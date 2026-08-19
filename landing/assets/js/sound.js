/* ============================================================
   MEZZO — the score. (window.MZSound)

   THE IDEA, and it is the reason this file exists at all:
   SCROLL POSITION IS THE ARRANGEMENT. The guitar plays alone on
   the first screen. Enter the guitar and a piano joins it. Enter
   the piano and a drum starts keeping time. Enter the drum and a
   violin comes in over the top. By the bottom of the page you are
   hearing all four, and you assembled that ensemble by scrolling.
   Scroll back up and it comes apart again, one instrument at a
   time. The page performs its own argument: seven instruments,
   one teacher, one sound.

   NOT ONE BYTE OF AUDIO IS DOWNLOADED. Every note here is
   synthesised in the browser — plucked strings from a decaying
   filter, the drum from a pitch-swept sine and a noise burst.
   Samples would have been four more megabytes on a page whose
   audience is on Indian mobile data, and they could not be
   crossfaded by scroll position the way these can.

   MUTED UNTIL ASKED. Browsers block audio before a gesture, and
   quite right too. Nothing here makes a sound until the switch in
   the corner is pressed.
   ============================================================ */
(function () {
  "use strict";

  var ctx = null, master = null, started = false, on = false;
  var voice = {};                       // guitar | piano | drum | violin -> GainNode
  var want  = { guitar: 0, piano: 0, drum: 0, violin: 0 };

  var BPM = 62, BEAT = 60 / BPM, BAR = BEAT * 4;
  var bar = 0, nextTime = 0, timer = null;

  /* Four bars, warm and unhurried. Written as MIDI note numbers so
     the arithmetic below stays readable: A minor 9, F major 7,
     C major 9, G major. */
  var CHORDS = [
    { root: 45, notes: [57, 60, 64, 67, 71] },
    { root: 41, notes: [53, 57, 60, 64, 69] },
    { root: 48, notes: [55, 60, 64, 67, 71] },
    { root: 43, notes: [55, 59, 62, 67, 71] }
  ];

  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function build() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;

    /* A little room. The whole page is about the inside of a
       resonating body, so a dry signal would be the wrong joke. */
    var wet = ctx.createConvolver();
    wet.buffer = impulse(2.6, 2.4);
    var wetGain = ctx.createGain(); wetGain.gain.value = 0.32;
    master.connect(ctx.destination);
    master.connect(wetGain); wetGain.connect(wet); wet.connect(ctx.destination);

    ["guitar", "piano", "drum", "violin"].forEach(function (k) {
      var g = ctx.createGain(); g.gain.value = 0; g.connect(master); voice[k] = g;
    });
    return true;
  }

  function impulse(seconds, decay) {
    var n = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  function noiseBuf(seconds) {
    var n = Math.floor(ctx.sampleRate * seconds);
    var b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /* ---------- the four voices ---------- */

  /* A plucked string is a bright attack that loses its high end fast.
     A sawtooth through a lowpass whose cutoff falls is exactly that,
     and it costs two nodes. */
  function pluck(dest, f, t, dur, level, bright) {
    var o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(f * (bright || 9), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.05, 140), t + dur * 0.85);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /* A struck string has a felt hammer on the front of it. The pair of
     detuned partials is what stops it sounding like an organ. */
  function struck(dest, f, t, dur, level) {
    [[1, level], [2.01, level * 0.36], [3.02, level * 0.12]].forEach(function (p) {
      var o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f * p[0];
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p[1], t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    });
    var n = ctx.createBufferSource(); n.buffer = noiseBuf(0.04);
    var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 4; bp.Q.value = 0.8;
    var ng = ctx.createGain(); ng.gain.setValueAtTime(level * 0.3, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(bp); bp.connect(ng); ng.connect(dest); n.start(t);
  }

  /* Pitch dropping fast is the body of the drum; the noise burst is
     the stick hitting the skin. */
  function hit(dest, t, level, low) {
    var o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(low ? 165 : 320, t);
    o.frequency.exponentialRampToValueAtTime(low ? 48 : 150, t + 0.13);
    var g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (low ? 0.4 : 0.2));
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.5);

    var n = ctx.createBufferSource(); n.buffer = noiseBuf(0.12);
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = low ? 1800 : 3600;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(level * (low ? 0.22 : 0.5), t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(hp); hp.connect(ng); ng.connect(dest); n.start(t);
  }

  /* A bow does not start a note, it leans into it. The slow attack is
     the whole character, and the LFO is the player's hand. */
  function bow(dest, f, t, dur, level) {
    var o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
    var lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 5.2;
    var lg = ctx.createGain(); lg.gain.value = f * 0.006;
    lfo.connect(lg); lg.connect(o.frequency);
    var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = f * 5; lp.Q.value = 3;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + dur * 0.35);
    g.gain.setValueAtTime(level, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }

  /* ---------- the bar ---------- */
  function schedule(t, n) {
    var c = CHORDS[n % CHORDS.length];

    for (var i = 0; i < 8; i++) {                       // guitar: eighths, rolling
      var note = c.notes[(i * 2 + (n % 2)) % c.notes.length] + (i > 4 ? 12 : 0);
      pluck(voice.guitar, hz(note), t + i * BEAT / 2, 1.5, 0.11, 8);
    }
    pluck(voice.guitar, hz(c.root), t, 2.6, 0.13, 5);

    struck(voice.piano, hz(c.root + 12), t, 2.4, 0.14);  // piano: root, then a phrase
    struck(voice.piano, hz(c.notes[2] + 12), t + BEAT * 2, 1.9, 0.1);
    struck(voice.piano, hz(c.notes[4] + 12), t + BEAT * 3, 1.4, 0.075);

    hit(voice.drum, t, 0.3, true);                      // drum: unhurried
    hit(voice.drum, t + BEAT * 2, 0.24, true);
    hit(voice.drum, t + BEAT * 3 + BEAT / 2, 0.11, false);
    hit(voice.drum, t + BEAT * 1 + BEAT / 2, 0.07, false);

    bow(voice.violin, hz(c.notes[2] + 12), t + 0.05, BAR * 0.95, 0.085);
    bow(voice.violin, hz(c.notes[4] + 12), t + BEAT * 2, BAR * 0.5, 0.05);
  }

  function tick() {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 0.35) {
      if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.06;
      schedule(nextTime, bar++);
      nextTime += BAR;
    }
    ["guitar", "piano", "drum", "violin"].forEach(function (k) {
      voice[k].gain.setTargetAtTime(want[k], ctx.currentTime, 0.45);
    });
  }

  /* ---------- the switch ---------- */
  function toggle() {
    if (!ctx && !build()) return false;
    on = !on;
    if (on) {
      if (ctx.state === "suspended") ctx.resume();
      if (!started) { started = true; nextTime = ctx.currentTime + 0.1; timer = setInterval(tick, 90); tick(); }
      master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6);
    } else {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
    }
    return on;
  }

  /* Which instruments are audible, as four numbers 0..1. The page
     hands this its scroll position and nothing else. */
  function levels(l) {
    want.guitar = l[0]; want.piano = l[1]; want.drum = l[2]; want.violin = l[3];
  }

  /* A press should sound like something in the room, not like a
     notification. It takes the note from whatever chord is playing,
     so a click is always in key. */
  function press(high) {
    if (!ctx || !on) return;
    var c = CHORDS[(bar + 3) % CHORDS.length];
    var n = c.notes[high ? 4 : 1] + (high ? 12 : 0);
    struck(master, hz(n), ctx.currentTime + 0.005, 0.9, high ? 0.1 : 0.13);
  }

  window.MZSound = { toggle: toggle, levels: levels, press: press,
                     isOn: function () { return on; } };
})();
