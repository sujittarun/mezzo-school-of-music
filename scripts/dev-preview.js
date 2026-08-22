/* Generate a signed-in preview of the real app, with no account.
 *
 *   node scripts/dev-preview.js && open _dev-preview.html
 *
 * WHY THIS EXISTS. Every screen worth looking at is behind a sign-in,
 * so iterating on how the register LOOKS used to mean holding real
 * credentials for a live tenant — which is a bad habit to build for an
 * app whose whole job is eighty families' money and attendance.
 *
 * So this takes the real app.html, the real cloud.js and the real
 * page script — nothing is reimplemented — and swaps exactly one
 * thing: fetch. Every screen renders from fixtures, signed in as
 * nobody, against a database that does not exist.
 *
 * The output is gitignored. It is a viewer, not a build step.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "app.html"), "utf8");
const app = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));

/* THE STYLESHEET COMES FROM app.html, not from a string in here.
   This file had its own hardcoded ?v= stamp, so the moment the app's
   stamp moved the preview was rendering the real markup against stale
   CSS — and an audit run against it would have been auditing a build
   that does not exist. */
const cssHref = (html.match(/href="(assets\/css\/app\.css[^"]*)"/) || [])[1] ||
                "assets/css/app.css";

/* Everything the real page puts in <body> before #root — the SVG
   filter defs and the feature test that switches refraction on. Taken
   from app.html rather than copied, because a preview that has
   drifted from the page it previews is worse than no preview: it was
   already reporting no refraction on a page that has it. */
const headOfBody = (function () {
  const b = html.indexOf("<body>");
  const r = html.indexOf('<div id="root">');
  return b < 0 || r < 0 ? "" : html.slice(b + 6, r);
})();

/* Six children, one per instrument, so the palette is all visible at
   once. Nothing here is a real person. */
const TODAY = new Date();
const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
                   "-" + String(d.getDate()).padStart(2, "0");
const T = iso(TODAY);

/* ============================================================
   NINETY-SIX CHILDREN, and a month of money.

   Eight was enough to see whether a screen was pretty. It was never
   enough to see whether it was FAST — the month grid at eight
   students is 8 x 31 cells and at ninety-six it is 2,976, which is
   the difference between "instant" and the complaint that arrived.

   Deterministic on purpose: a fixture that reshuffles on every reload
   cannot be measured twice, and every number below is going to be
   measured.
   ============================================================ */
let SEED = 20260821;
function rnd() { SEED = (SEED * 1103515245 + 12345) & 0x7fffffff; return (SEED >>> 8) / 8388608; }
function pick(a) { return a[Math.floor(rnd() * a.length) % a.length]; }

const FIRST = [
  "Aarthi","Bharath","Chitra","Deepak","Eshwari","Farhan","Gowri","Hari","Ilango","Janani",
  "Karthik","Lakshmi","Mani","Nithya","Oviya","Prakash","Ramya","Sanjay","Tara","Udhay",
  "Vidya","Yazhini","Abhinav","Bhavana","Charu","Dhanush","Ezhil","Ganesh","Harini","Indira",
  "Jeeva","Kavya","Lalitha","Madhan","Nandini","Oorja","Pavithra","Raghav","Sneha","Thamarai",
  "Uma","Varun","Yamini","Anand","Bhargav","Chandra","Divya","Elango","Gayathri","Hemanth",
  "Ishwarya","Jayanth","Keerthi","Lavanya","Mohan","Naveen","Padma","Rajesh","Sundar","Tanvi",
  "Usha","Vignesh","Anjali","Balaji","Chetan","Deepika","Ganga","Haritha","Iniya","Jagan",
  "Kalyani","Lokesh","Meera","Nithin","Poorna","Rekha","Sathya","Tejas","Vasanth","Yuvan",
  "Aditi","Bhuvana","Chinmay","Devika","Girish","Hasini","Kiran","Malar","Nirmala","Preethi",
  "Rithika","Shankar","Swathi","Vaishali","Arjun","Nivetha"
];
/* Twenty-two on piano and eight on drums is not arbitrary: piano is
   the premium instrument here and drums is the one that needs a room
   nobody else can use while it is running. */
const MIX = [["Piano",22],["Guitar",18],["Keyboard",14],["Violin",13],
             ["Vocals",12],["Ukulele",9],["Drums",8]];

const STUDENTS = [];
(function () {
  let n = 0;
  MIX.forEach(([sport, count]) => {
    for (let i = 0; i < count; i++) {
      const name = FIRST[n % FIRST.length] + (n >= FIRST.length ? " " + String.fromCharCode(65 + (n % 26)) : "");
      /* Each child comes on their OWN days now — two a week for most,
         three for a few, and a handful only on Saturday. */
      const r0 = rnd();
      const batch = r0 < 0.20 ? 1 : r0 < 0.34 ? 2 : r0 < 0.50 ? 3
                  : r0 < 0.66 ? 4 : r0 < 0.80 ? 5 : r0 < 0.92 ? 6 : 7;
      /* attendance rate 0.55-1.0. The spread is the point: without it
         nothing can tell a child who is drifting from one who is not. */
      const rate = 0.55 + rnd() * 0.45;
      /* joined between 1 and 26 months ago — retention needs a past */
      const tenure = 1 + Math.floor(rnd() * 26);
      STUDENTS.push({ n, name, sport, batch, rate, tenure });
      n++;
    }
  });
})();

/* The day patterns in play. A batch row is nothing more than one of
   these — see cloud.js. */
const PATTERN = { 1: [1,2,3,4,5], 2: [6], 3: [3,6], 4: [2,4], 5: [1,4], 6: [1,3,5], 7: [2,5] };

const Y = TODAY.getFullYear(), M = TODAY.getMonth() + 1, DOM = TODAY.getDate();
/* n days from today, as an ISO date */
function plusDays(n) {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
         "-" + String(d.getDate()).padStart(2, "0");
}
/* 1 to 30 days out, deterministic */
function renewIso(n) { return plusDays(1 + ((n * 7) % 30)); }
function isoOf(d) { return Y + "-" + String(M).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
function dowOf(d) { return new Date(Y, M - 1, d).getDay(); }

/* the same label the app builds, so the fixture cannot disagree with it */
function LABEL(v) {
  const N = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], runs = [];
  let i = 0;
  while (i < v.length) {
    let j = i; while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++;
    runs.push(j - i >= 2 ? N[v[i]] + "\u2013" + N[v[j]] : v.slice(i, j + 1).map((x) => N[x]).join(", "));
    i = j + 1;
  }
  return runs.join(", ");
}

const fixtures = {
  register: STUDENTS.map((s) => {
    const marks = {};
    for (let d = 1; d <= DOM; d++) {
      const w = dowOf(d);
      const runs = (PATTERN[s.batch] || []).indexOf(w) >= 0;
      if (!runs) continue;
      const r = rnd();
      /* a child who is fading does it toward the END of the month,
         which is the only reason a trend is detectable at all */
      const late = d > DOM - 10 ? (s.rate < 0.72 ? 0.30 : 0) : 0;
      if (r < s.rate - late) marks[isoOf(d)] = "present";
      else if (r < s.rate - late + 0.18) marks[isoOf(d)] = "absent";
    }
    return { enrollment_id: s.n + 1, member_id: s.n + 1, member_name: s.name,
             sport: s.sport, batch_id: s.batch, marks,
             months_enrolled: s.tenure,
             present_days: Object.values(marks).filter((v) => v === "present").length };
  }),
  dues: STUDENTS.filter((s) => s.n % 7 === 3).map((s, i) => ({
    enrollment_id: s.n + 1, member_id: s.n + 1,
    member_name: s.name, parent_name: "Parent " + s.name.split(" ")[0],
    sport: s.sport, amount: s.sport === "Piano" ? 2500 : 1500,
    days_since: 1 + (i * 3) % 26, due_date: isoOf(Math.max(1, DOM - ((i * 3) % 26))),
    phone: "900000" + String(1000 + s.n).slice(-4), already_sent: i % 4 === 0
  })),
  /* REAL PAYMENTS LOOK LIKE THIS.
     UPI is how almost everyone in Coimbatore pays now, so the mix is
     roughly four in five; a handful pay a term up front rather than a
     month, which is what plan_months 3 and 6 are for; and two are
     voided, because a mis-keyed payment being taken back is a normal
     week and the Undo path should be exercised by the fixtures rather
     than only by a test. */
  payments: STUDENTS.filter((s) => s.n % 7 !== 3).slice(0, 62).map((s, i) => {
    const rate = s.sport === "Piano" ? 2500 : 1500;
    const months = i % 17 === 0 ? 6 : i % 9 === 0 ? 3 : 1;
    return {
      id: i + 1, amount: rate * months,
      on_date: isoOf(1 + (i * 3) % Math.max(1, DOM - 1)),
      mode: i % 5 === 0 ? "Cash" : "UPI",
      kind: "fee", status: i === 12 || i === 41 ? "void" : "paid",
      months: months,
      member_id: s.n + 1, enrollment_id: s.n + 1, sport: s.sport,
      /* the embed is what the app reads; two rows carry only the plain
         `name` column so the fallback path is exercised too */
      member: i % 23 === 5 ? null : { name: s.name },
      name: s.name
    };
  }),

  expenses: [
    { id: 1,  category: "Rent",     detail: "Studio rent",        amount: 18000, mode: "UPI",  on_date: isoOf(2) },
    { id: 2,  category: "Utility",  detail: "Electricity",        amount: 3400,  mode: "UPI",  on_date: isoOf(4) },
    { id: 3,  category: "Upkeep",   detail: "Piano tuning",       amount: 2200,  mode: "Cash", on_date: isoOf(6) },
    { id: 4,  category: "Supplies", detail: "Guitar strings x6",  amount: 1450,  mode: "Cash", on_date: isoOf(8) },
    { id: 5,  category: "Supplies", detail: "Violin rosin, bows", amount: 980,   mode: "Cash", on_date: isoOf(9) },
    { id: 6,  category: "Upkeep",   detail: "Drum head replace",  amount: 2650,  mode: "UPI",  on_date: isoOf(11) },
    { id: 7,  category: "Utility",  detail: "Internet",           amount: 1100,  mode: "UPI",  on_date: isoOf(12) },
    { id: 8,  category: "Supplies", detail: "Printed music",      amount: 1650,  mode: "Cash", on_date: isoOf(14) },
    { id: 9,  category: "Upkeep",   detail: "Keyboard stand",     amount: 1900,  mode: "UPI",  on_date: isoOf(16) },
    { id: 10, category: "Utility",  detail: "Water",              amount: 450,   mode: "Cash", on_date: isoOf(17) },
    { id: 11, category: "Supplies", detail: "Ukulele strings",    amount: 620,   mode: "Cash", on_date: isoOf(18) },
    { id: 12, category: "Upkeep",   detail: "Aircon service",     amount: 2800,  mode: "UPI",  on_date: isoOf(19) }
  ],
  members: STUDENTS.map((s) => {
    /* joined `tenure` months ago, so "months here" has something real
       to count */
    const j = new Date(Y, M - 1 - s.tenure, Math.min(28, 1 + (s.n % 27)));
    const ji = j.getFullYear() + "-" + String(j.getMonth() + 1).padStart(2, "0") +
               "-" + String(j.getDate()).padStart(2, "0");
    return {
      id: s.n + 1, name: s.name, phone: "900000" + String(1000 + s.n).slice(-4),
      parent_name: "Parent " + s.name.split(" ")[0],
      parent_phone: "900000" + String(1000 + s.n).slice(-4), joined: ji,
      /* a few are away for a while — enough to see the Paused band
         and to prove a paused child is off the register */
      /* The renewal date is the whole axis of the members tab now:
         thirty days out is far left, the day itself is dead centre,
         and past it slides right. Spread across the coming month so
         the slider has something to say. */
      enrollments: [{ id: s.n + 1, sport: s.sport, batch_id: s.batch,
                      status: s.n % 23 === 5 ? "paused" : "active",
                      joined_on: ji, renewal_on: renewIso(s.n) }]
    };
  }),
  centres: [{ id: 1, code: "main", name: "Thadagam Road", short_name: "Main", sort: 1 }],
  batches: Object.keys(PATTERN).map((k) => ({
    id: +k, code: "d" + PATTERN[k].join(""), tenant_id: "mezzo",
    name: LABEL(PATTERN[k]), short_name: LABEL(PATTERN[k]),
    days: PATTERN[k], start_time: "15:00", end_time: "20:00",
    centre_id: 1, active: true, sort: +k
  })),
  sports: ["Piano","Keyboard","Guitar","Violin","Ukulele","Drums","Vocals"]
           .map((n, i) => ({ id: i + 1, code: n.toLowerCase(), name: n, icon: null, sort: i }))
};

function build(base) {
return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Mezzo — preview (fixtures, not real data)</title>
${base}<link rel="stylesheet" href="${cssHref}">
</head><body>
${headOfBody}
<div id="root"></div><div class="tabs" id="tabs" hidden></div>
<script>
/* THIS IS THE PREVIEW. cloud.js refuses a "preview" token on any page
   that does not say so, which is what stops a token left in a shared
   localStorage from booting the real app past its sign-in. */
window.MZ_PREVIEW = 1;
/* signed in as nobody, against nothing */
localStorage.setItem("mz-session", JSON.stringify({
  access_token: "preview", refresh_token: "preview",
  expires_at: Date.now() + 864e5, email: "preview@example.invalid",
  role: "staff", tenant: "mezzo"
}));
/* Take it back on the way out. The preview shares an origin with the
   real app, so a fake session left in localStorage makes app.html
   boot straight past the sign-in screen into a register that cannot
   load — which looks exactly like a bug in the app, and is not. */
addEventListener("pagehide", function () { localStorage.removeItem("mz-session"); });
var FIX = ${JSON.stringify(fixtures)};
window.fetch = function (url) {
  url = String(url);
  var body = [];
  if (url.indexOf("attendance_month") > -1) body = FIX.register;
  else if (url.indexOf("reminder_queue") > -1) body = FIX.dues;
  else if (url.indexOf("/payments") > -1)     body = FIX.payments;
  else if (url.indexOf("/expenses") > -1)     body = FIX.expenses;
  else if (url.indexOf("/members") > -1) {
    /* One student's card asks for ONE student. Handing back the whole
       list meant every card in the preview showed Aarthi's phone and
       Aarthi's renewal date, so anything read off a card was a lie —
       including whether pausing could see a fee date to move. */
    /* Doubled backslashes on purpose: this line lives inside a template
       literal, which eats \d and \. on the way out. The first version
       shipped as /[?&]id=eq.(d+)/ and matched nothing, so every card
       still showed the first student's phone — and it looked like the
       app reading the wrong row. */
    var one = url.match(/[?&]id=eq\\.(\\d+)/);
    /* the duplicate-name lookup asks with name=ilike.<name>, and a stub
       that hands back the whole roll would make every save look like a
       duplicate — the same lie the id=eq. filter above was fixing */
    var byName = url.match(/[?&]name=ilike\\.([^&]+)/);
    body = one
      ? FIX.members.filter(function (m) { return String(m.id) === one[1]; })
      : byName
        ? FIX.members.filter(function (m) {
            return String(m.name).trim().toLowerCase() ===
                   decodeURIComponent(byName[1]).trim().toLowerCase(); })
        : FIX.members;
  }
  else if (url.indexOf("/centres") > -1)      body = FIX.centres;
  else if (url.indexOf("/batches") > -1)      body = FIX.batches;
  else if (url.indexOf("/sports") > -1)       body = FIX.sports;
  else if (url.indexOf("/events") > -1)       body = {};
  return Promise.resolve({ ok: true, status: 200,
    text: function () { return Promise.resolve(JSON.stringify(body)); },
    json: function () { return Promise.resolve(body); } });
};
</script>
<script src="assets/js/cloud.js"></script>
<script src="assets/js/glass.js"></script>
<script>${app}</script>
</body></html>`;
}

fs.writeFileSync(path.join(ROOT, "_dev-preview.html"), build(""));

/* THERE IS NO PUBLISHED COPY ANY MORE.

   /try/ was a build of this file with fixtures in it, served from the
   live site so ninety-six invented children could be looked at on a
   real iPad without a login. It did its job and the owner asked for it
   to go — a public URL that shows a populated version of a client's app
   is a thing that gets mistaken for the client's app.

   _dev-preview.html stays. It is gitignored, it is served from
   localhost, and it is what every check in this session was verified
   against. Nothing is lost from testing; what is gone is the published
   copy of it. */
console.log("wrote _dev-preview.html");
