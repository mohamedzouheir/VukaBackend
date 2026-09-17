# Vuka session log

A record of what was decided, what was checked, what changed and what is still open. Written so
somebody who was not in the session can pick the project up, and so we can defend any of it in the
judging room.

Last updated: 17 September 2026, after the first successful run.

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
| Comments on a submission | UC-12 and UC-14. `review` took one free text reason for a whole submission, so the entity could not be told which figure was disputed |
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

This has to be decided before the demo, and it is first in section 9.

---

## 9. Still open

Ordered by how much it costs us if it is not done.

1. **Decide which quarter the demo is in.** Section 8.5. Either seed Q2 submission history so the
   lateness and evidence gap signals have real inputs, or present Q1 as current. As it stands the
   demo script says Robben Island is critical at 74 and the running system says medium at 45, and
   somebody in the room will have the wireframes open. Seeding Q2 means writing more illustrative
   quarterly figures, which section 4 is careful to label as the only invented numbers in the seed,
   so whichever way this goes it has to be said out loud.
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
8. **Decide where uploaded bytes live.** Metadata, hashes and the target link are all stored. The
   files are not. That is stated on the endpoint rather than hidden, but it is a real gap and
   somebody will ask.
9. **Decide the demo narrative.** The Robben Island story is the strongest available: a named
   entity, a real missed statutory deadline, a documented cause, a committee that had flagged it,
   and an audit excluded from portfolio outcomes. Our system surfaces exactly that pattern, and
   the risk engine reproduces it from published facts.

---

## 10. Standing preferences and constraints

- **No em dashes or dashes in written output.** Natural flowing prose. This applies to every
  message and document produced for this project.
- **Never invent a number.** Absent data stays absent. An entity with no published figure has no
  row, and the risk engine treats that as absence of evidence rather than evidence of absence.
- **State limitations before someone finds them.** Every export carries its own caveats, the README
  has a known-limitations section, and this log has section 5.
- **48 hours.** Everything scoped has to be buildable in the hackathon window.
