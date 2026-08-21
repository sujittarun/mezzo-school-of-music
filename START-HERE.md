# Start a Mezzo chat

Open a terminal **inside `Academy Manager Business/Mezzo/`** and paste
everything below the line into a new chat. `PLATFORM.md` is inherited
automatically from the parent folder, so it does not need pasting.

---

I am working on **Mezzo School of Music**, tenant `mezzo` on the Academy
Manager platform. Read `AcademyManager/PLATFORM.md` — it is inherited
into this session and it is the contract, not background reading. Then
read this repo's `CLAUDE.md` and `AcademyManager/prompts/tenants/mezzo.md`.

## Who this is for

Dr. R. Santhana Krishnan, Director & Tutor. Music school on Thadagam
Road, Coimbatore. **He is the only user of this app and he is not a
technical person.** ~95 enrolled, ~80 active, and he teaches every
instrument himself.

That single fact outranks every other design consideration here:

- Three tabs — Register, Dues, Money — always visible, nothing nested.
- Nothing under 15px. Every tappable thing at least 48px: a mis-tap on a
  register marks a child absent.
- Before adding any control, say what it replaces. "It's only one more
  button" is how this becomes an app he stops opening.
- Every failure says something in English. A silent catch becomes "it
  didn't work" on a phone call.

## The shape of the academy

| | |
|---|---|
| Mon–Fri 15:00–20:00 IST | batch `weekday` |
| Sat 10:00–20:00 IST | batch `saturday` |
| Piano | **₹2,500/month** |
| Every other instrument | **₹1,500/month** |
| Instruments | Piano, Keyboard, Guitar, Violin, Ukulele, Drums, Vocals |
| Flute | seeded `active = false` — struck through on his card. Ask before enabling |

**Batches are the time window, not the instrument.** One batch per
instrument would need sixteen to carry two day patterns, and would make
him pick an instrument before he can mark a register. The instrument
rides on `enrollments.sport`, which is where the fee chain reads it.

**Instruments are `sports` rows.** Same noun, different word.

## The rule that outranks everything

> **Anything that computes money lives in Postgres.**

`resolve_fee()` prices a student, `record_fee_payment()` is the only
thing that writes a rupee, `reminder_queue()` decides who is late. The
two prices live in `fee_rules` and nowhere else — `scripts/check-app.js`
fails if either number appears in this repo outside a comment.

The reason is not tidiness: if this app worked out a fee itself, the
number on his screen and the number in the parent's WhatsApp message
would come from two different pieces of code, and one day they would
disagree about what a family owes.

**Reminders are deliberately not a ladder.** `config.reminders =
{mode:'simple', afterDays:1}`, read by the shared `reminder_queue()`
(migration `2026-08-19r`). One nudge, one day late, every day until paid,
no +15 stop. **Never filter the dues list in the app** — what comes back
IS the list.

## Before you commit anything

```bash
node scripts/check-app.js
```

It runs the real app in node and asserts on the HTTP calls it makes, not
on the markup. It has already caught three bugs that reading the source
did not:

1. the register calling an adapter function that did not exist;
2. `p_status: status || "present"`, which turned an intentional `null`
   — the tap that CLEARS a mark — back into a present, so the third tap
   would have silently done nothing forever;
3. the class-day filter sitting on its fallback because the batch
   reference arrives on a second request and nothing redrew.

Add a case whenever something breaks. A conclusion defended only by
reading the source has been wrong here three times.

## Migrations

Never write SQL straight into the dashboard. One runner, dry run first,
`--scope` mandatory:

```bash
AcademyManager/scripts/migrate.sh --dry-run --scope mezzo path/to.sql
AcademyManager/scripts/migrate.sh          --scope mezzo path/to.sql
```

A file that touches a **shared** table or replaces a **shared** function
is `--scope shared`, even when it is only for Mezzo. `schema_migrations`
is keyed on filename + sha256; never rename an applied file.

## Working rules

- **Every timestamp carries its zone.** The database renders UTC, the
  academy thinks in IST. Cron is UTC: `30 9 * * *` is 15:00 IST.
- **A commit message is one line, at most 100 characters.** Reasoning
  goes in the migration header or a comment above the code.
- Per-tenant behaviour lives in `tenants.config`, never a new column on
  a shared table.
- Telemetry carries counts only — no names, no phone numbers, no
  amounts.
- **Say only what you have checked.** "I checked X and saw Y", or "I
  think" — never an unchecked inference in the voice of a measurement.

## Where things stand

- Live and paying: ₹899/month from 2026-08-19, first invoice 19 Sep.
- **Sixteen demo students, and not one real family yet.** Six were
  seeded at handover; ten more (`2026-08-21d`) so the app is worth
  opening. Every one carries `is_demo = true`, so go-live is still one
  line: `delete from members where tenant_id='mezzo' and is_demo;`
- **The ten new ones have no phone number, deliberately.** There is no
  automated sender for this tenant — `config.whatsapp` is null — but an
  invented Indian mobile is somebody's real number the day one gets
  wired up. Put a real number on one from the student card to try the
  WhatsApp path.
- Hosted at `https://sujittarun.github.io/mezzo-school-of-music/`. The
  **root is the school's public page**; the app is `app.html` behind
  the Sign in link, and a signed-in visit to the root hands over to it
  before anything paints. That URL is pinned in three places outside
  this repo, including a migration that raises if
  `tenants.config.app.url` is anything else — which is why the app
  moved to a filename rather than a path.
- His staff login has `app_metadata` (not user metadata) of
  `{"am_role":"staff","tenant_id":"mezzo"}`; he confirmed he can sign in
  on 2026-08-21.

Start by telling me what you have read and what you believe the current
state is, before proposing any change.
