const http = require("http"), fs = require("fs"), path = require("path");
/* Static server for looking at the landing page. The manager app is a
   static site too, so this serves the whole repo and you pick the URL:
   /landing/ for the public page, / for the app. */
const path_ = require("path");
const ROOT = path_.resolve(process.argv[2] || path_.join(__dirname, ".."));
const PORT = +(process.argv[3] || 8413);
const TYPES = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript",
  ".jpg":"image/jpeg", ".png":"image/png", ".webmanifest":"application/manifest+json",
  ".svg":"image/svg+xml", ".ico":"image/x-icon" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404, {"Content-Type":"text/plain"}).end("404 " + p); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream",
                         "Cache-Control": "no-store" });
    res.end(d);
  });
}).listen(PORT, () => console.log("serving " + ROOT + " on http://localhost:" + PORT));
