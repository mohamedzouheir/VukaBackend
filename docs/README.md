# Vuka reference documents

The documents this project is built against, plus the reporting template the system generates and
parses. If you are picking the project up, read them in the order below.

**Two of these are marked RESTRICTED by SITA. This repository is private and has to stay that
way.** If it is ever opened up, the two GovTech documents come out first.

---

## What each one is

| Document | What it fixes | Authoritative for |
|---|---|---|
| [GovTech2026-Challenge-Statements.pdf](GovTech2026-Challenge-Statements.pdf) | The DSAC problem statement and the five mandatory requirements, lettered (a) to (e) | What we are required to build. Nothing else overrides it |
| [GovTech2026-Judging-Criteria.pdf](GovTech2026-Judging-Criteria.pdf) | Eight weighted adjudication criteria | How the work is scored. See the weights below |
| [Vuka-DSAC-PRD.pdf](Vuka-DSAC-PRD.pdf) | Product concept, users, scope, the six differentiating features, the data model, the architecture, the stress test | Why the product is shaped the way it is |
| [Vuka-Frontend-Design.pdf](Vuka-Frontend-Design.pdf) | Journeys J1 to J5, use cases UC-1 to UC-22, the screen inventory, wireframes W1 to W13, nine components, the page weight budget | What a person sees, in what order |
| [Vuka-48-Hour-Build-Guide.pdf](Vuka-48-Hour-Build-Guide.pdf) | The build plan | Sequencing. Not yet reconciled against the current code |
| [DSAC-Quarterly-Reporting-Template-v1.xlsx](DSAC-Quarterly-Reporting-Template-v1.xlsx) | The reporting standard itself. Three sheets, 51 formulas | The parser contract. `TemplateParser` reads exactly this |

---

## Where the documents and the code disagree

They do, in both directions, and pretending otherwise wastes a day.

**[frontend-design-corrections.md](frontend-design-corrections.md) is the current diff.** It lists
every claim in the frontend document that the code has made true or false, with measured
replacements. Read it alongside the PDF rather than instead of it. The PDF has not been
regenerated, so where the two disagree the corrections file is newer.

The repository's own [README](../README.md) carries a known-limitations section that is kept
honest for the same reason. Nothing in this project has been compiled or run end to end, because
the environment it was written in could not reach Maven Central. Budget time for the first
`mvn spring-boot:run` to find something.

---

## The weights, because they decide what to work on

| Criterion | Weight |
|---|---|
| Relevance to the challenge statement | 20% |
| Technical feasibility and functionality | 20% |
| Innovation and emerging technologies | 15% |
| UX, accessibility and inclusivity | 10% |
| Data, intelligence and insight | 10% |
| Security, governance and responsible technology | 10% |
| Scalability, sustainability and sovereignty | 10% |
| Presentation and demonstration | 5% |

Only 20 percent is tied to the challenge statement itself. Another 45 percent rewards how the
thing is built and explained, which is available to anyone who thinks about it. Before starting a
piece of work, name the criterion it earns marks under.

---

## Three things you will be asked and should not get wrong

**How many entities.** Three counts circulate and all three are correct about different things.
The challenge statement says 26 public entities plus six NPOs. Treasury's Estimates of National
Expenditure lists **28** bodies receiving entity transfers, which is what the system is seeded
with. The Auditor-General audited 29, being those 28 plus the department itself.

**What is real and what is not.** The allocations for all 28 entities are real, from ENE 2026
Vote 37 Table 37.3, and reconcile exactly to the published portfolio totals in all four years.
Sixteen entities carry published audit outcomes. The quarterly submission timings in the seed are
illustrative, because that data is not published at this granularity, and they are labelled as
such in the code. Volunteer that before someone finds it.

**How this differs from eQPRS.** DPME already runs a quarterly performance reporting system at
`eqprs.dpme.gov.za`. It captures numbers and does not hold the evidence behind them, and it was
built around departments while every DSAC body is PFMA Schedule 3A, reporting to its executive
authority under Treasury Regulation 30.2.1, which sets no deadline and names no system. We fill
that gap and export into theirs. Do not open a pitch by claiming to have built performance
capture.
