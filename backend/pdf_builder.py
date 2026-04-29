"""ReportLab PDF builder. Handles legacy snapshot shape too."""
import io
from datetime import datetime, timezone
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

from i18n_data import PDF_I18N, BANKS


def _resolve_reco(r: dict, L: dict) -> tuple[str, str]:
    """Return (title, detail) supporting both legacy {title,detail} and {key,params}."""
    if "key" in r:
        title_tpl, detail_tpl = L["rec"].get(r["key"], ("", ""))
        try:
            title = title_tpl.format(**(r.get("params") or {}))
            detail = detail_tpl.format(**(r.get("params") or {}))
        except Exception:
            title, detail = title_tpl, detail_tpl
        return title, detail
    # Legacy: literal strings
    return r.get("title", ""), r.get("detail", "")


def build_pdf(biz: dict, analysis: dict, forecasts: dict, lang: str = "en", bank_code: str = "generic") -> bytes:
    L = PDF_I18N.get(lang, PDF_I18N["en"])
    B = BANKS.get(bank_code, BANKS["generic"])
    bank_color = colors.HexColor(B["color"])
    bank_accent = colors.HexColor(B["accent"])
    bank_full = B.get(f"full_name_{lang}", B["full_name_en"])
    bank_tagline = B.get(f"tagline_{lang}", B["tagline_en"])

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Title"], fontSize=22, textColor=colors.HexColor("#0a0a0b"), spaceAfter=6)
    sub_style = ParagraphStyle("sub", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#52525b"))
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=bank_color, spaceBefore=14, spaceAfter=8)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, leading=14, textColor=colors.HexColor("#18181b"))
    bank_band = ParagraphStyle("band", parent=styles["Normal"], fontSize=11, textColor=colors.white, alignment=1)

    story = []
    band_table = Table([[Paragraph(f"<b>{B['name']}</b>  ·  {bank_full}", bank_band)]], colWidths=[17 * cm])
    band_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bank_color),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(band_table)
    story.append(Spacer(1, 0.4 * cm))

    story.append(Paragraph(f"AYMAFIN — {L['title']}", title_style))
    story.append(Paragraph(f"<i>{bank_tagline}</i>",
                           ParagraphStyle("tag", parent=sub_style, textColor=bank_accent, fontSize=9)))
    story.append(Spacer(1, 0.2 * cm))
    story.append(Paragraph(
        f"{L['business']}: <b>{biz.get('business_name','—')}</b> · {L['type']}: {biz.get('business_type','—')} · "
        f"{L['country']}: {biz.get('country','Algeria')} · {L['currency']}: {biz.get('currency','DZD')}", sub_style))
    story.append(Paragraph(f"{L['generated']}: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", sub_style))
    story.append(Spacer(1, 0.4 * cm))

    story.append(Paragraph(L["exec_summary"], h2))
    cur = analysis["currency"]
    runway_str = (f"{analysis['runway_months']} {L['months']}"
                  if analysis["runway_months"] is not None else L["profitable"])
    summary_data = [
        [L["indicator"], L["value"]],
        [L["rev_m"], f"{analysis['revenue_monthly']:,.0f} {cur}"],
        [L["exp_m"], f"{analysis['expenses_monthly']:,.0f} {cur}"],
        [L["profit_m"], f"{analysis['profit_monthly']:,.0f} {cur}"],
        [L["margin"], f"{analysis['margin_pct']:.1f} %"],
        [L["burn"], f"{analysis['burn_rate_monthly']:,.0f} {cur}"],
        [L["runway"], runway_str],
        [L["risk"], analysis["risk_level"].upper()],
    ]
    t = Table(summary_data, colWidths=[7 * cm, 8 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), bank_color),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e4e4e7")),
        ("ALIGN", (1, 1), (1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f4f5")]),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t)

    story.append(Paragraph(L["recos"], h2))
    for r in analysis.get("recommendations", []):
        title, detail = _resolve_reco(r, L)
        if title or detail:
            story.append(Paragraph(f"<b>{title}</b> — {detail}", body))
            story.append(Spacer(1, 0.15 * cm))

    story.append(Paragraph(L["forecast_title"], h2))
    scen = forecasts.get("realistic", [])[:12]
    f_data = [[L["month"], f"{L['rev']} ({cur})", f"{L['exp']} ({cur})", f"{L['profit']} ({cur})", f"{L['cash']} ({cur})"]]
    for row in scen:
        f_data.append([str(row["month"]), f"{row['revenue']:,.0f}", f"{row['expenses']:,.0f}", f"{row['profit']:,.0f}", f"{row['cash']:,.0f}"])
    ft = Table(f_data, colWidths=[1.5 * cm, 3.5 * cm, 3.5 * cm, 3.5 * cm, 3.5 * cm])
    ft.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), bank_accent),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e4e4e7")),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f4f5")]),
    ]))
    story.append(ft)

    story.append(PageBreak())
    story.append(Paragraph(L["lender_notes"], h2))
    notes = {
        "fr": f"Ce rapport est produit par le moteur de décision automatisé d'AYMAFIN à l'attention de {bank_full} ({B['name']}). "
              f"La méthodologie combine les déclarations mensuelles de revenus/charges avec des prévisions stress-testées sur 3 scénarios. "
              f"Les chiffres doivent être recoupés avec les états financiers audités avant la décision finale.",
        "en": f"This report is produced by AYMAFIN's automated decision engine for {bank_full} ({B['name']}). "
              f"The methodology combines monthly revenue/expense self-declarations with stress-tested forecasts across 3 scenarios. "
              f"Figures should be cross-referenced with audited financial statements before final underwriting.",
        "ar": f"يُنتج هذا التقرير بواسطة محرك القرارات الآلي لـ AYMAFIN لصالح {bank_full} ({B['name']}). "
              f"تجمع المنهجية بين التصريحات الشهرية بالإيرادات والمصروفات وتوقعات اختُبرت ضد الضغط عبر 3 سيناريوهات. "
              f"يجب التحقق من الأرقام مقابل البيانات المالية المراجعة قبل اتخاذ القرار النهائي.",
    }.get(lang, "")
    story.append(Paragraph(notes, body))
    doc.build(story)
    return buf.getvalue()
