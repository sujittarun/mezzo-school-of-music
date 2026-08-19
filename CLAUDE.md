# Mezzo School of Music — tenant app

Tenant id **`mezzo`** on the Academy Manager platform. Read
`AcademyManager/PLATFORM.md` first; it is inherited into this session and
it is the contract.

## Who uses this

**One person.** Dr. R. Santhana Krishnan teaches every instrument
himself and is the only operator. There is no front desk, no second user
to spot a mistake, and no appetite for a screen that needs explaining.

That is the design constraint, not a nice-to-have:

- Three tabs, always visible. Nothing nested, nothing to get lost in.
- Nothing under 15px; every tappable thing at least 48px tall. A mis-tap
  on a register marks a child absent.
- Every failure says something in English. A silent catch becomes "it
  didn't work" on a phone call.
- Before adding a control, ask what it replaces. The answer "it's only
  one more button" is how this becomes an app he stops opening.

## The money rule

Piano ₹2,500, every other instrument ₹1,500 — both in `fee_rules`, and
nowhere else. `resolve_fee()` prices, `record_fee_payment()` writes.
`scripts/check-app.js` fails if either number appears in this repo
outside a comment.

## Reminders are deliberately not a ladder

The platform's `reminder_queue()` has a five-rung chase ladder. Mezzo is
configured `config.reminders = {mode:'simple', afterDays:1}` and the
shared function reads it — one nudge, a day late, every day until paid,
no +15 stop. Migration `2026-08-19r`.

**Do not filter the dues list in this app.** The list that comes back IS
the list. Filtering here is how his screen and his WhatsApp message start
disagreeing.

## Structure, and why it is shaped this way

- **Instruments are `sports` rows.** Same noun, different word — it is
  what the fee chain prices on.
- **Batches are the two time windows**, not the instruments: `weekday`
  (Mon–Fri 15:00–20:00) and `saturday` (10:00–20:00). One batch per
  instrument would need sixteen of them to carry two day patterns, and
  would make him choose an instrument before he can mark a register.
- **Flute is seeded `active = false`** — it is struck through by hand on
  the card he handed over. Ask before turning it back on.

## The register

`attendance_month(tenant, from, to)` — one call, one row per student,
marks as a date→status map, students with no marks included. Added in
`2026-08-19s` because `attendance_roster()` answers one day and
`attendance_history()` answers per session, and neither builds a grid.

Marking cycles blank → present → absent → blank. `null` is a real status
that **clears** the mark; do not re-introduce a `|| "present"` default.

## Before committing

```bash
node scripts/check-app.js
```

Commit messages: one line, 100 characters.
