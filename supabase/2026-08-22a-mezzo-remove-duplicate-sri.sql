-- ============================================================
-- ONE OF THE TWO SRIs
--
-- Two real students called Sri were added fifty-three seconds apart on
-- 2026-08-22 with DIFFERENT phone numbers — a number typed wrong and
-- then the whole student retyped rather than edited. The owner
-- confirmed 7656787655 is the right one, so the other goes.
--
--   keep    id 2381  Sri  7656787655   enrolment 2244
--   remove  id 2382  Sri  4567654345   enrolment 2245
--
-- IT IS NOT AN EMPTY ROW. The one being removed carries a real
-- ₹1,500 payment recorded the same day, and that payment goes with it.
-- That is the intent — it was entered against a student who does not
-- exist — but it is money leaving the books, so this file says so out
-- loud and prints what it removed.
--
-- Hard delete rather than discontinue: "has stopped coming" is for a
-- child who left, and it would leave a phantom Sri on the roll for ever.
-- This was never a student.
--
-- The app now asks before adding a name that is already on the roll
-- (findByName + the "already on the roll" question), so this particular
-- pair cannot happen again by the same route.
--
-- Scope: mezzo. Its own rows.
-- ============================================================

do $$
declare
  v_keep  bigint := 2381;
  v_drop  bigint := 2382;
  v_enrol bigint;
  v_pay   int; v_amt numeric; v_marks int; v_sess int; v_n int;
begin
  /* Refuse unless the rows are exactly what this file was written for.
     An id is a global thing on this platform and a stale id in a
     migration is how somebody else's student gets deleted. */
  if not exists (select 1 from members
                  where id = v_keep and tenant_id = 'mezzo'
                    and name = 'Sri' and phone = '7656787655') then
    raise exception 'member % is not the Sri to keep — refusing', v_keep;
  end if;
  if not exists (select 1 from members
                  where id = v_drop and tenant_id = 'mezzo'
                    and name = 'Sri' and phone = '4567654345') then
    raise exception 'member % is not the Sri to remove — refusing', v_drop;
  end if;

  select id into v_enrol from enrollments
   where tenant_id = 'mezzo' and member_id = v_drop;

  /* say what is about to go, before it goes */
  select count(*), coalesce(sum(amount), 0) into v_pay, v_amt
    from payments where tenant_id = 'mezzo' and member_id = v_drop;
  select count(*) into v_marks
    from attendance_records ar join sessions s on s.id = ar.session_id
   where s.tenant_id = 'mezzo' and ar.enrollment_id = v_enrol;
  raise notice 'removing Sri %: % payment(s) worth %, % attendance mark(s), enrolment %',
    v_drop, v_pay, v_amt, v_marks, v_enrol;

  /* children first, or the foreign keys refuse */
  delete from attendance_records where enrollment_id = v_enrol;
  delete from payments    where tenant_id = 'mezzo' and member_id = v_drop;
  delete from enrollments where tenant_id = 'mezzo' and member_id = v_drop;
  delete from members     where tenant_id = 'mezzo' and id = v_drop;

  /* and the one we meant to keep is untouched */
  select count(*) into v_n from members where tenant_id = 'mezzo' and id = v_keep;
  if v_n <> 1 then raise exception 'the Sri we meant to keep is gone'; end if;
  select count(*) into v_n from payments where tenant_id = 'mezzo' and member_id = v_keep;
  if v_n <> 1 then raise exception 'the kept Sri lost a payment'; end if;
  select count(*) into v_n from members where tenant_id = 'mezzo' and name = 'Sri';
  if v_n <> 1 then raise exception '% students called Sri remain, expected 1', v_n; end if;
end $$;
