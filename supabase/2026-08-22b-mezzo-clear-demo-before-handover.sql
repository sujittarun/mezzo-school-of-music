-- ============================================================
-- THE INVENTED STUDENTS COME OUT, THE DAY THE CLIENT GETS THE LINK
--
-- Forty-six demo students, 182 payments and ₹3,19,000 were seeded so
-- the app was worth opening while it was being built. None of it is
-- his. Signing in to a Money tab showing three lakh of income he never
-- earned is not a demo, it is a thing he has to be talked out of
-- believing.
--
-- This is the one-line cleanup the seeds were designed for, written out
-- with its children so the foreign keys do not refuse:
--
--   delete from members where tenant_id = 'mezzo' and is_demo;
--
-- WHAT SURVIVES: every row that is not is_demo. Today that is Sri and
-- his ₹1,500, which is real and stays exactly where it is. The day
-- patterns stay too — they are shapes, not people, and the app reuses
-- them rather than making a second Mon+Thu.
--
-- Scope: mezzo. Its own rows.
-- ============================================================

do $$
declare
  v_before int; v_real_before int; v_after int; v_real_after int;
  v_pay int; v_amt numeric; v_marks int;
begin
  select count(*) into v_before      from members where tenant_id='mezzo' and is_demo;
  select count(*) into v_real_before from members where tenant_id='mezzo' and coalesce(is_demo,false)=false;

  select count(*), coalesce(sum(amount),0) into v_pay, v_amt
    from payments p join members m on m.id = p.member_id
   where p.tenant_id='mezzo' and m.is_demo;
  select count(*) into v_marks
    from attendance_records ar
    join enrollments e on e.id = ar.enrollment_id
    join members m on m.id = e.member_id
   where e.tenant_id='mezzo' and m.is_demo;

  raise notice 'clearing % demo students: % payments worth %, % marks. % real member(s) stay.',
    v_before, v_pay, v_amt, v_marks, v_real_before;

  /* children first */
  delete from attendance_records ar using enrollments e, members m
   where ar.enrollment_id = e.id and e.member_id = m.id
     and e.tenant_id = 'mezzo' and m.is_demo;
  delete from payments p using members m
   where p.member_id = m.id and p.tenant_id = 'mezzo' and m.is_demo;
  delete from enrollments e using members m
   where e.member_id = m.id and e.tenant_id = 'mezzo' and m.is_demo;
  delete from members where tenant_id = 'mezzo' and is_demo;

  /* the sessions the marks hung off are now empty shells */
  delete from sessions s
   where s.tenant_id = 'mezzo'
     and not exists (select 1 from attendance_records a where a.session_id = s.id);

  /* seeded expenses go too — they were invented alongside the students.
     His own entry (detail 'rent', category 'General') is not one. */
  delete from expenses
   where tenant_id = 'mezzo' and category <> 'General';

  select count(*) into v_after      from members where tenant_id='mezzo' and is_demo;
  select count(*) into v_real_after from members where tenant_id='mezzo' and coalesce(is_demo,false)=false;

  if v_after <> 0 then raise exception '% demo students survived', v_after; end if;
  if v_real_after <> v_real_before then
    raise exception 'real members went from % to % — this file was only ever allowed to remove demo rows',
      v_real_before, v_real_after;
  end if;
  if not exists (select 1 from batches where tenant_id='mezzo') then
    raise exception 'the day patterns were removed; they are shapes, not people';
  end if;
  raise notice 'done: % demo students gone, % real member(s) untouched', v_before, v_real_after;
end $$;
