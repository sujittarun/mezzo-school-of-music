/* Runs the REAL app in node and asserts on what it does.
 *
 *   node scripts/check-app.js
 *
 * WHY THIS EXISTS, before the app has ever been opened
 *
 * The platform this app sits on has shipped the same bug three times: a
 * screen that reviewed perfectly and threw ReferenceError the moment it
 * loaded. Reading the source caught none of them. This one already had
 * a fourth — the register called MZ.rpcRegister(), which the adapter
 * never exported — found by cross-checking exports, not by reading.
 *
 * So nothing here stubs anything the app owns. It loads the real
 * cloud.js and the real page script, fakes only the browser, and
 * asserts on the HTTP calls that come out the other end. If it cannot
 * run, that is the test failing, which is the point.
 *
 * The client is one non-technical man with 80 children's fees in here.
 * "It looked right" is not a standard.
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const cloudSrc = fs.readFileSync(path.join(ROOT, "assets/js/cloud.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
let appSrc = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));

/* One injected line, at the very top of the IIFE: the app returns early
   to the sign-in gate when nobody is signed in, so anything appended at
   the foot would never run. */
const before = appSrc.length;
appSrc = appSrc.replace(/"use strict";/,
  '"use strict"; __x(function () { return { S: S, render: render, enter: enter, boot: boot }; });');
if (appSrc.length === before) { console.error("could not inject the accessor"); process.exit(1); }

/* ---- the browser, and only the browser ---- */
const store = {}, sess = {};
let onClick = null, onInput = null, getApi = null;
const fetchLog = [];
let nextBody = [];
let slowUrls = [];

function mkEl(id) {
  return {
    id, value: "", disabled: false, textContent: "", innerHTML: "", hidden: false,
    style: {}, dataset: {}, onclick: null, onkeydown: null,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, hasAttribute: () => false,
    appendChild() {}, remove() {}, focus() {}, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    get firstElementChild() { return mkEl("frag"); },
  };
}
const els = {};
function byId(id) { if (!els[id]) els[id] = mkEl(id); return els[id]; }

const doc = {
  createElement(tag) {
    const e = mkEl(tag);
    /* esc() is createElement("i").textContent read back as innerHTML, so
       the fake element must escape & < > and leave the double quote
       alone — escaping more than a browser would hide a real bug. */
    let t = "";
    Object.defineProperty(e, "textContent", {
      get: () => t,
      set(v) { t = String(v == null ? "" : v);
               e.innerHTML = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
    });
    return e;
  },
  getElementById: byId,
  querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, ...mkEl("body") },
  documentElement: mkEl("html"), head: mkEl("head"), readyState: "complete",
  addEventListener(t, f) { if (t === "click") onClick = f; if (t === "input") onInput = f; },
};

const ctx = {
  __x: (g) => { getApi = g; }, document: doc, console,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  localStorage: { getItem: (k) => (k in store ? store[k] : null),
                  setItem: (k, v) => { store[k] = String(v); },
                  removeItem: (k) => { delete store[k]; } },
  sessionStorage: { getItem: (k) => (k in sess ? sess[k] : null),
                    setItem: (k, v) => { sess[k] = String(v); }, removeItem() {} },
  location: { pathname: "/index.html", reload() {}, href: "http://x/" },
  navigator: { userAgent: "node" },
  encodeURIComponent, decodeURIComponent, URL, URLSearchParams, Intl,
  fetch(url, opt) {
    const body = opt && opt.body ? JSON.parse(opt.body) : null;
    fetchLog.push({ url: String(url), method: (opt && opt.method) || "GET", body });
    const out = typeof nextBody === "function" ? nextBody(String(url), body) : nextBody;
    const res = {
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify(out)),
      json: () => Promise.resolve(out),
    };
    /* slowUrls lets a test delay a response so request ORDER can be
       exercised, not just its content. Reference data is three parallel
       requests and lands after the single register call in a browser. */
    const slow = slowUrls.some((u) => String(url).includes(u));
    return slow ? new Promise((r) => setTimeout(() => r(res), 5)) : Promise.resolve(res);
  },
  confirm: () => true, alert() {}, prompt: () => null,
};
/* window.onerror is how the app reports crashes it did not catch, so the
   shim has to offer it or the app dies at load — which is a fake failure,
   not a real one. Capture the handler so a later test can fire it. */
let onWindowError = null;
ctx.addEventListener = (t, f) => { if (t === "error") onWindowError = f; };
ctx.removeEventListener = () => {};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

try { vm.runInContext(cloudSrc, ctx, { filename: "cloud.js" }); }
catch (e) { console.error("cloud.js threw on load: " + e.message); process.exit(1); }
try { vm.runInContext(appSrc, ctx, { filename: "index.html" }); }
catch (e) { console.error("the app threw on load: " + e.message); process.exit(1); }

let failed = 0;
function assert(c, m) { if (!c) throw new Error(m); }
async function check(name, fn) {
  try { await fn(); console.log("  ok   " + name); }
  catch (e) { failed += 1; console.log("  FAIL " + name + "\n       " + e.message); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));
function signIn() {
  store["mz-session"] = JSON.stringify({
    access_token: "tok", refresh_token: "r", expires_at: Date.now() + 36e5,
    email: "sir@mezzo.in", role: "staff", tenant: "mezzo" });
}
function calls(needle) { return fetchLog.filter((c) => c.url.includes(needle)); }

(async function () {
  const api = getApi();
  assert(onClick, "no click handler was registered");

  /* ---- 0. it runs at all. The bug this file exists for. ---- */
  await check("the app loads and renders without throwing", () => {
    assert(typeof api.render === "function", "render() is not reachable");
    api.render();
    assert(byId("root").innerHTML.length > 100, "nothing was rendered");
  });

  await check("signed out, it shows the sign-in and ships no password", () => {
    delete store["mz-session"];
    api.render();
    const h = byId("root").innerHTML;
    assert(h.includes("Sign in"), "the sign-in screen did not render");
    /* This repo is public. A value= on these inputs is a live credential
       on the open web, and it survives in git history after removal. */
    assert(!/<input[^>]*type="password"[^>]*value=/.test(h), "the password field is prefilled");
    assert(!/<input[^>]*value="[^"]/.test(h), "a sign-in field ships a value");
  });

  /* ---- 1. the register ---- */
  await check("the register asks the database once for the whole month", async () => {
    signIn();
    fetchLog.length = 0;
    nextBody = [];
    api.S.tab = "register"; api.S.mode = "month";
    api.enter(); await tick(); await tick();
    const reg = calls("attendance_month");
    assert(reg.length === 1, "attendance_month was called " + reg.length + " times, expected exactly 1");
    assert(reg[0].body.p_tenant === "mezzo", "wrong tenant: " + reg[0].body.p_tenant);
    assert(/^\d{4}-\d{2}-01$/.test(reg[0].body.p_from), "p_from is not the 1st: " + reg[0].body.p_from);
    /* 62 round trips at ~180 ms each is eleven seconds of spinner. */
    assert(calls("attendance_roster").length === 0, "it fell back to per-day roster calls");
  });

  await check("a student with no marks still appears in the register", async () => {
    signIn();
    nextBody = [
      { member_name: "Anu", enrollment_id: 1, batch_id: 9, sport: "Guitar", present_days: 0, marks: {} },
      { member_name: "Bala", enrollment_id: 2, batch_id: 9, sport: "Piano", present_days: 3,
        marks: { [MZ_today()]: "present" } },
    ];
    api.S.tab = "register"; api.S.mode = "today"; api.S.day = MZ_today(); api.S.q = "";
    api.enter(); await tick(); await tick();
    const h = byId("root").innerHTML;
    assert(h.includes("Anu"), "the child who has not come was dropped from the register");
    assert(h.includes("Bala"), "the child who came is missing");
    assert(h.includes("1 of 2 here"), "the present count is wrong: " + (h.match(/\d+ of \d+ here/) || ["none"])[0]);
  });

  /* The day patterns arrive on a SECOND request, after the register has
     already painted. Without a re-render when they land, the filter sits
     on its safe fallback — show everybody — and looks broken while being
     perfectly correct about what it knew at the time.

     This was found in a browser, not here, and this check is a SHAPE
     check, not a behavioural one. That is a deliberate admission: the
     ordering that breaks it depends on three parallel requests landing
     after one, and every attempt to force that order in node produced a
     test that passed either way — which is worse than no test, because
     it reads as proof. The real proof is opening the app. What this
     asserts is only that the callback still redraws.
     If you make this behavioural, delete this paragraph. */
  await check("the reference callback redraws (shape check — see the note)", () => {
    const boot = appSrc.slice(appSrc.indexOf("function boot()"), appSrc.indexOf("window.addEventListener"));
    const m = boot.match(/MZ\.reference\(\)\.then\(function \(r\) \{([^}]*)\}/);
    assert(m, "boot() no longer loads the class-day reference at all");
    assert(/render\(\)/.test(m[1]),
      "the day patterns land and nothing redraws — every student will show on every day");
  });

  /* Weekday students do not come on Saturday. Showing all 80 names on
     every day is noise, and an unmarked circle against a child who was
     never expected reads as a register he forgot to fill in. */
  await check("only the students whose class runs today are listed", async () => {
    signIn();
    api.S.ref = { batches: [{ id: 9, days: [1, 2, 3, 4, 5] }, { id: 10, days: [6] }], centres: [], instruments: [] };
    nextBody = [
      { member_name: "Weekday Child", enrollment_id: 1, batch_id: 9, sport: "Piano", present_days: 0, marks: {} },
      { member_name: "Saturday Child", enrollment_id: 2, batch_id: 10, sport: "Drums", present_days: 0, marks: {} },
    ];
    api.S.tab = "register"; api.S.mode = "today"; api.S.q = ""; api.S.showOff = false;
    api.S.day = "2026-08-19";                       // a Wednesday
    api.enter(); await tick(); await tick();
    let h = byId("root").innerHTML;
    assert(h.includes("Weekday Child"), "the child who has a class today is missing");
    assert(!h.includes("Saturday Child"), "a Saturday child is listed on a Wednesday");
    assert(/Show 1 more/.test(h), "there is no way to mark a makeup lesson");

    /* Hiding them must never be final — a makeup lesson on an off day
       is a real thing, and it has to be one tap away, not a setting. */
    onClick({ target: { closest: (s) => (s === "[data-off]" ? {} : null) } });
    await tick();
    h = byId("root").innerHTML;
    assert(h.includes("Saturday Child"), "the off-day child cannot be reached at all");

    api.S.day = "2026-08-22"; api.S.showOff = false;  // a Saturday
    api.enter(); await tick(); await tick();
    h = byId("root").innerHTML;
    assert(h.includes("Saturday Child"), "the Saturday child is missing on a Saturday");
    assert(!/^[\s\S]*Weekday Child[\s\S]*Show 1 more/.test(h) || h.includes("Show 1 more"),
      "the weekday child was neither listed nor offered");
  });

  /* If the batch reference ever comes back without its day pattern,
     the register must not empty itself. "We do not know" and "never"
     are different answers and only one of them is safe. */
  await check("a batch with no day pattern still shows its students", async () => {
    signIn();
    api.S.ref = { batches: [{ id: 9 }, { id: 10, days: [] }], centres: [], instruments: [] };
    nextBody = [
      { member_name: "Child A", enrollment_id: 1, batch_id: 9,  sport: "Piano", present_days: 0, marks: {} },
      { member_name: "Child B", enrollment_id: 2, batch_id: 10, sport: "Drums", present_days: 0, marks: {} },
    ];
    api.S.tab = "register"; api.S.mode = "today"; api.S.showOff = false; api.S.day = "2026-08-19";
    api.enter(); await tick(); await tick();
    const h = byId("root").innerHTML;
    assert(h.includes("Child A"), "a batch with no days field emptied the register");
    assert(h.includes("Child B"), "a batch with an empty days array emptied the register");
  });

  await check("a day with no class says so instead of showing an empty register", async () => {
    signIn();
    api.S.ref = { batches: [{ id: 9, days: [1, 2, 3, 4, 5] }], centres: [], instruments: [] };
    nextBody = [{ member_name: "Weekday Child", enrollment_id: 1, batch_id: 9, sport: "Piano", present_days: 0, marks: {} }];
    api.S.tab = "register"; api.S.mode = "today"; api.S.showOff = false;
    api.S.day = "2026-08-23";                        // a Sunday
    api.enter(); await tick(); await tick();
    assert(byId("root").innerHTML.includes("No class today"), "Sunday shows a register instead of saying it is closed");
  });

  /* ---- 2. marking: the thing he touches most ---- */
  await check("tapping cycles blank → present → absent → blank", async () => {
    signIn();
    for (const [now, want] of [["", "present"], ["present", "absent"], ["absent", null]]) {
      fetchLog.length = 0;
      nextBody = {};
      api.S.register = { rows: [{ member_name: "Anu", enrollment_id: 1, batch_id: 9, marks: {} }] };
      api.S.busy = {};
      const btn = { getAttribute: (k) => ({ "data-mark": "1", "data-batch": "9", "data-now": now }[k]),
                    classList: { add() {}, remove() {}, contains: () => false } };
      onClick({ target: { closest: (s) => (s === "[data-mark]" ? btn : null) } });
      await tick(); await tick();
      const m = calls("mark_attendance");
      assert(m.length === 1, 'from "' + now + '" the tap made ' + m.length + " calls");
      assert(m[0].body.p_status === want,
        'from "' + now + '" it sent ' + JSON.stringify(m[0].body.p_status) + ", expected " + JSON.stringify(want));
      assert(m[0].body.p_batch === 9 && m[0].body.p_enrollment === 1, "wrong ids: " + JSON.stringify(m[0].body));
    }
  });

  await check("a student with no class time cannot be silently un-markable", async () => {
    signIn(); fetchLog.length = 0;
    const btn = { getAttribute: (k) => ({ "data-mark": "1", "data-batch": "", "data-now": "" }[k]),
                  classList: { add() {}, remove() {}, contains: () => false } };
    onClick({ target: { closest: (s) => (s === "[data-mark]" ? btn : null) } });
    await tick();
    assert(calls("mark_attendance").length === 0, "it marked attendance against no batch");
  });

  /* ---- 3. dues ---- */
  await check("dues shows what reminder_queue returns, unfiltered", async () => {
    signIn();
    nextBody = [
      { enrollment_id: 5, member_name: "Chitra", parent_name: "Uma", phone: "9000000665",
        sport: "Violin", amount: 1500, days_since: 1, due_date: "2026-08-18" },
      { enrollment_id: 6, member_name: "Deepak", phone: "9000000001",
        sport: "Piano", amount: 2500, days_since: 40, due_date: "2026-07-10" },
    ];
    api.S.tab = "dues"; api.enter(); await tick(); await tick();
    const h = byId("root").innerHTML;
    assert(h.includes("Chitra") && h.includes("Deepak"), "a name is missing from the dues list");
    /* 40 days late must still be chased: the +15 stop belongs to the
       ladder, and this tenant is not on the ladder. */
    assert(h.includes("40 days late"), "the long-overdue student was dropped");
    assert(h.includes("2 to collect") && h.includes("₹4,000"), "the total is wrong");
  });

  await check("the WhatsApp link carries the country code and no stray characters", async () => {
    signIn();
    nextBody = [{ enrollment_id: 5, member_name: "Chitra", parent_name: "Uma", phone: "90000 00665",
                  sport: "Violin", amount: 1500, days_since: 1, due_date: "2026-08-18" }];
    api.S.tab = "dues"; api.enter(); await tick(); await tick();
    const h = byId("root").innerHTML;
    const m = h.match(/href="(https:\/\/wa\.me\/[^"]+)"/);
    assert(m, "no WhatsApp link was rendered");
    assert(m[1].startsWith("https://wa.me/919000000665?"),
      "the number is not a dialable 91xxxxxxxxxx: " + m[1].slice(0, 40));
    assert(/target="_blank"/.test(h) && /rel="noopener"/.test(h), "the link is not safely external");
  });

  /* A payment is three questions and a confirmation now, not one tap.
     These four checks exist because each of the three was previously
     hardcoded, and the months one reached the parent: a term paid up
     front recorded as one month rolls renewal_on forward once, and the
     platform then chases a family that has already paid. */
  await check("the Paid button opens the sheet and writes nothing yet", async () => {
    signIn(); fetchLog.length = 0; nextBody = {};
    const btn = { getAttribute: (k) => ({ "data-paid": "5", "data-amt": "1500",
                                          "data-nm": "Chitra", "data-sport": "Violin" }[k]) };
    onClick({ target: { closest: (s) => (s === "[data-paid]" ? btn : null) } });
    await tick(); await tick();
    assert(calls("record_fee_payment").length === 0,
      "it recorded a payment before he had confirmed anything");
    assert(api.S.pay && api.S.pay.enrollment === 5, "the sheet did not open on the right student");
    assert(api.S.pay.amount === 1500, "the sheet lost the amount the queue quoted");
  });

  await check("months and mode are asked, and both reach the database", async () => {
    signIn();
    api.S.pay = { enrollment: 5, name: "Chitra", sport: "Violin", amount: 1500, months: 1, mode: "Cash" };
    fetchLog.length = 0; nextBody = { amount: 4500 };

    /* three months: the price must be re-asked, never multiplied here */
    onClick({ target: { closest: (s) => (s === "[data-paymonths]"
      ? { getAttribute: () => "3" } : null) } });
    await tick(); await tick();
    assert(calls("enrollment_fee").length === 1,
      "it did not ask the database what three months costs");
    assert(api.S.pay.amount === 4500, "it ignored the price the database returned");

    onClick({ target: { closest: (s) => (s === "[data-paymode]"
      ? { getAttribute: () => "UPI" } : null) } });
    await tick();
    assert(api.S.pay.mode === "UPI", "the payment mode was not recorded");

    fetchLog.length = 0; nextBody = {};
    byId("payAmt").value = "4500";   /* elements exist on first access */
    onClick({ target: { closest: (s) => (s === "#payGo" ? {} : null) } });
    await tick(); await tick();
    const p = calls("record_fee_payment");
    assert(p.length === 1, "confirming made " + p.length + " calls to record_fee_payment");
    assert(p[0].body.p_months === 3, "months went in as " + p[0].body.p_months + ", not 3");
    assert(p[0].body.p_mode === "UPI", "mode went in as " + p[0].body.p_mode + ", not UPI");
    assert(p[0].body.p_amount === 4500, "amount went in as " + p[0].body.p_amount);
    /* Nothing else may write a payment: that function also rolls the
       renewal date forward and closes the reminder. */
    assert(calls("/payments").filter((c) => c.method === "POST").length === 0,
      "it wrote to the payments table directly, bypassing the fee logic");
  });

  await check("a family who paid ON TIME can still be recorded", async () => {
    signIn(); api.S.pay = null; api.S.picker = null;
    fetchLog.length = 0;
    nextBody = [{ id: 9, name: "Gowri", enrollments: [{ id: 12, sport: "Ukulele" }] }];
    onClick({ target: { closest: (s) => (s === "[data-other]" ? {} : null) } });
    await tick(); await tick();
    assert(calls("/members").length >= 1,
      "the picker never read the members list, so only overdue families can pay");

    nextBody = { amount: 1500 };
    onClick({ target: { closest: (s) => (s === "[data-pick]"
      ? { getAttribute: (k) => ({ "data-pick": "12", "data-nm": "Gowri",
                                  "data-sport": "Ukulele" }[k]) } : null) } });
    await tick(); await tick();
    assert(api.S.pay && api.S.pay.enrollment === 12,
      "picking a student did not open the payment sheet");
    assert(api.S.pay.amount === 1500,
      "the amount was not priced by the database for a student who is not overdue");
  });

  /* ---- 4. fixing things ---- */
  await check("stopping a student goes through discontinue_member", async () => {
    signIn(); fetchLog.length = 0; nextBody = {};
    api.S.who = { enrollment: 7, member: 3, name: "Deepak", sport: "Drums",
                  batch: 1, phone: "", confirmStop: true };
    onClick({ target: { closest: (s) => (s === "#whStopYes" ? {} : null) } });
    await tick(); await tick();
    assert(calls("discontinue_member").length === 1,
      "it did not call discontinue_member");
    /* THE POINT OF THAT RPC. It closes every live enrolment as well as
       the member. reminder_queue() reads enrolments, so a PATCH that
       only set members.status would leave a child who has left being
       chased for fees by WhatsApp for ever. */
    assert(calls("/members").filter((c) => c.method === "PATCH").length === 0,
      "it patched members directly, which leaves the enrolment open and the family still billed");
    assert(calls("discontinue_member")[0].body.p_member === 3,
      "wrong member: " + JSON.stringify(calls("discontinue_member")[0].body));
  });

  await check("editing a student writes the member and the enrolment", async () => {
    signIn(); fetchLog.length = 0; nextBody = {};
    api.S.who = { enrollment: 7, member: 3, name: "Deepak", sport: "Drums",
                  batch: 1, phone: "9000000123", loaded: true, confirmStop: false };
    byId("whName").value  = "Deepak S";
    byId("whPhone").value = "90000 00123";
    byId("whIns").value   = "Piano";
    byId("whBatch").value = "2";
    onClick({ target: { closest: (s) => (s === "#whSave" ? {} : null) } });
    await tick(); await tick(); await tick();

    const mem = calls("/members").filter((c) => c.method === "PATCH");
    assert(mem.length === 1, "the member was not updated");
    assert(mem[0].body.name === "Deepak S", "the name did not change");
    /* Typed with a space; the database must get digits only, or the
       WhatsApp link built from it goes nowhere. */
    assert(mem[0].body.phone === "9000000123",
      "the phone was stored unclean: " + mem[0].body.phone);

    const enr = calls("/enrollments").filter((c) => c.method === "PATCH");
    assert(enr.length === 1, "the enrolment was not updated");
    assert(enr[0].body.sport === "Piano" && enr[0].body.batch_id === 2,
      "instrument or time window did not move: " + JSON.stringify(enr[0].body));
  });

  /* THE ONE THAT COST A FAMILY ITS REMINDERS.
     attendance_month() returns member_id but NOT a phone number, so
     the card has to fetch it. Until that arrives the field is empty —
     and an empty field written back over a real number silently cuts
     that family off from every WhatsApp reminder, with nothing on
     screen to say so. So an unloaded phone is not sent at all. */
  await check("an unloaded phone is never written over a real one", async () => {
    signIn(); fetchLog.length = 0; nextBody = {};
    api.S.who = { enrollment: 7, member: 3, name: "Deepak", sport: "Drums",
                  batch: 1, phone: "", loaded: false, confirmStop: false };
    byId("whName").value  = "Deepak";
    byId("whPhone").value = "";
    onClick({ target: { closest: (s) => (s === "#whSave" ? {} : null) } });
    await tick(); await tick(); await tick();
    const mem = calls("/members").filter((c) => c.method === "PATCH");
    assert(mem.length === 1, "the member was not updated at all");
    assert(!("phone" in mem[0].body),
      "it sent a phone it had never read: " + JSON.stringify(mem[0].body));
  });

  /* The other half of that guard: a number he TYPES must still be
     saved, even though the read never came back. Otherwise a student
     whose record has no phone could never be given one. */
  await check("a phone he types is saved even if the read failed", async () => {
    signIn(); fetchLog.length = 0; nextBody = {};
    api.S.who = { enrollment: 7, member: 3, name: "Deepak", sport: "Drums",
                  batch: 1, phone: "", loaded: false, asked: true, confirmStop: false };
    byId("whName").value  = "Deepak";
    byId("whPhone").value = "98000 12345";
    onClick({ target: { closest: (s) => (s === "#whSave" ? {} : null) } });
    await tick(); await tick(); await tick();
    const mem = calls("/members").filter((c) => c.method === "PATCH");
    assert(mem[0].body.phone === "9800012345",
      "a typed number was dropped: " + JSON.stringify(mem[0].body));
  });

  await check("a payment can be taken back through void_payment", async () => {
    signIn(); fetchLog.length = 0; nextBody = {};
    onClick({ target: { closest: (s) => (s === "[data-void]"
      ? { getAttribute: () => "42" } : null) } });
    await tick(); await tick();
    const v = calls("void_payment");
    assert(v.length === 1, "Undo made " + v.length + " calls to void_payment");
    assert(v[0].body.p_payment === 42, "wrong payment: " + JSON.stringify(v[0].body));
    /* Never a status flip on the row: void_payment also recomputes
       which months the money had covered. */
    assert(calls("/payments").filter((c) => c.method === "PATCH").length === 0,
      "it flipped the payment row directly and left the coverage wrong");
  });

  await check("an expense is amount + what + save, and nothing else", async () => {
    signIn(); fetchLog.length = 0; nextBody = [];
    byId("exAmt").value = "450"; byId("exWhat").value = "Guitar strings";
    onClick({ target: { closest: (s) => (s === "#exSave" ? byId("exSave") : null) } });
    await tick(); await tick();
    const ex = fetchLog.filter((c) => c.url.includes("/expenses") && c.method === "POST");
    assert(ex.length === 1, "saving made " + ex.length + " expense writes");
    assert(ex[0].body.amount === 450, "wrong amount: " + ex[0].body.amount);
    assert(ex[0].body.detail === "Guitar strings", "wrong detail: " + ex[0].body.detail);
    assert(ex[0].body.tenant_id === "mezzo", "wrong tenant on the expense");
  });

  await check("an expense with no amount is refused, not saved as zero", async () => {
    signIn(); fetchLog.length = 0;
    byId("exAmt").value = ""; byId("exWhat").value = "nothing";
    onClick({ target: { closest: (s) => (s === "#exSave" ? byId("exSave") : null) } });
    await tick(); await tick();
    assert(fetchLog.filter((c) => c.url.includes("/expenses") && c.method === "POST").length === 0,
      "a blank amount was saved");
  });

  /* ---- 5. the house rule, as a test ---- */
  await check("no fee is ever computed in the client", () => {
    const both = cloudSrc + appSrc;
    /* The two prices exist in exactly one place: fee_rules, in Postgres.
       A literal here is how his screen and his WhatsApp start
       disagreeing about what a parent owes. */
    /* Both spellings, because a human writes the second one. The guard
       used to be \b(2500|1500)\b, which cannot see ₹2,500 — and the
       add-student screen said "₹2,500 for piano, ₹1,500 for everything
       else" underneath it for as long as the screen existed. The
       lookarounds keep 21500 and 15000 from reading as a fee. */
    const FEE = /(?<![\d.,])(?:1|2),?500(?![\d.,])/;
    const lines = both.split("\n").filter((l) =>
      FEE.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
    assert(lines.length === 0,
      "a fee amount is hardcoded outside a comment:\n         " + lines[0]);
    assert(!/resolve_fee|monthly_amount\s*[*+]/.test(appSrc.replace(/\/\*[\s\S]*?\*\//g, "")),
      "the page does fee arithmetic");
  });

  /* A static site with ?v=1 pinned in it forever is a site nobody ever
     sees an update to: the browser holds the old CSS and JS and the
     deploy appears to have done nothing. This does not check that the
     stamp is CORRECT — nothing can — only that it was moved off the
     value it shipped with, which is the mistake that actually happens. */
  await check("the asset cache stamp has been moved off ?v=1", () => {
    const stamps = (html.match(/\?v=([0-9a-z]+)/g) || []);
    assert(stamps.length >= 2, "assets are not cache-stamped at all");
    assert(!stamps.includes("?v=1"), "an asset is still pinned at ?v=1");
  });

  await check("telemetry carries counts, never a name, phone or amount", () => {
    const rep = cloudSrc.slice(cloudSrc.indexOf("function report("), cloudSrc.indexOf("function reference("));
    ["name:", "phone", "amount", "member_name"].forEach((bad) => {
      assert(!new RegExp("props[^}]*" + bad).test(rep), "report() may be leaking " + bad);
    });
    const evs = (appSrc + cloudSrc).match(/report\("(\w+)"/g) || [];
    assert(evs.length >= 4, "only " + evs.length + " event kinds; the console reads a silent tenant as Onboarding");
  });

  console.log(failed ? "\n" + failed + " failed" : "\nall app checks passed");
  process.exit(failed ? 1 : 0);
})();

function MZ_today() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
         "-" + String(d.getDate()).padStart(2, "0");
}
