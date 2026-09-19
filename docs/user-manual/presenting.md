# Presenting Vuka

[Back to the manual](README.md)

> **In short:** Reset the demonstration copy, then follow the twelve steps in section 2. Section 3 shows where each
> requirement in the brief is answered on screen, and section 4 what to say before you are asked.

**Who this is for:** whoever demonstrates Vuka to the GovTech 2026 panel or to the Department.

**What you will do:** reset the demonstration copy, walk the quarter from deadline to citizen in
one pass, and answer, screen by screen, each requirement in the DSAC challenge statement.

The whole run takes about twelve minutes. Every step below is a real action against real data: the
28 entities and their allocations are the published figures, and the quarterly figures, names and
comments are illustrative, as the screens say.

---

## 1. Before you start

1. Give Karabo its model. On a Mac, set these in the terminal you will start the backend from
   (on Windows, `run-local.ps1` reads them from `karabo.local.ps1` instead). Keep the key in a file
   outside the repository:

   ```bash
   export AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
   export AZURE_DEPLOYMENT_NAME=<deployment name>
   export AZURE_OPENAI_API_KEY_FILE=/path/to/file/holding/the/key
   ```

2. In the same terminal, put the demonstration copy back to its seeded state and start it:

   ```bash
   ./run-demo.sh --reset
   ```

3. In a second terminal start the dashboard, then open `http://localhost:5173`:

   ```bash
   cd frontend && VITE_DEV_AUTH=true npm run dev
   ```

4. Have the completed demonstration template to hand. The reset writes it to
   `~/.vuka/demo/Iziko_Q2-2026-27_completed.xlsx`. It has one row with no figure and one indicator
   code that is not registered, and every other row is clean.
5. Have one small PDF to hand to attach as evidence.
6. Open a second browser window (or a private one) for the reporter, so you can show the return
   arriving without signing out.
7. Check Karabo is connected: open it on the landing page. The opening message should say what it
   answers from, not that it is not connected.

The development sign-in is on in this copy. **Never run it anywhere another person can reach.**
Switch roles from the **Demonstration accounts** panel at the foot of the sign-in page.

---

## 2. The run, in order

| # | Sign in as | Do | Say | Manual |
|---|---|---|---|---|
| 1 | Nobody | Open the landing page. Switch the language to isiZulu, then back. Open the **Ask Karabo** tab and show its four questions | Five languages across every screen. Karabo is on every page, and answers from Vuka's records with the asker's own access | [Getting in](getting-in.md) |
| 2 | Administrator | Set Q2's due date to within 30 days, then click **Set** | For Schedule 3A the regulation sets no day count, so the date is the Department's instruction. A passed date is locked | [Setting up, step 2](00-administrator.md#2-set-a-quarters-due-date) |
| 3 | Administrator | Issue Artscape a reporter account. Publish Artscape and Iziko | There is no sign-up. The account is tied to one entity. Publication is a departmental decision, and the administrator cannot approve figures | [Setting up, steps 3 and 5](00-administrator.md#3-issue-a-reporter-account) |
| 4 | Entity reporter (Iziko) | Show the deadline warning. **Upload completed file**, **Upload and parse** | 21 rows read, 20 matched, one held aside rather than dropped | [J1, steps 1 to 3](J1-reporting-from-your-desk.md) |
| 5 | Entity reporter | On HER-1.3, type 2 (reason required), give a reason, attach the PDF. **Confirm all 20**, **Submit** | Every figure carries its source cell. Confirming is in your name and cannot be edited. A figure with no evidence is unverifiable | [J1, steps 4 to 7](J1-reporting-from-your-desk.md#4-check-what-vuka-read) |
| 6 | DSAC reviewer | **Today**, then **Review queue**. Click Robben Island's score | Ranked by risk, not by date. Five signals, each weighted and explained. Arithmetic, reproducible by hand | [J3, steps 1 to 3](J3-reviewing-submissions.md) |
| 7 | DSAC reviewer | Open Iziko Q1. Dispute HER-1.1, then **Return 1 figure to the entity** | Nothing is ever edited. Only the disputed figure goes back | [J3, steps 4 to 6](J3-reviewing-submissions.md#4-open-a-submission) |
| 8 | Entity reporter (second window) | Watch the returned notice arrive on My reporting | The reviewer's words, against that one figure, without a reload | [J1, If a figure is returned](J1-reporting-from-your-desk.md#if-a-figure-is-returned-to-you) |
| 9 | DSAC executive | **Portfolio**, open Boxing SA, **Explain the score**, **Unit cost** | Allocated, promised, reported, verified. Unit cost only against its own plan, its history and same-sector peers | [J4, steps 1 to 4](J4-portfolio-view.md) |
| 10 | DSAC executive | **Analytics & Insights**. **Ask Karabo**: *Why is Robben Island scored critical?* | Year on year, audit outcomes, filing, sectors, who moved. Karabo corrects the question (it is medium, 45), gives the five signals and names its source | [J4, steps 5 and 6](J4-portfolio-view.md#5-is-the-portfolio-getting-better); [Asking Karabo](karabo.md) |
| 11 | Nobody | **Citizen View** on a phone-sized window. Open Artscape, **Visit Artscape**, the light version. Then ask Karabo *What was Iziko allocated this year?* | What was received, promised and delivered, only for published entities, in five languages, on a small data bundle. A visitor's Karabo sees only what is published | [J5](J5-citizen-view.md); [Asking Karabo, step 3](karabo.md#3-what-karabo-can-see-depends-on-who-you-are) |
| 12 | Reviewer, if time allows | `/logs`, then **Export CSV** | Every event read from the record it describes, in a named person's name | [Working together, step 5](working-together.md#5-the-audit-trail) |

If time is short, keep steps 2, 4 to 8 and 10. They carry the deadline, the evidence, the return
and the question box, which are the parts nobody else will show.

---

## 3. Where each requirement in the brief is answered

The challenge statement lists five functional requirements, (a) to (e).

| Requirement | Where it is on screen | Honest limit |
|---|---|---|
| **(a) Analytics.** Trends and patterns per entity, audit findings, year-on-year, targets in progress, not started, deadline missed | **Analytics & Insights** (J4, step 5); the entity page's audit history and **Targets for the year** (J4, step 2); **Portfolio** (J4, step 1); **Ask Karabo** (J4, step 6) | No screen shows staff demographics or job creation. A workforce table exists in the data model and is kept off the public pages on purpose, but nothing draws it yet |
| **(b) Early warning.** Risk-based alerts before deadlines are missed; notifications on due dates; countdown at 30 days, 15 days and hourly | **Risk & Alerts** and the ranked **Review queue** (J3, steps 2, 3 and 7); the reporter's sign-in warning and countdown (J1, step 1); reminders at 30, 15 and the last day, and on Teams hourly on the last two days (Setting up, step 2) | The score is weighted arithmetic over five published signals, not a trained prediction. Say so as a choice: every alert can be explained and reproduced. Reminder email has not been sent through a real mail relay |
| **(c) Document repository.** Plans, APPs, reports and financials uploaded for DSAC review | **Documents** with versions, receipts and decisions (Working together, step 1); phone **Documents** upload (J2) | Approving or returning a document works in the system but has no button on the dashboard yet |
| **(d) Workspaces.** Microsoft integration, version on save, real-time comments, internal and external tasks, approval on receipt, full mobile working | **Workspaces**, **Tasks** and **Set a task**, live comments (Working together, steps 2 to 4); **Microsoft 365** binding and Teams reminders (Setting up, step 4); receipts (Working together, step 1); phone reporting and offline (J2; Working together, step 6) | The Microsoft Graph path is tested against Microsoft's documented response shapes, not a live tenant. Present it as built and untested unless one library has been bound first |
| **(e) Security and privacy.** Aligned with South African cybersecurity and privacy principles | No sign-up; each reporter bound to one entity by a claim on their signed token; the executive reads and changes nothing; publication and approval held by two different people; nothing public until published; the audit trail; the POPIA notice on sign-in (Getting in, Setting up) | The demonstration uses the development sign-in. The real sign-in (Firebase) is built; show that it exists rather than claiming the demo uses it |

---

## 4. Say these before you are asked

- **The quarterly figures, names, comments and tasks are illustrative.** The allocations for all
  28 entities are real, from the Estimates of National Expenditure 2026, Vote 37, Table 37.3, and
  sixteen entities carry published audit outcomes.
- **Entity Registration and Forgot password are designs.** Each says so on screen.
- **Karabo needs its model connected before the demo.** It runs on a Microsoft Foundry
  deployment, set as in section 1. Without it, Karabo says it is not connected and answers
  nothing. Answers come only from Vuka's records, with the caller's own access, and list their
  sources; it can still be wrong, so point at the source.
- **The four translations are machine-drafted and unreviewed.** The interface is fully externalised,
  so reviewing them is a content task. PanSALB, one of the 28 entities, is the obvious partner.
- **Robben Island scores 45, medium**, not the 74, critical, the design wireframes show. The
  published history for it is thin, and the score only uses what is stored.
- **Vuka is not a second eQPRS.** DPME's system is where the numbers go; Vuka is where they can be
  defended, and it exports into DPME's shape.
- **Two entry points are not yet in the menu.** The audit trail is reached at `/logs`, and the
  document approve and return actions have no button yet.

---

[Back to the manual](README.md)
