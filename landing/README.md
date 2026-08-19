# The landing page

`mezzoschoolofmusic.in` — the public page. Separate from the manager app
in the folder above it, and deliberately so: the app is one non-technical
man marking a register at eight in the evening, and this is a parent
deciding whether to bring their child. Nothing here is shared with it
except the brand.

## The idea

Every acoustic instrument is a **room**. A hollow body of air is
literally what turns a vibrating string into a sound you can hear. So
the page takes that literally — you do not scroll down it, you fall
through it.

| | you are | and the way on is |
|---|---|---|
| I | outside, looking at a guitar | its soundhole |
| II | inside the guitar | the one piano key that is missing |
| III | inside the piano | the head of a drum |
| IV | inside the drum | the f-hole of a violin |
| V | inside the violin | nothing. You have arrived |

**The violin is last on purpose.** The school's mark is a line-art
violin taken from Dr. Krishnan's own business card, so the descent ends
inside the logo, and the final screen resolves from "inside a violin" to
that violin. No other school can end this journey that way.

## Scroll position is the arrangement

The guitar plays alone at the top. Enter the guitar and a piano joins.
Enter the piano and a drum keeps time. Enter the drum and a violin comes
in over it. At the bottom you are hearing all four — an ensemble you
assembled by scrolling, which comes apart again on the way back up.

**Not one byte of audio is downloaded.** Every note is synthesised in the
browser: plucked strings from a sawtooth through a collapsing filter,
the drum from a pitch-swept sine and a noise burst. Samples would have
been megabytes on a page whose audience is on Indian mobile data, and
they could not be crossfaded by scroll position the way these can.

Muted until the switch in the corner is pressed.

## How the dive actually works

The instrument is a solid SVG shape with a real hole cut through it
(`fill-rule="evenodd"`). Behind that hole sits `.portal` — an ellipse
the size of the hole, holding a photograph of the **next** room. Both
are scaled by the same factor about the same point, so the opening and
what is behind it stay welded together while the wood flies past the
camera. The photograph inside counter-scales by `1/S`, which is what
keeps it reading as a room seen through an opening rather than a
thumbnail being blown up.

Three things that were wrong before they were right, and would be again:

1. **Measure with `offsetWidth`, never `getBoundingClientRect()`.** The
   rect includes the element's own transform, so re-measuring during a
   dive — rotating a phone mid-fall is enough — reads the instrument at
   scale 3, sets an aperture three times too wide, and computes the
   growth needed to fill the screen from a lie.
2. **Anchor the portal to the aperture, not to the middle of the
   screen.** The instrument is pushed down the stage to clear the words
   above it. Anything centred on the viewport sits a hundred pixels off
   the hole, and the two drift further apart the more they scale.
3. **Scale geometrically — `target^t`, not a linear ramp.** Flying
   toward something at a steady speed multiplies its apparent size by a
   constant factor per unit of distance. A linear ramp looks motionless
   for half the dive and then jump-cuts.

## The three that were wrong on screen

1. **A missing letter.** "Every instrument" rendered as "E ery" — the
   `v` was in the DOM at opacity 1, width 17.7px, transform none, and
   painted nowhere. Cause: `will-change: transform` on every `.ch`.
   Five headlines of ~30 characters asked the compositor for ~150
   layers; it answered by silently dropping some. These animate once
   and are smooth without the hint. **Never put `will-change` on a
   per-character split.**
2. **The instrument is sized by the script, not by CSS.** A headline is
   two lines on a laptop and four on a phone, and seven chips wrap
   differently again, so no fixed `vh` clears the words on every screen
   — which is how the roster ended up on top of the keyboard. `layout()`
   measures where the copy actually ends and gives the instrument what
   is left.
3. **Nothing blurs on anything that scales.** A `box-shadow` with a
   120px blur on an element scaled 25x is a 3000px blur, recomputed
   every frame of the dive. The aperture's glow is two strokes now, and
   `update()` reads no layout at all — the first version called
   `getBoundingClientRect()` on five acts and then wrote transforms to
   them, forcing a full layout per act per frame.

## Running it

```bash
node ../../scripts/serve-landing.js
```

Or open `index.html`. No build step, no npm install, no framework — the
same rule the manager app follows.

## Before it goes live

- **The phone number is a placeholder** (`+910000000000`, in two places
  in `index.html`, marked `FILL BEFORE DEPLOY`). Nothing on this page is
  invented; that number is blank on purpose rather than plausible.
- **No fee appears here, deliberately.** Piano is ₹2,500 and everything
  else ₹1,500, and both live in `fee_rules` in Postgres. A price printed
  on a marketing page is a second copy that stops agreeing with the
  first one the day he raises it — the same argument as the house rule,
  pointed at parents instead of at him.

## Reduced motion

`prefers-reduced-motion` turns the page into four still rooms with the
words on them. It loses the dive and nothing else — the address, the
hours and the phone number are all still there.
