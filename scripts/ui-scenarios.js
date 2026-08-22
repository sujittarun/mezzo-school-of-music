/* ============================================================
   MEZZO — UI SCENARIOS.  End-to-end tests, run in a real browser.

   WHAT THIS IS, AND WHAT IT IS NOT.

   scripts/check-app.js is an INTEGRATION suite: it runs the real app
   code against a fake DOM with the network stubbed. Forty-odd checks,
   fast, and it has caught a great deal. What it cannot see is a
   browser — no layout, no focus, no real event order, no rendered
   text. A button whose label disagreed with what it recorded sailed
   straight through it, because in a fake DOM nobody reads the button.

   This file is the other half: END-TO-END tests, sometimes called UI
   automation. It drives the ACTUAL app in an ACTUAL browser, the way
   the operator does — tap the tab, type in the box, press the button —
   and asserts on what the SCREEN says. The industry tool for this is
   Playwright (or Cypress); this is the same discipline without the
   dependency, since the app is three static files and adding a
   node_modules to the repo the client receives is a poor trade.

   HOW TO RUN IT
     node scripts/dev-preview.js
     open _dev-preview.html          (or serve it and open localhost)
     …then paste this file into the console and:  MZScenarios.run()

   IT REFUSES TO RUN ANYWHERE BUT THE PREVIEW. Every scenario below
   adds students and records payments. Against the live tenant that is
   not a test, it is data entry into a paying client's books — so the
   first thing it does is check for the preview's own flag and stop.

   ADDING A SCENARIO is the point. Each is a named journey with
   assertions about what the operator can SEE. When something is found
   by using the app rather than by a test — which is how both of
   2026-08-22's bugs were found — the fix is not only the fix, it is a
   scenario here so it is found by machine next time.
   ============================================================ */
(function () {
  "use strict";

  var S = [];                       /* the scenarios */
  function scenario(name, fn) { S.push({ name: name, fn: fn }); }

  /* ---------- the small amount of machinery ---------- */
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function $(sel)  { return document.querySelector(sel); }
  function $$(sel) { return [].slice.call(document.querySelectorAll(sel)); }
  function text(sel) { var e = $(sel); return e ? e.textContent.trim() : null; }
  function html() { return $("#root").innerHTML; }

  function ok(cond, msg) { if (!cond) throw new Error(msg); }
  function eq(got, want, what) {
    if (String(got) !== String(want))
      throw new Error(what + ": got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want));
  }
  function shows(re, what) {
    if (!(re instanceof RegExp ? re : new RegExp(re)).test(html()))
      throw new Error("the screen never said " + what);
  }

  /* Clicking re-renders, so anything held from before the click is a
     detached node. Every helper re-queries. */
  async function tap(sel, ms) {
    var e = $(sel);
    ok(e, "nothing to tap: " + sel);
    e.click();
    await wait(ms || 700);
  }
  async function tapTab(tab, ms) { await tap('[data-tab="' + tab + '"]', ms || 2200); }
  async function type(sel, value) {
    var e = $(sel);
    ok(e, "no field: " + sel);
    e.value = value;
    e.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(150);
  }
  async function pickDay(d) {
    var b = $$("[data-daypick]").filter(function (x) {
      return x.getAttribute("data-daypick").slice(-2) === ":" + d; })[0];
    ok(b, "no day button for " + d);
    b.click();
    await wait(420);                /* the form redraws on every tick */
  }
  async function openAdd() {
    await tapTab("register", 1600);
    await tap("[data-add]", 1500);
  }

  /* ============================================================
     THE SCENARIOS
     ============================================================ */

  /* 2026-08-22. The database quoted 2,500; he typed 1500; the button
     went on offering "Record ₹2,500" and recorded 1,500. The number
     was right and the last thing he read before it was written was
     wrong. Nothing in the fake-DOM suite reads a button. */
  scenario("the pay button offers the number it will record", async function () {
    await tapTab("dues", 2800);
    var row = $(".mrow.ok") || $(".mrow:not(.rest)");
    ok(row, "nobody on the roll to pay for");
    row.click(); await wait(1600);
    var pay = $("[data-paid]");
    ok(pay, "a settled member has no way to pay early");
    pay.click(); await wait(1700);

    ok($("#payAmt"), "the pay sheet has no amount box");
    await type("#payAmt", "1500");
    eq(text("#payGo"), "Record ₹1,500", "the button after typing 1500");

    await type("#payAmt", "2500");
    eq(text("#payGo"), "Record ₹2,500", "the button after typing 2500");

    await type("#payAmt", "");
    eq(text("#payGo"), "Record payment", "the button with an empty box");
    await tap("#payCancel", 800);
  });

  /* 2026-08-22. Two students called Sri, fifty-three seconds apart,
     with different phone numbers. */
  scenario("a name already on the roll is asked about", async function () {
    /* a real name off the Members roll. NOT the frozen name column of
       the month grid — that table only exists in month mode, and the
       first draft of this scenario read it from the day view and found
       nothing, which looked like a missing student and was a missing
       table. */
    await tapTab("dues", 2800);
    var who = $(".mrow .mwho b");
    ok(who, "no existing student to collide with");
    var nm = who.textContent.trim();

    await openAdd();
    await type("#nsName", nm.toLowerCase());                /* case must not matter */
    await type("#nsPhone", "9876543210");
    await pickDay(1); await pickDay(4);
    await tap("#nsSave", 1400);

    shows(/already on the roll/, "that the name was already there");
    eq(text("#nsSave"), "Yes, add anyway", "the button once it has asked");
    ok($(".askline"), "the question has no place on screen");

    /* and the second press is the answer */
    await tap("#nsSave", 1800);
    ok(!$("#nsName"), "saying yes did not save the student");
  });

  scenario("a name nobody has is saved without a question", async function () {
    await openAdd();
    await type("#nsName", "Zephyrine Quicksilver");
    await type("#nsPhone", "9000012345");
    await pickDay(2); await pickDay(5);
    await tap("#nsSave", 1900);
    ok(!/already on the roll/.test(html()), "it asked about a name nobody has");
    ok(!$("#nsName"), "a new student was not saved");
  });

  /* Two days a week is the shape of this school. */
  scenario("the day picker asks at one day, is silent at two, nudges at three",
    async function () {
      await openAdd();
      await type("#nsName", "Daycheck Test");
      await type("#nsPhone", "9000099999");

      await pickDay(1);
      shows(/Most come twice a week/, "that most come twice, on one day");

      await pickDay(4);
      ok(!/Most come twice a week/.test(html()) && !/more than the usual/.test(html()),
         "it still has something to say at two days, which is the normal case");

      await pickDay(6);
      shows(/3 days \u2014 more than the usual two/, "that three days is more than usual");

      /* one day is ASKED about on save, and then obeyed */
      await pickDay(6); await pickDay(4);                  /* back to one */
      await tap("#nsSave", 1300);
      shows(/Only one day a week\?/, "the one-day question");
      eq(text("#nsSave"), "Yes, save", "the button once it has asked");
      await tap("#nsCancel", 900);
    });

  /* Nobody wrote this one, and it is why Sri owes nothing until 2027:
     a twelve-month plan moves the next fee a year out at the moment of
     enrolment, before anybody has paid. The scenario does not judge
     that — it just makes the app SAY it, so the choice is visible. */
  scenario("the add form says when the next fee falls due", async function () {
    await openAdd();
    await type("#nsName", "Planwatch Test");
    await type("#nsPhone", "9000088888");
    await pickDay(1); await pickDay(4);
    var plans = $$("[data-plan]");
    ok(plans.length, "there is no way to choose a plan");
    for (var i = 0; i < plans.length; i++) {
      var months = $$("[data-plan]")[i].getAttribute("data-plan");
      $$("[data-plan]")[i].click();
      await wait(450);
      shows(new RegExp("Reminder in " + months + " month"),
            "when the next fee is due on a " + months + "-month plan");
    }
    await tap("#nsCancel", 900);
  });

  /* The register opened on the 1st: on a phone that is three screens of
     sideways scrolling to reach the week you are in. */
  scenario("the month grid opens on today and lights the row you touch",
    async function () {
      await tapTab("register", 1600);
      await tap('[data-mode="month"]', 2300);
      var sc = $(".gridscroll"), td = sc && sc.querySelector("td.c.today");
      ok(td, "there is no today column");
      var s = sc.getBoundingClientRect(), r = td.getBoundingClientRect();
      ok(r.left >= s.left - 1 && r.right <= s.right + 1,
         "today is off-screen when the month opens (scrollLeft " + Math.round(sc.scrollLeft) + ")");

      var rows = $$('.reg.names tr[data-r]'), bar = $(".rowlight");
      ok(rows.length && bar, "no rows, or no row light");
      rows[2].querySelector(".nmcol").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await wait(260);
      ok(!bar.hidden, "touching a row lit nothing");
      ok(Math.abs(bar.getBoundingClientRect().top - rows[2].getBoundingClientRect().top) < 1.5,
         "the light is on a different row from the one touched");
      /* and the marks must still be readable through it */
      var mark = $(".gridscroll .reg tr[data-r] td.c.pn");
      if (mark) ok(/radial-gradient|url\(/.test(getComputedStyle(mark).backgroundImage),
                   "the light washed the marks out");
      rows[2].querySelector(".nmcol").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await wait(220);
      ok(bar.hidden, "the light will not go out again");
      await tap('[data-mode="today"]', 1500);
    });

  /* One dial, three lamps, and the lamps are the way into the roll. */
  scenario("the dial reads the school and its lamps reach every band", async function () {
    await tapTab("dues", 2800);
    var lamps = $$(".lamp");
    eq(lamps.length, 3, "how many lamps");
    var lit = $$(".lamp.on").length;
    eq(lit, 1, "how many lamps are lit (a tuner lights exactly one)");

    /* every lamp's count is the heading it jumps to */
    lamps.forEach(function (l) {
      var band = l.getAttribute("data-band");
      var n = l.querySelector("b").textContent.trim();
      var head = $('.msec[data-sec="' + band + '"]');
      if (Number(n) === 0) { ok(l.disabled, "an empty band is still tappable"); return; }
      ok(head, "no heading for the " + band + " band");
      ok(head.textContent.indexOf(n) > -1,
         band + ": the lamp says " + n + " and the heading says " + head.textContent.trim());
    });

    /* and the last band — the one whose target is past the page end */
    var rows = $$(".mrow").length;
    window.scrollTo(0, 0); await wait(300);
    var paused = $('[data-band="paused"]');
    if (paused && !paused.disabled) {
      paused.click(); await wait(500);
      var sec = $('.msec[data-sec="paused"]');
      var t = sec.getBoundingClientRect().top;
      ok(t > 0 && t < window.innerHeight, "the paused lamp did not reach its band");
    }
    eq($$(".mrow").length, rows, "the roll lost rows — a lamp filtered instead of jumping");
  });

  /* Three amounts that touched each other read as one number. */
  scenario("the month's three figures are three separate figures", async function () {
    await tapTab("money", 2500);
    var figs = $$(".fig");
    eq(figs.length, 3, "how many figures");
    var rng = document.createRange();
    figs.forEach(function (f) {
      var b = f.querySelector("b");
      rng.selectNodeContents(b);
      var slack = f.getBoundingClientRect().width - rng.getBoundingClientRect().width;
      ok(slack >= 8, "'" + b.textContent + "' has " + Math.round(slack) + "px of room around it");
    });
    /* the ledger's three faces */
    ["spent", "in", "look"].forEach(function (v) {
      ok($('[data-ledger="' + v + '"]'), "the ledger has no " + v + " face");
    });
    await tap('[data-ledger="in"]', 800);
    var named = $$(".lglist .srow .nm b").filter(function (b) {
      return !/^₹/.test(b.textContent); }).length;
    ok(named > 0, "the Received list names nobody — it is a column of amounts again");
  });

  /* Nothing may run off the side of the screen, and nothing you have to
     hit may be smaller than a fingertip. */
  scenario("nothing overflows and nothing is too small to hit", async function () {
    var V = document.documentElement.clientWidth, bad = [];
    function inScroller(e) {
      var p = e.parentElement;
      while (p && p !== document.body) {
        var o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") return true;
        p = p.parentElement;
      }
      return false;
    }
    for (var t = 0; t < 3; t++) {
      await tapTab(["register", "dues", "money"][t], 2400);
      if (document.documentElement.scrollWidth > V + 1)
        bad.push(["register","dues","money"][t] + ": the page scrolls sideways");
      $$("#root *").forEach(function (e) {
        var b = e.getBoundingClientRect();
        if (!b.width || !b.height || inScroller(e)) return;
        if (b.right > V + 1.5)
          bad.push(String(e.className || e.tagName).slice(0, 30) + " runs " +
                   Math.round(b.right - V) + "px off the side");
      });
      $$("#root button, #root a, #root input, #root select").forEach(function (e) {
        var b = e.getBoundingClientRect();
        if (!b.width || !b.height) return;
        if (b.height < 34 || b.width < 26)
          bad.push(String(e.className || e.tagName).slice(0, 26) + " is only " +
                   Math.round(b.width) + "x" + Math.round(b.height));
      });
    }
    ok(bad.length === 0, bad.slice(0, 6).join("; "));
  });

  /* ============================================================ */
  async function run(only) {
    if (!window.MZ_PREVIEW) {
      var m = "MZScenarios refuses to run here: this is not the preview.\n" +
              "These scenarios add students and record payments. Against the " +
              "live tenant that is data entry into a paying client's books.\n" +
              "Run: node scripts/dev-preview.js  then open _dev-preview.html";
      console.error(m);
      return { refused: true, why: m };
    }
    var list = only ? S.filter(function (s) { return s.name.indexOf(only) > -1; }) : S;
    var pass = 0, results = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      try {
        window.scrollTo(0, 0);
        await s.fn();
        pass++; results.push({ ok: true, name: s.name });
        console.log("  ok   " + s.name);
      } catch (e) {
        results.push({ ok: false, name: s.name, why: e.message });
        console.error("  FAIL " + s.name + "\n       " + e.message);
      }
    }
    var line = pass + "/" + list.length + " scenarios passed";
    console.log("\n" + line);
    return { passed: pass, of: list.length, line: line, results: results };
  }

  window.MZScenarios = { run: run, list: function () {
    return S.map(function (s) { return s.name; }); } };
})();
