/* ============================================================
   MEZZO — the descent.

   Each act is four screens tall with one sticky stage pinned inside
   it, so the whole act is driven by a single number: p, how far
   through those four screens you have come, 0 to 1.

   p 0.00 – 0.52   you are standing in the room. The words are here.
   p 0.52 – 1.00   you fall through the aperture into the next one.

   THE ONE TRICK WORTH UNDERSTANDING. The instrument is a solid shape
   with a real hole cut through it (fill-rule="evenodd" in the SVG).
   Behind that hole sits .portal — an ellipse the size of the hole,
   holding a photograph of the NEXT room. Both are scaled by exactly
   the same factor about exactly the same point, so the hole and what
   is behind it stay welded together while the wood flies past the
   camera. The photograph inside counter-scales by 1/S, which keeps it
   reading as a room seen through an opening rather than a thumbnail
   being blown up. When S is large enough that the portal covers the
   viewport you are inside, and the next act's sticky stage takes over
   with the same photograph already full-screen. The seam is invisible
   because there isn't one.

   WHY THIS FILE READS NO LAYOUT.
   The first version asked every act for getBoundingClientRect() and
   then wrote transforms to it, every frame — read, write, read, write,
   five times over. Each read after a write forces the browser to
   redo layout before it can answer, so a scroll that should cost one
   composite cost five full layouts, and it stuttered exactly as you
   would expect. Nothing here measures during a frame. Every geometry
   the scroll needs is taken once in layout() and cached; a frame reads
   one number, window.pageYOffset, and writes transforms. Writes that
   would not change anything are skipped, because setting a style is
   not free even when the value is identical.
   ============================================================ */
(function () {
  "use strict";

  var reduce = window.matchMedia &&
               window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- letters ----------
     Each character rises on its own, a beat after the one before, the
     way notes in a phrase arrive. Words are wrapped before letters are:
     an inline-block per character lets a line break anywhere, and a
     headline reading "O / ne teacher" is worse than no animation. */
  function split(el) {
    var n = 0;
    (function walk(node) {
      [].slice.call(node.childNodes).forEach(function (k) {
        if (k.nodeType === 3) {
          var frag = document.createDocumentFragment();
          k.nodeValue.split(/(\s+)/).forEach(function (word) {
            if (!word) return;
            if (/^\s+$/.test(word)) { frag.appendChild(document.createTextNode(" ")); return; }
            var w = document.createElement("span");
            w.className = "wd";
            word.split("").forEach(function (ch) {
              var c = document.createElement("span");
              c.className = "ch";
              c.textContent = ch;
              c.style.transitionDelay = (n++ * 18) + "ms";
              w.appendChild(c);
            });
            frag.appendChild(w);
          });
          node.replaceChild(frag, k);
        } else if (k.nodeType === 1 && k.tagName !== "BR") {
          walk(k);
        }
      });
    })(el);
  }
  [].forEach.call(document.querySelectorAll("[data-split]"), split);

  /* ---------- the acts ---------- */
  var acts = [].map.call(document.querySelectorAll(".act"), function (el) {
    var raw = (el.getAttribute("data-ap") || "").split(",").map(Number);
    return {
      el: el,
      wide:   el.hasAttribute("data-wide"),
      room:   el.querySelector(".room img"),
      copy:   el.querySelector(".copy"),
      cue:    el.querySelector(".cue"),
      chars:  [].slice.call(el.querySelectorAll(".ch")),
      inst:   el.querySelector(".instrument"),
      portal: el.querySelector(".portal"),
      pimg:   el.querySelector(".portal img"),
      ap:     raw.length === 4 && !raw.some(isNaN)
                ? { cx: raw[0], cy: raw[1], w: raw[2], h: raw[3] } : null,
      top: 0, run: 1, h: 0, target: 24, offX: 0, offY: 0,
      shown: false, last: {}
    };
  });

  var ladder = [].slice.call(document.querySelectorAll(".ladder a"));
  var active = -1;

  /* Setting a style that already holds that value still dirties the
     element. At five acts times six properties times sixty frames it
     is worth one string compare. */
  function set(el, prop, val, memo, key) {
    if (memo[key] === val) return;
    memo[key] = val;
    el.style[prop] = val;
  }

  /* ---------- layout ----------
     Runs on load and on resize, never during a scroll. Everything a
     frame could possibly want to know is worked out here. */
  function layout() {
    var vh = window.innerHeight, vw = window.innerWidth;

    acts.forEach(function (a) {
      a.top = a.el.offsetTop;
      a.h   = a.el.offsetHeight;
      a.run = Math.max(1, a.h - vh);
      a.last = {};

      if (!a.ap || !a.inst || !a.portal) return;

      /* THE INSTRUMENT IS SIZED TO THE ROOM THAT IS LEFT.
         The words come first and their height is not knowable in CSS —
         a headline is two lines on a laptop and four on a phone, and
         seven instrument chips wrap differently again. Sizing the
         instrument with a fixed vh and hoping is what put the roster
         on top of the keyboard. So: measure where the words actually
         end, and give the instrument what remains. */
      var gap  = Math.max(18, vh * 0.035);
      var copyBottom = a.copy ? (a.copy.offsetTop + a.copy.offsetHeight) : vh * 0.10;
      var room = vh - copyBottom - gap - 14;
      var want = a.wide ? Math.min(vh * 0.42, vw * 0.52)
                        : Math.min(vh * 0.62, vw * 0.72);
      a.inst.style.height    = Math.max(104, Math.min(want, room)) + "px";
      a.inst.style.marginTop = Math.max(0, copyBottom + gap) + "px";

      /* offsetWidth, NOT getBoundingClientRect. The rect includes the
         element's own transform, so re-measuring during a dive — a
         phone being rotated mid-fall is enough — reads the instrument
         at scale 3, sets an aperture three times too wide, and then
         computes the growth needed to fill the screen from a lie. */
      var w = a.inst.offsetWidth, h = a.inst.offsetHeight;
      if (!w || !h) return;

      var pw = a.ap.w * w, ph = a.ap.h * h;
      a.portal.style.width  = pw + "px";
      a.portal.style.height = ph + "px";

      /* Where the aperture ACTUALLY is, in the stage's coordinates —
         not "the middle of the screen plus a bit". The instrument sits
         below the words, so anything anchored to the centre of the
         screen is a hundred pixels off the hole it is meant to be
         behind, and they drift further apart the more they scale. */
      var stage = a.inst.offsetParent;
      var apX = a.inst.offsetLeft + w / 2 + (a.ap.cx - 0.5) * w;
      var apY = a.inst.offsetTop  + h / 2 + (a.ap.cy - 0.5) * h;

      a.portal.style.left = apX + "px";
      a.portal.style.top  = apY + "px";
      a.inst.style.transformOrigin = (a.ap.cx * 100) + "% " + (a.ap.cy * 100) + "%";

      a.offX = apX - (stage ? stage.offsetWidth  : vw) / 2;
      a.offY = apY - (stage ? stage.offsetHeight : vh) / 2;

      /* How much growth actually covers this screen, both ways. */
      a.target = Math.max(vw / pw, vh / ph) * 1.3;
    });
  }

  /* ---------- easings ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function span(v, a, b)  { return clamp((v - a) / (b - a), 0, 1); }
  function outCubic(t)    { return 1 - Math.pow(1 - t, 3); }

  var DIVE = 0.52;
  var levels = [0, 0, 0, 0];

  function update(y) {
    var vh = window.innerHeight;
    var mid = y + vh * 0.5;

    for (var i = 0; i < acts.length; i++) {
      var a = acts[i], m = a.last;
      var rel = y - a.top;

      /* Off screen: leave it exactly as it is. */
      if (rel < -vh || rel > a.h) continue;

      var p    = clamp(rel / a.run, 0, 1);
      var hold = span(p, 0, DIVE);
      var dive = span(p, DIVE, 1);

      if (a.room) {
        set(a.room, "transform",
            "scale(" + (1.14 - 0.14 * outCubic(hold) + 0.1 * dive).toFixed(4) + ")", m, "room");
      }

      if (a.copy) {
        /* The first act is what the page opens on: its words are there
           before a pixel is scrolled. The last act has no aperture
           because there is nowhere left to fall to — it is the
           destination, so its words arrive and STAY. Running them
           through the fade that clears the way for a dive is what left
           the address and the phone number invisible at the bottom. */
        var inN  = i === 0 ? 1 : span(p, 0.03, 0.24);
        var outN = a.ap ? span(p, 0.40, DIVE) : 0;
        var o    = outCubic(inN) * (1 - outN);
        var ty   = (1 - outCubic(inN)) * 34 - outN * 60;

        set(a.copy, "opacity",   o.toFixed(3), m, "co");
        set(a.copy, "transform", "translateY(" + ty.toFixed(2) + "px)", m, "ct");
        if (a.cue) set(a.cue, "opacity", o.toFixed(3), m, "cue");

        if (inN > 0.02 && !a.shown) {
          a.shown = true;
          for (var c = 0; c < a.chars.length; c++) {
            a.chars[c].style.opacity = 1; a.chars[c].style.transform = "none";
          }
        }
      }

      if (a.inst && a.portal) {
        /* Scale GEOMETRICALLY, not linearly. Flying toward something at
           a steady speed multiplies its apparent size by a constant
           factor per unit of distance, so the honest curve is target^t.
           A linear ramp looks motionless for half the dive and then
           jump-cuts; this feels like a steady fall the whole way. */
        var S    = Math.pow(a.target, dive);
        var panX = -a.offX * dive, panY = -a.offY * dive;
        var br   = dive > 0 ? 1 : 1 + Math.sin(hold * Math.PI) * 0.03;

        set(a.inst, "transform",
            "translate(" + panX.toFixed(1) + "px," + panY.toFixed(1) + "px) scale(" +
            (S * br).toFixed(4) + ")", m, "it");
        set(a.portal, "transform",
            "translate(calc(-50% + " + panX.toFixed(1) + "px), calc(-50% + " +
            panY.toFixed(1) + "px)) scale(" + S.toFixed(4) + ")", m, "pt");
        if (a.pimg) set(a.pimg, "transform", "scale(" + (1 / S).toFixed(6) + ")", m, "pi");

        set(a.inst, "opacity",
            (dive > 0.9 ? 1 - span(dive, 0.9, 1) : 1).toFixed(3), m, "io");
      }

      /* Which instruments are playing. Entering an act brings its own
         voice up, and every voice already gathered stays. */
      if (p > 0.02 && p < 0.999) {
        var depth = i + span(p, DIVE, 0.95);
        for (var v = 0; v < 4; v++) levels[v] = clamp(depth - v + 1, 0, 1);
      }

      if (mid >= a.top && mid < a.top + a.h && active !== i) {
        active = i;
        for (var l = 0; l < ladder.length; l++) ladder[l].classList.toggle("on", l === i);
      }
    }

    if (window.MZSound) window.MZSound.levels(levels);
  }

  /* One number in, transforms out. Nothing is measured here. */
  var lastY = -1, dirty = true;
  function frame() {
    var y = window.pageYOffset;
    if (y !== lastY || dirty) { lastY = y; dirty = false; update(y); }
    requestAnimationFrame(frame);
  }

  /* ---------- the sound switch ---------- */
  var btn = document.getElementById("sound"), label = document.getElementById("soundLabel");
  if (btn) {
    btn.addEventListener("click", function () {
      var on = window.MZSound && window.MZSound.toggle();
      btn.classList.toggle("on", !!on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (label) label.textContent = on ? "Playing" : "Sound";
    });
  }

  /* ---------- every press ----------
     A ring goes out from the point of contact, the way a struck drum
     head does, and the note it plays is taken from the chord that is
     sounding, so a click is always in key. */
  document.addEventListener("pointerdown", function (e) {
    var t = e.target.closest && e.target.closest(".btn, .roster span, .ladder a, .sound");
    if (!t) return;
    var r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.4;
    var ring = document.createElement("span");
    ring.className = "ripple";
    ring.style.width = ring.style.height = d + "px";
    ring.style.left = (e.clientX - r.left) + "px";
    ring.style.top  = (e.clientY - r.top) + "px";
    if (getComputedStyle(t).position === "static") t.style.position = "relative";
    t.appendChild(ring);
    setTimeout(function () { ring.remove(); }, 620);
    if (window.MZSound) window.MZSound.press(t.tagName === "SPAN");
  }, true);

  /* ---------- go ---------- */
  function boot() {
    if (reduce) {
      [].forEach.call(document.querySelectorAll(".ch"),
        function (c) { c.style.opacity = 1; c.style.transform = "none"; });
      return;                       /* four still rooms, and complete */
    }
    [].forEach.call(document.querySelectorAll(".ch"), function (c) {
      c.style.opacity = 0;
      c.style.transform = "translateY(.5em)";
      c.style.transition = "opacity .6s cubic-bezier(.22,.61,.36,1), transform .6s cubic-bezier(.22,.61,.36,1)";
    });
    layout();
    requestAnimationFrame(frame);
    /* Let the first headline play itself in on load rather than
       waiting for a scroll that may never come. */
    setTimeout(function () {
      var a = acts[0];
      if (!a) return;
      a.shown = true;
      a.chars.forEach(function (c) { c.style.opacity = 1; c.style.transform = "none"; });
    }, 120);
  }

  var rt = null;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () { layout(); dirty = true; }, 120);
  });
  window.addEventListener("orientationchange", function () {
    setTimeout(function () { layout(); dirty = true; }, 260);
  });
  window.addEventListener("load", function () { layout(); dirty = true; });
  /* Web fonts land after first paint and change how tall the words
     are, which changes how much room the instrument gets. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { layout(); dirty = true; });
  }
  boot();
})();
