# Mezzo School of Music

The manager app for **Mezzo School of Music**, Thadagam Road, Coimbatore.
Dr. R. Santhana Krishnan, Director & Tutor.

Piano · Keyboard · Guitar · Violin · Ukulele · Drums · Vocals
Mon–Fri 3–8 pm · Saturday 10 am–8 pm

## What it does

Three tabs, and nothing else.

| | |
|---|---|
| **Register** | Today's attendance — tap a name to mark them. Switch to **Whole month** for the register grid, students down the side and days across. |
| **Dues** | Whoever is a day or more late on their fee, with a WhatsApp button and a Paid button. **Someone else paid** records a family who paid on time and so never appeared here at all. |
| **Money** | Fees collected and money spent this month, and a two-field form to add an expense. |

## The landing page

`landing/` is the public site for **mezzoschoolofmusic.in** — a separate
surface with its own rules, and its own `README`. It is not the app: it
is for a parent deciding whether to bring their child, and it is allowed
to be as elaborate as that job needs. The app is for one man marking a
register, and is not.

## Running it

Both are static sites. One server covers them:

```bash
node scripts/serve-landing.js
```

`/` is the manager app, `/landing/` is the public page. There is no
build step, no npm install, no framework.

## Before you change anything

```bash
node scripts/check-app.js
```

That runs the real app in node and asserts on the HTTP calls it makes —
not on how it looks. It already caught two bugs that reading the source
did not: a register calling an adapter function that did not exist, and
a third tap that could never clear a mark because `status || "present"`
turned an intentional `null` back into a present.

Add a case whenever something breaks. A conclusion defended only by
reading the source has been wrong here before.

## Taking money

A payment asks three things: how much, how many months, and cash or
UPI. All three were once hardcoded — one month, UPI, and the exact
figure the reminder queue quoted — and the months one reached the
parent: a term paid up front recorded as a single month rolls
`renewal_on` forward once, and the platform then chases a family that
has already paid.

The amount is still never worked out here. `enrollment_fee()` prices
the months and the app displays what it is told; changing the month
count re-asks the database rather than multiplying anything.

## The one rule

**No fee is ever calculated in this app.** Piano is ₹2,500 and everything
else is ₹1,500, and both numbers live in one place — `fee_rules` in
Postgres. `resolve_fee()` prices a student and `record_fee_payment()` is
the only thing that writes a rupee.

The reason is not tidiness. If this app worked out a fee itself, the
number on Sir's screen and the number in the parent's WhatsApp message
would be produced by two different pieces of code, and one day they
would disagree about what a family owes. There is a check in
`scripts/check-app.js` that fails if either amount ever appears in this
repo outside a comment.

The same goes for who is late: `reminder_queue()` decides, the academy's
setting says "one day overdue, keep telling me", and the Dues tab shows
what comes back without filtering it.
