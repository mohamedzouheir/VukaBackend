# Vuka

Performance reporting and audit readiness for the Department of Sport, Arts and Culture and the
bodies it funds.

Government already defines what public entities must report. Nobody has made it machine-readable,
and nobody holds the evidence behind the numbers. Vuka does both, and everything else follows.

---

## Read this before you pitch it

**There is already a system that captures quarterly performance data.** DPME runs eQPRS, the
Electronic Quarterly Performance Reporting System, at `eqprs.dpme.gov.za`. It configures
indicators and targets, captures actuals against them, carries an approval workflow and draws
dashboards. DPME has been running onboarding sessions for national public entities, and a
successor called the Integrated Reporting System is planned, though DPME's own annual report
records that the related monitoring system "was not developed due to procurement delays".

If you present Vuka as a way to capture performance data, someone in the room who knows this will
end the conversation. So don't. Present it as the four things eQPRS does not do:

1. **Evidence tied to figures.** Every reported number carries the cell it came from, the document
   that supports it, and the named person who confirmed it. This is the Auditor-General's
   reliability test, built as a schema instead of written as a policy.
2. **The Schedule 3A gap.** Every DSAC entity is Schedule 3A, and a Schedule 3A entity reports
   performance to its **executive authority** under Treasury Regulation 30.2.1, which prescribes
   **no deadline and names no system**. eQPRS was built around departments. The 3A performance
   line is genuinely unserved.
3. **Target versioning that matches the law.** A target may only change where the Annual
   Performance Plan is revised and re-tabled. Being about to miss it is not a lawful reason.
4. **Export rather than capture.** `/api/export` emits the filing in full provenance form, in a
   DPME-shaped CSV, and as a spreadsheet. If the Integrated Reporting System lands and mandates
   entity reporting, Vuka still has a job, because it produces that system's input.

The honest one-line positioning: **eQPRS is where the numbers go, Vuka is where they can be
defended.**

---

## How many entities, exactly

Three different counts circulate and all three are correct about different things. Expect to be
asked.

| Count | What it is | Source |
|---|---|---|
| 26 + 6 | The framing in the challenge statement | DSAC challenge brief |
| **28** | Bodies receiving entity transfers, which is what this system seeds | ENE 2026, Vote 37, Table 37.3 |
| 29 | Auditees in the portfolio, being the 28 plus the department itself | AGSA briefing, PMG meeting 41948 |

Separately, DSAC transfers to non-profit institutions that are **not** public entities, including
SASCOC, The Sports Trust, Business and Arts South Africa and loveLife. They are in the ENE under
"Transfers to non-profit institutions" and are deliberately not seeded as entities here.

---

## Run it

You need **Java 21** and **Docker** (for Postgres only). Maven comes with the repository.

```bash
docker compose up -d          # Postgres on 5432
./mvnw spring-boot:run
```

The Maven wrapper is checked in, so `mvn` does not have to be on the path: `./mvnw` downloads
a pinned Maven 3.9.16 on first use and verifies it against a checksum in
`.mvn/wrapper/maven-wrapper.properties`. Run it through the wrapper rather than through an IDE's
own compiler, which is how the build loses the `-parameters` flag that Spring needs to read
handler argument names.

First start runs the Flyway migrations and loads the real data described below. Then:

| Surface | URL | Who |
|---|---|---|
| Citizen view | http://localhost:8080/public, chosen by connection | Anyone, no login |
| Citizen view, light or full by choice | http://localhost:8080/public?view=lite, ?view=rich | Anyone, no login |
| Reporter sign-in | http://localhost:8080/m/signin | Entity reporters |
| Mobile submission | http://localhost:8080/m | Entity reporters |
| Office dashboard | http://localhost:5173 in development, http://localhost:8080 once built | Everyone who signs in |
| Dashboard API | http://localhost:8080/api/dashboard/portfolio | DSAC roles |
| Export | http://localhost:8080/api/export/submission/{id}/full.csv | Reporter (own) or DSAC |
| Documents on a phone | http://localhost:8080/m/workspace | Entity reporters |
| Comments on a phone | http://localhost:8080/m/comments | Entity reporters |
| Comments API | http://localhost:8080/api/comments/workspace?entityId={id} | Reporter (own) or DSAC |
| Workspace API | http://localhost:8080/api/workspace/entity/{id}/documents | Reporter (own) or DSAC |

The citizen view needs no authentication, so it is the fastest way to confirm the application is
alive.

**Without Docker, for a demonstration.** With Postgres already on 5432, `./run-demo.sh` starts the
backend against its own `vuka_demo` database with development sign in and the demo account uids,
and `./run-demo.sh --reset` puts that database back to the seeded demo state after a rehearsal.
Then `cd frontend && VITE_DEV_AUTH=true npm run dev` and open http://localhost:5173. Never run it
anywhere another person can reach.

### The office dashboard

React, in `frontend/`. Run it beside the backend in development, or build it into the jar.

```bash
cd frontend
npm install
npm run dev      # port 5173, proxies /api, /m and /public to 8080
npm run build    # writes into src/main/resources/static, so mvn package ships one jar
```

It needs an identity to do anything. See **Firebase** below, or the development sign in
immediately after it. `frontend/README.md` has the detail, including which role to sign in as
first and why the order matters.

### Firebase

Identity only. Everything else lives in Postgres, which is what makes "the department can take
this in-house" a true statement rather than a hedge.

1. Create a Firebase project, enable **Email/Password** auth.
2. Download a service account key.
3. Point the app at it:

```bash
export FIREBASE_CREDENTIALS=/path/to/service-account.json
```

On Cloud Run, leave it unset and application default credentials are used.

Users need two custom claims, set through the Admin SDK:

```
role      ENTITY_REPORTER | DSAC_REVIEWER | DSAC_EXECUTIVE | ADMIN
entityId  the entity a reporter is bound to; omit for DSAC roles
```

`entityId` lives on the token rather than in a request parameter precisely so a client cannot
choose it. It is what stops one entity reading another's data, and every controller routes that
check through `VukaPrincipal.canRead`.

**Reporters cannot sign up; they can only sign in.** A reporter account is issued by a DSAC
administrator from the Administration screen, for one named entity (`ReporterAccountService`).
With Firebase configured it creates the user with no password, sets both claims and returns a
set-password link for the administrator to send, so the password never passes through DSAC.
Without Firebase it records the person in the directory, so they still receive the entity's
reminders, and says that no credential was issued. Firebase's own sign-up endpoint can only be
switched off in the console (Authentication, Settings, User actions); turn it off for any real
deployment. Either way an account made that way carries no `role` claim and every endpoint
refuses it. DSAC staff accounts are still set by script.

With no usable credential the application still starts. The citizen view, the migrations and the
Thymeleaf surfaces have nothing to do with Firebase, and taking them down because a key file is
missing is the wrong failure. It logs loudly, verifies nothing, and every authenticated endpoint
answers 401. It fails closed rather than refusing to boot.

### Signing in on the reporter surface

The React dashboard holds its token in memory and sends it as a header. A phone opening `/m`
cannot: a browser navigation sends cookies and nothing else. So that surface has its own sign-in,
and three decisions in it are worth knowing.

**The server exchanges the password, not the phone.** `POST /m/signin` takes an email address and
a password, calls Google's Identity Toolkit, and puts the returned ID token in a cookie. The
alternative was the Firebase JavaScript SDK on the sign-in page, which is about 100KB on the one
page whose whole argument is that it costs almost nothing to open. The cost of this choice, stated
plainly: the password transits this server rather than going from the phone straight to Google. It
is never logged and never stored. Set the key path to enable it:

```bash
export FIREBASE_WEB_API_KEY_FILE=/path/to/file/containing/the/web/api/key
```

The file holds the key, not the environment variable, so the value never appears in a process
listing or an image layer. Leave it unset and sign-in is unavailable while the citizen view and
the header-authenticated API carry on working.

**The cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` when the request is.** It holds the ID
token only and never the refresh token, so a session lasts an hour and then the reporter signs in
again. That is deliberate: a refresh token in a browser is a long-lived credential, and expiry
costs almost nothing here because every step is written as it is answered and the step index is in
the URL. An expired token redirects to sign-in carrying where you were, and sends you back there.

**CSRF protection is on where the credential is ambient and off where it is not.** `/api/**` sends
a bearer token that an attacker's page cannot make a browser attach, so a CSRF token there would
be ceremony. `/m/**` authenticates from a cookie, so it gets a token as well as `SameSite=Strict`.
Two independent defences, because SameSite is a browser behaviour and the token is ours.

`/m/**` also requires `ENTITY_REPORTER` rather than merely a signed-in caller. It writes
performance data, and `canRead` lets DSAC roles read everything, so authentication alone would
have let a reviewer confirm a figure on an entity's behalf.

### Signing in without Firebase

There is a development sign in, for walking the four role journeys on a laptop with no Firebase
project attached.

```bash
VUKA_DEV_AUTH=true mvn spring-boot:run     # backend
VITE_DEV_AUTH=true                          # in frontend/.env
```

On a Mac with no Docker, `./run-local.sh --dev-auth` starts a portable Postgres from `~/.vuka` on
port 5433 and then the backend; see the script's header. `PORT=8081 ./run-local.sh` runs the
backend on another port, and `VUKA_API=http://localhost:8081 npm run dev` points the frontend at it.

It must never be true in a deployed environment. `DevAuthFilter` is a `@ConditionalOnProperty`
bean, so with the property off the filter is not in the chain and there is no code path to bypass.
It runs after the real verifier and only fills a context the real verifier left empty, so a signed
token always wins. A development reporter is still bound to exactly one entity and every
authorisation check applies unchanged: what is switched off is signature verification, not
authorisation. The backend logs a warning on every start and the interface carries a banner on
every page while it is on.

### What each role can do

Written down once, in `config/Capability.java`, and read by both sides. Every endpoint checks
`@can.has('...')` rather than naming roles, and `/api/me` returns the caller's capabilities so the
dashboard shows a page or a button only when the API behind it would accept the request.

| | Reporter | Reviewer | Executive | Admin |
|---|:-:|:-:|:-:|:-:|
| Read reporting (own entity for a reporter) | yes | yes | yes | yes |
| Submit figures, evidence and documents | yes | | | |
| Comment, set and move tasks | yes | yes | | yes |
| Download the pre-filled template | yes | yes | | yes |
| See across entities | | yes | yes | yes |
| Approve, return, decide on documents | | yes | | |
| Register entities, issue reporter accounts, set deadlines, publish, bind Microsoft | | | | yes |

The executive column reads everything and changes nothing. The reporter column is the only one
that puts figures or evidence on the record. Before this table existed, two endpoints let an
executive post a comment or approve a document while the dashboard presented the role as read
only.

**Each role opens on its own screen, with its own rail.** `/` is one address with four homes
(`Home` in `frontend/src/App.tsx`, `railFor` in `components/AppShell.tsx`):

| Role | Lands on | Rail |
|---|---|---|
| Reporter | My reporting (W1). On sign in, a warning when a quarter is late or due within 30 days. Anything the Department returned sits at the top: who, why, and each disputed figure in the reviewer's words, live | My reporting, Documents, Workspaces, Tasks, Citizen View |
| Reviewer | Today: what awaits their decision, and the top three of the risk-ranked queue | Today, Review queue, Risk & Alerts, Analytics, Documents, Workspaces, Tasks |
| Executive | The portfolio (W9): counts, bands, rands in the critical band | Portfolio, Entities, Analytics, Citizen View |
| Admin | Administration: quarter deadlines, register an entity, issue its reporter account, publish | Administration, Workspaces, Tasks, Citizen View |

**Deadlines are the Department's to set, and a passed one is fixed.** For a Schedule 3A entity
TR 30.2.1 names no day count, so the quarterly due date is a departmental instruction, set per
quarter on the Administration screen. The reporter's warning, the countdown, the email reminders
and the lateness signal all read that one date. Four refusals, each tested in
`DeadlineRulesTest`: a deadline that has passed cannot be moved (lateness was measured against
it), a new one cannot be in the past, it cannot fall before the quarter ends, and it cannot be
later than a statutory deadline where one applies. Every change is written to the audit log with
the administrator's name.

The admin does not review, in the table or on screen. Whoever decides what the public sees is not
the person who approves the figures it will see, so publication and approval always take two
people; an admin approval is refused by the API with a 403. This narrows the PRD's "nothing is
fully barred" for the administrator, deliberately.

**Analytics & Insights answers whether things are getting better** (`/analytics`, one call to
`GET /api/dashboard/analytics`, `AnalyticsService`). Every other oversight screen describes one
quarter; this one carries the four series the data can actually support. Year on year: ENE
allocation per financial year beside the Auditor-General's published outcomes and targets-achieved
counts. Who moved: the same entities in the two latest audited years, because a portfolio rate
over six audited entities one year and twelve the next measures who got audited, not who improved.
Quarter by quarter: filing against the due date, figures against each target's own quarter value,
and the stored risk bands. By sector: rands and delivery side by side for the quarter under review,
never divided into a cost per outcome. A year not audited shows no rate, and a quarter not yet due
shows no "not filed" count. There is no monthly series and no document view count, because nothing
records either. `AnalyticsServiceTest` holds the matched-cohort arithmetic and the latest-row rule
for corrected figures.

The screen draws those series rather than tabulating them (`components/Charts.tsx`: inline SVG and
CSS, no chart library), with **Show the figures** beside every picture opening the exact table it
was drawn from. Money and delivery are always two charts and never one with two scales. The palette
was run through a colour-blindness and contrast validator against this surface rather than chosen
by eye, which is why sector identity is carried by the axis label and one hue instead of by six
colours: no six-way categorical set passes. A year with no audited figure draws no bar and says
why. **Download as CSV** builds the whole view client side in screen order, with a blank cell
meaning not published or not yet due and the file saying so; **Print or save as PDF** lays the
screen out as a committee pack.

**Ask Vuka** (`components/AskVuka.tsx`, on Analytics and on the Portfolio) takes a typed question
and answers it from the same figures those screens are drawn from. There is no language model
behind it and nothing leaves the building: it matches the question against a fixed set this product
can answer, naming an entity beats every general question, and where it matches nothing it says so
and lists what it can take. Every answer carries its source and a link to the screen that shows the
working. That is the design rather than a shortcut, because an executive quoting a figure in a
portfolio committee has to be able to defend where it came from.

All of it is translated into the same five languages as the rest of the interface, including the
headers of the CSV: an export is a document somebody hands to somebody else, so a reader who chose
isiZulu is not handed an English spreadsheet. Ask Vuka carries its trigger words per language rather
than matching English stems against a question typed in Sesotho, with the English triggers kept in
every language so a bilingual user can type whichever word comes first.

A refusal is told apart from a missing sign in, and says why:

- `/api/**`: 401 JSON when not signed in, 403 JSON naming the caller's role and listing what it
  can do when the role is wrong. It used to answer both with a redirect to the phone sign-in page.
- `/m/**`: not signed in redirects to sign in and back. Signed in as a DSAC role, it shows a page
  saying whose screens these are, with a link to the dashboard and a sign-out that works for any
  role. It used to send a reviewer back to sign in, where they succeeded and were refused again.

---

## The data is real

This is the part that changed most, and it is the difference between a demo and a finding.

**Allocations.** All 28 entities carry their actual transfer figures for 2023/24 through 2026/27
from Estimates of National Expenditure 2026, Vote 37, Table 37.3, pages 803 to 806, in R'000.
2023/24 and 2024/25 are audited outcome, 2025/26 is the adjusted appropriation, 2026/27 is the
medium-term estimate. They reconcile exactly to the published portfolio totals in all four years:

```
2023/24  2 256 247      2025/26  2 301 766
2024/25  2 128 623      2026/27  2 257 830
```

**Audit outcomes and targets achieved.** Sixteen entities carry published outcomes for 2024/25 and
nine for 2023/24, from their annual reports and from AGSA's briefing to the Portfolio Committee.
The 2024/25 rows reproduce AGSA's portfolio position: five qualified opinions (National Library,
Iziko, Boxing South Africa, National Heritage Council, Mandela Bay Theatre Complex) and one
outstanding (Robben Island Museum).

Entities with no published figure we could reach have **no row**, and the risk engine treats an
absent row as absence of evidence rather than evidence of absence. Resist the urge to fill them in.

**Quarterly submission and delivery figures are illustrative.** Per-entity quarterly performance is
not published at the granularity this system models, so the Q1 profiles in `SeedService` are shaped
to be plausible. They are the only invented numbers in the seed, and they are labelled as such in
the code. Say so if asked, because someone will ask.

Data lives in `src/main/resources/data/` as CSV with its citations in the file header, not buried
in Java. Set `vuka.seed.enabled=false` to turn it off.

**Demo workflow data is invented, all of it.** `DemoDataService` runs once after the seed, on a
database with no comments or tasks yet, and adds what the workflow screens need to show something:
Q1 2026/27 submissions in every review state (six approved, five awaiting review, the National
Library returned with two open disputes, Robben Island with nothing filed), evidence tagged to the
Auditor-General's tests, a three version document history with a rejection, comment threads, tasks
for each demo account in both directions across the departmental boundary, two Q2 drafts, and a
completed Q2 template for the demo reporter at `var/demo/Iziko_Q2-2026-27_completed.xlsx`. That
template carries one row for each case the confirmation screen catches. Every document it stores
says on its first line that it is a demonstration file. It finds entities by short name, so it
works on an existing database without breaking a reporter's `entityId` claim. The demo account uids
are in `application.yml` under `vuka.demo`; with the development sign in, set them to the `dev-*`
uids. Set `VUKA_DEMO_DATA=false` for any real department data.

---

## How it is put together

```
domain/       JPA entities: the accountability chain as foreign keys
repository/   Spring Data repositories
service/
  RiskEngine          pure scoring, no Spring, no database, fully unit-tested
  RiskService         assembles inputs, persists scores and signals
  TemplateParser      reads the reporting template with Apache POI
  SubmissionService   upload -> parse -> confirm -> submit -> review
  UnitCostService     planned versus actual, sector-bound peer comparison
  ExportService       the filing in full, DPME and spreadsheet shapes
  NotificationService 30 day / 15 day / final day countdowns, by email and optionally Teams
  EmailNotifier       SMTP, off unless configured, with a demo redirect
  PublicationService  builds the citizen view, gated on DSAC approval
  SeedService         real published data, plus labelled illustrative quarterlies
  ReportingViewService assembles the rows the dashboard reads, provenance attached
  TemplateWriter      writes the pre-filled template, against TemplateParser's own constants
  DocumentVersionService the one write path for documents: store, version, receipt, decision
  DocumentStore       the bytes, content-addressed by SHA-256
  WorkspaceService    tasks set across the departmental boundary, direction derived not declared
  microsoft/          Graph client, SharePoint mirror and delta poller, Teams countdown
web/          REST controllers plus two server-rendered surfaces
config/       Firebase token verification, Spring Security, the development sign in
frontend/     the React office dashboard. Builds into src/main/resources/static
```

The dashboard is a separate application in the same repository rather than a separate repository,
because it is built against these exact records and a version skew between the two is the failure
nobody notices until a demo. `npm run build` puts it inside the jar.

### Four decisions worth knowing about

**Extraction is separate from performance data.** The parser writes `extraction_result` rows
carrying the cell each value came from. A named human turns those into `target_result` rows.
Human-in-the-loop is enforced by the shape of the schema, not by a policy document.

**There is no way to edit a confirmed figure.** No endpoint, no service method. A reviewer who
disputes a number returns the submission; the entity corrects and confirms again. The original row
and its author stay on the record.

**Targets are versioned, not mutable.** Under section 4.4.4 of the 2019 Revised Framework for
Strategic Plans and Annual Performance Plans, a target may only change where the strategic plan is
revised or an in-year budget adjustment occurs, approved by the executive authority and given
effect by re-tabling the APP. So `target` carries `version`, `supersedes_id`, `effective_from`,
`revision_trigger` and `retabling_reference`, and there are only two lawful triggers in the enum.
Missing a target is not one of them.

**Publication is a departmental decision.** Nothing reaches the citizen view unless DSAC sets
`publicly_visible` on the entity. The system makes publication a switch, not a project, and does
not make the call. Every seeded entity ships with it false.

**The citizen page has a way out of it.** Both citizen views carry a link to the entity's own
website, in all five languages. Vuka holds one thing about a funded body, what it was given and
what it reported against it, and a reader who has taken that in wants to know what is on and how to
visit, which is not here. The address comes from `public_entity.website`, loaded from
`data/dsac-entities.csv`. Where none is on record there is no link, because a wrong address on a
named national institution sends a reader to somebody else's domain under a government masthead.
**That column is the only one in the reference file not taken from a published Treasury or
Auditor-General document**, so every URL in it must be checked against the entity's own letterhead
before this surface is published anywhere real.

### The risk engine

Deterministic and rule-weighted rather than trained. A model would score better on paper and be
indefensible in the room; this can be reproduced on a whiteboard, which matters when the department
has to justify a decision to an entity, to Parliament or to the Auditor-General.

Five signals, weights summing to 1.0:

| Signal | Weight |
|---|---|
| Submission lateness | 0.30 |
| Evidence gap, scaled by how far into the year | 0.25 |
| Spend running ahead of delivery | 0.20 |
| Prior audit findings, repeats counted double, audit outstanding worst of all | 0.15 |
| Targets restated mid-year | 0.10 |

**Lateness is measured against two different kinds of deadline and says which one it used.**
Treasury Regulation 26.1.1 gives 30 days after quarter end and covers revenue and expenditure only.
TR 30.2.1 requires quarterly performance reporting to the executive authority and sets no day count
at all. The 30 days everyone quotes for performance is a National Treasury guideline. So lateness
against a departmental instruction is capped at 60 percent of the signal, while a missed **statutory**
PFMA date under sections 55 or 65 can drive it to full. An entity chronically late on an instruction
should never outrank one that breached the Act.

An **outstanding** audit normalises to 1.0, above every bad opinion. An audit that was never
completed is worse than a qualified one, and a system that models only the five opinions cannot
represent the single worst outcome in this portfolio.

Every score is stored with its signals, each carrying its raw value, its weight, its contribution
and a plain-language description. The interface never shows the number alone.

```bash
./mvnw test    # each test encodes a claim the pitch makes
```

Two of them are the ones that matter: `RiskEngineTest` reproduces **Robben Island Museum as
critical** and **SAHRA as low** from published facts alone. That is the demonstration that the
weights describe reality rather than flattering it.

### Unit cost

Three comparisons, in descending order of how well they survive scrutiny: entity against its own
plan, entity against its own history, entity against sector peers.

A fourth, cost per outcome across sectors, is deliberately absent. A ballet company and a boxing
regulator do not produce commensurable outputs. The API exposes no way to ask for that comparison,
and the absence is the design decision.

---

## Workspaces and Microsoft 365

Requirement (d) asks for workspaces that "seamlessly integrate with Microsoft Technologies, have
version control of documents triggered at save/upload", comments visible in real time, tasks set
"internally and externally", "approval on receipt of upload", and full use on a phone. Comments
are covered under `/m/comments` and `/api/comments`. The rest is here.

**A document is its path, and every arrival of that path is a version.** The key is the file's
place in the workspace, `ANNUAL_REPORT/Annual report.pdf`, and it is the same path in the bound
SharePoint library. A new upload writes version n+1, points it at version n, and stamps version n
superseded. Nothing is updated in place and nothing is deleted, which is the target versioning
rule applied to evidence. A partial unique index on `lower(document_key)` makes "one current
version" a fact the database enforces, and ignores case because SharePoint does.

**Identical bytes are not a version.** Uploading the same file twice returns the version already
held and says so. This is what makes sync in both directions terminate: Vuka mirrors an upload
into SharePoint, Graph reports that file as changed, the poller downloads it, the SHA-256 matches,
and nothing is versioned.

**Save in Microsoft, version in Vuka.** Where an entity's workspace is bound to a SharePoint
library, uploads are copied into it (SharePoint keeps its own version label, recorded beside ours)
and a delta poll every five minutes picks up files saved there from Word, Excel or Teams. Those
arrive as versions with source `MICROSOFT_365` and the name of the person who saved them. Only the
bound folder is read; the rest of the entity's site is none of the department's business. A file
deleted in SharePoint is not deleted here, because a record you can remove by deleting it in
OneDrive is not a record.

**Receipt and approval are different events.** Every version gets a receipt on arrival, such as
`VK-20260918-2BD6E5E6`, with its SHA-256, so the reporter can prove what they sent and when. A
DSAC officer then approves or rejects that version by name; a rejection needs a reason. The phone
page says "a receipt is not an approval" in those words.

**Only the entity uploads, only DSAC decides, both set tasks.** A reviewer who could upload into an
entity's repository could put evidence there under the entity's name. Whether a task is external
is read from who set it and who has to do it, not from a flag the caller chooses.

**The countdown arrives by email.** Every entity has a mailbox, and many departments restrict
Teams workflows, so email is the channel expected to work everywhere. At 08:00 on 30 days, 15
days, the day before and the due date, the entity's contact address and its registered reporters
get a plain-text reminder naming the targets that still have no evidence. It stops once the
period is submitted. Any SMTP relay works (Microsoft 365, Azure Communication Services, SendGrid,
a government relay), rather than Graph's `Mail.Send`, which would let the app send as any mailbox
in the tenant:

```bash
export MAIL_HOST=smtp.example.gov.za  MAIL_FROM=vuka@example.gov.za
export MAIL_USERNAME=...  MAIL_PASSWORD_FILE=/path/to/file/containing/the/password
export MAIL_REDIRECT_TO=you@example.com   # demos: every reminder goes here instead
```

The seeded contact addresses are invented, so set `MAIL_REDIRECT_TO` for any demonstration.

**Teams is optional.** Where an administrator also sets a channel workflow URL on an entity's
workspace, the same countdown posts there as an Adaptive Card, once at 30 and 15 days and hourly
on the last two days. A workflow webhook rather than Graph's `ChannelMessage.Send`, because that
permission is protected by Microsoft and far larger than a reminder needs.

To bind a tenant, register an app with `Files.ReadWrite.All` or `Sites.ReadWrite.All` as an
application permission (`Sites.Selected` with a per-library grant is the smaller, better
configuration for a real department), then:

```bash
export MS_TENANT_ID=...  MS_CLIENT_ID=...
export MS_CLIENT_SECRET_FILE=/path/to/file/containing/the/secret
# then, as ADMIN:
POST /api/workspace/entity/{id}/microsoft/bind   {"siteHostname":"x.sharepoint.com","sitePath":"sites/Reporting","folderPath":"Vuka"}
POST /api/workspace/entity/{id}/microsoft/teams-webhook   {"webhookUrl":"..."}
GET  /api/workspace/microsoft/status
```

With none of it set, everything above except the mirror and the Teams post works, and the status
endpoint and every document say `NOT_CONFIGURED` rather than pretending to be queued.

### Comments, live

**Every comment lands on a figure, a reported result or a document version.** There is no comment
on "the entity" or "the filing". The anchor is required and the entity is read off it rather than
passed in, so a comment cannot be filed against one entity while pointing at another's target.
`POST /api/submissions/{id}/comments` refuses a comment with no target for the same reason: a note
on the whole filing makes the entity guess which number is wrong.

**"In real time" is a five second poll, deliberately.** The PRD takes this position and the code
keeps it: no websocket. Every comment read carries an ETag computed from two aggregates, the row
count and the latest change, and a client that sends it back gets `304` with no body until
something is said. An unchanged poll reads no comment rows at all. That validator is sound only
because comments are append-only: a count can only rise, and closing a point moves the latest
change. The office dashboard polls `/api/submissions/{id}/comments`; the phone thread at
`/m/comments/{type}/{id}` polls its own `/live` fragment with a few hundred bytes of inline script,
and is complete and correct with script switched off. When a poll fails, both keep what they last
showed and try again five seconds later. The dashboard also skips polls while its tab is hidden.

**Nothing is edited and nothing is deleted.** A comment can be closed and reopened, and who closed
it is recorded. The author or any DSAC role may close one; an entity cannot close an objection the
Department raised against its own figures.

**A dispute is an open DSAC comment that opened a thread on a target.** A reporter's reply is not
one, so answering "corrected" does not mark the figure as disputed again, and a closed dispute
drops off the row. The rule is `ReportingViewService.isOpenDispute`, repeated in
`frontend/src/lib/useLiveComments.ts` because the dashboard recomputes it between reloads.

**Not built:** mentions, notifications when a comment arrives, and a reply box on the one-indicator
step page, whose page budget is nearly spent. Replies on a phone happen on the thread page.

---

## The low-bandwidth surfaces

Server-rendered Thymeleaf, no JavaScript framework, and every page under 2.5KB once gzip is on.
Response compression is configured in `application.yml`; do not turn it off. The 5KB budget before
compression that the design document set is no longer met by every page: the one-indicator step page
is 5.8KB and the light citizen entity page 6.0KB, and both were over it before the offline layer
added about 170 and 350 bytes to them. Gzipped, which is what a phone downloads, they are 2.3KB.
See [docs/frontend-design-corrections.md](docs/frontend-design-corrections.md) for the table.

Script on these surfaces is optional everywhere and required nowhere. The comment thread,
`mobile-thread.html`, carries an inline poller of about 600 bytes, and grows with the conversation;
the poll is a 304 with no body while nothing changes. Every reporter page loads
`static/offline/mobile.js` (about 3KB gzipped, fetched once and then served from the phone), and
the light citizen pages carry one line that registers the offline worker. With scripts off, every
page still works, it just does not work offline.

### Two citizen views

`/public` is served in one of two forms, chosen per request by `CitizenSurface`:

| | Light view | Full view |
|---|---|---|
| Built with | Thymeleaf, server-rendered | React, its own Vite entry (`citizen.html`, `src/citizen/`) |
| On the wire | 1.7KB to 2.3KB gzipped per page | about 55KB gzipped once (React 46KB, the page 4KB, CSS 2.4KB), then JSON |
| Has | every figure, five languages | the same figures and languages, plus search, sector filters, a delivery chart per entity and portfolio totals |
| Loads | no framework, no Firebase, no web font | no Firebase, no router, no web font: never the dashboard bundle |

How the choice is made, in order: the reader's own choice in `?view=lite` or `?view=rich`, which
always wins; `Save-Data: on`; the `ECT` and `Downlink` client hints, where a 3G effective connection
or under 1 Mbps gets the light view; otherwise the full view. The full view checks again in the
browser before its bundle runs, using `navigator.connection`, and a watchdog offers the light view
after three seconds and moves there after ten if the bundle has not started. That covers Safari and
Firefox, which send no hints. A browser with no script at all is sent to the light view by a
`<noscript>` refresh. Each view links to the other, and every link in the light view carries
`view=lite`, so the choice holds for the visit. It is in the URL rather than a cookie for the reason
the language is: nothing is stored about a reader who never signed in. A build without the frontend
has no full view, and serves the light one to everybody.

Both read `PublicationService`, the full view through `/public/api/entities` and
`/public/api/messages`, so they cannot disagree about a figure, and both return 404 for an entity
DSAC has not published.

### Offline

One service worker, `frontend/public/sw.js`, served at `/sw.js`, with a different rule for each
audience because each needs something different from a dropped connection.

| Who | What works with no connection | How |
|---|---|---|
| Citizen, either view | every page and figure already read on this device, with the date it was saved at the top | pages and `/public/api/*` answers kept by the worker, network first |
| Entity reporter, phone | every page opened, every indicator of a report once any of it has been opened, and answering: each answer typed with no signal is kept on the phone and sent in order when the signal returns | pages kept per person; answers kept in IndexedDB; a bar at the bottom says how many are waiting |
| DSAC staff and entity reporters, dashboard | the dashboard opens, every screen already visited shows its last data with the time it was saved, and comments, replies, approving or returning a submission, confirming figures, submitting a period, task moves and document decisions are kept and sent when the connection returns | the shell and bundle kept by the worker; data kept per person by `lib/offline.ts`; a bar under the top bar lists every kept change |

Four rules hold across all three, because they are what make offline safe rather than merely
convenient:

- **Never a copy when the network answered.** Every read tries the network first. A copy is only
  shown when there was no answer, and it always says when it was saved.
- **Sent as the person who made it, or not at all.** Every figure and decision in Vuka carries a
  name. A kept change is stamped with who was signed in and is only sent under that same session.
  On the phone, the worker fetches the form again before sending, which proves the same reporter is
  signed in through the `X-Vuka-User` header (`OfflineIdentity`) and gets a fresh CSRF token. An
  answer kept by one reporter on a shared phone waits for that reporter.
- **The server stays the judge.** Kept changes are sent oldest first, through the same endpoints and
  state checks as anything else. A refusal, such as a missing reason or a submission approved in the
  meantime, is shown in the server's own words against the kept change, and nothing after it is sent
  until it is discarded or corrected.
- **Sign-out takes it all.** Kept pages and data for the person signing out are deleted. On the
  dashboard, unsent changes are deleted too, after a confirmation that says how many.

What is never kept for later: uploads, opening a period, setting a task, publication and recompute.
Each either needs the server's answer before the screen can go on, or is a decision that should not
be made against a copy. They say they need a connection instead.

Verified in headless Chrome against a running backend: both citizen views offline in English and
Afrikaans, the full view moving to the light one on an emulated 3G connection and staying put with
`?view=rich`, the reviewer's dashboard opening offline with its comments, a reply kept and
discarded without reaching the server, a reporter answering an indicator they had never opened, and
a kept answer sent on reconnection and refused with the server's own sentence. An accepted replay
was not run end to end, because it writes to the append-only record and there is no undoing that on
a demo database.

**Two different arguments, and they should not be confused.** The citizen page is a genuine
bandwidth case: no login, no training, a low-end phone, prepaid data, and a reader who may never
come back if the first page costs them a megabyte. The reporter flow is a *capacity* case rather
than a connectivity one. A finance officer at a large museum is at a desk on institutional wifi,
and claiming otherwise invites a judge to say so. What is true is that six of the funded bodies are
two or three people for whom reporting competes directly with delivering the service, and ten short
screens they can finish on a phone between other work is a different proposition to an afternoon
with a spreadsheet. Requirement (d) asks for full functionality on mobile devices in any case.

The mobile flow puts one indicator per screen and carries the step index in the URL rather than in
session state, so a dropped connection loses nothing, and with the offline layer above it the
reporter can keep going through one.

### Accessibility

Criterion 4 names three groups: varying digital literacy, persons with disabilities, and
low-bandwidth or resource-constrained environments. Page weight only answers the third.

Every server-rendered page has a skip link, a `main` landmark, a visible focus ring, list and table
semantics rather than styled `div`s, and form hints wired to their inputs through
`aria-describedby`. Two things were fixed rather than added. `input:focus` carried `outline:none`,
which leaves a keyboard or switch user with no way to tell which field they are in, and the colour
pair on primary buttons was white on `--green`, which is 12:1 in light mode but **1.8:1 in dark
mode** and failed badly. Button text is now `--on-green`, which inverts with the theme and holds
10:1 either way. The muted and heading colours were checked and already passed at 5.6:1 and above.

### Language

The citizen pages are served in English, Afrikaans, isiZulu, isiXhosa and Sesotho. The language is
a `lang` query parameter rather than a cookie or a session, for the same reason the mobile flow
keeps its step index in the URL: the page stays cacheable, a forwarded link opens in the language it
was shared in, and a surface built to be narrow and non-personal does not start storing preferences
about readers who never signed in. `LocaleConfig` holds the supported set; adding a language is a
properties file and one list entry.

Five of twelve official languages is a demonstration that the surface carries languages, not a
claim that the set is complete. The remaining seven are a translation job rather than an
engineering one, and that is the honest way to put it.

---

## POPIA, scoped honestly

POPIA applies to **personal information**. Performance data, being indicators, targets, actuals and
narrative, is not personal information, so the eight conditions do not attach to the reporting
payload at all. They do attach to the identity and audit layer: official names, email addresses,
confirmer and reviewer identities on every row. Sections 19 (security safeguards) and 22 (breach
notification) are the operative ones there.

This materially narrows the compliance surface, and saying so precisely is better than claiming
blanket POPIA compliance for a system that mostly does not process personal information.

---

## Deploying

Ordinary Spring Boot application. `./mvnw package` produces a runnable jar.

For data residency, Cloud SQL for PostgreSQL is available in `africa-south1` (Johannesburg), which
keeps the POPIA and sovereignty answer short. The database is standard Postgres with Flyway
migrations, so nothing here ties you to a provider. Note that the region is fixed at database
creation and cannot be changed afterwards.

---

## Known limitations

State these before someone finds them.

- **Latest run, 18 September 2026.** After the workspace and Microsoft work: `./mvnw test` passes
  49 tests, and against an embedded PostgreSQL 14 Flyway applies all five migrations,
  `ddl-auto: validate` passes and the application starts. Upload, identical re-upload, a changed
  version, history, download, the receipt, DSAC approval, per-criterion evidence, a cross-boundary
  task and the tenancy refusals were exercised over HTTP with the development sign in. The
  Microsoft calls were not, for want of a tenant; see below.
- **Evidence can be attached a quarter at a time.** "Attach evidence files" on the confirmation
  screen takes every file at once, reads the indicator code (`HER-1.1`, `her_1_1`, `HER1.1`) and
  the reliability test (attendance, reconciliation, register) from each file name, and asks only
  about the files it could not place. A file with no indicator or no test is held back, never
  attached as a guess. Each file goes through `POST /api/submissions/{id}/evidence`, the same path
  as a single attach. The matching was walked in Chrome against the demo data; the attach itself
  was not pressed there, to keep the demo database clean, and is the same call the single attach
  already makes.
- **The template is optional on the web.** The quarter card leads with "Enter figures", which opens
  the confirmation screen with a box per indicator; uploading the template is the second option.
  A column of figures copied from any spreadsheet can be pasted into the first box and fills the
  rows below it in screen order, and two columns, indicator code and figure, fill by code in any
  order. Wider selections are refused, because a row of the template also holds its targets.
  Pasting only fills the boxes; nothing is written until the reporter confirms, so a typed or
  pasted figure carries "entered by hand" and the confirmer's name rather than a source cell. Both
  were walked in Chrome against a seeded draft; nothing was confirmed.
- **It runs, and starting it found two bugs that reading did not.** `./mvnw clean test` passes, 60
  source files and 17 tests, Flyway applies all three migrations, the seed loads and
  `Started VukaApplication` appears. Getting there took three attempts. `ddl-auto: validate`
  refused to start on `missing column [q1target]`, because the quarterly target columns were
  renamed in the migration to match a naming rule Hibernate does not apply when a digit precedes
  the capital. Then `/api/dashboard/portfolio` failed on every call with a
  `LazyInitializationException` reading `RiskScore.signals`, so the review queue and the executive
  portfolio had no working data source at all. Both are fixed. Section 8 of `SESSION-LOG.md` has
  the detail.
- **Every journey has now been walked in a browser, on development sign in.** Reporter on the web
  and on a phone, reviewer, executive, administrator and citizen, against a freshly seeded
  Postgres, driven by a script that clicks what a person would click. That pass found and fixed:
  the template download, the source cell links and the evidence links all opening without the
  token (the Open link on the Documents screen was missed by that pass and fixed later; a PDF or
  image now opens in a new tab, anything else downloads); submission detail, submit, review, export, the drilldown, the phone home and the phone
  receipt answering 500 on lazy loads; every phone form bouncing to sign in because each request
  deleted the CSRF cookie; a returned figure that could not be corrected; and no state checks on
  confirm, submit or review, so a figure could be changed after submission and a draft approved.
  `SubmissionStateTest` holds the last of those. What has not been walked is a real Firebase
  sign in, on either surface.
- **`docker compose up -d` assumes you have Docker.** If you do not, native Postgres works
  unchanged: the credentials in `docker-compose.yml` are the defaults in `application.yml`, so a
  `vuka` role owning a `vuka` database on 5432 needs no configuration. `run-local.ps1` starts the
  application that way on Windows.
- **Reporters and the Department open on different quarters, on purpose.** A reporter's screens
  default to the open period, the last one whose window has started. The Department's screens
  default to the last period whose due date has passed (`reviewPeriodId()`), because until then
  there is nothing to review. In September that is Q2 for the reporter and Q1 for the reviewer.
  `RiskSchedule` scores both. Robben Island still scores 45 and medium where the frontend design
  has it at 74 and critical, because the seed carries one prior period of history where those
  wireframes assume three. The engine is right and the data is thin. A quarterly report that fell
  due and was never filed counts as late until it is filed, where the entity has targets registered.
- **Quarterly submission timing in the seed is illustrative**, as described above.
- **The eQPRS export shape is our reading of a published reporting format, not a certified
  integration.** Confirm the columns against DPME's current template before anyone relies on it.
- **Document bytes are stored on the local filesystem.** `DocumentStore` writes them under
  `DOCUMENT_ROOT`, content-addressed. On more than one instance that must be a shared volume, or
  half the downloads 404; object storage is one class away and has not been written.
- **The Microsoft 365 integration has not run against a real tenant.** The Graph calls are the
  documented v1.0 endpoints (token, site drive, simple and session upload, delta, versions) and the
  mapping is unit tested against Graph's response shapes, but no tenant was available. Bind one
  test library and run `POST .../microsoft/sync` before showing it. The Teams card is likewise
  tested for shape, not posted to a live channel.
- **Reminder email has not been sent through a real relay.** The schedule and the message are unit
  tested; delivery has not been exercised. Point `MAIL_HOST` at a test relay with
  `MAIL_REDIRECT_TO` set and wait for, or temporarily trigger, the 08:00 run before relying on it.
- **Delta polling, not change notifications.** Five minutes between a save in SharePoint and the
  version in Vuka by default (`MS_POLL_INTERVAL_MS`). Graph subscriptions would make it seconds
  but need a public HTTPS endpoint Microsoft can reach.
- **Display names are missing in two places.** The schema stores a uid for the reviewer on a
  submission and for the uploader on a document, not a name. Both come back null rather than as a
  uid, because showing a uid to a reviewer is noise and inventing a name is worse.
- **The administration surface is gated on the API and not on the route.** `/api/admin/**` carries
  a class level `hasRole('ADMIN')`, which is the check that matters. `/admin/entities/**` is
  `permitAll` in `SecurityConfig` because it is a route of the client side router and the server
  has no page for it: it returns the shell, and the shell has no data in it. Anyone adding a
  server-rendered admin page under `/admin` has to add a rule, because it would otherwise inherit
  that `permitAll` rather than `anyRequest().authenticated()`.
- **The translations have not been reviewed by first-language speakers.** They are a working
  implementation of the language surface, not certified government text, and should go past PanSALB
  or a departmental translator before anything is published. Volunteer this rather than let it be
  discovered.
- **The React dashboard is light theme only.** Every Thymeleaf template ships a dark theme and
  `docs/frontend-design-corrections.md` adds a dark column to the section 10 token table. The
  dashboard was built from the uncorrected document and does not honour
  `prefers-color-scheme` yet.
