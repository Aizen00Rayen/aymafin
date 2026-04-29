"""Pure financial computation (analysis + forecasts). No DB access."""
from typing import Optional


def compute_analysis(biz: dict) -> dict:
    revenue = sum(float(r.get("monthly_amount", 0)) for r in biz.get("revenue_streams", []))
    expenses = sum(float(e.get("monthly_amount", 0)) for e in biz.get("expenses", []))
    profit = revenue - expenses
    margin = (profit / revenue * 100) if revenue > 0 else 0
    capital = float(biz.get("initial_capital", 0) or 0)
    burn_rate = max(expenses - revenue, 0)
    runway_months: Optional[float] = (capital / burn_rate) if burn_rate > 0 else None

    risk_score = 0
    if margin < 0:
        risk_score += 3
    elif margin < 10:
        risk_score += 2
    elif margin < 25:
        risk_score += 1
    if runway_months is not None and runway_months < 6:
        risk_score += 3
    elif runway_months is not None and runway_months < 12:
        risk_score += 1
    if revenue == 0:
        risk_score += 3
    if len(biz.get("revenue_streams", [])) <= 1:
        risk_score += 1

    risk_level = "low" if risk_score <= 1 else ("medium" if risk_score <= 4 else "high")

    recs = []
    if margin < 15:
        recs.append({"key": "improve_margin", "params": {}})
    if runway_months is not None and runway_months < 9:
        recs.append({"key": "secure_financing", "params": {"runway": round(runway_months, 1)}})
    if len(biz.get("revenue_streams", [])) <= 1:
        recs.append({"key": "diversify_revenue", "params": {}})
    if expenses > 0 and revenue > 0:
        top = max(biz.get("expenses", []), key=lambda x: float(x.get("monthly_amount", 0)), default=None)
        if top and float(top.get("monthly_amount", 0)) / max(expenses, 1) > 0.4:
            recs.append({"key": "optimize_expense", "params": {"name": top["name"]}})
    if not recs:
        recs.append({"key": "scale_up", "params": {}})

    return {
        "revenue_monthly": round(revenue, 2),
        "expenses_monthly": round(expenses, 2),
        "profit_monthly": round(profit, 2),
        "margin_pct": round(margin, 2),
        "burn_rate_monthly": round(burn_rate, 2),
        "runway_months": round(runway_months, 1) if runway_months is not None else None,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "recommendations": recs,
        "currency": biz.get("currency", "DZD"),
    }


def compute_forecasts(biz: dict, months: int = 12) -> dict:
    revenue = sum(float(r.get("monthly_amount", 0)) for r in biz.get("revenue_streams", []))
    expenses = sum(float(e.get("monthly_amount", 0)) for e in biz.get("expenses", []))
    capital = float(biz.get("initial_capital", 0) or 0)

    scenarios = {
        "optimistic": {"rev_growth": 0.08, "exp_growth": 0.02},
        "realistic": {"rev_growth": 0.03, "exp_growth": 0.02},
        "pessimistic": {"rev_growth": -0.02, "exp_growth": 0.04},
    }
    out = {}
    for name, p in scenarios.items():
        series = []
        rev, exp, cash = revenue, expenses, capital
        for m in range(1, months + 1):
            rev = rev * (1 + p["rev_growth"])
            exp = exp * (1 + p["exp_growth"])
            cash = cash + (rev - exp)
            series.append({
                "month": m,
                "revenue": round(rev, 2),
                "expenses": round(exp, 2),
                "profit": round(rev - exp, 2),
                "cash": round(cash, 2),
            })
        out[name] = series
    return out
