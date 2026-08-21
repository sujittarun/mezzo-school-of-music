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
      ar:     parseFloat(el.getAttribute("data-ar")) || 1,
      /* cx, cy, rx — and an optional fourth number, the ratio of the
         aperture's height to its width. A soundhole and a port hole are
         circles and leave it out; a piano's lid opening is a wide, flat
         slot and a circle jammed into it is exactly what looked odd. */
      ap:     raw.length >= 3 && !raw.some(isNaN)
                ? { cx: raw[0], cy: raw[1], r: raw[2],
                    ratio: raw.length > 3 ? raw[3] : 1 } : null,
      top: 0, run: 1, h: 0, apX: 0, apY: 0, apR: 1, Rmax: 1, creep: 0.06,
      offX: 0, offY: 0, shown: false, last: {}
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

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- layout ----------
     Runs on load and on resize, never during a scroll. Everything a
     frame could possibly want to know is worked out here. */
  function layout() {
    var vw = window.innerWidth;
    /* Ask the STAGE how tall it is, not the window. The stages are
       sized in svh and window.innerHeight on iOS is the visual
       viewport, which changes as the toolbar collapses — if the script
       and the stylesheet disagree about the height of a screen, the
       dive is computed against one number and drawn against another. */
    var first = document.querySelector(".stage");
    var vh = (first && first.offsetHeight) || window.innerHeight;

    acts.forEach(function (a) {
      a.top = a.el.offsetTop;
      a.h   = a.el.offsetHeight;
      a.run = Math.max(1, a.h - vh);
      a.vh  = vh;
      a.last = {};

      if (!a.ap || !a.inst || !a.portal) return;

      /* THE INSTRUMENT IS SIZED TO THE ROOM THAT IS LEFT.
         The words come first and their height is not knowable in CSS —
         a headline is two lines on a laptop and four on a phone, and
         seven instrument chips wrap differently again. Sizing the
         instrument with a fixed vh and hoping is what put the roster
         on top of the keyboard. So: measure where the words actually
         end, and give the instrument what remains. */
      /* A wide, short screen — an iPad on its side — puts the words
         and the instrument beside each other instead of above and
         below, so the instrument gets the whole height. Matches the
         media query in the stylesheet. */
      var side = vw >= 900 && vh <= 900;
      var gap  = Math.max(18, vh * 0.035);
      var H, W;
      /* needed by the creep calculation below as well as by the stacked
         layout, so it is worked out for both */
      var copyBottom = a.copy ? (a.copy.offsetTop + a.copy.offsetHeight) : vh * 0.10;

      if (side) {
        H = vh * 0.80;
        W = H * a.ar;
        if (W > vw * 0.42) { W = vw * 0.42; H = W / a.ar; }
        a.inst.style.marginTop = Math.round((vh - H) / 2) + "px";
      } else {
        /* Leave the bottom of the screen alone: the scroll cue lives
           down there on the first act, and an instrument touching the
           edge reads as cropped rather than standing in the room. */
        var room = vh - copyBottom - gap - Math.max(56, vh * 0.09);
        H = Math.max(120, Math.min(vh * 0.58, room));
        W = H * a.ar;
        if (W > vw * 0.90) { W = vw * 0.90; H = W / a.ar; }   /* keep the aspect */
        a.inst.style.marginTop = Math.max(0, copyBottom + gap) + "px";
      }
      a.inst.style.width  = W + "px";
      a.inst.style.height = H + "px";

      /* Where the aperture ACTUALLY is, in the stage's coordinates —
         the soundhole of that guitar, the port hole in that bass drum,
         the opening under that piano lid. The iris starts exactly
         there, at exactly that size, which is the whole illusion. */
      var stage = a.inst.offsetParent;
      a.apX = a.inst.offsetLeft + a.ap.cx * W;
      a.apY = a.inst.offsetTop  + a.ap.cy * H;
      a.apR = Math.max(2, a.ap.r * W);
      a.inst.style.transformOrigin = (a.ap.cx * 100) + "% " + (a.ap.cy * 100) + "%";

      a.offX = a.apX - (stage ? stage.offsetWidth  : vw) / 2;
      a.offY = a.apY - (stage ? stage.offsetHeight : vh) / 2;

      /* Far enough for the iris to clear the corners once it is centred,
         expressed as the growth factor both it and the instrument use.
         The shape rounds out on the way in (see below), so the ending
         only has to cover a circle. */
      a.Rmax   = Math.hypot(vw, vh) * 0.62;
      a.target = a.Rmax / a.apR;

      /* HOW MUCH THE INSTRUMENT MAY CREEP WHILE THE WORDS ARE STILL UP.
         The approach now starts at once rather than after a screen and
         a half of nothing — but it scales about the APERTURE, which
         sits inside the instrument, so growing pushes the top edge up
         towards the headline. On a phone the headroom is thirty pixels
         and an unchecked creep climbed forty-seven into the text.

         So the creep is not a constant. Each act gets the largest share
         its own layout can carry: solve (S-1) * apertureY <= headroom
         for the share, and take the smaller of that and the share the
         motion wants. Side-by-side layouts have no vertical conflict
         and get the lot. Recomputed on every resize, because the
         headroom is a measured thing. */
      var wantShare = 0.06;
      if (side) {
        a.creep = wantShare;
      } else {
        var head  = Math.max(0, a.inst.offsetTop - copyBottom - 6);
        var maxS  = 1 + head / Math.max(1, a.ap.cy * H);
        a.creep   = clamp(Math.log(maxS) / Math.log(Math.max(1.001, a.target)),
                          0.015, wantShare);
      }
    });
  }

  /* ---------- easings ---------- */
  function span(v, a, b)  { return clamp((v - a) / (b - a), 0, 1); }
  function outCubic(t)    { return 1 - Math.pow(1 - t, 3); }

  var DIVE = 0.52;
  var levels = [0, 0, 0, 0];

  function update(y) {
    var vh = (acts[0] && acts[0].vh) || window.innerHeight;
    var vw = window.innerWidth;
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
        /* The room settles in and then STAYS. It used to zoom back out
           again during the dive (+0.1 * dive), so at the exact moment
           the instrument started flying at you the room behind it began
           moving the other way — two contrary motions in one frame,
           which is a thing the eye reads as "wrong" long before it can
           say why. */
        set(a.room, "transform",
            "scale(" + (1.14 - 0.14 * outCubic(hold)).toFixed(4) + ")", m, "room");
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
        /* THE HOLE AND THE IRIS GROW AT EXACTLY THE SAME RATE.
           They have to. If the iris outruns the instrument, the next
           room spills out over the soundboard and you are watching a
           circle wipe; if it lags, you are staring at a hole with a
           postage stamp in it. Locking them is the whole illusion, so
           the instrument's scale IS the iris's scale.

           This is affordable now only because the instruments are
           bitmaps. Scaling a photograph is a GPU texture operation;
           scaling the SVGs this replaced meant re-rasterising vector
           art at twenty-five times the size of the screen, every
           frame. Same arithmetic, completely different cost. */
        /* ONE NUMBER DRIVES THE APPROACH, AND IT IS NEVER ZERO.

           This used to be Math.pow(target, dive), and dive is 0 for the
           whole first half of the act — so the instrument sat at
           scale 1.000 for 1,498px, a screen and a half, not moving by a
           single pixel. Measured across the act: six of twelve steps
           had a scale delta of exactly 0, and then the last 240px did
           more than the first 1,700 put together. That is what "not in
           sync with the scroll" is. It is not lag; it is a dead zone
           followed by a rocket.

           So `app` runs from 0 to 1 across the WHOLE act — a slow creep
           while you are still reading (5% of the way in by the time the
           dive proper begins, about 1.19x) and then the geometric rush.
           It is continuous, it is monotonic, and the finger is never
           doing nothing.

           Scale AND pan AND the iris all come off this one number,
           which is what keeps the hole welded to what is behind it. */
        /* LINEAR on the hold, not eased. outCubic has zero slope at its
           end, so an eased creep decelerates to a dead stop in the last
           beat before the dive — measured as a growth ratio of exactly
           1.00 for one whole step, then 1.52 the next. A hitch at the
           join is the one place you must not put one. Linear keeps the
           creep at a steady 1.03x per step right up to the handover. */
        var app  = a.creep * hold + (1 - a.creep) * dive;
        var S    = Math.pow(a.target, app);
        var panX = -a.offX * app, panY = -a.offY * app;
        var br   = dive > 0 ? 1 : 1 + Math.sin(hold * Math.PI) * 0.025;

        set(a.inst, "transform",
            "translate(" + panX.toFixed(1) + "px," + panY.toFixed(1) + "px) scale(" +
            (S * br).toFixed(4) + ")", m, "it");
        /* Gone before it can look soft. A 505px photograph at twenty
           times is mush, so it leaves while it still reads as wood. */
        set(a.inst, "opacity", (1 - span(dive, 0.42, 0.80)).toFixed(3), m, "io");

        /* THE IRIS. Geometric again, for the same reason the old scale
           was: opening at a steady rate multiplies the radius by a
           constant factor per unit of scroll. It starts at exactly the
           radius of the hole in the photograph and ends past the
           corners, and its centre walks from the hole to the middle of
           the screen as you line up on it. */
        var RX = a.apR * S;
        /* The aperture starts the shape it really is — a wide slot for
           a piano lid, a circle for a soundhole — and rounds out as you
           go through it, because once you are inside the shape of the
           doorway stops being the point. */
        var ratio = a.ap.ratio + (1 - a.ap.ratio) * outCubic(dive);
        var RY = RX * ratio;
        var cx = a.apX + (vw / 2 - a.apX) * app;
        var cy = a.apY + (a.vh / 2 - a.apY) * app;
        set(a.portal, "clipPath",
            "ellipse(" + RX.toFixed(1) + "px " + RY.toFixed(1) + "px at " +
            cx.toFixed(1) + "px " + cy.toFixed(1) + "px)", m, "clip");
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
