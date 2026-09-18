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
| Citizen view | http://localhost:8080/public | Anyone, no login |
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
| Approve, return, decide on documents | | yes | | yes |
| Publication, Microsoft binding | | | | yes |

The executive column reads everything and changes nothing. The reporter column is the only one
that puts figures or evidence on the record. Before this table existed, two endpoints let an
executive post a comment or approve a document while the dashboard presented the role as read
only.

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
  NotificationService 30 day / 15 day / hourly countdowns
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

**The countdown lands in Teams.** Where an administrator sets a channel workflow URL on an
entity's workspace, the 30 day, 15 day and hourly reminders post there as an Adaptive Card naming
the targets with no evidence. A workflow webhook rather than Graph's `ChannelMessage.Send`,
because that permission is protected by Microsoft and far larger than a reminder needs.

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

Server-rendered Thymeleaf, no JavaScript framework, every page under 5KB before compression and
under 2KB once gzip is on. Response compression is configured in `application.yml`; do not turn it
off.

One page qualifies that. The comment thread, `mobile-thread.html`, carries the only script on these
surfaces, an inline poller of about 600 bytes, and it grows with the conversation. Empty it is
4.0KB, 1.8KB gzipped. With three comments of realistic length it is 4.9KB, 2.1KB gzipped, and at
about four comments it passes 5KB. The poll that keeps it live is a 304 with no body while nothing
changes, and roughly 380 bytes gzipped when something does.

**Two different arguments, and they should not be confused.** The citizen page is a genuine
bandwidth case: no login, no training, a low-end phone, prepaid data, and a reader who may never
come back if the first page costs them a megabyte. The reporter flow is a *capacity* case rather
than a connectivity one. A finance officer at a large museum is at a desk on institutional wifi,
and claiming otherwise invites a judge to say so. What is true is that six of the funded bodies are
two or three people for whom reporting competes directly with delivering the service, and ten short
screens they can finish on a phone between other work is a different proposition to an afternoon
with a spreadsheet. Requirement (d) asks for full functionality on mobile devices in any case.

The mobile flow puts one indicator per screen and carries the step index in the URL rather than in
session state, so a dropped connection loses nothing.

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
- **It runs, and starting it found two bugs that reading did not.** `./mvnw clean test` passes, 60
  source files and 17 tests, Flyway applies all three migrations, the seed loads and
  `Started VukaApplication` appears. Getting there took three attempts. `ddl-auto: validate`
  refused to start on `missing column [q1target]`, because the quarterly target columns were
  renamed in the migration to match a naming rule Hibernate does not apply when a digit precedes
  the capital. Then `/api/dashboard/portfolio` failed on every call with a
  `LazyInitializationException` reading `RiskScore.signals`, so the review queue and the executive
  portfolio had no working data source at all. Both are fixed. Section 8 of `SESSION-LOG.md` has
  the detail.
- **No screen has been opened by a person.** The API returns correct data for every endpoint the
  dashboard calls, against a seeded Postgres with Firebase configured. That is not the same as the
  screens being right, and the empty and error states in particular have never been seen.
- **The mobile reporter flow has never been exercised against a running server.** The 401 and 405
  faults that made it unusable are fixed, and the reasoning is in *Signing in on the reporter
  surface* above, but no request has been made against it. The specific thing to check first is
  that the CSRF hidden field is actually rendered into the forms. Thymeleaf injects it through
  Spring Security's `RequestDataValueProcessor` into any form with a `th:action`, which is the
  standard mechanism and the only one available since Thymeleaf 3.1 removed request-attribute
  access from templates. If that processor is not registered for any reason, every POST under `/m`
  answers 403 and the fix is to add the field explicitly. View the page source once and look for
  `name="_csrf"` before trusting the flow.
- **`docker compose up -d` assumes you have Docker.** If you do not, native Postgres works
  unchanged: the credentials in `docker-compose.yml` are the defaults in `application.yml`, so a
  `vuka` role owning a `vuka` database on 5432 needs no configuration. `run-local.ps1` starts the
  application that way on Windows.
- **The seed scores Q1 and the system thinks it is Q2.** `currentPeriodId()` resolves to the last
  period whose window has opened. `SeedService` writes risk scores against Q1 2026/27. So a fresh
  database shows every band as `NOT_SCORED` until somebody presses Recompute, and recomputing
  against Q2 puts Robben Island at 45 and medium where the frontend design has it at 74 and
  critical, because the seed carries one prior period of history where those wireframes assume
  three. The engine is right and the data is thin. Decide which quarter the demo is in before
  presenting it.
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
