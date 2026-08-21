-- ============================================================
-- THIRTY MORE STUDENTS, AND SIX MONTHS OF COSTS
--
-- The tenant had sixteen demo students and expenses in ONE month, so
-- stepping back in the Money tab showed fees arriving against no costs
-- at all — a business that only ever earns. This adds thirty students
-- with real payment histories, and the rent and bills that were always
-- being paid alongside them.
--
-- Every member carries is_demo = true and NO phone number, exactly as
-- 2026-08-21d. The one-line cleanup still clears the lot:
--
--   delete from members where tenant_id = 'mezzo' and is_demo;
--
-- THE STATES ARE DESIGNED, NOT RANDOM. Of the thirty: five are behind,
-- twenty-three are settled and two are away. Two paid a term up front
-- rather than a month. One payment was mis-keyed and taken back, so the
-- ledger has an undone row in it — which is a normal week, and the
-- Undo path should be exercised by the data and not only by a test.
--
-- The dates were generated and checked before this file was written:
-- no payment falls in the future (record_fee_payment refuses one, and
-- rightly), and the count per month climbs 5, 12, 19, 24, 28, 28, 18
-- from February — a school filling up, not thirty children arriving at
-- once.
--
-- Money moves through record_fee_payment() and void_payment(). Nothing
-- here inserts a payment row by hand.
--
-- Scope: mezzo. Its own rows only.
-- ============================================================

do $$
declare v_real int;
begin
  select count(*) into v_real from members
   where tenant_id = 'mezzo' and coalesce(is_demo, false) = false;
  if v_real > 0 then
    raise exception 'mezzo now holds % real member(s) — this seed is for a demo tenant', v_real;
  end if;
  if exists (select 1 from members where tenant_id = 'mezzo' and name = 'Aravind Balaji') then
    raise exception 'these thirty are already here';
  end if;
end $$;

-- ---------- the students ----------
do $$
declare
  v_centre bigint; r record; v_member bigint; v_enrol bigint;
  v_batch bigint; v_fee numeric; k int; v_pay date; v_extra bigint;
begin
  select id into v_centre from centres where tenant_id = 'mezzo' order by id limit 1;

  for r in
    select * from (values
      ('Aravind Balaji', 'Guitar', array[1,4], date '2026-02-03', 7, false, 0),
      ('Bhavya Sundaram', 'Piano', array[2,5], date '2026-02-07', 7, false, 0),
      ('Chandran Moorthy', 'Drums', array[3,6], date '2026-02-12', 6, false, 0),
      ('Devika Raghavan', 'Vocals', array[1,3], date '2026-02-18', 7, false, 0),
      ('Elakkiya Natarajan', 'Violin', array[2,4], date '2026-02-24', 5, false, 0),
      ('Farid Sheikh', 'Keyboard', array[1,5], date '2026-03-02', 6, false, 0),
      ('Gayathri Subbu', 'Ukulele', array[2,6], date '2026-03-06', 6, false, 0),
      ('Hariharan Iyer', 'Piano', array[4,6], date '2026-03-11', 6, false, 0),
      ('Indhu Lakshmi', 'Guitar', array[1,4], date '2026-03-15', 6, false, 0),
      ('Jeyanth Kumar', 'Drums', array[2,5], date '2026-03-19', 5, false, 0),
      ('Kalaivani Raman', 'Vocals', array[3,6], date '2026-03-23', 5, false, 0),
      ('Lokesh Chandran', 'Keyboard', array[1,3], date '2026-03-28', 5, false, 0),
      ('Mythili Venkat', 'Violin', array[2,4], date '2026-04-02', 5, false, 0),
      ('Naveena Suresh', 'Piano', array[1,5], date '2026-04-06', 5, false, 0),
      ('Oviya Bhaskar', 'Ukulele', array[2,6], date '2026-04-10', 5, false, 0),
      ('Pranav Desai', 'Guitar', array[4,6], date '2026-04-14', 5, false, 0),
      ('Quadir Basha', 'Drums', array[1,4], date '2026-04-19', 3, false, 0),
      ('Ramya Krishnan', 'Keyboard', array[2,5], date '2026-04-23', 4, false, 0),
      ('Sanjana Pillai', 'Vocals', array[3,6], date '2026-04-27', 4, false, 0),
      ('Thendral Mani', 'Violin', array[1,3], date '2026-05-04', 4, false, 0),
      ('Udhaya Kumar', 'Piano', array[2,4], date '2026-05-08', 3, false, 3),
      ('Vaishnavi Rao', 'Guitar', array[1,5], date '2026-05-13', 4, false, 0),
      ('Yogesh Prabhu', 'Keyboard', array[2,6], date '2026-05-17', 4, false, 0),
      ('Anitha Selvaraj', 'Ukulele', array[4,6], date '2026-05-22', 3, false, 0),
      ('Barath Nandan', 'Drums', array[1,4], date '2026-06-01', 3, false, 0),
      ('Chitra Devi', 'Vocals', array[2,5], date '2026-06-06', 2, false, 0),
      ('Dinesh Karthik', 'Piano', array[3,6], date '2026-06-11', 2, true, 0),
      ('Emil Joseph', 'Violin', array[1,3], date '2026-06-16', 2, false, 6),
      ('Fathima Noor', 'Guitar', array[2,4], date '2026-07-01', 2, false, 0),
      ('Girish Menon', 'Keyboard', array[1,5], date '2026-07-08', 1, true, 0)
    ) as t(nm, sport, days, first_paid, months, paused, term)
  loop
    select x.id into v_batch from batches x
     where x.tenant_id = 'mezzo'
       and (select array_agg(v order by v) from unnest(x.days) v)
           = (select array_agg(v order by v) from unnest(r.days) v)
     limit 1;
    if v_batch is null then
      raise exception 'no day pattern for % — 2026-08-21d should have made it', r.days;
    end if;

    insert into members (tenant_id, name, phone, parent_name, parent_phone,
                         program, joined, status, venue, is_demo)
    values ('mezzo', r.nm, null, 'Parent of ' || split_part(r.nm, ' ', 1), null,
            r.sport, r.first_paid, 'active', 'Mezzo School of Music', true)
    returning id into v_member;

    insert into enrollments (tenant_id, member_id, centre_id, batch_id, sport,
                             plan_months, joined_on, renewal_on, status)
    values ('mezzo', v_member, v_centre, v_batch, r.sport,
            1, r.first_paid, r.first_paid, 'active')
    returning id into v_enrol;

    v_fee := (resolve_fee('mezzo', v_member, v_centre, r.sport, v_batch, 1)->>'amount')::numeric;

    for k in 0 .. r.months - 1 loop
      v_pay := (r.first_paid + (k || ' months')::interval)::date;
      perform record_fee_payment(
        p_tenant => 'mezzo', p_enrollment => v_enrol, p_amount => v_fee,
        p_months => 1,
        p_mode => case when (v_member + k) % 5 = 0 then 'Cash' else 'UPI' end,
        p_on_date => v_pay);
    end loop;

    /* a term up front rather than a month */
    if r.term > 0 then
      perform record_fee_payment(
        p_tenant => 'mezzo', p_enrollment => v_enrol,
        p_amount => v_fee * r.term, p_months => r.term, p_mode => 'UPI',
        p_on_date => (r.first_paid + (r.months || ' months')::interval)::date);
    end if;

    /* ONE mis-keyed payment, taken back. Recorded and then voided, so
       the renewal date ends up exactly where it started — a void that
       left the child a month ahead would be a seed that lies. */
    if r.nm = 'Pranav Desai' then
      select (record_fee_payment(
                p_tenant => 'mezzo', p_enrollment => v_enrol, p_amount => v_fee,
                p_months => 1, p_mode => 'Cash',
                p_on_date => date '2026-08-11')->>'payment_id')::bigint
        into v_extra;
      perform void_payment('mezzo', v_extra, 'Entered twice by mistake');
    end if;

    if r.paused then
      update enrollments
         set status = 'paused', renewal_on = (renewal_on + interval '2 months')::date
       where id = v_enrol;
    end if;
  end loop;
end $$;

-- ---------- what the months before August cost ----------
-- August already has its own, including the owner's own rent entry, so
-- this fills in February to July: the rent and the bills that were always
-- being paid while those fees were coming in.
insert into expenses (tenant_id, category, payee, detail, amount, mode, on_date)
select 'mezzo', e.category, e.payee, e.detail, e.amount, e.mode, e.on_date
from (values
  ('Rent','Landlord','Studio rent',18000,'UPI',date '2026-02-03'),
  ('Utility','TNEB','Electricity',2710,'UPI',date '2026-02-06'),
  ('Supplies','Music store','Keyboard stand, cables',1890,'Cash',date '2026-02-17'),
  ('Rent','Landlord','Studio rent',18000,'UPI',date '2026-03-02'),
  ('Utility','TNEB','Electricity',2950,'UPI',date '2026-03-05'),
  ('Supplies','Music store','Guitar strings, picks',1180,'Cash',date '2026-03-14'),
  ('Rent','Landlord','Studio rent',18000,'UPI',date '2026-04-02'),
  ('Utility','TNEB','Electricity',3240,'UPI',date '2026-04-05'),
  ('Upkeep','Tuner','Piano tuning',2200,'Cash',date '2026-04-16'),
  ('Supplies','Printer','Printed music books',1420,'Cash',date '2026-04-24'),
  ('Rent','Landlord','Studio rent',18000,'UPI',date '2026-05-02'),
  ('Utility','TNEB','Electricity',3610,'UPI',date '2026-05-06'),
  ('Upkeep','Music store','Violin bow rehair',1750,'UPI',date '2026-05-19'),
  ('Rent','Landlord','Studio rent',18000,'UPI',date '2026-06-02'),
  ('Utility','TNEB','Electricity',3880,'UPI',date '2026-06-05'),
  ('Upkeep','Aircon service','Aircon service',2800,'UPI',date '2026-06-12'),
  ('Supplies','Music store','Drum sticks, heads',2140,'Cash',date '2026-06-21'),
  ('Rent','Landlord','Studio rent',18000,'UPI',date '2026-07-02'),
  ('Utility','TNEB','Electricity',3520,'UPI',date '2026-07-06'),
  ('Utility','Broadband','Internet',1100,'UPI',date '2026-07-09'),
  ('Upkeep','Tuner','Piano tuning',2200,'Cash',date '2026-07-18'),
  ('Supplies','Music store','Ukulele strings',640,'Cash',date '2026-07-27')
) as e(category, payee, detail, amount, mode, on_date);

-- ---------- three weeks of register for the new thirty ----------
do $$
declare r record; d date;
begin
  for r in
    select e.id as enrol, e.batch_id, e.member_id, b.days
      from enrollments e
      join members m on m.id = e.member_id
      join batches b on b.id = e.batch_id
     where e.tenant_id = 'mezzo' and m.is_demo and m.phone is null
       and e.status = 'active'
       and not exists (select 1 from attendance_records ar
                        join sessions s on s.id = ar.session_id
                       where ar.enrollment_id = e.id)
  loop
    d := current_date - 20;
    while d <= current_date loop
      if extract(dow from d)::int = any (r.days) then
        perform mark_attendance('mezzo', r.batch_id, d, r.enrol,
          case when (r.member_id * 13 + extract(day from d)::int) % 8 = 0
               then 'absent' else 'present' end);
      end if;
      d := d + 1;
    end loop;
  end loop;
end $$;

-- ---------- prove it ----------
do $$
declare
  v_all int; v_real int; v_due int; v_paused int; v_void int;
  v_months int; v_expmonths int; v_marks int;
begin
  select count(*) into v_all  from members where tenant_id = 'mezzo';
  select count(*) into v_real from members where tenant_id = 'mezzo' and coalesce(is_demo,false) = false;
  select count(*) into v_due  from reminder_queue('mezzo');
  select count(*) into v_paused from enrollments where tenant_id = 'mezzo' and status = 'paused';
  select count(*) into v_void from payments where tenant_id = 'mezzo' and status = 'void';
  select count(distinct to_char(on_date,'YYYY-MM')) into v_months
    from payments where tenant_id = 'mezzo' and status <> 'void';
  select count(distinct to_char(on_date,'YYYY-MM')) into v_expmonths
    from expenses where tenant_id = 'mezzo';
  select count(*) into v_marks from attendance_records ar
    join sessions s on s.id = ar.session_id where s.tenant_id = 'mezzo';

  if v_all <> 46 then raise exception 'tenant has % members, expected 46', v_all; end if;
  if v_real <> 0 then raise exception '% members are not marked is_demo — cleanup would miss them', v_real; end if;
  if v_paused < 3 then raise exception 'only % paused', v_paused; end if;
  if v_void < 1 then raise exception 'no voided payment, so the Undo path has no example'; end if;
  /* the point of the expense half: every month that took money in also
     shows what it cost to earn it */
  if v_expmonths < v_months then
    raise exception 'payments span % months but expenses only % — the Money tab still shows a business that never spends',
      v_months, v_expmonths;
  end if;

  raise notice 'mezzo: % members, % due, % paused, % voided, % months of fees, % of costs, % marks',
    v_all, v_due, v_paused, v_void, v_months, v_expmonths, v_marks;
end $$;
