# Vuka session log

A record of what was decided, what was checked, what changed and what is still open. Written so
somebody who was not in the session can pick the project up, and so we can defend any of it in the
judging room.

Last updated: 17 September 2026.

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

**The bug the schema check caught:** `Target.q1Target` through `q4Target` were mapped to SQL columns
named `q1target`, but Hibernate derives `q1_target` from the field name. With `ddl-auto: validate`
the application would have refused to start. Renamed in V1. This is exactly the class of failure
that kills a demo at the worst moment.

**A bug in newly written code, caught during review:** `ExportController` compared
`principal.entityId()` (a `String`) to a `UUID`, which is always false, so a reporter could never
export their own filing. Now routed through the existing `VukaPrincipal.canRead` helper that every
other controller uses.

Two risk engine tests are worth demonstrating specifically: the engine reproduces **Robben Island
Museum as critical** and **SAHRA as low** from published facts alone. That is the evidence the
weights describe reality rather than flattering it.

---

## 6. Deliverables

| Item | State |
|---|---|
| PRD, 19 pages | Delivered as PDF |
| Specification and build plan, 20 pages | Delivered as PDF. FR-1 to FR-13, NFR-1 to NFR-8, all entities, API surface, 48-hour build |
| User guide, 13 pages | Delivered as PDF |
| Spring Boot backend | This repository |
| Frontend design doc: journeys, use cases, views, wireframes | Sections 1 to 8 drafted, sections 9 to 12 outstanding |
| Session log | This file |

---

## 7. Still open

Ordered by how much it costs us if it is not done.

1. **Run `mvn spring-boot:run` on a machine with Maven access.** Nothing else on this list matters
   until the application has started once. Budget time for it to find something.
2. **Confirm the eQPRS export columns** against DPME's current template. Ours is a reading of a
   published shape, not a certified integration.
3. **Replace the illustrative quarterly profiles** in `SeedService` if any real quarterly data can
   be obtained, most likely from Portfolio Committee quarterly reports on PMG.
4. **Fill the 12 entities with no audit row.** They are blank because no published figure could be
   reached, which is the honest state. Only fill them from a real source.
5. **Finish the frontend design doc**, sections 9 to 12: citizen view wireframes, component and
   state library, accessibility and page-weight budget, frontend build order.
6. **Decide the demo narrative.** The Robben Island story is the strongest available: a named
   entity, a real missed statutory deadline, a documented cause, a committee that had flagged it,
   and an audit excluded from portfolio outcomes. Our system surfaces exactly that pattern, and
   the risk engine reproduces it from published facts.

---

## 8. Standing preferences and constraints

- **No em dashes or dashes in written output.** Natural flowing prose. This applies to every
  message and document produced for this project.
- **Never invent a number.** Absent data stays absent. An entity with no published figure has no
  row, and the risk engine treats that as absence of evidence rather than evidence of absence.
- **State limitations before someone finds them.** Every export carries its own caveats, the README
  has a known-limitations section, and this log has section 5.
- **48 hours.** Everything scoped has to be buildable in the hackathon window.
