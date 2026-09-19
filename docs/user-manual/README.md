# Vuka user manual

## Vuka in one minute

The Department of Sport, Arts and Culture (DSAC) funds 28 public bodies: museums, theatres, arts
councils, libraries, sport and language bodies. Every quarter each of them must tell the Department
what it achieved against the targets it promised. Vuka is where that happens.

- **Entities report** their figures, and attach the document each figure came from.
- **The Department checks** them, starting with the entities most at risk, and approves them or
  sends back the ones it doubts.
- **Leadership sees** the whole portfolio at a glance, and can ask questions in ordinary words.
- **The public sees** what each published body was given and what it delivered.

![How one quarter moves through Vuka: administrator, reporter, reviewer, executive, the public](img/overview-flow.png)

### Words you will see

| Word | What it means |
|---|---|
| **Entity** | One of the 28 bodies DSAC funds, for example Iziko Museums or Boxing South Africa |
| **Quarter** | A three-month reporting period. Q1 is April to June, Q2 July to September, and so on |
| **Target** | Something the entity promised to deliver this year, for example "12 exhibitions mounted" |
| **Figure** | What the entity says it actually delivered against a target this quarter |
| **Evidence** | The document behind a figure: an attendance register, a signed report, an invoice |
| **Confirm** | The reporter's promise that a figure is right. It is recorded in their name and cannot be edited |
| **Submit** | Sending the whole quarter to the Department |
| **Return** | The Department sending back one or more figures it doubts, with a reason |
| **Unverifiable** | A figure with no evidence attached. It cannot be checked at all |
| **Risk score** | A number from 0 to 100 saying how much attention an entity needs. Always explained, never a black box |
| **Published** | Visible to the public. Nothing is public until the Department publishes it |
| **Karabo** | The assistant. Ask it a question and it answers from Vuka's records, with its sources |

---

This manual has one chapter for each kind of person who uses Vuka. Find yourself in the table and
start there.

| If you are | You want to | Read |
|---|---|---|
| Anyone | Open Vuka, choose your language, sign in | [Getting in](getting-in.md) |
| Anyone | Ask a question in ordinary words | [Asking Karabo](karabo.md) |
| A DSAC administrator | Set deadlines, give an entity its reporter account, connect Microsoft 365, choose what the public sees | [Setting up: the administrator](00-administrator.md) |
| A reporting officer at an entity, at a desk | Report the quarter from the Excel template | [J1. Reporting from your desk](J1-reporting-from-your-desk.md) |
| A reporting officer on a phone | Report the quarter one question at a time, on mobile data | [J2. Reporting from a phone](J2-reporting-from-a-phone.md) |
| A DSAC reviewer | Decide which submissions to look at, then approve or return them | [J3. Reviewing submissions](J3-reviewing-submissions.md) |
| A DSAC executive | See the whole portfolio, explain any one entity, ask a question | [J4. The portfolio view](J4-portfolio-view.md) |
| A member of the public | See what an entity was given and what it delivered | [J5. The citizen view](J5-citizen-view.md) |
| Anyone signed in | Keep documents, set and close tasks, read the audit trail, work offline | [Working together](working-together.md) |
| Presenting Vuka | Run the demonstration in order, and know what each screen answers in the brief | [Presenting Vuka](presenting.md) |

---

## How the journeys connect

A quarter moves through Vuka in one direction, and each chapter picks it up where the last one
left it.

1. The **administrator** sets the due date, issues the entity's reporter account and, when the
   Department decides to, publishes the entity.
2. The **reporter** is warned as the due date approaches, fills in the figures, attaches evidence,
   confirms each figure and submits.
3. The **reviewer** checks each figure against its evidence, then approves the submission or
   returns the figures they dispute. A returned figure goes back to the reporter, who answers it
   and submits again.
4. The **executive** reads the result across all 28 entities, and can ask Karabo a question in
   ordinary words.
5. The **public** sees what was allocated, promised and delivered for each published entity.

Two rules hold throughout, and they explain most of what the screens say:

- **A confirmed figure cannot be edited.** Not by the reporter, not by the reviewer. If a figure is
  wrong, the reviewer returns it and the reporter confirms a corrected one. Both stay on the record.
- **A figure with no evidence is "unverifiable".** That is different from "unverified". Attach the
  attendance register, signed report, photograph or invoice that the number came from.

---

## Opening Vuka

| Surface | Address | Who |
|---|---|---|
| Landing page and office dashboard | the address your department gives you, for example `https://vuka.example.gov.za` | Everyone with an account |
| Phone reporting | the same address followed by `/m` | Entity reporters |
| Citizen view | the same address followed by `/public` | Anyone, no account |
| Audit trail | the same address followed by `/logs` | Anyone signed in (a reporter sees their own entity only) |

**There is no sign-up.** DSAC issues each reporter account for one named entity. If you report for
an entity and have no account, ask your DSAC administrator. See [Getting in](getting-in.md).

**You land on your own screen.** Vuka knows your role and, for a reporter, your entity, from your
account. A reporter never chooses an entity; the entity name is already at the top of the page.

| Role | Opens on | Menu on the left |
|---|---|---|
| Entity reporter | My reporting | My reporting, Documents, Workspaces, Tasks, Citizen View |
| DSAC reviewer | Today | Today, Review queue, Risk & Alerts, Analytics & Insights, Documents, Workspaces, Tasks |
| DSAC executive | Portfolio | Portfolio, Entities, Analytics & Insights, Citizen View |
| DSAC administrator | Administration | Administration, Workspaces, Tasks, Citizen View |

Across the top of every signed-in page are a search box, the **language** picker, a notifications
bell, and your name and role with the sign-out button. The arrow at the top of the menu collapses
it to icons.

Down the right edge of every page, signed in or not, is the **Ask Karabo** tab. See
[Asking Karabo](karabo.md).

---

## About the screenshots

The screenshots were taken on a demonstration copy of Vuka loaded with the 28 real DSAC entities
and their published allocations. Quarterly figures, reviews, comments, tasks and people's names in
them are illustrative.

That copy runs with a development sign-in, so three things in the screenshots will not appear on a
real deployment:

- the orange strip across the top that reads "Development sign in is enabled",
- the **Demonstration accounts** panel at the foot of the sign-in page, and
- the employee single sign-on button signing straight in as the administrator. A real deployment
  would federate it to the Department's directory, which is not wired in this build.

Karabo's answers in the screenshots are real answers from the connected model, given to the
questions shown. Asked again, it may word them differently; the figures and sources stay the same.

Red numbered boxes were added to the screenshots to show where to click. They are not part of the
screen.
