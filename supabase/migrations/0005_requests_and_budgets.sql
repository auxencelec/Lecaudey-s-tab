-- ============================================================
-- Requests + Budgets.
-- Run this SQL in Supabase → SQL Editor.
-- ============================================================

-- ----- Requests --------------------------------------------
-- A child asks for money. A parent approves (creates a transaction
-- crediting the child) or rejects.
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12, 2) not null,
  currency text not null,
  category text not null check (category in (
    'argent_de_poche',
    'vacances',
    'loyer',
    'transport',
    'cadeau',
    'avance',
    'remboursement',
    'autre'
  )),
  description text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  decision_note text,
  approved_transaction_id uuid references public.transactions(id) on delete set null
);
create index if not exists requests_family_status_idx on public.requests (family_id, status);
create index if not exists requests_child_idx on public.requests (child_id);

alter table public.requests enable row level security;

drop policy if exists "req: read own or parent" on public.requests;
drop policy if exists "req: child create"       on public.requests;
drop policy if exists "req: update"             on public.requests;

create policy "req: read own or parent" on public.requests for select
  using (
    family_id = public.current_family_id()
    and (child_id = auth.uid() or public.current_role() = 'parent')
  );

create policy "req: child create" on public.requests for insert
  with check (
    family_id = public.current_family_id()
    and child_id = auth.uid()
    and public.current_role() = 'child'
  );

create policy "req: update" on public.requests for update
  using (
    family_id = public.current_family_id()
    and (
      (child_id = auth.uid() and status = 'pending') -- child can cancel own pending
      or public.current_role() = 'parent'             -- parent can approve/reject
    )
  );

-- ----- Budgets ---------------------------------------------
-- Parents allocate an amount per category. Tracked against the
-- sum of expenses in that category since start_date.
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  category text not null check (category in (
    'argent_de_poche',
    'vacances',
    'loyer',
    'transport',
    'cadeau',
    'avance',
    'remboursement',
    'autre'
  )),
  amount numeric(12, 2) not null,
  currency text not null,
  start_date date not null default current_date,
  end_date date,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists budgets_family_active_idx on public.budgets (family_id, active);

alter table public.budgets enable row level security;

drop policy if exists "bud: read same family" on public.budgets;
drop policy if exists "bud: parent manage"    on public.budgets;

create policy "bud: read same family" on public.budgets for select
  using (family_id = public.current_family_id());

create policy "bud: parent manage" on public.budgets for all
  using (family_id = public.current_family_id() and public.current_role() = 'parent')
  with check (family_id = public.current_family_id() and public.current_role() = 'parent');
