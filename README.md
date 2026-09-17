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
| Dashboard API | http://localhost:8080/api/dashboard/portfolio | DSAC roles |
| Export | http://localhost:8080/api/export/submission/{id}/full.csv | Reporter (own) or DSAC |

The citizen view needs no authentication, so it is the fastest way to confirm the application is
alive.

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
web/          REST controllers plus two server-rendered surfaces
config/       Firebase token verification, Spring Security
```

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
./mvnw test    # 17 tests, each encoding a claim the pitch makes
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

## The low-bandwidth surfaces

Server-rendered Thymeleaf, no JavaScript framework, every page under 5KB before compression and
under 2KB once gzip is on. Response compression is configured in `application.yml`; do not turn it
off.

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

- **The application has not been exercised end to end against real data.** It now compiles in
  full under `./mvnw clean test` and the risk engine's 17 tests pass, and it has booted far enough
  to serve HTTP requests and reach the controller layer. What that does *not* cover: no run has
  gone through the full reporter journey with Postgres seeded and Firebase configured. Also
  verified statically: all 173 JPA-mapped columns exist in the migrations so `ddl-auto: validate`
  will pass, and every repository call resolves to a declared method. Budget time for the first
  real journey finding something anyway.
- **Quarterly submission timing in the seed is illustrative**, as described above.
- **The eQPRS export shape is our reading of a published reporting format, not a certified
  integration.** Confirm the columns against DPME's current template before anyone relies on it.
- **Evidence-to-target linking in the export** falls back to a filename convention where an
  extraction row does not carry the link. Good enough to demonstrate, not good enough to ship.
- **The mobile reporter flow has never been exercised against a running server.** The 401 and 405
  faults that made it unusable are fixed, and the reasoning is in *Signing in on the reporter
  surface* above, but no request has been made against it. The specific thing to check first is
  that the CSRF hidden field is actually rendered into the forms. Thymeleaf injects it through
  Spring Security's `RequestDataValueProcessor` into any form with a `th:action`, which is the
  standard mechanism and the only one available since Thymeleaf 3.1 removed request-attribute
  access from templates. If that processor is not registered for any reason, every POST under `/m`
  answers 403 and the fix is to add the field explicitly. View the page source once and look for
  `name="_csrf"` before trusting the flow.
- **There is no `/admin/**` rule in `SecurityConfig`.** The frontend design document gates it to
  `ADMIN`. No admin controller exists yet, so the paths 404 today, but when one lands it will
  inherit `anyRequest().authenticated()` and be reachable by any signed-in reporter unless the
  rule is added first.
- **The translations have not been reviewed by first-language speakers.** They are a working
  implementation of the language surface, not certified government text, and should go past PanSALB
  or a departmental translator before anything is published. Volunteer this rather than let it be
  discovered.
