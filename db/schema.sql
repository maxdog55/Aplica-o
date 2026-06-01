-- =============================================================================
--  Esquema da base de dados — colar no Supabase: SQL Editor -> New query -> Run
--  Cria a tabela "expenses" (despesas a pagar) e as regras de segurança (RLS)
--  para que cada utilizador só veja/edite os SEUS dados.
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.expenses (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name                 text not null,
  amount_cents         integer not null default 0,                       -- valor em cêntimos (EUR)
  due_date             date not null,                                    -- data base / 1.ª ocorrência
  recurrence           text not null default 'yearly'
                         check (recurrence in ('once','monthly','yearly')),
  reminder_days_before integer not null default 7
                         check (reminder_days_before >= 0 and reminder_days_before <= 60),
  category             text,
  notes                text,
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);

create index if not exists expenses_user_due_idx on public.expenses (user_id, due_date);

-- ---- Row Level Security (privacidade) ----
alter table public.expenses enable row level security;

drop policy if exists "expenses_select_own" on public.expenses;
drop policy if exists "expenses_insert_own" on public.expenses;
drop policy if exists "expenses_update_own" on public.expenses;
drop policy if exists "expenses_delete_own" on public.expenses;

create policy "expenses_select_own" on public.expenses
  for select using (auth.uid() = user_id);
create policy "expenses_insert_own" on public.expenses
  for insert with check (auth.uid() = user_id);
create policy "expenses_update_own" on public.expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "expenses_delete_own" on public.expenses
  for delete using (auth.uid() = user_id);

-- Nota: o notificador (GitHub Actions) usa a chave "service_role", que ignora
-- o RLS e consegue ler tudo para enviar os avisos. Essa chave NUNCA vai para a
-- app nem para o config.js — só para os Secrets do GitHub.
