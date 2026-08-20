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

const STUDENTS = [
  ["Aarthi",  "Piano",    "present"], ["Bharath", "Guitar",   null],
  ["Chitra",  "Violin",   "present"], ["Deepak",  "Drums",    "absent"],
  ["Eshwari", "Vocals",   "present"], ["Farhan",  "Keyboard", null],
  ["Gowri",   "Ukulele",  "present"], ["Hari",    "Piano",    null]
];

const fixtures = {
  register: STUDENTS.map((s, i) => {
    const marks = {};
    if (s[2]) marks[T] = s[2];
    for (let d = 1; d <= 18; d++) {
      const day = T.slice(0, 8) + String(d).padStart(2, "0");
      if (d % 3 !== 0) marks[day] = d % 7 === 0 ? "absent" : "present";
    }
    return { enrollment_id: i + 1, member_id: i + 1, member_name: s[0],
             sport: s[1], batch_id: 1, marks,
             present_days: Object.values(marks).filter((v) => v === "present").length };
  }),
  dues: STUDENTS.slice(0, 4).map((s, i) => ({
    enrollment_id: i + 1, member_name: s[0], parent_name: "Parent " + s[0],
    sport: s[1], amount: s[1] === "Piano" ? 2500 : 1500,
    days_since: i + 1, due_date: T, phone: "90000006" + (10 + i),
    already_sent: i === 0
  })),
  payments: [1, 2, 3, 4, 5].map((i) => ({
    id: i, amount: i % 2 ? 1500 : 2500, on_date: T, mode: i % 2 ? "UPI" : "Cash",
    kind: "fee", status: "paid", member_id: i, enrollment_id: i
  })),
  expenses: [
    { id: 1, category: "General", detail: "Guitar strings", amount: 850,  mode: "Cash", on_date: T },
    { id: 2, category: "General", detail: "Electricity",    amount: 2400, mode: "UPI",  on_date: T },
    { id: 3, category: "General", detail: "Piano tuning",   amount: 1800, mode: "Cash", on_date: T }
  ],
  centres: [{ id: 1, code: "main", name: "Thadagam Road", short_name: "Main", sort: 1 }],
  batches: [{ id: 1, code: "weekday", name: "Mon–Fri 3–8pm", days: [1,2,3,4,5],
              start_time: "15:00", end_time: "20:00", sort: 1 },
            { id: 2, code: "saturday", name: "Saturday 10am–8pm", days: [6],
              start_time: "10:00", end_time: "20:00", sort: 2 }],
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
