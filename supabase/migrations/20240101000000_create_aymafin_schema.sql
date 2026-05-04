-- AYMAFIN schema — all tables, indexes, RLS disabled, anon grants

-- Users
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  name          text,
  password_hash text not null,
  role          text not null default 'user',
  onboarded     boolean not null default false,
  subscription  jsonb,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
alter table users disable row level security;
grant all on users to anon;

-- Login attempts (rate limiting)
create table if not exists login_attempts (
  id          uuid primary key default gen_random_uuid(),
  identifier  text unique not null,
  attempts    int not null default 0,
  locked_until timestamptz,
  updated_at  timestamptz not null default now()
);
alter table login_attempts disable row level security;
grant all on login_attempts to anon;

-- Businesses (user profile / company info)
create table if not exists businesses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  name        text,
  sector      text,
  description text,
  country     text,
  currency    text default 'DZD',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists businesses_user_id_idx on businesses(user_id);
alter table businesses disable row level security;
grant all on businesses to anon;

-- Reports
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  type        text not null,
  period      text,
  data        jsonb,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists reports_user_id_idx on reports(user_id);
alter table reports disable row level security;
grant all on reports to anon;

-- Chat history
create table if not exists chat_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null,
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists chat_history_user_id_idx on chat_history(user_id);
alter table chat_history disable row level security;
grant all on chat_history to anon;

-- Accounting entries (charges 60-69 / produits 70-79)
create table if not exists accounting_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  period       text not null,
  account_code text not null,
  entry_type   text not null,   -- 'charge' | 'produit'
  amount       numeric not null default 0,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ae_user_period_idx on accounting_entries(user_id, period);
create unique index if not exists ae_user_period_code_idx on accounting_entries(user_id, period, account_code);
alter table accounting_entries disable row level security;
grant all on accounting_entries to anon;

-- Bilan entries (balance sheet raw data)
create table if not exists bilan_entries (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references users(id) on delete cascade,
  period                    text not null,
  ecarts_acquisition        numeric not null default 0,
  immo_incorporelles_brut   numeric not null default 0,
  immo_incorporelles_amort  numeric not null default 0,
  immo_corporelles_brut     numeric not null default 0,
  immo_corporelles_amort    numeric not null default 0,
  immo_financieres          numeric not null default 0,
  impots_differes_actif     numeric not null default 0,
  stocks                    numeric not null default 0,
  creances_clients          numeric not null default 0,
  autres_debiteurs          numeric not null default 0,
  impots_taxes_recuperables numeric not null default 0,
  tresorerie_actif          numeric not null default 0,
  capital                   numeric not null default 0,
  reserves                  numeric not null default 0,
  autres_capitaux_propres   numeric not null default 0,
  emprunts_lt               numeric not null default 0,
  impots_differes_passif    numeric not null default 0,
  fournisseurs              numeric not null default 0,
  dettes_personnel          numeric not null default 0,
  dettes_impots             numeric not null default 0,
  autres_dettes_ct          numeric not null default 0,
  decouvert_bancaire        numeric not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create unique index if not exists be_user_period_idx on bilan_entries(user_id, period);
alter table bilan_entries disable row level security;
grant all on bilan_entries to anon;

-- Journal entries (double-entry bookkeeping)
create table if not exists journal_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  date            text not null,
  journal_type    text not null,
  description     text,
  debit_account   text not null,
  credit_account  text not null,
  amount          numeric not null,
  created_at      timestamptz not null default now()
);
create index if not exists je_user_date_idx on journal_entries(user_id, date);
alter table journal_entries disable row level security;
grant all on journal_entries to anon;

-- Treasury entries (cash flow movements)
create table if not exists treasury_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  date        text not null,
  label       text not null,
  amount      numeric not null,
  type        text not null,   -- 'income' | 'expense'
  category    text,
  created_at  timestamptz not null default now()
);
create index if not exists te_user_date_idx on treasury_entries(user_id, date);
alter table treasury_entries disable row level security;
grant all on treasury_entries to anon;

-- Invoices
create table if not exists invoices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  invoice_number  text,
  name            text,
  label           text,
  amount          numeric not null,
  type            text not null,   -- 'incoming' | 'outgoing'
  date            text not null,
  status          text not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists inv_user_idx on invoices(user_id);
alter table invoices disable row level security;
grant all on invoices to anon;

-- Payment transactions (Stripe)
create table if not exists payment_transactions (
  id              uuid primary key default gen_random_uuid(),
  session_id      text unique not null,
  user_id         uuid references users(id),
  user_email      text,
  plan_id         text,
  amount          numeric,
  currency        text,
  status          text default 'pending',
  payment_status  text default 'unpaid',
  amount_total    numeric,
  metadata        jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists pt_user_id_idx on payment_transactions(user_id);
create index if not exists pt_session_id_idx on payment_transactions(session_id);
alter table payment_transactions disable row level security;
grant all on payment_transactions to anon;
