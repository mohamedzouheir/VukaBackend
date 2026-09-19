# Vuka session log

A record of what was decided, what was checked, what changed and what is still open. Written so
somebody who was not in the session can pick the project up, and so we can defend any of it in the
judging room.

Last updated: 19 September 2026, after a pass over the four user flows.

---

## 1. Where this project came from

| Stage | What happened |
|---|---|
| Start | Question about whether a traffic fines and digital licence app fitted the GovTech 2026 theme. It did, but weakly. |
| Repositioning | Moved to a "unified citizen layer" framing. |
| Reset | Three hackathon challenge statements arrived. We had to choose one, and chose the **DSAC** challenge: performance reporting across the public entities and NPOs that DSAC funds. |
| Framing | Settled on the **accountability chain** as the product idea: Allocation to Target to Evidence to Outcome. |
| Key insight | The missing piece is not a portal. It is a machine-readable reporting standard, and the evidence behind each number. |

**Traffic Hub is not part of this.** It was an earlier prototype and is dead for this purpose.

One thing worth remembering from it: the prototype used `support@etraffic.gov.za` and
`www.etraffic.gov.za` on an app built by a private company. That reads as impersonating a
government service and would have ended the relationship with the SITA and Department of Transport
people in the room. Do not reuse those assets anywhere.

---

## 2. Stack, and how we got here

| Decision | Outcome |
|---|---|
| Shesha framework | Initially believed mandatory, then confirmed **not** mandatory. Dropped, because nobody on the team knows it. A Shesha drop-in package exists in the archive and is superseded. |
| Firebase | Kept, **identity only**. Custom claims `role` and `entityId`. |
| Backend | **Java 21, Spring Boot 3.3**, at the team's request. |
| Database | **PostgreSQL 16**, Flyway migrations, Hibernate with `ddl-auto: validate`. |
| Documents | Apache POI for the reporting template. |
| Front end | Thymeleaf for low-bandwidth surfaces, React for the office dashboard. |

Everything that matters lives in Postgres rather than in Firebase, which is what makes "the
department can take this in-house" a true statement rather than a hedge.

---

## 3. The research pass, and what it broke

Three parallel research agents checked our assumptions against the actual instruments. Five
findings changed the build. This is the most important section in this file.

### 3.1 eQPRS already exists

DPME runs the Electronic Quarterly Performance Reporting System at `eqprs.dpme.gov.za`. It does
indicator configuration, actuals capture against targets, an approval workflow and dashboards.
DPME has been onboarding national public entities. A successor, the Integrated Reporting System,
is planned but late; DPME's own annual report records the related monitoring system "was not
developed due to procurement delays".

**Consequence.** We stopped claiming to be a capture system. Positioning is now: eQPRS is where
the numbers go, Vuka is where they can be defended. Added `ExportService` and `ExportController`
so reporting is an **export** rather than a competing capture path.

**The gap that is genuinely unserved:** every DSAC entity is PFMA Schedule 3A, and a 3A entity
reports performance to its **executive authority** under Treasury Regulation 30.2.1, which
prescribes **no deadline and names no system**. eQPRS was built around departments.

### 3.2 The 30-day performance deadline does not exist

Treasury Regulation 26.1.1 gives 30 days after quarter end and covers **revenue and expenditure
only**. TR 30.2.1 covers quarterly performance to the executive authority and sets **no day count
at all**. The 30-day figure everyone quotes for performance is a National Treasury *guideline*,
which binds as an instruction and not as a regulation.

The annual dates are real and statutory: PFMA s55(1)(c) two months to the auditors, s55(1)(d) five
months for the annual report, s65(1)(a) one month from receipt of the audit report, s65(2) a
six-month backstop.

**Consequence.** The lateness signal was measuring against a deadline that does not legally exist.
It now takes the worse of two measures and says which one drove the score. Administrative lateness
is capped at 60% of the signal; a missed statutory PFMA date can drive it to full. Added the
`DeadlineBasis` enum and `reporting_period.deadline_basis` and `deadline_citation` columns, so a
date always carries its authority and the interface never dresses an instruction up as law.

### 3.3 Targets may not be changed just because they will be missed

Section 4.4.4 of the 2019 Revised Framework for Strategic Plans and Annual Performance Plans allows
an in-year target change only where the strategic plan is revised or an in-year budget adjustment
occurs. The executive authority approves it and it takes effect by **re-tabling the APP**.

**Consequence.** `revision_count` was a mutable counter, which was exactly the wrong shape: it told
you a target moved but not to what, when, or on whose authority. Targets are now versioned with
`version`, `supersedes_id`, `effective_from`, `superseded_on`, `revision_trigger` and
`retabling_reference`. The `RevisionTrigger` enum has exactly two lawful values.

### 3.4 The Auditor-General's tests have names, and we should use them

Under section 20(2) of the Public Audit Act, reported performance is tested for **usefulness**
(presentation, consistency, measurability, relevance) and **reliability** (validity, accuracy,
completeness).

**Consequence.** Added the `AgsaCriterion` enum and `document_record.agsa_criterion`. Attaching
evidence stops being "upload a file" and becomes "satisfy the completeness test on this indicator".
That is the whole difference between a document repository and an audit readiness tool.

### 3.5 An outstanding audit is worse than a bad one

Robben Island Museum submitted its 2024/25 annual financial statements on **9 August 2025**, after
the statutory date. Its audit was left incomplete and it was **excluded from the portfolio audit
outcomes entirely**. Cause on record: finance division instability, CFO disciplinary proceedings,
key finance staff resigned. The Portfolio Committee had flagged the delay repeatedly.

**Consequence.** Added `OUTSTANDING` to the `AuditOutcome` enum, normalising to 1.0, above every
bad opinion. A system modelling only the five opinions cannot represent the single worst outcome in
the portfolio. Also split audit outcome onto its own `AuditOutcomeRecord` rather than hanging it
off a finding row, because an entity with a clean audit has no findings and was therefore getting
no outcome at all.

### 3.6 POPIA is narrower than we were claiming

POPIA applies to personal information. Performance data is not personal information, so the eight
conditions do not attach to the reporting payload. They attach to the identity and audit layer:
names, emails, confirmer and reviewer identities. Sections 19 and 22 are the operative ones.

**Consequence.** Stopped claiming blanket POPIA compliance and scoped it precisely, which is both
more accurate and more convincing.

---

## 4. The real data

| What | Source | Status |
|---|---|---|
| Transfer allocations, all 28 entities, FY2023/24 to FY2026/27 | ENE 2026, Vote 37, Table 37.3, pp. 803-806 | **Verified.** Reconciles exactly to published portfolio totals in all four years |
| PFMA schedule per entity | Treasury, Public institutions listed in PFMA Schedules, 21 Nov 2025 | Loaded. All 3A except PanSALB, which is Schedule 1 |
| Audit outcomes and targets achieved | Entity annual reports and AGSA briefing, PMG meeting 41948 | 16 entities for 2024/25, 9 for 2023/24 |
| Portfolio audit position 2024/25 | AGSA briefing | 29 auditees: 13 clean, 10 unqualified with findings, 5 qualified, 1 outstanding |
| Quarterly submission timing and delivery rates | Not published at this granularity | **Illustrative.** The only invented numbers in the seed, labelled in code |

Reconciliation actually run:

```
            seed         published      diff
2023/24     2 256 247    2 256 247      0
2024/25     2 128 623    2 128 623      0
2025/26     2 301 766    2 301 766      0
2026/27     2 257 830    2 257 830      0
```

Data lives in `src/main/resources/data/*.csv` with citations in the file headers, not buried in
Java, so it can be corrected without a recompile.

### Three entity counts, all correct

26 + 6 is the challenge statement's framing. **28** is the number of bodies receiving entity
transfers in Table 37.3, which is what we seed. 29 is AGSA's auditee count, being the 28 plus the
department itself. Expect to be asked.

---

## 5. What has actually been verified

Maven Central is blocked by policy in the build environment, so the full application has **never
been compiled or run end to end**. Rather than assert it works, here is precisely what was checked
and how.

| Check | Method | Result |
|---|---|---|
| Risk engine arithmetic | Real `RiskEngineTest` compiled against minimal JUnit stubs and run | **17 tests pass, 37 assertions** |
| Domain layer compiles | All 18 entities compiled against `jakarta.persistence` stubs | **Clean** |
| Schema validates | 173 JPA-mapped columns extracted by reflection, compared to V1 and V2 SQL | **173 of 173 present.** Found and fixed a real bug |
| Repository calls | Every call cross-checked against declared methods | **All resolve** |
| Enum constants | Every `Enums.X.Y` reference checked against compiled enums | **All exist** |
| Seed arithmetic | Allocation totals summed and compared to published figures | **Exact, all four years** |

**The bug the schema check caught, and the half of it we got wrong.** `Target.q1Target` through
`q4Target` were mapped to SQL columns named `q1target`. The reasoning recorded here was that
Hibernate derives `q1_target` from the field name, so V1 was renamed to `q1_target` and the entity
left alone.

That reasoning was wrong, and section 8 below is where it was caught. Spring's
`CamelCaseToUnderscoresNamingStrategy` inserts an underscore only between a **lowercase** letter
and an uppercase one. The character before the `T` in `q1Target` is the digit `1`, so Hibernate
derives `q1target` and not `q1_target`. Renaming the migration moved the mismatch rather than
removing it, and the application refused to start on the first real run with
`missing column [q1target] in table [target]`.

Now fixed on the mapping side with an explicit `@Column(name = "q1_target")` on all four fields,
which is the right side to change: `q1_target` is the readable column name, V1 is already applied
so its Flyway checksum is fixed, and being explicit means the mapping no longer depends on a
naming strategy edge case at all.

The wider lesson is the one worth keeping. A schema check done by reflection and reading compared
what the code *said* against what the SQL *said*, and agreed with itself. Only starting the
application compared either of them against what Hibernate actually does.

**A bug in newly written code, caught during review:** `ExportController` compared
`principal.entityId()` (a `String`) to a `UUID`, which is always false, so a reporter could never
export their own filing. Now routed through the existing `VukaPrincipal.canRead` helper that every
other controller uses.

Two risk engine tests are worth demonstrating specifically: the engine reproduces **Robben Island
Museum as critical** and **SAHRA as low** from published facts alone. That is the evidence the
weights describe reality rather than flattering it.

### 5.1 What the frontend build added to this

Maven is still not installed on this machine, but the dependency jars are in the local repository,
so the backend was compiled and the tests were run directly rather than being reasoned about.

| Check | Method | Result |
|---|---|---|
| Whole backend compiles | `javac` over all 60 source files against the local jars | **Clean.** This is the first time the full backend has compiled, including the web layer |
| Risk engine still passes | The real `RiskEngineTest`, run through a reflective harness because the JUnit platform launcher is not in the local repository | **17 of 17 pass**, Robben Island and SAHRA included |
| Frontend typechecks | `tsc --noEmit` in strict mode over every file | **Clean** |
| Frontend builds | `vite build` into `src/main/resources/static` | **Clean.** 108KB gzipped in total against a 250KB budget: 103KB of JavaScript, 5KB of CSS |

One real defect was caught by compiling rather than by reading. `FirebaseTokenFilter` had a local
variable named `auth` already, so the change that made the verifier optional shadowed it. It would
have been a compile error on the first real `mvn` run, which is exactly the kind of thing that eats
an hour at the wrong moment.

**Still not verified:** the application has not been started against Postgres. Flyway has not run
V3, Hibernate has not validated the mapping of the new `document_record.target_id` column, and no
HTTP request has been served. Compiling is not running and this log should not pretend otherwise.

---

## 6. The frontend build

Built from `docs/Vuka-Frontend-Design.pdf`, which by then had all twelve sections rather than the
first eight. The design fixes seventeen views across three surfaces, nine components, five states
per component and a build order. What follows is what was built and where it departed from the
document.

### 6.1 What was built

`frontend/` is a Vite, React and TypeScript application, and it is Surface B of the design: the
reporter's desktop path, the DSAC review queue and the executive portfolio. The six Thymeleaf
surfaces were already in the repository and were not touched.

| Block in the design | Built | Notes |
|---|---|---|
| 1. Nine components, five states each | Yes | `StateLine`, `RiskBadge`, `RiskPanel`, `ProvenanceCell`, `EvidenceChip`, `ChainStrip`, `PeriodCard`, `IndicatorRow`, `CitationLine` |
| 2. Sign in and route gating | Yes | Four roles land in four places. A reporter has no route into the portfolio |
| 3. Extraction review | Yes | The screen section 12 says to protect. Built third, as instructed |
| 4. Review queue and submission review | Yes | Risk order by default, per target disputes, no edit control anywhere |
| 5. Portfolio and entity drilldown | Yes | Counts first, then the heatmap, then the rand figure in the critical band |
| 6. RiskPanel on all three screens | Yes | One component reading stored signals, so there is one explanation and not three |
| 7. Unit cost | Yes | Including the comparison the system refuses to offer, stated on the screen |
| 8. Polish and empty states | Partly | States are built and typechecked. Nothing has been checked in a browser |

Design tokens are exactly those in section 10. Icons are inline stroke SVG line icons rather than
an icon font, because section 11 rules out icon fonts and because a font is a second request that
can fail on its own.

### 6.2 The backend was missing more than we thought

The design describes the office surface as React against "the existing JSON API". Reading the
controllers against the seventeen views showed that a good deal of what the screens need had no
endpoint behind it. This was the real work of the session and it is worth listing, because each row
is a claim the frontend makes that the backend could not previously support.

| Added | Why the frontend could not work without it |
|---|---|
| `GET /api/me` | Nothing told the client its own role, and a reporter needs their entity's **name**, which is only in Postgres |
| `GET /api/periods` | No way to learn the open period, its due date, or which instrument that date rests on |
| `GET /api/submissions` and `/{id}` | The queue and both review screens had nothing to read. `IndicatorRowView` is the row that carries a figure with its source cell, its evidence and its confirmer |
| `GET /api/dashboard/entity/{id}/chain` | The four boxes at the top of the drilldown, each with its citation |
| `GET /api/dashboard/entity/{id}/unit-cost` | W11 had planned and actual unit cost nowhere to read them from |
| `GET /api/submissions/template` | UC-1. A pre filled .xlsx, written by a new `TemplateWriter` against `TemplateParser`'s own constants |
| `POST /api/submissions/{id}/evidence` | UC-4. There was no way to attach evidence at all, which is the whole product |
| Comments on a submission | UC-12 and UC-14. `review` took one free text reason for a whole submission, so the entity could not be told which figure was disputed. *Later:* this endpoint now writes through `CommentService`, requires a target, and answers polls with an ETag |
| `GET /api/documents/{id}` | Every source cell and evidence chip links somewhere |
| `POST /api/admin/entities/{id}/publication` | UC-21. Every seeded entity ships with `publiclyVisible` false, so with no switch the citizen view is permanently empty |
| `totalAllocation` on `PortfolioRow` | "R358.6 million sits with entities in the critical band" is the line a Director-General takes into a committee. Fetching it per entity would be 28 requests to render one tile |

Two existing pieces were also wrong for the frontend rather than merely absent.

**`/api/dashboard/entity/{id}` was closed to reporters.** The class carries a DSAC only
`@PreAuthorize`, but section 5 of the design has a reporter reaching their own entity, and that one
comparison is the whole tenancy model. The method now permits the reporter role and checks
`canRead` itself.

**The application could not start without Firebase.** `GoogleCredentials.getApplicationDefault()`
throws with no credential, which took the whole application down including the citizen view, the
migrations and the Thymeleaf surfaces, none of which have anything to do with Firebase. It now logs
loudly and returns no verifier, `FirebaseTokenFilter` takes an `ObjectProvider` and verifies
nothing, and every authenticated endpoint answers 401. It fails closed instead of refusing to boot.

### 6.3 Two decisions worth defending

**A development sign in exists, and it is off.** The four role journeys could not be walked on this
machine at all, and the alternative was a presenter finding that out at three in the morning.
`DevAuthFilter` is a `@ConditionalOnProperty` bean, so with `vuka.dev-auth.enabled` false the
filter is not in the chain and there is no code path to bypass. It accepts a token shaped
`dev|ROLE|entityId|Name`, deliberately not a JWT so nothing about it can be mistaken for a
credential. It runs after the real filter and only fills an empty context, a signed token always
wins, a dev reporter is still bound to one entity, and the whole interface carries a banner while
it is on. What is switched off is signature verification, not authorisation.

**Evidence now points at a target with a foreign key.** V3 adds `document_record.target_id`. The
known limitations section of the README said the link fell back to a filename convention and called
it good enough to demonstrate but not good enough to ship, which was honest and still wrong: a
filename convention fails the moment somebody uploads `scan001.pdf`, and it fails silently. The
claim the product makes is that a reported figure carries the document behind it, so that join
belongs in the schema. The column is nullable, because the uploaded reporting template is evidence
about the filing as a whole and forcing a target onto it would mean inventing a link.

### 6.4 Where the frontend is honest about the backend

The bytes of an uploaded document are not stored anywhere. `DocumentRecord.storagePath` names where
they would live and `GET /api/documents/{id}` returns everything the evidence chain actually rests
on: the file name, the size, the content hash, who uploaded it, when, the target it is attached to
and the Auditor-General's test it was offered against. The endpoint says so in its response rather
than implying the file is there. A reviewer who cannot open the PDF but can see that a named person
attached a hashed file against the completeness test on a specific indicator is still in a far
better position than one reading an emailed spreadsheet, and claiming more than that would be the
fastest way to lose the room.

`SubmissionRow.reviewedByName` and `EvidenceView.uploadedByName` are always null. The schema stores
a uid for those and not a display name. Showing a uid to a reviewer is noise, so the field stays
absent and the interface says "reviewed" without inventing a name.

---

## 7. Deliverables

| Item | State |
|---|---|
| PRD, 19 pages | Delivered as PDF |
| Specification and build plan, 20 pages | Delivered as PDF. FR-1 to FR-13, NFR-1 to NFR-8, all entities, API surface, 48-hour build |
| User guide, 13 pages | Delivered as PDF |
| Spring Boot backend | This repository |
| Frontend design doc: journeys, use cases, views, wireframes | Delivered as PDF, all twelve sections |
| React office dashboard | `frontend/`. Builds into `src/main/resources/static`, so one jar ships both surfaces |
| Session log | This file |

---

## 8. The first run

The application had never been started. This session started it, on Windows, and it took three
attempts. Both failures were real and neither could have been found by reading.

### 8.1 The machine, and why it is not the documented setup

| Needed | Found | Done |
|---|---|---|
| Java 21 | Java 17 only | `winget install Microsoft.OpenJDK.21`, alongside 17 |
| Maven | not installed | Apache's binary zip into `C:\Users\mphah\tools`. It is not in winget, and the zip needs no admin |
| Postgres via Docker | **no Docker at all** | `winget install PostgreSQL.PostgreSQL.16`, running as a Windows service |

**The README's `docker compose up -d` does not work on this machine**, because Docker is not
installed and Docker Desktop is a larger install than Postgres itself: about 1GB, WSL2 or Hyper-V,
and usually a reboot. Native Postgres 16.15 on port 5432 with a `vuka` role owning a `vuka`
database matches the credentials already in `docker-compose.yml`, so `DB_URL`, `DB_USER` and
`DB_PASSWORD` in `application.yml` work unchanged and nothing in the repository needed editing.

`run-local.ps1` pins the toolchain for one process and starts the app, so none of this depends on
machine wide environment variables being right. The compose file is untouched and still correct
for anybody who has Docker.

### 8.2 Maven Central is reachable here

The constraint that shaped the entire previous session does not apply on this machine. `mvn
compile` and `mvn test` both run against the real dependency tree.

| Check | Result |
|---|---|
| `mvn compile` | **BUILD SUCCESS**, 60 source files, `release 21` |
| `mvn test` | **Tests run: 17, Failures: 0, Errors: 0, Skipped: 0** |
| Flyway | **3 migrations applied**, V1, V2 and the new V3, schema at v3 |
| Seed | 28 entities, 112 allocations, 280 targets, 25 audit outcomes, 13 submissions |
| Startup | `Started VukaApplication in 45.7 seconds` |

### 8.3 The two bugs starting it found

**One: `missing column [q1target] in table [target]`.** Covered in section 5 above, because it
corrects a claim this log was making. `ddl-auto: validate` did exactly its job and refused to
start rather than failing later against a column that was not there.

**Two: `LazyInitializationException` on `RiskScore.signals`.** `DashboardController.portfolio()`
read `rs.getSignals()` outside a transaction with `open-in-view` set to false. The portfolio
endpoint could never have returned, which means the review queue and the executive portfolio, two
of the three screens the pitch turns on, had no working data source. It answered an error on every
call.

Fixed with two fetch join queries on `RiskScoreRepository` rather than by wrapping the read in a
transaction. A transaction would have removed the exception and left an N+1: one query for the
scores and twenty eight more for their signals, to draw one screen. `distinct` is required in both
queries because the join multiplies each score by its signal count.

Worth noting that `open-in-view: false` is correct and should stay. It is the setting that turned a
latent design error into a loud startup era failure instead of a silent extra query per row in
production.

### 8.4 Identity is wired

Firebase is configured against the project `vuka-authentication`. The service account key was
found **untracked in the repository root**, which means `git add .` would have committed a private
key granting full administrative access to the project. It had never been committed, confirmed
against the full history. `.gitignore` now covers `*firebase-adminsdk*.json`,
`*-service-account*.json` and `serviceAccountKey.json`.

Four accounts exist, one per role, with `role` and `entityId` set as custom claims.
`tools/ProvisionUsers.java` and `tools/provision-users.ps1` create and inspect them. The script
refuses to give a DSAC role an `entityId` and refuses to create a reporter without one, because a
token shaped differently from production would make the demo exercise a path that does not exist.

Still outstanding on identity: the **web API key**, which is not in the service account file and
has to come from the Firebase console, and enabling **Email/Password** as a sign in method. Until
both are done the browser cannot sign in, and `VUKA_DEV_AUTH` is carrying the demo.

### 8.5 The seed points at the wrong quarter

Today is 17 September 2026. `currentPeriodId()` correctly resolves to **Q2 2026/27**, being the
last period whose window has opened. `SeedService` writes its risk scores against **Q1 2026/27**.

So a freshly seeded database shows twenty eight entities with real allocations and every band
reading `NOT_SCORED`, until somebody presses **Recompute scores**. That is not a bug in either
piece, it is the two disagreeing about which quarter the demo is in.

Recomputing against Q2 produces **4 MEDIUM and 24 LOW, with nothing critical**. Robben Island
Museum scores **45 and lands in MEDIUM**, where W6 and the demo script both have it at **74 and
CRITICAL**. The engine is not wrong: `RiskEngineTest` still reproduces 74 for the documented
scenario, and the largest factor it reports for Robben Island on real data is the right one,
"filed 70 days after a statutory PFMA deadline, a breach of the Act and not of a departmental
instruction". The inputs are simply thinner, because the seed has one prior period of history where
the wireframes assume three.

This has to be decided before the demo, and it is first in section 13.

---

## 9. Workspaces, Microsoft 365, capabilities and live comments

Requirement (d) of the challenge: workspaces that integrate with Microsoft, version documents on
save or upload, show comments in real time, set tasks internally and externally, and acknowledge
an upload on receipt. The README carries the full account under "Workspaces and Microsoft 365";
this is the record of what was decided.

### 9.1 What was added

| Piece | What it does |
|---|---|
| `V5__workspaces_and_microsoft.sql` | `entity_workspace`, a version chain on `document_record` keyed by path, receipt and decision columns, Graph provenance columns, task creation and completion times |
| `V6__live_comments.sql` | `updated_at` on comments so a poll can be answered from an aggregate, and who closed a point |
| `DocumentVersionService`, `DocumentStore` | The one write path for documents. Bytes stored on the local filesystem, content-addressed by SHA-256 |
| `WorkspaceService` | Tasks across the departmental boundary. Whether a task is external is derived from who set it and who must do it |
| `service/microsoft/` | Graph client, SharePoint mirror, delta poller, Teams countdown card via a workflow webhook |
| `Capability`, `Can`, `AccessResponses` | One table of what each role may do. Endpoints check `@can.has(...)`; `/api/me` returns the caller's capabilities |
| `CommentService` and controllers | Every comment anchored to a figure, a result or a document version. ETag on every read |
| Phone pages | `/m/workspace`, `/m/document`, `/m/comments`, `/m/comments/{type}/{id}` and its `/live` fragment, `access-denied.html` |
| Dashboard | `CommentPanel` and `useLiveComments` on extraction review and submission review; screens gated on capabilities |

### 9.2 Decisions worth defending

- **A document is its path, and every arrival of that path is a version.** Nothing is updated in
  place or deleted. A partial unique index on `lower(document_key)` makes "one current version" a
  database fact, and ignores case because SharePoint does.
- **Identical bytes are not a version.** This is what stops the Vuka to SharePoint to Vuka loop.
- **Receipt and approval are separate events.** A receipt is automatic; an approval is a named
  DSAC officer. Collapsing them would let an acknowledgement read as a departmental decision.
- **Only the entity uploads, only DSAC decides.** A reviewer who could upload could put evidence
  on the record under the entity's name.
- **The executive reads everything and changes nothing.** Before `Capability`, two endpoints let an
  executive comment or approve a document while the dashboard showed the role as read only.
- **"Real time" is a five second poll, not a websocket**, as the PRD said. An unchanged poll is a
  bodiless 304 that reads no comment rows, which is sound only because comments are append-only.
- **A dispute is an open DSAC comment that opened a thread on a target.** "Any comment on the
  target" became wrong once reporters could reply, because their "corrected" would have shown
  back to them as a dispute.
- **Teams via a workflow webhook**, not Graph `ChannelMessage.Send`, which is a protected
  permission far larger than a reminder needs.

### 9.3 Verified, 18 September 2026

`./mvnw test` passes 55 tests with no failures, and `tsc -b` on the frontend is clean. The README
records an earlier run after the workspace work, before live comments: 49 tests, five migrations,
the app started against embedded PostgreSQL, and the document flow exercised over HTTP. The
Microsoft calls have never run against a real tenant, and the Teams card has never been posted to
a live channel. Both are tested for shape only.

### 9.4 Page weight

`mobile-step.html` has 178 bytes of headroom. The two workspace pages sit within about 130 bytes
of the 5KB budget and grow with history. `mobile-thread.html` passes 5KB at about four comments
and is the one page whose weight depends on the conversation. Figures are in
`docs/frontend-design-corrections.md`.

---

## 10. Merging it, and rebuilding the interface

Section 9 was written on a branch. This section is what happened when it met the work described in
sections 6 and 8, and what changed afterwards.

### 10.1 The same bug, found twice, twice over

`Target.q1Target` was fixed independently by two people hours apart, to the same conclusion. The
authentication entry point defect was also found twice. That is two problems, each solved twice,
inside a 48 hour window.

The cause is not carelessness. Nobody could start the application until section 8, so everyone was
reading rather than running, and reading finds the same things. It is a working practice point
rather than a fault: get it started early, even badly.

### 10.2 Two conflicts, resolved in opposite directions

**`SecurityConfig` was taken wholesale from the branch**, not combined. It was better on every
point, including two the other side had not reached:

- `dispatcherTypeMatchers(ERROR, FORWARD).permitAll()`, the same fault as the `/error` rule found
  in section 8.3, fixed by dispatcher type so it covers forwards as well
- `AccessResponses`, a table of what a caller is actually told: 401 against 403, API against
  phone, with JSON naming the role and what it can do instead so a client can recover
- `NullAuthenticatedSessionStrategy` on CSRF. Authentication is rebuilt from a token on every
  request, so with the default strategy every request counted as a fresh sign in and deleted the
  CSRF cookie. The browser's own favicon request was enough to break every form on the phone
- `/m/signout` moved out from behind the reporter-only rule, so a reviewer signed in on a phone
  could sign out again

**`DashboardController` kept both sides.** The capability check replaces the role list, which is
the point of the capability table. `@Transactional(readOnly = true)` stayed, because the lazy load
fault from section 8.3 was still live on the branch and would have taken the executive drilldown
down again on merge.

`./mvnw clean test` after the merge: **64 tests, 0 failures.**

### 10.3 The interface was rebuilt against the design screenshots

`docs/Front End designs/` arrived: twelve screenshots of a complete product interface, different
from the one section 6 describes. A navy rail with ten sections, a global search bar, a user chip,
cards with pastel icon tiles, a right rail, and a separate marketing landing page.

New tokens, a new `AppShell`, and new screens for Dashboard, Entities, Risk and Alerts,
Workspaces, Documents and Tasks. The existing screens inherit the look through the shared class
vocabulary rather than being rewritten. **122KB gzipped against the 250KB budget.**

**The decision that shaped it.** Roughly forty percent of what those screens show has no source in
the schema: a performance trend by month, an on track rate by sector, provinces, acronyms,
document view and download counts, days left on an alert, and "Predicted Impact: potential
shortfall of 1 900 beneficiaries if current trend continues".

Section 11 says never invent a number, and the risk engine is defensible precisely because it is
arithmetic rather than a prediction. A panel headed Predicted Impact contradicts the one sentence
a Director-General is meant to be able to say in public.

So the look was taken and the invented figures were not:

| Design element | What is there instead |
|---|---|
| Performance trend by month | Risk band distribution, stored and self explaining |
| Alerts trend, seven day line | Nothing. Nothing stores a score per day |
| Predicted impact, recommended actions | The five stored signals with their contributions |
| Province, acronym, registration number | Absent, and the footnote says so |
| Document views and downloads | Absent. Nothing counts either |
| Analytics and Insights, whole screen | At first a screen saying what was missing; since 10.6, the trends the data can carry |

The Analytics screen is the one to defend out loud. Built as designed it would have been the most
persuasive thing in the product and the only part that could not survive being clicked into. It
was later built from the series that do exist; see 10.6.

**Tasks and Documents turned out to be real.** They were going to be honest empty states until
reading the branch showed `/api/workspace/tasks/mine` and
`/api/workspace/entity/{id}/documents` already exist. Both are wired to live data, and the rail
badge counts open tasks from the same endpoint the screen reads, so the badge cannot disagree with
the page.

---

### 10.4 Demo data, and which quarter the demo is in

Section 8.5 left this open. It is now decided by role rather than by date. A reporter's screens
open on the open period, which in September is Q2. The Department's screens open on the last
period that has fallen due, which is Q1, through `ReportingViewService.reviewPeriodId()` and the
matching `reviewPeriod()` in `frontend/src/lib/format.ts`. `RiskSchedule` scores both. The real
date is kept, so nothing in the demo is dated before the quarter it reports on.

`DemoDataService` then adds workflow data on top of the reference seed, once, on a database with
no comments or tasks. Every row of it is invented and says so. Q1 carries every review state; the
demo reporter's entity (Iziko, the one Firebase reporter account) is submitted and waiting so a
reviewer can return it live; the National Library is returned with two open disputes; tasks are
assigned to the four Firebase accounts by uid; and a completed Q2 template for Iziko is written to
`var/demo/`, with a figure typed as words, a figure typed as text, a missing figure with its
reason, a shortfall with no reason and an unregistered indicator code.

One cost worth stating. The reference seed reported only 12 of Iziko's 20 Q1 indicators. The demo
answers the other 8, because a returned period reopens every unanswered target, and a live return
would otherwise hand the reporter ten rows instead of one. That lowers Iziko's evidence gap signal.

Found on the way and fixed: a quarterly report that fell due and was never filed added nothing to
the lateness signal, which averaged only the reports that arrived, so an entity that stopped
filing scored better than one filing a week late. `RiskService` now counts each such report as
late up to today, where the entity has targets registered for the year, and the panel says how
many are unfiled. It changes nothing in the seeded demo, because every entity with targets filed
Q1. It does not move Robben Island either: its lateness is already at the ceiling from the
seventy day statutory breach, and it has no targets registered, so no quarterly report is due
from it in the system. The 45 against the wireframes' 74 is thin history, as section 8.5 says.

---

### 10.5 Setting tasks, and a demo database that outlives a session

**Tasks can be set from the screen.** Requirement (d) asks for tasks set internally and externally,
and until now the endpoint existed with nothing calling it. The Tasks screen has a Set a task form
for every role holding `PARTICIPATE`: reporter, reviewer, administrator, not the executive. The
assignee list is `GET /api/workspace/entity/{id}/people`, which is the Department plus that
entity's own reporters and nobody from another entity. Whether a task is external is still derived
by the server, never ticked. Anyone who signs in is recorded in `user_profile` by `/api/me`, which is
what makes them assignable.

**My tasks returned only OPEN.** Work marked in progress vanished from its owner's list and the Done
filter could never show anything. It now returns everything assigned to the caller, open first; the
badge and the dashboard already filtered out done work on the client.

**Seeded tasks no longer claim the Director-General set them.** The executive has no `PARTICIPATE`,
so a task "set by the Director-General" was something the product would not have let happen.

**The demo database.** The Postgres that was running on 5432 lived in another Claude session's
scratch directory and goes when that session is cleaned up. `run-local.sh` now runs a portable
Postgres 16 from `~/.vuka` on 5433, seeded from scratch with the demo data. Its Iziko id is new, so
the Firebase reporter account's `entityId` claim has to be reset to it before Nomsa can sign in.

### One home and one rail per role

Before this pass the reviewer, the executive and the admin all landed on the same dashboard and
saw nearly the same eight rail entries, which is the opposite of block 2 in the build order
("four roles land in four different places") and the first thing a judge switching accounts would
notice. `homeFor` in `lib/auth.tsx` described the intended routing and was never called.

Now `/` renders a different home per role and each role has its own rail, written out whole in
`railFor` rather than filtered from one shared list:

- **Reviewer, J3.** Lands on Today: awaiting decision, returned, nothing filed, approved, then the
  top three of the risk-ranked queue using the queue's own row component. No portfolio totals and
  no rand figures, which are the executive's.
- **Executive, J4.** Lands on the portfolio (W9). Rail is Portfolio, Entities, Citizen View. No
  tasks, workspaces or recompute button, because the role changes nothing.
- **Admin, UC-21.** Lands on Administration, the publication switch, with published, unpublished
  and no-targets counts. Rail is Administration, Workspaces, Tasks, Citizen View. No queue and no
  risk screen.

The risk band bars on the old shared dashboard are gone; the same distribution is the executive's
heatmap. Analytics & Insights was in no rail then; 10.6 put it in the reviewer's and executive's. The recompute buttons on the queue and on Risk &
Alerts are now shown only to a role holding `REVIEW_SUBMISSIONS`, where before an executive
reaching Risk & Alerts was offered one the API refused.

The capability table changed once, on purpose: `REVIEW_SUBMISSIONS` is the reviewer's alone, so
publication and approval take two people. `CapabilityTest.adminDoesNotReview` holds it. The
Microsoft sync endpoint, which was reviewer only, now also admits `ADMINISTER`, because the admin
binds the library and pulling versions decides nothing. This departs from the PRD's "nothing is
fully barred" for the administrator, and the pitch should say so as a governance choice.

### The reporter, and the return round trip

The reporter had two homes, a Dashboard and My reporting, showing the same tiles and the same
deadline. Their home is now the reporting screen itself (J1: no generic landing page).

The bigger fault was the return. The reporter's screen showed a returned card only for the open
quarter, but the Department reviews the quarter that has fallen due, so in September the reviewer
returns Q1 while the reporter's screen is on Q2. A live return left nothing on the reporter's
screen but a chip in the prior periods list, with no link. Now every returned period sits at the
top: who returned it (the name now resolved from the user directory rather than left null), the
reason, each open dispute in the reviewer's words, and one button into the confirmation screen,
which already opens on the disputed rows only. Disputes are read on the five second comment poll
and the submission list every ten seconds, so a return made on stage appears without a reload.
Prior periods now link to their submissions.

Demo plumbing: a dev reporter with no entity id is the demo reporter at Iziko, so nobody pastes a
uuid mid-demonstration. The local database had never received the demo seed (it already held
comments, so the seed stepped aside) and the demo uids pointed at Firebase accounts; `run-demo.sh`
runs against a separate `vuka_demo` database with the dev uids, and `--reset` restores it.

### The demonstration journey: deadline, warning, account

The journey the demo now shows, end to end and each step real:

1. **Admin sets the deadline.** Administration, Submission deadlines. For Schedule 3A the date is
   a departmental instruction, so the Department sets it here. A passed deadline is locked; a new
   one cannot be past, before the quarter ends, or later than a statutory date
   (`DeadlineRulesTest`). Audit logged.
2. **Reporter signs in and is warned.** `DeadlineAlert`: late (due date passed, nothing filed) or
   approaching (open quarter due within thirty days, not filed), the same thirty days at which the
   reminders begin. Once per sign in for a given set of warnings. A returned quarter is not called
   late; the returned card handles it. In the seeded demo Q2 is due 30 October, 42 days out, so
   the warning appears only after the admin brings it forward, which is the point to show.
3. **Admin registers an entity and issues its reporter account.** There is no sign up anywhere.
   With Firebase the account is created with claims and a set-password link; without it the person
   is recorded in the directory and the screen says no credential was issued. A new entity appears
   in the queue as not scored with nothing filed, and its reporter is warned that Q1 is late.

This departs from the PRD, which cut entity creation and user administration (section 12, cuts 1
and 3). The brief's emphasis on who may report and by when made them the demonstration rather than
admin screens nobody watches. Targets are still not entered by form: they are versioned against a
tabled plan.

### 10.6 Analytics built from what is actually stored

The placeholder said what a real Analytics screen would need, and most of it was already in the
database: allocations for 2023/24 to 2026/27, published audit outcomes with targets achieved for
2023/24 and 2024/25, and confirmed quarterly results with their stored risk scores. The screen is
now built on those, through `GET /api/dashboard/analytics` (`AnalyticsService`), and sits in the
reviewer's and the executive's rails. It is the only screen that answers "is it getting better"
rather than "where does it stand this quarter", so it does not repeat the portfolio or the risk
screen.

Four sections: year on year, who moved (the same entities in both audited years, largest fall
first), quarter by quarter, and by sector. Three decisions worth defending:

- **Like for like.** The portfolio rate covers six entities in 2023/24 and twelve in 2024/25, so the
  screen says the rows are different populations and computes movement only over the four entities
  with counts in both years.
- **Every funded entity is expected to file**, the same population the register and the queue
  count, so "not filed" on this screen agrees with "nothing filed" on the Entities screen. The
  sixteen with no registered targets are named as such rather than dropped.
- **Met is computed, not read.** A figure meets its quarter target when the latest confirmed actual
  is at least the quarter value, so the rate can be reproduced from the two numbers on the review
  screen, and a figure corrected after a return counts once.

Still absent, on purpose: any monthly series, document views and downloads, and cost per outcome
across sectors. The in-year quarterly figures in the demonstration are the illustrative seed, and
the footnote says so.

---

## 11. Two citizen views, and offline for every audience

Asked for: the citizen view in React where the bandwidth allows, the Thymeleaf page where it does
not, chosen automatically or by the reader; and offline working for citizens, DSAC users and
entities alike.

**Two views, one address.** `/public` serves the light Thymeleaf view or the full React view
(`frontend/citizen.html`, `src/citizen/`), chosen by `CitizenSurface`: the reader's `?view=` first,
then `Save-Data`, then the `ECT` and `Downlink` client hints, else the full view, which rechecks
`navigator.connection` in the browser and falls back after ten seconds if its bundle has not
started. The choice lives in the URL like `lang`, never a cookie, per `LocaleConfig`'s reasoning.
The full view is its own Vite entry so it never loads Firebase or the dashboard: about 55KB gzipped.
It reads `/public/api/entities` and `/public/api/messages`, so it renders in the same five languages
from the same files. New citizen strings were added to all five bundles; the four translations are
unreviewed like the rest.

**Offline.** One service worker (`frontend/public/sw.js`), a phone script (`public/offline/
mobile.js`) and a dashboard layer (`src/lib/offline.ts`). Citizens read pages already read, dated.
Reporters on the phone keep answering with no signal, including indicators never opened, and
answers go in order when the signal returns. Dashboard users open screens already visited and can
comment, review, confirm, submit, move tasks and decide documents offline; each is listed until
sent. The safety rules: never a copy when the network answered; a kept change goes under the same
person's session or not at all (`OfflineIdentity` puts a digest of the uid on every `/m` page, and
the worker fetches the form again before sending, which also refreshes the CSRF token); the server's
state checks still decide, and a refusal blocks what was kept after it; sign-out deletes it all.

**Faults found by running it rather than by reading it.** Kept assets failed offline because the
server varies on Origin and a module script sends one, so every cache lookup now ignores Vary. On a
phone's first visit the worker took over after the page loaded, so it knew neither the page nor the
reporter; the page now asks it to fetch itself once. Comments were missing offline because the
live poll bypassed the cache. Six dashboard routes (`/entities`, `/risk`, `/analytics`,
`/workspaces`, `/documents`, `/tasks`) answered 401 on reload; they are now forwarded and permitted.
`/favicon.svg` answered 401 too.

**Verified** in headless Chrome against a running backend, listed in the README under Offline. Not
run: an accepted replay end to end, because it writes to the append-only record.

---

## 12. Language, across all twenty one screens

Until this point the language picker changed the landing page and the three auth screens and
nothing else. A person could choose isiZulu, sign in, and land on an entirely English dashboard.
That was a deliberate scope decision at the time, argued on quality: translating twenty dense
screens of regulatory vocabulary badly would be worse than translating four well. The reasoning
was sound about quality and wrong about scope. A reporting officer at a provincial museum is
exactly the person most likely to want isiZulu, and they live in the dashboard, not on the
landing page.

So the scope grew and the quality caveat stayed, stated rather than quietly dropped.

### 12.1 What is now translated

Five languages: English, Afrikaans, isiZulu, isiXhosa, Sesotho. Nine hundred keys each, covering
every screen, every empty state, every error message, every modal and every aria-label in the
application. `lib/i18n/` replaces the single `lib/i18n.tsx` that came before it.

Every dictionary is declared as `Record<Key, string>` against the English one, so a missing key is
a compile error rather than a word that silently falls back on a screen nobody happened to open in
isiXhosa. A script checks key parity on every batch as well, because a key added to four files out
of five is the exact failure the arrangement exists to catch and catching it before `tsc` is
cheaper.

### 12.2 The vocabulary that must not drift

Four phrases carry legal or audit meaning and are marked in `en.ts` so a reviewer knows not to
smooth them over.

- **unverifiable against unverified.** The Auditor-General's own distinction. A figure with no
  evidence cannot be checked at all, which is a different and worse thing than a figure nobody has
  got round to checking.
- **statutory against departmental.** PFMA sections 55 and 65 are law. The thirty day quarterly
  figure is a National Treasury guideline. A translation that renders all seven deadline bases as
  "the rules say" destroys the only distinction that screen exists to draw.
- **no result reported.** Never "zero". The difference between not done and not reported is the
  subject of this product.
- **arithmetic, not a prediction.** The sentence the risk engine is defensible on.

### 12.3 Two bugs that only translation exposes

**`StateLine` decided whether to show the "waiting on you" clock by testing whether its own
sentence started with the words `Waiting on you`.** True in English, false in every other language,
so the clock and the active styling would have quietly stopped appearing the moment anyone switched.
The function now returns keys and a `waiting` flag rather than prose, and nothing reads meaning back
out of a rendered sentence.

**Karabo's suggestion chips matched English keywords.** Click the isiZulu chip and the matcher,
reading isiZulu text for the substring "late", falls through to the generic reply. Chips now carry
the answer they demonstrate, so they work in any language. Free text still matches English only,
which is stated in the file rather than papered over: a real model would handle it and this design
build cannot.

### 12.4 Where the labels live

`format.ts` turns numbers and dates into strings and has no opinion about language beyond the South
African locale. Turning enum codes into words is a different job, because words have a language, so
`lib/labels.ts` now does it: risk bands, statuses, sectors, audit outcomes, the Auditor-General's
seven criteria, and the eight deadline bases. One hook, fifteen call sites, rather than threading a
dictionary through every one of them and leaving half still in English.

Every lookup falls through to the code itself, tidied up. If the backend adds an outcome before
this file learns about it, the screen shows `Revision churn` rather than a blank cell or the word
"Unknown", and the gap is visible to whoever is looking at it.

### 12.5 What is not translated, and why

- **Province names.** KwaZulu-Natal is KwaZulu-Natal in all five.
- **PFMA schedule designations.** "Public entity, Schedule 3A" is a legal classification.
- **Published citations.** `CitationLine` renders whatever the API supplies, and Estimates of
  National Expenditure 2026, Vote 37, Table 37.3 is the published reference.
- **The actor string in the audit trail.** The backend writes the literal `Not recorded` where no
  actor is on the record, so the comparison stays in English and only the display translates.

### 12.6 The page weight, which the first version got wrong

Bundling all five dictionaries put three hundred and thirty kilobytes of text into every page load,
and the main chunk went from a passing figure to 742 kB raw, 208 kB gzipped. Section 6 sets a two
hundred and fifty kilobyte budget for the dashboard, and that budget is not arbitrary: it is a
reporting officer on a provincial museum's connection paying for every byte. Most of those bytes
were words the reader would never see, because somebody working in English was downloading the
isiXhosa, isiZulu, Sesotho and Afrikaans copies too.

The four other languages are now fetched when one is chosen. English stays in the bundle because it
is both the default and the fallback, so there is always something to render while another language
is in flight, and a failed fetch leaves the page in English rather than leaving it broken.

    main chunk    742 kB -> 502 kB raw,  208 kB -> 137 kB gzipped
    per language  about 60 kB raw, 19 kB gzipped, loaded only if chosen

### 12.7 The caveat that belongs in the pitch

South Africa has twelve official languages and this is five. These strings have not been reviewed
by first-language speakers, exactly as this log already records for the citizen surface. The honest
claim is that the interface is fully externalised, so translation is a content task rather than a
rebuild, and that PanSALB, which is in the seeded portfolio, is the obvious partner to review it.
Claiming twelve reviewed languages and demonstrating five machine-drafted ones would be worse than
saying this.

### 12.8 After the merge with the citizen and offline work

The language work and the work in section 11 grew from the same commit without seeing each other,
so the merge brought in six surfaces written in English: the reviewer's day on the dashboard,
Analytics as rebuilt from stored data, Administration, the offline connection bar, the deadline
warning, and bulk evidence. It also reverted two headers that had been translated, because git kept
their line where both sides had touched it. All of it now reads from the dictionaries, which stand
at 1,204 keys in each of the five languages.

Three things came out of doing it.

**The criterion wording was rendered twice.** `er.validity` already carried its own label, so the
merged extraction review showed "Validity. Validity. The reported figure..." The three sentences
now live in `lib/labels.ts` as `criterionText`, shared with bulk evidence, which needed the same
wording.

**Counts read as whole sentences, one key for one and one for many.** The connection bar and the
paste summary had built their English by gluing a count, a noun and a range together. The five
languages do not agree on the order those fall in, so each case is a sentence of its own.

**Section 12.1 overstated it.** It says every error message is translated. The ones raised inside
React are. The ones raised in `lib/api.ts`, `lib/auth.tsx` and `lib/useAsync.ts` are not, and were
not before the merge either: they are thrown outside any component, where the translation hook
cannot reach, and reach the screen as English. The same holds for the offline outbox, which stores
each change's description in the language it was made in. Fixing either means the library layer
raising keys and arguments rather than sentences. It is listed in section 13.
## 13. A pass over the four user flows

Asked for: go through each user flow and take the decisions out of it. Four specific changes came
with the request, one per role. All four are done, and three of them turned out to be sitting on
defects rather than on preferences.

### How this work reached the branch twice

Worth recording, because the recovery is the useful part. This work was first written against
`fd19ba9`, committed as two commits, and then lost to a `git reset --hard origin/mo` that moved the
branch onto `92c60c5`, which carried the language work in section 12. The commits survived in the
reflog, so nothing was retyped: they were saved to the branch `rescue/ui-overhaul` and the tag
`rescue-ui-overhaul`, a patch of only the paths this work owns was taken from them, and that was
replayed onto the new base with a three-way merge. Six files conflicted and were resolved by hand.

Two things came out of doing it that way rather than redoing it. The patch deliberately excluded
`icons/index.tsx`, `lib/api.ts`, `lib/types.ts`, `routes/Documents.tsx` and `routes/EntityAdmin.tsx`,
which were somebody else's uncommitted Microsoft workspace changes that the first commit had swept
up; they stayed on the branch untouched. And the replay landed on a base where every screen had been
externalised into `lib/i18n/`, so the English strings this work had introduced would have been a
visible regression in four languages. They were keyed instead. That is the next subsection.

### Everything here is translated

185 new keys across all five dictionaries, covering the rebuilt Analytics screen, the chart kit,
Ask Vuka, the reviewer's three-state dispute row and the reporter's confirm footer. The dictionaries
are `Record<Key, string>` against `en.ts`, so a key added to four files out of five is a compile
error, which is how the count is known to be right rather than believed to be.

Two decisions inside that. The CSV export is headed in the reader's language, because an export is a
document somebody hands to somebody else and a reader who chose isiZulu should not be handed an
English spreadsheet. And Ask Vuka carries its trigger words per language rather than matching English
stems against a question typed in Sesotho, with the English triggers kept in every language's list
because a bilingual user types whichever word comes first.

The four translations are machine-drafted and unreviewed, exactly as section 12.2 records for the
rest of them. The vocabulary that must not drift was not touched.

### The reporter: one gap instead of five

The demonstration template that `DemoDataService` writes for the reporter used to carry five rows
needing attention, one for each case the confirmation screen exists to catch: a figure typed as
words, a figure typed as text, a shortfall past the variance threshold with no reason, a missing
figure with its reason, and an indicator code the entity never registered. Every one of those is a
real case and every one is still handled by the code that reads the file. What they were not is a
demonstration. Four minutes of somebody retyping numbers in front of a panel buries the one claim
the screen is there to make.

It now writes one gap. Row three of twenty arrives with no figure, no explanation and no evidence
reference; everything else is a clean number inside the threshold. The unregistered code stays,
because it costs the reporter nothing and lands in **Held aside** by itself. Verified end to end
against a running backend: the file parses as 21 rows read, 20 matched, 1 held aside, and the rows
endpoint gives 19 figures confirmable in one click with exactly one row needing a figure and a
supporting document.

The footer of that screen also stopped offering two equal buttons. While anything is outstanding
the bulk confirm is the primary and **Submit** is off; once nothing is outstanding they swap.

### The reviewer: three defects, two of them real

**Typing stopped after one character.** This was the worst of the four and it was not a reviewer
screen bug at all. `Modal` in `Shell.tsx` ran one effect that both moved focus to the close button
and installed the Escape handler, with `[onClose]` as its dependency. `onClose` is an inline arrow
at every call site, so it is a different function on every render of the screen behind the modal.
Every keystroke in the return note re-rendered that screen, gave the modal a new `onClose`, re-ran
the effect and threw focus onto the close button. Focus now moves once, on open; the Escape handler
reads the current `onClose` through a ref. `RiskPanel` had the identical pattern and is fixed with
it. This was affecting every textarea inside every modal in the product, not only the reviewer's.

**The dispute button did not go away.** `IndicatorRowVerify` had two states where it needed three.
After **Mark disputed** the form stayed open with the same button on it, so nothing said the mark
had taken and clicking again did nothing visible. It now closes the form and reads the reason back
under a **Disputed** label, with **Edit the reason** and **Undo this dispute** beside it. A dispute
already sent to the entity on an earlier round says so and offers no undo, because that one has
left the reviewer's hands.

**One decision, one button.** The footer used to show **Return with comments** and **Approve** side
by side with one of them greyed, leaving the reviewer to work out the rule on every submission. It
now states in a sentence what has been marked and what the button will do about it, and carries
only that button: **Approve all n figures** while nothing is marked, **Return n figures to the
entity** as soon as anything is. Either decision returns to the queue with a line confirming what
was recorded, including the offline case where it is waiting in the outbox.

**Submitting works.** Checked against the running backend rather than assumed. A per-target comment
posts, `POST /review` with `approve=false` moves the submission to RETURNED with the reason and the
row reading as disputed; `approve=true` moves another to APPROVED with the reviewer's name and the
time. The frontend defect was the focus loop, which made the return note impossible to type.

### The executive: pictures, an export, and a question box

`Analytics.tsx` was five tables and about nine hundred words of caveat. Every word was true and
most were load-bearing, and it still failed the person it was written for.

**Drawn rather than tabulated.** A chart kit in `components/Charts.tsx` and `Charts.css`: inline
SVG and CSS, no library. Money and delivery as two column charts side by side and never one chart
with two scales; audit outcomes as a stacked bar per year; filing as on time, late and not filed per
quarter; sector as paired horizontal bars; movement as one dumbbell per entity. Every chart has
**Show the figures**, which opens the exact table it was drawn from, and the caveats moved into one
closed block at the bottom where they are read once rather than stepped over five times.

Nothing was softened to do it. A year with no audited figure still draws no bar and says why. The
sector charts still refuse to divide rands by outcomes.

**The palette was computed, not chosen.** Run through a colour-blindness and contrast validator
against this surface's white rather than eyeballed. Categorical `#1D6BF3 #0E9AA7 #7C5CFC #C2389E`
passes every check; a six-way categorical set does not exist that passes, which is why sector
identity is carried by the axis label and one hue rather than by six. Status is `#15803D` good,
`#CA8A04` warning, `#DC2626` critical; the warning step sits at 2.86:1 against white, just under the
line, which obliges visible labels rather than colour alone, and every status chart here prints its
counts and keeps its table. Audit outcomes use four steps, not six, for the same reason: the three
worst opinions share a fill and stay six separate labelled rows in the sentence and the table. There
is no dark theme on the office surface, so there is one palette to hold.

**Export.** **Download as CSV** builds the whole view client side, in screen order, so a figure
quoted from the spreadsheet and one quoted from the screen cannot disagree; a blank cell means not
published or not yet due and the file says so on its fifth line. **Print or save as PDF** lays the
screen out as a committee pack, with the controls off and the chart fills kept.

**Ask Vuka** (`components/AskVuka.tsx`) is the question box, on Analytics and on the Portfolio.
There is no language model behind it and nothing leaves the building. It matches a typed question
against a fixed set this product can answer and then reads the same figures the screens are drawn
from; naming any entity beats every general question. Where it cannot match it says so and lists
what it can take. Every answer carries its source and a link to the screen that shows the working.

That restraint is the design rather than a shortcut. An executive quoting a figure in a portfolio
committee is accountable for it, and a number that came from a model that might have inferred it is
a number they cannot defend. The first time one is wrong in that room the product is finished.

### The citizen: a way off the page

The public record answered one question well and left the reader with three it cannot answer. There
was nowhere to go from it but a search engine.

`public_entity` gains a `website` column (`V7__entity_website.sql`), loaded from a new column in
`data/dsac-entities.csv`, carried on `PublicationService.CitizenView` and rendered on both citizen
views as **Visit <entity>**, opening in a new tab, in all five languages. Where no address is on
record there is no link: a wrong address under a government masthead sends a reader to somebody
else's domain, which is worse than a blank.

**This is the one column in that reference file not taken from a published Treasury or
Auditor-General document.** The 28 URLs were written from general knowledge of these bodies and
every one must be checked against the entity's own letterhead before the citizen surface is
published anywhere real. The file says so in its header and so does the migration. That check is
item 16 in section 14.

### What was verified, and how

Against a freshly reset `vuka_demo` and a running backend: the migration applies; 28 entities load
with their websites; `/public/api/entities` carries the field; the light citizen page renders the
link and the note in English, Afrikaans, isiZulu, isiXhosa and Sesotho; the demo template contains
exactly one empty row; the upload parses to 19 one-click confirmable rows and one gap; dispute,
return and approve all move the submission and record the reviewer. The frontend typechecks and
builds.

All of it was run again after the replay onto the new base, against a freshly reset
`vuka_demo`: the migration applies, 28 entities load with their websites, the citizen page renders
the link and its note in English, isiZulu and Sesotho, the demo template still has exactly one empty
row, the upload still parses to 19 one-click confirmable rows and one gap, and dispute, return and
approve still move the submission and record the reviewer. 85 backend tests pass, the frontend
typechecks and builds.

**Not verified:** no screen in this pass has been looked at in a browser. There is no browser
automation in this environment and installing one was not a call to make unasked. The charts, the
Ask Vuka panel and the new reviewer footer are correct by construction, by build and by their data,
not by sight. That is item 3 in section 14, which this pass has made larger rather than smaller.

---

## 14. Still open

Ordered by how much it costs us if it is not done.

1. **Decided: the quarter depends on who is looking.** Section 10.4. Reporters open on Q2, the
   Department on Q1. Robben Island still reads medium at 45 rather than critical at 74; say so if
   the wireframes are on the table.
2. **Finish Firebase.** The web API key from the console into `frontend/.env`, and Email/Password
   enabled as a sign in method. Four accounts already exist with correct claims. Until this is done
   the browser cannot sign in at all and `VUKA_DEV_AUTH` is carrying the demo, which must not be
   how it is presented.
3. **Open every screen in a browser.** The application serves requests and the API returns correct
   data, but no screen has been looked at by a person. Empty and error states especially: a
   portfolio with no scores, an entity with no allocation row, a submission with no evidence on any
   figure. All three are states the seed can actually produce.
4. **Confirm the eQPRS export columns** against DPME's current template. Ours is a reading of a
   published shape, not a certified integration.
5. **Replace the illustrative quarterly profiles** in `SeedService` if any real quarterly data can
   be obtained, most likely from Portfolio Committee quarterly reports on PMG.
6. **Fill the 12 entities with no audit row.** They are blank because no published figure could be
   reached, which is the honest state. Only fill them from a real source.
7. **Publication is on for twelve entities in the local database only.** Every seeded entity ships
   with `publiclyVisible` false, and the twelve carrying registered targets were switched on for
   testing through `POST /api/admin/entities/{id}/publication`. That is local state and does not
   travel with the repository, so a fresh database still needs it doing. Note that Luthuli Museum,
   which W13 uses as its worked example, has no targets registered, so its public page would show
   a promise of nothing.
8. **Decide where uploaded bytes live in production.** They are now stored, on the local
   filesystem under `DOCUMENT_ROOT`. On more than one instance that must be a shared volume or
   object storage, and the object store implementation has not been written.
9. **Bind one test SharePoint library before showing Microsoft 365.** No tenant has been
   available, so the Graph path and the Teams card are unit tested against response shapes only.
   Run `POST /api/workspace/entity/{id}/microsoft/sync` against a real library first, or present
   the integration as built and untested.
10. **Decide the demo narrative.** The Robben Island story is the strongest available: a named
   entity, a real missed statutory deadline, a documented cause, a committee that had flagged it,
   and an audit excluded from portfolio outcomes. Our system surfaces exactly that pattern, and
   the risk engine reproduces it from published facts.
11. **Run one accepted offline replay before relying on it in a demonstration.** Answer an indicator
   on a phone with no signal, reconnect, and check the figure lands with the reporter's name on it.
   Every step up to the send was verified; the accepted send was not, to keep the demo record clean.
12. **Two pages are over the 5KB rendered budget.** `mobile-step.html` (5.8KB) and
   `public-entity.html` (6.0KB) were both over before the offline layer. Gzipped they are 2.3KB.
   Either trim them or restate the budget as gzipped bytes, which is what a phone downloads.
13. **Background sync is Chrome only.** Elsewhere, kept answers go when the reporter next opens a
   page with signal, not by themselves.
14. **Translate the library layer.** Errors raised in `lib/api.ts`, `lib/auth.tsx` and
   `lib/useAsync.ts`, and the offline outbox descriptions, still reach the screen in English
   whatever language is chosen. Section 12.8 says why. A reviewer choosing isiZulu sees an English
   error exactly when something has gone wrong, which is the worst moment for it.
15. **Decide which translation system owns what.** `messages*.properties` on the server and
   `lib/i18n/` on the client now both carry the same five languages. The obvious split is the
   properties files for the Thymeleaf mobile and citizen templates and the dictionaries for the
   React app, but nobody has decided it, and until someone does a sentence can be translated twice.
16. **Check all 28 entity websites against each entity's own letterhead.** The `website` column in
   `data/dsac-entities.csv` is the only column in that file not taken from a published document. It
   was written from general knowledge of these bodies, and a wrong URL on a named national
   institution sends a citizen to somebody else's domain under a government masthead. Leave a cell
   blank rather than guess: the citizen page omits the link where there is none. Note this also
   grew `public-entity.html` a little, so item 12 is now slightly worse than it was.
17. **Delete the `rescue/ui-overhaul` branch and the `rescue-ui-overhaul` tag once this
   work is merged.** They exist only because a `git reset --hard` discarded it once. They point at
   the pre-language version of these screens, so leaving them around invites somebody to check the
   wrong one out. See the note at the top of section 13.
18. **Look at the rebuilt Analytics screen, the Ask Vuka panel and the reviewer footer in a
   browser.** They typecheck, they build, and their data was verified against a running backend, but
   no person has seen them render. Label collision, overflow and layout at phone width are exactly
   what a build does not catch. This enlarges item 3 rather than reducing it. Partly done on 19
   September: every screen in the user manual was driven in headless Chrome at 1440 wide, and the
   phone and citizen pages at 390, and the captures were read. Nothing was found overlapping. Layout
   of the dashboard at phone width is still unchecked.
19. **One Attach click stores the evidence twice.** On the reporter's confirmation screen, attaching
   one PDF to HER-1.3 through the row's **attach** dialog left two `Attendance-register-Q2.pdf` rows,
   both version 1, and the home tile counted two evidence documents. Reproduced on two fresh
   databases. The user manual shows the doubled chip; retake `j1-11` once it is fixed.
20. **The audit trail has no way in.** `/logs` is routed and works for every role, reporters scoped
   to their own entity, but no menu item or link reaches it. The manual tells people to type the
   address.
21. **Documents cannot be approved or returned from the dashboard.** `api.decideDocument` exists and
   nothing calls it, while the reviewer's Today screen offers "Decide on documents" and requirement
   (d) asks for approval on receipt. The presenting chapter of the manual states it as a limit.
22. **A Q1 dispute shows on the Q2 filing.** `ReportingViewService.commentsFor` returns every comment
   for the entity, and a target is the same row across the financial year, so an open dispute on
   Q1's HER-1.1 labels HER-1.1 on the Q2 confirmation screen "The Department disputed this figure".
   Seen in the manual's reporter journey, step 7. Filter comments to the submission's period, or
   anchor disputes to the result rather than the target.
23. **Answering a return resets the lateness.** `SubmissionService` sets `submittedAt` to now on
   every submit, so Iziko's Q1, first filed 11 days late, reads 51 days late once the reporter
   answers the returned figure, and the lateness signal moves with it. Keep the first submission
   date for lateness and record the resubmission separately.

---

## 15. Standing preferences and constraints

- **No em dashes or dashes in written output.** Natural flowing prose. This applies to every
  message and document produced for this project.
- **Never invent a number.** Absent data stays absent. An entity with no published figure has no
  row, and the risk engine treats that as absence of evidence rather than evidence of absence.
- **State limitations before someone finds them.** Every export carries its own caveats, the README
  has a known-limitations section, and this log has section 5.
- **48 hours.** Everything scoped has to be buildable in the hackathon window.
