# Mezzo — the mark

The symbol is the **line-art violin from Dr. Krishnan's business card**,
not a new idea. He is already handing that card out, so the app carries
his identity rather than competing with it. The card also uses a treble
clef as a background watermark; that is a texture, not the mark, and it
is deliberately not used here.

| file | what it is | where |
|---|---|---|
| `logo.png` | 318×900, purple `#4B3F72` on transparent, hairline | sign-in screen, print, anywhere it is shown large |
| `logo-white.png` | 113×320, white, **thicker stroke** | the app header, on the purple |
| `icon-192/512.png` | white violin on `#4B3F72` | phone home screen |
| `favicon.png` | 64×64, heaviest stroke | browser tab |
| `docs/logo-source-1024.png` | the 1024px original | regenerate from this, not from a resize |

## Why there are three stroke weights

A hairline that looks refined at 900px **disappears at 40px**. Measured,
not guessed: at the header's size the untouched stroke rendered as a
grey smudge and the 32px favicon was blank. Each cut is dilated to suit
where it is used — heavier as it gets smaller.

If you regenerate any of these, check them at the size they are actually
used before shipping. Resizing the big one is what produced the smudge.

## Colour

`#4B3F72` — taken from the card. `--brand` in `assets/css/app.css`.
Ink `#2A2340`. Nothing else in the palette is a brand colour: green
means present, red means absent or money late, and those are states, not
identity.

## The mark is a line, not a tile

It sits directly on the purple in the header with no white plate behind
it, and keeps the violin's tall proportion instead of being squeezed
into a square. A line drawing on a white rounded rectangle reads as a
sticker someone stuck on.
