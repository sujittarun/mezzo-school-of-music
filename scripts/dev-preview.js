/* Generate a signed-in preview of the real app, with no account.
 *
 *   node scripts/dev-preview.js && open _dev-preview.html
 *
 * WHY THIS EXISTS. Every screen worth looking at is behind a sign-in,
 * so iterating on how the register LOOKS used to mean holding real
 * credentials for a live tenant — which is a bad habit to build for an
 * app whose whole job is eighty families' money and attendance.
 *
 * So this takes the real index.html, the real cloud.js and the real
 * page script — nothing is reimplemented — and swaps exactly one
 * thing: fetch. Every screen renders from fixtures, signed in as
 * nobody, against a database that does not exist.
 *
 * The output is gitignored. It is a viewer, not a build step.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const app = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));

/* Everything the real page puts in <body> before #root — the SVG
   filter defs and the feature test that switches refraction on. Taken
   from index.html rather than copied, because a preview that has
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
      /* three in four come midweek */
      const batch = rnd() < 0.76 ? 1 : 2;
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

const Y = TODAY.getFullYear(), M = TODAY.getMonth() + 1, DOM = TODAY.getDate();
function isoOf(d) { return Y + "-" + String(M).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
function dowOf(d) { return new Date(Y, M - 1, d).getDay(); }

const fixtures = {
  register: STUDENTS.map((s) => {
    const marks = {};
    for (let d = 1; d <= DOM; d++) {
      const w = dowOf(d);
      const runs = s.batch === 1 ? (w >= 1 && w <= 5) : w === 6;
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
    enrollment_id: s.n + 1, member_name: s.name, parent_name: "Parent " + s.name.split(" ")[0],
    sport: s.sport, amount: s.sport === "Piano" ? 2500 : 1500,
    days_since: 1 + (i * 3) % 26, due_date: isoOf(Math.max(1, DOM - ((i * 3) % 26))),
    phone: "900000" + String(1000 + s.n).slice(-4), already_sent: i % 4 === 0
  })),
  payments: STUDENTS.filter((s) => s.n % 7 !== 3).slice(0, 62).map((s, i) => ({
    id: i + 1, amount: s.sport === "Piano" ? 2500 : 1500,
    on_date: isoOf(1 + (i * 3) % Math.max(1, DOM - 1)),
    mode: i % 3 ? "UPI" : "Cash", kind: "fee", status: "paid",
    member_id: s.n + 1, enrollment_id: s.n + 1, member_name: s.name, sport: s.sport
  })),
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
  members: STUDENTS.map((s) => ({
    id: s.n + 1, name: s.name, phone: "900000" + String(1000 + s.n).slice(-4),
    parent_name: "Parent " + s.name.split(" ")[0],
    parent_phone: "900000" + String(1000 + s.n).slice(-4),
    enrollments: [{ id: s.n + 1, sport: s.sport, batch_id: s.batch, status: "active" }]
  })),
  centres: [{ id: 1, code: "main", name: "Thadagam Road", short_name: "Main", sort: 1 }],
  batches: [{ id: 1, code: "weekday", name: "Mon–Fri 3–8pm", short_name: "Mon–Fri",
              days: [1,2,3,4,5], start_time: "15:00", end_time: "20:00", sort: 1 },
            { id: 2, code: "saturday", name: "Saturday 10am–8pm", short_name: "Saturday",
              days: [6], start_time: "10:00", end_time: "20:00", sort: 2 }],
  sports: ["Piano","Keyboard","Guitar","Violin","Ukulele","Drums","Vocals"]
           .map((n, i) => ({ id: i + 1, code: n.toLowerCase(), name: n, icon: null, sort: i }))
};

const out = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Mezzo — preview (fixtures, not real data)</title>
<link rel="stylesheet" href="assets/css/app.css">
</head><body>
${headOfBody}
<div id="root"></div><div class="tabs" id="tabs" hidden></div>
<script>
/* signed in as nobody, against nothing */
localStorage.setItem("mz-session", JSON.stringify({
  access_token: "preview", refresh_token: "preview",
  expires_at: Date.now() + 864e5, email: "preview@example.invalid",
  role: "staff", tenant: "mezzo"
}));
/* Take it back on the way out. The preview shares an origin with the
   real app, so a fake session left in localStorage makes index.html
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
  else if (url.indexOf("/members") > -1)      body = FIX.members;
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

fs.writeFileSync(path.join(ROOT, "_dev-preview.html"), out);
console.log("wrote _dev-preview.html — open /_dev-preview.html on the dev server");
