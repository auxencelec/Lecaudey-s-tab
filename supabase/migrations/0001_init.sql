-- ============================================================
-- Family Budget — initial schema
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Family (single-family for now, but multi-ready)
-- ------------------------------------------------------------
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_currency text not null default 'EUR',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Profile (one row per auth user)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('parent', 'child')),
  preferred_currency text not null default 'EUR',
  avatar_emoji text default '👤',
  birth_year int,
  created_at timestamptz not null default now()
);
create index on public.profiles (family_id);

-- ------------------------------------------------------------
-- Spaces (private = parents ↔ one child, group = shared budget)
-- ------------------------------------------------------------
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('private', 'group')),
  default_currency text not null default 'EUR',
  -- For private spaces: the child this space belongs to.
  owner_child_id uuid references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.spaces (family_id);

create table public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (space_id, profile_id)
);
create index on public.space_members (profile_id);

-- ------------------------------------------------------------
-- Transactions
-- ------------------------------------------------------------
-- amount: positive credits the wallet of the "concerns" member,
-- negative debits it. Currency stored alongside amount.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  -- Who the transaction concerns (whose wallet moves). NULL = group-shared.
  concerns_id uuid references public.profiles(id),
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
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index on public.transactions (space_id, occurred_on desc);
create index on public.transactions (concerns_id);

-- ------------------------------------------------------------
-- Advances (créances — qui doit quoi à qui)
-- ------------------------------------------------------------
create table public.advances (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete set null,
  debtor_id uuid not null references public.profiles(id) on delete cascade,    -- celui qui doit
  creditor_id uuid not null references public.profiles(id) on delete cascade,  -- celui à qui on doit
  amount numeric(12, 2) not null,
  currency text not null,
  remaining numeric(12, 2) not null,
  description text,
  status text not null default 'open' check (status in ('open', 'partial', 'closed')),
  source_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index on public.advances (family_id, status);
create index on public.advances (debtor_id);
create index on public.advances (creditor_id);

-- ------------------------------------------------------------
-- Recurring allowances (argent de poche automatique)
-- ------------------------------------------------------------
create table public.allowances (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12, 2) not null,
  currency text not null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  day_of_period int not null default 1,
  active boolean not null default true,
  last_paid_on date,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Helper: which family does an authenticated user belong to?
-- ------------------------------------------------------------
create or replace function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_member_of_space(s_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.space_members
    where space_id = s_id and profile_id = auth.uid()
  ) or exists (
    -- parents see every space of their family
    select 1 from public.spaces sp
    join public.profiles p on p.family_id = sp.family_id
    where sp.id = s_id and p.id = auth.uid() and p.role = 'parent'
  )
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.families      enable row level security;
alter table public.profiles      enable row level security;
alter table public.spaces        enable row level security;
alter table public.space_members enable row level security;
alter table public.transactions  enable row level security;
alter table public.advances      enable row level security;
alter table public.allowances    enable row level security;

-- families
create policy "family: members read" on public.families for select
  using (id = public.current_family_id());

-- profiles
create policy "profile: same family read" on public.profiles for select
  using (family_id = public.current_family_id());
create policy "profile: self update" on public.profiles for update
  using (id = auth.uid());
create policy "profile: parent update" on public.profiles for update
  using (family_id = public.current_family_id() and public.current_role() = 'parent');

-- spaces
create policy "space: visible if member or parent" on public.spaces for select
  using (
    family_id = public.current_family_id()
    and (public.current_role() = 'parent' or public.is_member_of_space(id))
  );
create policy "space: parent insert" on public.spaces for insert
  with check (family_id = public.current_family_id() and public.current_role() = 'parent');
create policy "space: parent update" on public.spaces for update
  using (family_id = public.current_family_id() and public.current_role() = 'parent');
create policy "space: parent delete" on public.spaces for delete
  using (family_id = public.current_family_id() and public.current_role() = 'parent');

-- space_members
create policy "space_members: visible if member or parent" on public.space_members for select
  using (public.is_member_of_space(space_id));
create policy "space_members: parent manage" on public.space_members for all
  using (public.current_role() = 'parent' and exists(
    select 1 from public.spaces s where s.id = space_id and s.family_id = public.current_family_id()
  ))
  with check (public.current_role() = 'parent' and exists(
    select 1 from public.spaces s where s.id = space_id and s.family_id = public.current_family_id()
  ));

-- transactions
create policy "tx: read if space visible" on public.transactions for select
  using (public.is_member_of_space(space_id));
create policy "tx: insert if space visible" on public.transactions for insert
  with check (public.is_member_of_space(space_id) and created_by = auth.uid());
create policy "tx: update own or parent" on public.transactions for update
  using (created_by = auth.uid() or public.current_role() = 'parent');
create policy "tx: delete own or parent" on public.transactions for delete
  using (created_by = auth.uid() or public.current_role() = 'parent');

-- advances
create policy "adv: read if involved or parent" on public.advances for select
  using (
    family_id = public.current_family_id()
    and (public.current_role() = 'parent' or debtor_id = auth.uid() or creditor_id = auth.uid())
  );
create policy "adv: insert if involved" on public.advances for insert
  with check (
    family_id = public.current_family_id()
    and (debtor_id = auth.uid() or creditor_id = auth.uid() or public.current_role() = 'parent')
  );
create policy "adv: update involved or parent" on public.advances for update
  using (
    family_id = public.current_family_id()
    and (debtor_id = auth.uid() or creditor_id = auth.uid() or public.current_role() = 'parent')
  );

-- allowances (parents only)
create policy "allowance: read same family" on public.allowances for select
  using (family_id = public.current_family_id() and (public.current_role() = 'parent' or child_id = auth.uid()));
create policy "allowance: parent manage" on public.allowances for all
  using (family_id = public.current_family_id() and public.current_role() = 'parent')
  with check (family_id = public.current_family_id() and public.current_role() = 'parent');
