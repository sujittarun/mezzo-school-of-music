-- ============================================================
-- TEN MARKED TEST STUDENTS FOR MEZZO
--
-- The tenant was six demo students, zero payments and one expense, so
-- signing in showed an app with nothing in it — which is why the owner
-- had been living on a published /try/ build full of invented children
-- instead. That build is gone now, so the real tenant has to be worth
-- opening.
--
-- WHY THIS IS SAFE TO RUN, measured before writing a line of it:
--   * members in mezzo: 6, and all six are already is_demo. There are
--     ZERO real families in this tenant.
--   * tenants.config.whatsapp for mezzo is null, so there is no
--     automated sender. The app builds a wa.me link the operator taps
--     by hand; nothing here can text anybody on its own.
-- The guard at the top re-checks the first of those at apply time and
-- refuses if it has stopped being true.
--
-- EVERY MEMBER CARRIES is_demo = true, so the whole lot comes out in
-- one line when the real families arrive:
--
--   delete from members where tenant_id = 'mezzo' and is_demo;
--
-- The money is NOT inserted. record_fee_payment() writes every rupee,
-- because that is the one write path for fees and it is what rolls
-- renewal_on forward — a seed that inserted into payments directly
-- would produce a tenant whose dues do not match its history. Same for
-- attendance: mark_attendance() creates the day's session, and an
-- attendance_record without one is invisible to attendance_month().
--
-- Scope: mezzo. Nothing here alters a shared table, adds a trigger or
-- replaces a shared function; it inserts this tenant's own rows and
-- calls the platform's functions to do it.
-- ============================================================

-- ---------- 1. refuse to run over real families ----------
do $$
declare v_real int;
begin
  select count(*) into v_real
  from members where tenant_id = 'mezzo' and coalesce(is_demo, false) = false;
  if v_real > 0 then
    raise exception
      'mezzo now holds % real (non-demo) member(s). This seed was written for an empty tenant; adding invented families beside real ones is a data incident, not a test.', v_real;
  end if;
  if exists (select 1 from members where tenant_id = 'mezzo' and name = 'Aadhira Suresh') then
    raise exception 'these demo students are already here — nothing to do';
  end if;
end $$;

-- ---------- 2. the day patterns ----------
-- A batch row IS a day pattern in this app, and the client creates one
-- on demand from the day picker. These are seeded to match that exactly
-- — code "d" + the days, name from the same label rule — so the app
-- REUSES them instead of creating a second row for the same pattern.
-- No short_name: batches has never had that column. The app was setting
-- it too, which is why the first student put on a new pair of days
-- could not be saved at all — fixed in cloud.js in the same breath.
insert into batches (tenant_id, centre_id, code, name, days, active, sort,
                     start_time, end_time, capacity, sport)
select 'mezzo', b.centre_id, d.code, d.label, d.days, true, 10 + d.n,
       b.start_time, b.end_time, b.capacity, b.sport
from (select * from batches where tenant_id = 'mezzo' and code = 'weekday' limit 1) b
cross join (values
  (1, 'd14', 'Mon, Thu', array[1,4]),
  (2, 'd25', 'Tue, Fri', array[2,5]),
  (3, 'd36', 'Wed, Sat', array[3,6]),
  (4, 'd13', 'Mon, Wed', array[1,3]),
  (5, 'd24', 'Tue, Thu', array[2,4]),
  (6, 'd15', 'Mon, Fri', array[1,5]),
  (7, 'd26', 'Tue, Sat', array[2,6]),
  (8, 'd46', 'Thu, Sat', array[4,6])
) as d(n, code, label, days)
where not exists (
  select 1 from batches x
  where x.tenant_id = 'mezzo'
    and (select array_agg(v order by v) from unnest(x.days) v)
        = (select array_agg(v order by v) from unnest(d.days) v));

-- ---------- 3. the students, their enrolments, their money ----------
do $$
declare
  v_centre bigint;
  r        record;
  v_member bigint;
  v_enrol  bigint;
  v_batch  bigint;
  v_fee    numeric;
  k        int;
  v_pay    date;
begin
  select id into v_centre from centres where tenant_id = 'mezzo' order by id limit 1;

  for r in
    /* first_paid is the day the cycle starts; months is how many
       monthly payments have been taken since. renewal_on therefore
       lands on first_paid + months, which is what puts each of them at
       a different point on the fee dial: four behind, five in tune and
       one away. */
    select * from (values
      ('Aadhira Suresh',  'Piano',    array[1,4], date '2026-05-10', 4, false),
      ('Bhuvan Ramesh',   'Guitar',   array[2,5], date '2026-05-15', 3, false),
      ('Charulatha Iyer', 'Violin',   array[3,6], date '2026-03-06', 6, false),
      ('Dhruv Anand',     'Drums',    array[1,3], date '2026-04-07', 4, false),
      ('Eshanya Prabhu',  'Keyboard', array[2,4], date '2026-03-02', 6, false),
      ('Gokul Varma',     'Ukulele',  array[3,6], date '2026-05-19', 3, false),
      ('Haasini Reddy',   'Vocals',   array[1,5], date '2026-04-18', 4, false),
      ('Isaac Fernandes', 'Piano',    array[2,6], date '2026-05-05', 3, true),
      ('Janaki Murthy',   'Keyboard', array[4,6], date '2026-04-21', 4, false),
      ('Kabilan Selvam',  'Guitar',   array[1,3], date '2026-05-27', 2, false)
    ) as t(nm, sport, days, first_paid, months, paused)
  loop
    select x.id into v_batch from batches x
    where x.tenant_id = 'mezzo'
      and (select array_agg(v order by v) from unnest(x.days) v)
          = (select array_agg(v order by v) from unnest(r.days) v)
    limit 1;
    if v_batch is null then
      raise exception 'no day pattern for % — the batch seed above did not take', r.days;
    end if;

    /* No phone number, deliberately. There is no automated sender for
       this tenant, but a made-up Indian mobile is somebody's real
       number the day one gets wired up. He can put his OWN number on
       any of these from the student card when he wants to try the
       WhatsApp path, which is the only honest way to test it. */
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

    /* The price comes from the fee chain, not from a number typed in
       here. Piano is 2500 and everything else 1500 because fee_rules
       says so, and this seed must not be a second place that knows. */
    v_fee := (resolve_fee('mezzo', v_member, v_centre, r.sport, v_batch, 1)->>'amount')::numeric;

    for k in 0 .. r.months - 1 loop
      v_pay := (r.first_paid + (k || ' months')::interval)::date;
      perform record_fee_payment(
        p_tenant     => 'mezzo',
        p_enrollment => v_enrol,
        p_amount     => v_fee,
        p_months     => 1,
        p_mode       => case when k % 4 = 3 then 'Cash' else 'UPI' end,
        p_on_date    => v_pay);
    end loop;

    /* One family paid a term up front rather than a month, which is
       what makes a 4,500 row in the ledger legible as three months
       instead of a suspicious number. */
    if r.nm = 'Haasini Reddy' then
      perform record_fee_payment(
        p_tenant => 'mezzo', p_enrollment => v_enrol,
        p_amount => v_fee * 3, p_months => 3, p_mode => 'UPI',
        p_on_date => date '2026-08-18');
    end if;

    /* Away for two months. A status flip on its own would bring him
       back sixty days overdue for months he did not attend, so the fee
       date moves with him — the same thing the app's pause does. */
    if r.paused then
      update enrollments
         set status = 'paused',
             renewal_on = (renewal_on + interval '2 months')::date
       where id = v_enrol;
    end if;
  end loop;
end $$;

-- ---------- 4. what the month cost ----------
insert into expenses (tenant_id, category, payee, detail, amount, mode, on_date)
values
  ('mezzo', 'Rent',     'Landlord',      'Studio rent',            18000, 'UPI',  date '2026-08-02'),
  ('mezzo', 'Utility',  'TNEB',          'Electricity',             3400, 'UPI',  date '2026-08-04'),
  ('mezzo', 'Upkeep',   'Tuner',         'Piano tuning',            2200, 'Cash', date '2026-08-06'),
  ('mezzo', 'Supplies', 'Music store',   'Guitar strings x6',       1450, 'Cash', date '2026-08-09'),
  ('mezzo', 'Upkeep',   'Music store',   'Drum head replacement',   2650, 'UPI',  date '2026-08-13'),
  ('mezzo', 'Supplies', 'Printer',       'Printed music books',     1650, 'Cash', date '2026-08-17');

-- ---------- 5. three weeks of register ----------
-- Through mark_attendance(), which creates the day's session. An
-- attendance_record inserted without one is a mark attendance_month()
-- cannot see, so the register would look empty while the rows existed.
do $$
declare
  r record; d date;
begin
  for r in
    select e.id as enrol, e.batch_id, e.member_id, b.days
    from enrollments e
    join members m on m.id = e.member_id
    join batches b on b.id = e.batch_id
    /* active only. mark_attendance() refuses a paused enrolment, and it
       is right to: the one student who is away should have no marks in
       the weeks he was away. attendance_month() filters the same way,
       so he would not appear on the register either. */
    where e.tenant_id = 'mezzo' and m.is_demo and m.phone is null
      and e.status = 'active' 
  loop
    d := (current_date - 20);
    while d <= current_date loop
      if extract(dow from d)::int = any (r.days) then
        perform mark_attendance('mezzo', r.batch_id, d, r.enrol,
          /* deterministic, and not a perfect record: about one lesson
             in seven is a miss, which is what a real register looks
             like and what makes the percentages worth reading */
          case when (r.member_id * 13 + extract(day from d)::int) % 7 = 0
               then 'absent' else 'present' end);
      end if;
      d := d + 1;
    end loop;
  end loop;
end $$;

-- ---------- 6. prove it, and say what it built ----------
do $$
declare
  v_new int; v_pay int; v_amt numeric; v_marks int; v_due int; v_owed numeric; v_paused int;
begin
  select count(*) into v_new from members
   where tenant_id = 'mezzo' and is_demo and phone is null;
  select count(*), coalesce(sum(amount), 0) into v_pay, v_amt
    from payments where tenant_id = 'mezzo' and status <> 'void';
  select count(*) into v_marks from attendance_records ar
    join sessions s on s.id = ar.session_id where s.tenant_id = 'mezzo';
  /* reminder_queue() returns a TABLE, not jsonb — it is read as rows.
     And it answers for the WHOLE tenant, so it is narrowed to the ten
     students this file creates: the six that were already here are due
     as well, which is real and none of this file's business. */
  select count(*), coalesce(sum(q.amount), 0) into v_due, v_owed
    from reminder_queue('mezzo') q
    join members m on m.id = q.member_id
   where m.is_demo and m.phone is null;
  select count(*) into v_paused from enrollments
   where tenant_id = 'mezzo' and status = 'paused';

  if v_new <> 10 then raise exception 'seeded % students, expected 10', v_new; end if;
  if v_pay < 39 then raise exception 'only % payments were recorded', v_pay; end if;
  if v_marks < 100 then raise exception 'only % attendance marks', v_marks; end if;
  if v_paused <> 1 then raise exception '% paused enrolments, expected 1', v_paused; end if;
  /* four of them are behind by design; if the fee chain disagrees, the
     dates above are wrong and the dial would read a fiction */
  if v_due <> 4 then
    raise exception 'reminder_queue says % of the ten are due, expected 4 — the fee dates are wrong and the dial would read a fiction', v_due;
  end if;

  raise notice 'mezzo demo seed: % students, % payments totalling %, % marks, % due (%) , % paused',
    v_new, v_pay, v_amt, v_marks, v_due, v_owed, v_paused;
end $$;
