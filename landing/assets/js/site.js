/* ============================================================
   MEZZO — the descent.

   Each act is four screens tall with one sticky stage pinned
   inside it, so the whole act is driven by a single number: p,
   how far through those four screens you have come, 0 to 1.

   p 0.00 – 0.52   you are standing in the room. The words are here.
   p 0.52 – 1.00   you fall through the aperture into the next one.

   THE ONE TRICK WORTH UNDERSTANDING. The instrument is a solid
   shape with a real hole cut through it (fill-rule="evenodd" in
   the SVG). Behind that hole sits .portal — an ellipse the size of
   the hole, holding a photograph of the NEXT room. Both are scaled
   by exactly the same factor about exactly the same point, so the
   hole and what is behind it stay welded together while the wood
   flies past the camera. The photograph inside the portal is
   counter-scaled by 1/S, which is what keeps it reading as a room
   glimpsed through an opening rather than a thumbnail being blown
   up. When S is large enough that the portal covers the viewport,
   you are inside, and the next act's sticky stage takes over with
   the same photograph already full-screen. The seam is invisible
   because there isn't one.

   The scale needed is MEASURED, never guessed: an aperture is a
   different number of pixels on a phone and on a desktop, so the
   factor is recomputed from the real element box on every resize.
   ============================================================ */
(function () {
  "use strict";

  var reduce = window.matchMedia &&
               window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- letters ----------
     Each character rises on its own, a beat after the one before,
     the way notes in a phrase arrive. Split walks the element so
     the <em> inside a headline survives it. */
  function split(el) {
    var n = 0;
    (function walk(node) {
      var kids = [].slice.call(node.childNodes);
      kids.forEach(function (k) {
        if (k.nodeType === 3) {
          var frag = document.createDocumentFragment();
          /* Words first, THEN letters. An inline-block per character
             lets the line break anywhere, and a headline reading
             "O / ne teacher" is worse than no animation at all. */
          k.nodeValue.split(/(\s+)/).forEach(function (word) {
            if (!word) return;
            if (/^\s+$/.test(word)) { frag.appendChild(document.createTextNode(" ")); return; }
            var w = document.createElement("span");
            w.className = "wd";
            word.split("").forEach(function (ch) {
              var c = document.createElement("span");
              c.className = "ch";
              c.textContent = ch;
              c.style.transitionDelay = (n++ * 20) + "ms";
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
      room:   el.querySelector(".room img"),
      copy:   el.querySelector(".copy"),
      cue:    el.querySelector(".cue"),
      chars:  [].slice.call(el.querySelectorAll(".ch")),
      inst:   el.querySelector(".instrument"),
      portal: el.querySelector(".portal"),
      pimg:   el.querySelector(".portal img"),
      ap:     raw.length === 4 && !raw.some(isNaN)
                ? { cx: raw[0], cy: raw[1], w: raw[2], h: raw[3] } : null,
      target: 24, offX: 0, offY: 0, shown: false
    };
  });

  var ladder = [].slice.call(document.querySelectorAll(".ladder a"));

  /* ---------- layout ----------
     Everything the dive needs in pixels, measured rather than
     assumed, and measured again whenever the window changes. */
  function layout() {
    acts.forEach(function (a) {
      if (!a.ap || !a.inst || !a.portal) return;
      /* offsetWidth, NOT getBoundingClientRect. The rect includes the
         element's own transform, so re-measuring during a dive (a
         phone being rotated mid-fall is enough) reads the instrument
         at scale 3 and sets an aperture three times too wide — after
         which the growth needed to fill the screen is computed from a
         lie and the dive stops short. offset* is the untransformed
         box, which is the thing being asked about. */
      var w = a.inst.offsetWidth, h = a.inst.offsetHeight;
      if (!w) return;

      var pw = a.ap.w * w, ph = a.ap.h * h;
      a.portal.style.width  = pw + "px";
      a.portal.style.height = ph + "px";

      /* Where the aperture ACTUALLY is, in the stage's own
         coordinates. Not "the middle of the screen plus a bit": the
         instrument is pushed down the stage to clear the words above
         it, so anything anchored to the centre of the screen sits a
         hundred-odd pixels off the hole it is supposed to be behind —
         and the two drift further apart the more they are scaled. */
      var stage = a.inst.offsetParent;                 /* .dive */
      var apX = a.inst.offsetLeft + w / 2 + (a.ap.cx - 0.5) * w;
      var apY = a.inst.offsetTop  + h / 2 + (a.ap.cy - 0.5) * h;

      a.portal.style.left = apX + "px";
      a.portal.style.top  = apY + "px";
      a.inst.style.transformOrigin = (a.ap.cx * 100) + "% " + (a.ap.cy * 100) + "%";

      /* How far the aperture is from the middle of the screen, so the
         fall can bring it to the centre as it goes. */
      a.offX = apX - (stage ? stage.offsetWidth  : window.innerWidth)  / 2;
      a.offY = apY - (stage ? stage.offsetHeight : window.innerHeight) / 2;

      /* How much growth actually covers this screen, both ways. */
      a.target = Math.max(window.innerWidth / pw, window.innerHeight / ph) * 1.3;
    });
  }

  /* ---------- easings ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function span(v, a, b)  { return clamp((v - a) / (b - a), 0, 1); }
  function outCubic(t)    { return 1 - Math.pow(1 - t, 3); }
  /* (No ease-in here on purpose — see the dive below.) */

  var DIVE = 0.52;                       // where standing still becomes falling
  var levels = [0, 0, 0, 0];

  function frame() {
    var vh = window.innerHeight;

    acts.forEach(function (a, i) {
      var box = a.el.getBoundingClientRect();
      var run = a.el.offsetHeight - vh;
      var p = run > 0 ? clamp(-box.top / run, 0, 1) : (box.top <= 0 ? 1 : 0);

      /* Off screen entirely: stop touching it. */
      if (box.bottom < -vh || box.top > vh * 2) return;

      var hold = span(p, 0, DIVE);
      var dive = span(p, DIVE, 1);

      /* The room drifts toward you while you read, then pushes past
         as you fall. */
      if (a.room) {
        a.room.style.transform = "scale(" + (1.14 - 0.14 * outCubic(hold) + 0.1 * dive) + ")";
      }

      /* The words arrive, hold, and leave before the fall starts, so
         nothing is ever read at speed. */
      if (a.copy) {
        /* The first act is what the page opens on. Its words have to be
           there before a single pixel is scrolled, or the site loads
           looking empty. Every other act fades its words in. */
        var inN  = i === 0 ? 1 : span(p, 0.03, 0.24);
        /* The last act has no aperture because there is nowhere left to
           fall to — it is the destination. Its words arrive and STAY;
           running them through the same fade-out that clears the way
           for a dive leaves the address and the phone number invisible
           at the bottom of the page, which is the one screen that has
           to work. */
        var outN = a.ap ? span(p, 0.40, DIVE) : 0;
        var o = outCubic(inN) * (1 - outN);
        a.copy.style.opacity = o;
        if (a.cue) a.cue.style.opacity = o;
        a.copy.style.transform = "translateY(" + ((1 - outCubic(inN)) * 34 - outN * 60) + "px)";

        if (inN > 0.02 && !a.shown) {
          a.shown = true;
          a.chars.forEach(function (c) { c.style.opacity = 1; c.style.transform = "none"; });
        } else if (inN <= 0.02 && a.shown && p < 0.03) {
          a.shown = false;
          a.chars.forEach(function (c) { c.style.opacity = 0; c.style.transform = "translateY(.5em) rotateX(-40deg)"; });
        }
      }

      /* The fall. One factor, applied to the instrument and to what
         is behind its hole, about the same point. */
      if (a.inst && a.portal) {
        /* Scale GEOMETRICALLY, not linearly. Flying toward something at
           a steady speed multiplies its apparent size by a constant
           factor per unit of distance — so the honest curve is
           target^t, not a straight ramp and certainly not an ease-in.
           A linear ramp spends the first half of the dive looking
           motionless and the last tenth looking like a jump cut;
           this one feels like a steady fall the whole way down. */
        var t = dive;
        var S = Math.pow(a.target, t);
        var breathe = 1 + Math.sin(hold * Math.PI) * 0.03;
        var panX = -a.offX * t, panY = -a.offY * t;

        a.inst.style.transform =
          "translate(" + panX + "px," + panY + "px) scale(" + (S * (dive > 0 ? 1 : breathe)) + ")";
        a.portal.style.transform =
          "translate(calc(-50% + " + panX + "px), calc(-50% + " + panY + "px)) scale(" + S + ")";
        if (a.pimg) a.pimg.style.transform = "scale(" + (1 / S) + ")";

        /* Once the portal has swallowed the screen there is nothing
           left to see of the instrument, and holding it at scale 30
           costs a repaint for no picture. */
        a.dive_done = dive > 0.995;
        a.inst.style.opacity = dive > 0.9 ? (1 - span(dive, 0.9, 1)) : 1;
      }

      /* Which instruments are playing. Entering an act brings its own
         voice up, and every voice already gathered stays. */
      if (p > 0.02 && p < 0.999) {
        var depth = i + span(p, DIVE, 0.95);
        for (var v = 0; v < 4; v++) levels[v] = clamp(depth - v + 1, 0, 1);
      }

      /* The ladder follows the middle of the screen. */
      if (box.top <= vh * 0.5 && box.bottom > vh * 0.5) {
        ladder.forEach(function (l, li) { l.classList.toggle("on", li === i); });
      }
    });

    if (window.MZSound) window.MZSound.levels(levels);
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
     A ring goes out from the point of contact, the way a struck
     drum head does, and the note it plays is taken from the chord
     that is sounding, so a click is always in key. */
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
    if (window.MZSound) window.MZSound.press(t.classList.contains("roster") || t.tagName === "SPAN");
  }, true);

  /* ---------- go ---------- */
  function boot() {
    if (reduce) {
      [].forEach.call(document.querySelectorAll(".ch"),
        function (c) { c.style.opacity = 1; c.style.transform = "none"; });
      return;                       // the page is four still rooms, and complete
    }
    [].forEach.call(document.querySelectorAll(".ch"), function (c) {
      c.style.opacity = 0;
      c.style.transform = "translateY(.5em) rotateX(-40deg)";
      c.style.transition = "opacity .7s cubic-bezier(.22,.61,.36,1), transform .7s cubic-bezier(.22,.61,.36,1)";
    });
    layout();
    requestAnimationFrame(frame);
    /* Let the first headline play itself in on load rather than
       waiting for a scroll that may never come. */
    setTimeout(function () {
      var a = acts[0];
      if (a) { a.shown = true;
        a.chars.forEach(function (c) { c.style.opacity = 1; c.style.transform = "none"; }); }
    }, 120);
  }

  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", function () { setTimeout(layout, 250); });
  window.addEventListener("load", layout);
  boot();
})();
