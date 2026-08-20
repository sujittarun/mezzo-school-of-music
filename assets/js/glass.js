/* ============================================================
   MEZZO — liquid glass. (optional; the app is complete without it)

   Glass is not a translucent rectangle. What makes a real pane read
   as glass is that it ANSWERS THE LIGHT: a specular sheen slides
   across it, its rim lights on the side facing the source and darkens
   on the other, its shadow falls away from it, and what is behind it
   sits at a slightly different depth. All four of those move together
   or none of them convince.

   So this file keeps one light source and moves everything from it.

   WHERE THE LIGHT COMES FROM, GIVEN THE DEVICE.
   A pointer is the obvious answer and it is the one input he will
   never have — this is an iPad app, and on an iPad there is no
   cursor to track. So:

     · pointer, if there is one (a laptop, the odd desktop)
     · the finger, while it is down
     · SCROLL, always — the light drifts as the page moves under it,
       which needs no permission and never stops working

   Device tilt would be the nicest of all and is deliberately not used:
   iOS requires an explicit permission prompt for motion, and a scary
   system dialog on first tap is a bad trade for a moving highlight.

   COST. The sheen is recomputed only for .card — there are two or
   three on screen, never forty — and only on frames where the light
   actually moved. Rows read as glass because they are translucent
   over a card that is already lit, which costs nothing.
   ============================================================ */
(function () {
  "use strict";

  var root = document.documentElement;
  if (!root.animate) return;                       /* very old browser: plain glass */
  if (window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /* Where the light is, 0..1 across the viewport. It starts up and to
     the left, which is where light comes from in every painting
     anybody has ever been comfortable looking at. */
  var lx = 0.34, ly = 0.06;                        /* current */
  var tx = 0.34, ty = 0.06;                        /* target  */
  var raf = null, cards = null, dirty = true;

  function aim(nx, ny) {
    tx = nx < 0 ? 0 : nx > 1 ? 1 : nx;
    ty = ny < 0 ? 0 : ny > 1 ? 1 : ny;
    start();
  }
  function start() { if (!raf) raf = requestAnimationFrame(tick); }

  function tick() {
    raf = null;
    /* Ease toward the target rather than snapping to it: glass has
       mass, and a highlight that teleports reads as a decal. */
    lx += (tx - lx) * 0.14;
    ly += (ty - ly) * 0.14;
    paint();
    if (Math.abs(tx - lx) > 0.0008 || Math.abs(ty - ly) > 0.0008 || dirty) start();
    dirty = false;
  }

  function paint() {
    var W = window.innerWidth, W2 = W || 1;
    var H = window.innerHeight, H2 = H || 1;
    var px = lx * W2, py = ly * H2;

    /* The global light, for anything that only needs a direction:
       the rim, the shadow, the parallax on the background. */
    root.style.setProperty("--lx", (lx * 100).toFixed(2) + "%");
    root.style.setProperty("--ly", (ly * 100).toFixed(2) + "%");
    root.style.setProperty("--shx", (-(lx - 0.5) * 16).toFixed(2) + "px");
    root.style.setProperty("--shy", ((0.55 - ly) * 20 + 8).toFixed(2) + "px");
    root.style.setProperty("--bgx", (-(lx - 0.5) * 22).toFixed(2) + "px");
    root.style.setProperty("--bgy", (-(ly - 0.5) * 14).toFixed(2) + "px");

    /* The sheen, per pane, in that pane's own coordinates. */
    cards = document.querySelectorAll(".card");
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i], r = c.getBoundingClientRect();
      if (r.bottom < -80 || r.top > H2 + 80 || !r.width) continue;
      c.style.setProperty("--sx", (((px - r.left) / r.width) * 100).toFixed(1) + "%");
      c.style.setProperty("--sy", (((py - r.top) / r.height) * 100).toFixed(1) + "%");
    }
  }

  /* ---------- what moves the light ---------- */
  if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener("pointermove", function (e) {
      aim(e.clientX / (window.innerWidth || 1), e.clientY / (window.innerHeight || 1));
    }, { passive: true });
  }
  window.addEventListener("touchmove", function (e) {
    var t = e.touches && e.touches[0];
    if (t) aim(t.clientX / (window.innerWidth || 1), t.clientY / (window.innerHeight || 1));
  }, { passive: true });

  /* Scrolling tips the light, so the glass is alive on a device that
     has no pointer and has not been touched in the last second. */
  var maxScroll = 1;
  window.addEventListener("scroll", function () {
    maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    var p = Math.min(1, Math.max(0, window.pageYOffset / maxScroll));
    aim(0.30 + p * 0.42, 0.04 + p * 0.30);
  }, { passive: true });

  window.addEventListener("resize", function () { dirty = true; start(); }, { passive: true });
  start();
})();
