/* ============================================================
   MEZZO SCHOOL OF MUSIC — cloud adapter (window.MZ)
   Supabase over fetch. No SDK, no build step.

   ONE USER. Dr. Santhana Krishnan is the only person who will ever
   open this app, and he is not a technical man. Two consequences run
   through this file:

     · Nothing is stored locally except the session. The database is
       the record. A local draft that disagrees with Postgres is worse
       than no app, because he has no second screen to check against.
     · Every failure says something in English. A silent catch here
       becomes "it didn't work" on a phone call.

   THE HOUSE RULE. Money is never computed here. resolve_fee() prices
   a student, record_fee_payment() is the only way a rupee is written,
   and reminder_queue() decides who is late. If a number is needed and
   no function returns it, it goes in the SQL — not in this file.
   ============================================================ */
(function () {
  "use strict";

  var APP_VER = "1";
  var PROJECT = "https://ugsklcipzyiogxynshnh.supabase.co";
  var BASE    = PROJECT + "/rest/v1";
  var AUTH    = PROJECT + "/auth/v1";
  /* The anon key is public by design and belongs in this repo. It grants
     nothing on its own: RLS scopes every read to the signed-in tenant. */
  var KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnc2tsY2lwenlpb2d4eW5zaG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTUyMzksImV4cCI6MjA5ODQ3MTIzOX0.w7xkjdTkYN2qA0oxMKLUNtua0ScKVHKQzfEyIayh9eo";
  var TENANT  = "mezzo";
  var SKEY    = "mz-session";
  var PREFIX  = "mz-";

  /* ---------------- session ---------------- */
  function session() {
    try { return JSON.parse(localStorage.getItem(SKEY)); } catch (e) { return null; }
  }
  function save(s)  { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {} }
  function clear()  { try { localStorage.removeItem(SKEY); } catch (e) {} }
  function signedIn() { var s = session(); return !!(s && s.access_token); }

  function tokenReq(body) {
    var grant = body.refresh_token ? "refresh_token" : "password";
    return fetch(AUTH + "/token?grant_type=" + grant, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error_description || j.msg || j.error || "Sign-in failed");
        var meta = (j.user && j.user.app_metadata) || {};
        var s = {
          access_token: j.access_token,
          refresh_token: j.refresh_token,
          expires_at: Date.now() + (j.expires_in || 3600) * 1000,
          email: j.user && j.user.email,
          role: meta.am_role || "",
          tenant: meta.tenant_id || ""
        };
        /* An account with no claims signs in perfectly and then sees an
           empty app, which looks identical to a broken one. Say so. */
        if (!s.tenant && s.role !== "operator") {
          throw new Error("This login has no academy attached to it. Ask for the claims to be set.");
        }
        if (s.tenant !== TENANT && s.role !== "operator") {
          throw new Error("This login belongs to a different academy.");
        }
        save(s);
        return s;
      });
    });
  }
  function signIn(email, password) { return tokenReq({ email: email, password: password }); }
  function signOut() { clear(); }

  /* Refresh a token that is close to expiring, so he is never bounced to
     the sign-in screen halfway through marking a register. */
  function bearer() {
    var s = session();
    if (!s || !s.access_token) return Promise.resolve(KEY);
    if (s.expires_at - Date.now() > 90000) return Promise.resolve(s.access_token);
    return tokenReq({ refresh_token: s.refresh_token })
      .then(function (n) { return n.access_token; })
      .catch(function () { clear(); return KEY; });
  }

  /* ---------------- transport ---------------- */
  function req(path, opts) {
    opts = opts || {};
    return bearer().then(function (tok) {
      var h = { apikey: KEY, Authorization: "Bearer " + tok, "Content-Type": "application/json" };
      if (opts.prefer) h.Prefer = opts.prefer;
      return fetch(BASE + path, {
        method: opts.method || "GET",
        headers: h,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      }).then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
          if (!r.ok) {
            var msg = (j && (j.message || j.hint || j.error)) || ("Request failed (" + r.status + ")");
            var err = new Error(msg); err.status = r.status;
            /* A handled failure is still a failure the console should
               see. NEVER put a name, a phone number or an amount in it. */
            report("client_error", { msg: String(msg).slice(0, 140), status: r.status, path: path.split("?")[0] });
            throw err;
          }
          return j;
        });
      });
    });
  }
  function get(p)        { return req(p); }
  function post(p, b)    { return req(p, { method: "POST",  body: b, prefer: "return=representation" }); }
  function patch(p, b)   { return req(p, { method: "PATCH", body: b, prefer: "return=representation" }); }
  function rpc(fn, args) { return req("/rpc/" + fn, { method: "POST", body: args || {} }); }

  var T = "tenant_id=eq." + TENANT;

  /* ---------------- who, as opposed to which tab ----------------
     A session id dies with the tab, so the same person opening the app
     tomorrow reads as somebody new. This one lives in localStorage,
     which is what lets "3 visits" mean one person three times. It
     identifies a BROWSER: no name, no phone, nothing from the account. */
  function vid() {
    try {
      var k = PREFIX + "vid", v = localStorage.getItem(k);
      if (!v) { v = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(k, v); }
      return v;
    } catch (e) { return null; }
  }
  function sid() {
    try {
      var k = PREFIX + "sid", v = sessionStorage.getItem(k);
      if (!v) { v = Math.random().toString(36).slice(2); sessionStorage.setItem(k, v); }
      return v;
    } catch (e) { return null; }
  }

  /* Telemetry from day one: a tenant that sends nothing reads as
     "Onboarding" on the operator console forever. Counts only — no
     names, no phone numbers, no amounts, ever. */
  function report(name, props) {
    try {
      fetch(BASE + "/events", {
        method: "POST",
        headers: { apikey: KEY, Authorization: "Bearer " + KEY,
                   "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          tenant_id: TENANT, name: name,
          page: (location.pathname.split("/").pop() || "index.html").slice(0, 60),
          session_id: sid(),
          props: Object.assign({ ver: APP_VER, vid: vid() }, props || {})
        }),
        keepalive: true
      }).catch(function () {});
    } catch (e) { /* reporting must never break a screen */ }
  }

  /* ---------------- reference data ----------------
     Instruments and the two time windows change roughly never, and every
     screen needs them, so they are read once per page load. */
  var refCache = null;
  function reference(force) {
    if (refCache && !force) return Promise.resolve(refCache);
    return Promise.all([
      get("/centres?" + T + "&active=is.true&order=sort&select=id,code,name,short_name"),
      get("/batches?" + T + "&active=is.true&order=sort&select=id,code,name,days,start_time,end_time"),
      get("/sports?"  + T + "&active=is.true&order=sort&select=id,code,name,icon")
    ]).then(function (r) {
      refCache = { centres: r[0] || [], batches: r[1] || [], instruments: r[2] || [] };
      return refCache;
    });
  }

  /* ---------------- students ---------------- */
  function students() {
    return get("/members?" + T + "&status=neq.discontinued&order=name" +
               "&select=id,name,phone,parent_name,parent_phone,status,joined," +
               "enrollments(id,sport,batch_id,centre_id,status,renewal_on,plan_months)");
  }
  function addStudent(a) {
    /* Two writes, deliberately in order: the member, then the enrolment
       that carries the instrument. The instrument is what prices them —
       resolve_fee() reads enrollments.sport — so an enrolment without one
       is a student nobody can bill. */
    if (!a.name)       return Promise.reject(new Error("A name is needed."));
    if (!a.instrument) return Promise.reject(new Error("Pick an instrument."));
    if (!a.batch)      return Promise.reject(new Error("Pick weekday or Saturday."));
    return post("/members", {
      tenant_id: TENANT, name: a.name.trim(), phone: a.phone || null,
      parent_name: a.parentName || null, parent_phone: a.phone || null,
      status: "active", joined: a.joined || todayIso()
    }).then(function (rows) {
      var m = rows[0];
      return post("/enrollments", {
        tenant_id: TENANT, member_id: m.id, centre_id: a.centre, batch_id: a.batch,
        sport: a.instrument, plan_months: 1, joined_on: a.joined || todayIso(),
        renewal_on: a.renewalOn || monthOn(a.joined || todayIso(), 1), status: "active"
      }).then(function () { report("student_added", {}); return m; });
    });
  }
  function stopStudent(memberId) {
    return patch("/members?" + T + "&id=eq." + memberId,
                 { status: "discontinued", discontinued_on: todayIso() })
      .then(function (r) { report("student_stopped", {}); return r; });
  }

  /* ---------------- attendance ----------------
     mark_attendance() owns this: it creates the day's session if there
     is not one yet, and writes the record. Never insert into
     attendance_records directly — the session would be missing. */
  /* `null` is a real status here — it CLEARS the mark, which is the
     third tap of the register's cycle. So the default may only apply
     when the caller said nothing at all: `status || "present"` turned
     an intentional clear back into a present, and the third tap would
     have silently done nothing for as long as the app existed. */
  function mark(batchId, dateIso, enrollmentId, status) {
    return rpc("mark_attendance", {
      p_tenant: TENANT, p_batch: batchId, p_date: dateIso,
      p_enrollment: enrollmentId,
      p_status: status === undefined ? "present" : status
    }).then(function (r) { report("attendance_marked", {}); return r; });
  }
  /* The register, in ONE call. attendance_month() returns a row per
     active student with their marks as a date -> status map, including
     students who have no marks at all — an empty row is the child who
     has not come, and dropping it would hide exactly that.

     The alternative was attendance_roster() once per day per batch: 62
     round trips for a month. The database answers in milliseconds; the
     round trip to Tokyo is ~180 ms, so the only optimisation that
     matters here is asking once. */
  function register(fromIso, toIso) {
    return rpc("attendance_month", { p_tenant: TENANT, p_from: fromIso, p_to: toIso });
  }

  /* ---------------- money ----------------
     resolve_fee prices, record_fee_payment writes. Neither number is
     ever computed in this file. */
  function feeFor(enrollmentId, months) {
    return rpc("enrollment_fee", { p_enrollment: enrollmentId, p_months: months || 1 })
      .catch(function () { return null; });
  }
  function takePayment(a) {
    return rpc("record_fee_payment", {
      p_tenant: TENANT, p_enrollment: a.enrollment, p_amount: a.amount,
      p_months: a.months || 1, p_mode: a.mode || "UPI",
      p_on_date: a.onDate || todayIso(), p_note: a.note || null
    }).then(function (r) { report("payment_recorded", {}); return r; });
  }
  function payments(fromIso, toIso) {
    return get("/payments?" + T + "&on_date=gte." + fromIso + "&on_date=lte." + toIso +
               "&order=on_date.desc&select=id,amount,on_date,mode,kind,status,member_id,enrollment_id");
  }
  function expenses(fromIso, toIso) {
    return get("/expenses?" + T + "&on_date=gte." + fromIso + "&on_date=lte." + toIso +
               "&order=on_date.desc&select=id,category,payee,detail,amount,mode,on_date");
  }
  function addExpense(a) {
    if (!a.amount || a.amount <= 0) return Promise.reject(new Error("Enter an amount."));
    return post("/expenses", {
      tenant_id: TENANT, category: a.category || "General", detail: a.detail || null,
      amount: Math.round(a.amount), mode: a.mode || "Cash", on_date: a.onDate || todayIso()
    }).then(function (r) { report("expense_added", {}); return r; });
  }

  /* ---------------- who is late ----------------
     reminder_queue() decides. This tenant's config says "simple, 1 day",
     so what comes back is already exactly the list he asked for — no
     filtering here, or his screen and his WhatsApp could disagree. */
  function dues() { return rpc("reminder_queue", { p_tenant: TENANT }); }
  function logReminder(a) {
    return rpc("log_manual_reminder", {
      p_tenant: TENANT, p_enrollment: a.enrollment, p_stage: a.stage || "overdue",
      p_amount: a.amount, p_phone: a.phone, p_channel: "whatsapp", p_by: "staff"
    }).then(function (r) { report("reminder_sent", {}); return r; });
  }

  /* ---------------- dates, in IST ----------------
     The database renders UTC and the academy thinks in IST. Everything
     this app shows or sends is an IST calendar day, built locally, never
     via toISOString() — which would silently shift 05:30 back a day for
     anything before half past five in the morning. */
  function todayIso() { return iso(new Date()); }
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }
  function monthOn(fromIso, months) {
    var p = fromIso.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setMonth(d.getMonth() + (months || 1));
    return iso(d);
  }
  function monthRange(y, m) {                      // m is 1-12
    return { from: y + "-" + String(m).padStart(2, "0") + "-01",
             to:   iso(new Date(y, m, 0)),
             days: new Date(y, m, 0).getDate() };
  }

  window.MZ = {
    TENANT: TENANT, VER: APP_VER,
    session: session, signedIn: signedIn, signIn: signIn, signOut: signOut,
    report: report, reference: reference,
    students: students, addStudent: addStudent, stopStudent: stopStudent,
    mark: mark, register: register,
    feeFor: feeFor, takePayment: takePayment, payments: payments,
    expenses: expenses, addExpense: addExpense,
    dues: dues, logReminder: logReminder,
    todayIso: todayIso, iso: iso, monthOn: monthOn, monthRange: monthRange
  };
})();
