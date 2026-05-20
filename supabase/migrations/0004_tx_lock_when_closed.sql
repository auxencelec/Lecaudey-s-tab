-- ============================================================
-- Lock transactions for children once the linked advance is settled.
--
-- Rule:
--   - Parents: can update/delete any transaction in their family.
--   - Children: can update/delete only their own transactions, AND
--     only when no linked advance has status='closed'.
--
-- Run this SQL in Supabase → SQL Editor.
-- ============================================================

drop policy if exists "tx: update own or parent" on public.transactions;
drop policy if exists "tx: delete own or parent" on public.transactions;
drop policy if exists "tx: update own (not closed) or parent" on public.transactions;
drop policy if exists "tx: delete own (not closed) or parent" on public.transactions;

create policy "tx: update own (not closed) or parent" on public.transactions
  for update
  using (
    public.current_role() = 'parent'
    or (
      created_by = auth.uid()
      and not exists (
        select 1 from public.advances a
        where a.source_transaction_id = transactions.id
          and a.status = 'closed'
      )
    )
  );

create policy "tx: delete own (not closed) or parent" on public.transactions
  for delete
  using (
    public.current_role() = 'parent'
    or (
      created_by = auth.uid()
      and not exists (
        select 1 from public.advances a
        where a.source_transaction_id = transactions.id
          and a.status = 'closed'
      )
    )
  );
