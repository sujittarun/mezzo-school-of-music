-- ============================================================
-- TWO CORRECTIONS TO THE DEMO SEED
--
-- 1. AUGUST HAD RENT TWICE. The owner had already entered his own
--    "rent 18,000" through the app on the 20th, and 2026-08-21d seeded
--    a "Studio rent 18,000" on the 2nd on top of it. Spent came to
--    47,350 against 10,000 collected, so the Money tab opened on a
--    month that looked like a disaster and was really a duplicate.
--    The seeded one goes; HIS row is left exactly where it is.
--
-- 2. THE SIX OLDER DEMO STUDENTS WERE ALL BEHIND. They were seeded
--    months ago and never paid, so every one of them sat in the dues
--    list and the dial read ten of sixteen out of tune — which is not
--    a school, it is a backlog. They are brought current the way the
--    app would do it, through record_fee_payment(), which leaves the
--    four students 2026-08-21d deliberately put behind as the four
--    the dues list is about.
--
-- Scope: mezzo. Its own rows, and the platform's own function to move
-- the money.
-- ============================================================

-- ---------- 1. the duplicate rent ----------
do $$
declare v_gone int;
begin
  delete from expenses
   where tenant_id = 'mezzo'
     and category = 'Rent' and payee = 'Landlord'
     and detail = 'Studio rent' and amount = 18000
     and on_date = date '2026-08-02';
  get diagnostics v_gone = row_count;
  if v_gone <> 1 then
    raise exception 'expected to remove exactly one seeded rent row, removed %', v_gone;
  end if;
  /* and his own must still be there */
  if not exists (select 1 from expenses where tenant_id = 'mezzo'
                   and detail = 'rent' and amount = 18000) then
    raise exception 'the owner''s own rent row is gone — that was not this file''s to touch';
  end if;
end $$;

-- ---------- 2. bring the older six current ----------
do $$
declare
  r      record;
  v_fee  numeric;
  v_when date;
  n      int := 0;
begin
  for r in
    select e.id, e.member_id, e.centre_id, e.sport, e.batch_id, m.name
      from enrollments e
      join members m on m.id = e.member_id
     where e.tenant_id = 'mezzo'
       and m.is_demo and m.phone is not null      -- the older six; the ten new ones have none
       and e.status = 'active'
     order by m.id
  loop
    v_fee := (resolve_fee('mezzo', r.member_id, r.centre_id, r.sport, r.batch_id, 1)->>'amount')::numeric;
    /* spread across the month rather than all on one day, so the
       month's shape has something to draw */
    v_when := date '2026-08-03' + (n * 3);
    perform record_fee_payment(
      p_tenant => 'mezzo', p_enrollment => r.id, p_amount => v_fee,
      p_months => 1, p_mode => case when n % 3 = 2 then 'Cash' else 'UPI' end,
      p_on_date => v_when);
    n := n + 1;
  end loop;
  if n <> 6 then raise exception 'settled % of the older six', n; end if;
end $$;

-- ---------- prove it ----------
do $$
declare v_in numeric; v_out numeric; v_due int; v_rent int;
begin
  select coalesce(sum(amount), 0) into v_in from payments
   where tenant_id = 'mezzo' and status <> 'void'
     and on_date >= date_trunc('month', current_date)::date;
  select coalesce(sum(amount), 0) into v_out from expenses
   where tenant_id = 'mezzo' and on_date >= date_trunc('month', current_date)::date;
  select count(*) into v_rent from expenses
   where tenant_id = 'mezzo' and amount = 18000
     and on_date >= date_trunc('month', current_date)::date;
  select count(*) into v_due from reminder_queue('mezzo');

  if v_rent <> 1 then raise exception 'rent appears % times this month', v_rent; end if;
  if v_due <> 4 then raise exception '% students are due, expected the four by design', v_due; end if;
  raise notice 'mezzo: % in, % out this month, % due', v_in, v_out, v_due;
end $$;
