# Demonstration script

[Back to the manual](README.md)

> **In short:** About twelve minutes, five journeys, one person at a time. Lines in plain text are
> what you say. Lines in *italics* are what you click. You don't need to learn it word for word;
> say it your way, but keep the order.

---

## Before you go on

Do these in the hour before, not in front of the panel.

1. In one terminal, give Karabo its model, then reset and start the demo copy:

   ```bash
   export AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
   export AZURE_DEPLOYMENT_NAME=<deployment name>
   export AZURE_OPENAI_API_KEY_FILE=/path/to/file/holding/the/key
   ./run-demo.sh --reset
   ```

2. In a second terminal: `cd frontend && VITE_DEV_AUTH=true npm run dev`, then open
   `http://localhost:5173`.
3. Have the filled Q2 template to hand: `~/.vuka/demo/Iziko_Q2-2026-27_completed.xlsx`, and one small
   PDF to attach as evidence.
4. Open the **Ask Karabo** tab once. The first message should say what it answers from. If it says
   it isn't connected, go back to step 1.
5. Close every other window. Zoom the browser to 110 percent so the back of the room can read it.

To switch person, sign out (top right), click **Sign in**, and pick the role from the
**Demonstration accounts** panel at the bottom of the sign-in page.

---

## Opening (30 seconds)

*Landing page on screen.*

Every quarter, the 28 bodies the Department of Sport, Arts and Culture funds have to report what
they delivered against what they promised. Today that happens by email and spreadsheet, deadlines
slip, and nobody can say where a number came from.

Vuka fixes that. Every figure carries the cell it came from, the document behind it, and the name
of the person who confirmed it. I'm going to show you one quarter through the eyes of five people:
the administrator, the reviewer, a reporter at Iziko Museums, the Director-General, and a member of
the public.

---

## 1. The administrator (2 minutes)

*Sign in as Administrator.*

This is the administrator at the Department. They decide three things: when reports are due, who is
allowed to report, and what the public gets to see.

*Point at the Submission deadlines table.*

First, deadlines. Every one of these entities is Schedule 3A, and the regulations don't set a day
count for their quarterly report. So the date is the Department's call, and it's set here, once,
for everyone.

*In the Q2 row, set the date to about three weeks from today. Click Set.*

I've brought Q2 forward. That one date now drives every reporter's countdown, the reminders at 30
days, 15 days and on the day, and the lateness score. And once a date has passed, you can't move
it, because lateness was already measured against it. You can see Q1 is locked.

*Scroll to Entities and their reporters. On Artscape, click Issue an account, fill in a name and
email, confirm.*

Second, who can report. There's no sign-up in Vuka. The Department issues each reporter an account
for one entity, and that entity is written into the account itself. So Thabo can report for
Artscape and nothing else. He can't pick another entity, because there's nothing to pick.

*Click Publish on Artscape, Iziko, Robben Island, Boxing SA, SAHRA and the Market Theatre.*

Third, what the public sees. Nothing is public until the Department publishes it. And notice what
the administrator can't do: they can't touch a figure, and they can't approve one. Publishing and
approving are deliberately two different people.

---

## 2. The reviewer (3 minutes)

*Sign out. Sign in as DSAC reviewer.*

Now the reviewer. Q1 reports came in over August, and this is where they start their day.

*Point at the four counts, then at Start with these three.*

It tells them what's waiting, and which three entities to look at first. Not the first three that
arrived: the three most at risk.

*Click The whole queue, ranked. Click Robben Island's score.*

Here's the whole queue, ranked by risk. And every score explains itself. Robben Island is at 45.
That's five signals, each with a weight: it filed 70 days after a legal deadline, and its audit is
outstanding. There's no black box here. It's arithmetic you could do on paper, which matters when
you have to defend it in a committee.

*Close the panel. Find Iziko and click open.*

Let's open Iziko's Q1 filing. Every figure sits next to where it came from and the evidence behind
it. You can open any document right here.

*On HER-1.1, click Dispute this figure. Type a reason. Click Mark disputed.*

This one says two exhibitions, but the register they attached lists three. I don't edit it. Nobody
can edit a confirmed figure in Vuka, not even me. I dispute it, and say why.

*Point at the bottom bar, then click Return 1 figure to the entity, and confirm.*

See how the button changed on its own: approve became return. Only that one figure goes back. The
other nineteen stay exactly as Iziko filed them.

*Open Boxing South Africa. Click Approve all 18 figures, then Approve.*

And when I'm happy, I approve. It's recorded with my name and the time. If some figures have no
evidence, Vuka tells me first, and they stay marked as unverifiable.

*Click Risk & Alerts in the menu.*

This is the early warning view across all 28, by band, with the reason for each in plain words.

---

## 3. The reporter (3 minutes)

*Sign out. Sign in as Entity reporter.*

Now I'm the reporting officer at Iziko Museums.

*The deadline warning is on screen.*

The first thing they see is the warning about the date the administrator just moved. Q2 is due in
twenty days. I'll come back to it.

*Click Later. Point at the returned notice.*

And there's the reviewer's return, in the reviewer's own words, against that one figure. It arrived
without anyone refreshing anything.

*Click Answer the disputed figure. Type 3, write a short note, confirm, submit.*

Only the figure in question is open. I correct it to three and say why. When I confirm, it's in my
name and it can't be edited afterwards. And the two isn't erased. Both stay on the record, with who
confirmed each one and when. That's the audit trail the Auditor-General asks for.

*Back on My reporting, click Upload completed file. Choose the template. Click Upload and parse.*

Now Q2. Most entities work in Excel, so we meet them there. They download a template that's already
filled with their own targets, type in their figures, and upload it. Twenty-one rows read, twenty
matched. The one we don't recognise is held aside, not silently dropped.

*Click Review what was read. Point at a source cell.*

Every figure shows the exact cell it came from. And nothing is saved until the reporter confirms it.

*Scroll to HER-1.3. Type 2. Point at the reason box. Write a reason.*

One row was blank. They delivered two against a target of six, and Vuka won't let them confirm a
shortfall that big without a reason. That's the most common reason a report gets sent back, so we
catch it here instead of two weeks later.

*Click attach, choose the PDF, tick Validity and Completeness, Attach.*

And the evidence. They say which part of the Auditor-General's test it satisfies. A figure with no
evidence shows to the Department as unverifiable.

*Click Confirm all 20, Confirm, Submit to the Department, Submit.*

Confirm, submit, done. Twenty days early.

---

## 4. The executive (2 minutes)

*Sign out. Sign in as DSAC executive.*

Now the Director-General. This view is read only.

*Point at the totals, then the risk bands.*

R2.26 billion across 28 bodies, at a glance: who's filed, what's outstanding, and everyone grouped
by risk. Those allocations are the real published figures, Vote 37.

*Click BoxingSA.*

Any entity opens like this: what it was given, what it promised, what it reported, and how much of
that is actually backed by evidence. Plus its audit history from the Auditor-General.

*Click Explain the score, close it, click Unit cost.*

The same explanation the reviewer saw, so the Department only ever tells one story. And unit cost,
compared against its own plan, its own history and its sector peers. Never across sectors: a museum
visit and a boxing licence aren't the same thing, and we won't pretend they are.

*Click Analytics & Insights. Scroll a little.*

Is the portfolio getting better? Year on year, audit outcomes, who files on time, by sector. A year
that hasn't been audited yet shows no bar, not a zero. And it all exports to a spreadsheet or a PDF
for the committee.

*Click Ask Karabo. Click Why is Robben Island scored critical?*

And if you'd rather just ask, that's Karabo. I asked why Robben Island is critical, and it corrected
me: it's medium, 45, and here's why. Every answer lists where it came from, and it only answers
from Vuka's own records, with my access and nothing more.

---

## 5. The public (1 minute)

*Sign out. Open Citizen View. Narrow the window to phone size if you can.*

Finally, anyone at all, on a phone, no account.

*Tap Artscape's View organisation.*

What it received, what it promised, what it delivered. Only what the Department has approved and
published.

*Switch the language to isiZulu.*

In five languages.

*Go to the landing page, click Ask Karabo, ask What was Iziko allocated this year?*

And the public can ask Karabo too. It answers from published figures only. Ask it about risk scores
and it tells you that's for staff.

---

## Closing (20 seconds)

So that's one quarter, end to end. A deadline set once, a report filed from Excel with the evidence
attached, a figure questioned without ever being edited, and the whole picture for leadership and
the public.

eQPRS is where the numbers go. Vuka is where they can be defended. Thank you.

---

## If you're asked

**"Isn't this what eQPRS already does?"**
eQPRS captures the numbers. It doesn't hold the evidence behind them, and it was built around
departments. Every DSAC body is Schedule 3A, which no system currently serves. We fill that gap, and
we export in the shape eQPRS takes.

**"Is this real data?"**
The 28 entities and their allocations are real, from the 2026 Estimates of National Expenditure.
Sixteen carry their published audit outcomes. The quarterly figures, comments and names are made up
for the demo, because that data isn't published at this level.

**"Could Karabo make something up?"**
It's told to answer only from what Vuka's records return, and the sources under each answer come
from what it actually looked up, not from what the model wrote. It can still be wrong, which is
exactly why the source is always there to check.

**"Why isn't Robben Island critical?"**
Because the score only uses what's stored, and its reporting history in the system is thin. We'd
rather show a defensible 45 than an impressive 74.

**"Are the translations checked?"**
Not yet. They're machine drafted. The whole interface is built to be translated, so reviewing it is
content work, and PanSALB, which is one of the 28, is the obvious partner.

**"How is it secured?"**
No sign-up. Each reporter's account is tied to one entity, and every request is checked against it.
The executive can read everything and change nothing. Publishing and approving are two different
people. Nothing is public until it's published, and every action is on the audit trail.

**"What isn't built yet?"**
Staff demographics and job creation aren't on a screen yet. Staff single sign-on through the
Department's Microsoft directory isn't wired. And Microsoft 365 document syncing is built but hasn't
been run against a live tenant.

---

## Where each requirement in the brief shows up

| Requirement | Where you showed it |
|---|---|
| (a) Analytics | Executive, steps 1 to 5: portfolio, entity page, audit history, Analytics, Karabo |
| (b) Early warning | Administrator step 2 (the date), reporter step 1 (the warning), reviewer steps 2, 3 and 8 (risk) |
| (c) Document repository | Reporter step 9 (evidence attached to each figure); reviewer step 4 (open it in place) |
| (d) Workspaces | Reporter steps 2 to 4 (the return and reply, live); reviewer steps 5 and 6 |
| (e) Security and privacy | Administrator steps 3 and 4; the reporter seeing one entity; Karabo following each person's access |
