-- V2. What the research changed.
--
-- Four things came out of checking our assumptions against the actual instruments, and each one
-- needed schema behind it rather than a comment in a slide deck.
--
--   1. The PFMA schedule decides who an entity reports performance to, and therefore which of
--      its deadlines are law. Every DSAC body is Schedule 3A except PanSALB, which is Schedule 1.
--
--   2. A deadline needs its authority stored beside it. Treasury Regulation 26.1.1 gives 30 days
--      after quarter end and it covers revenue and expenditure only. TR 30.2.1 requires quarterly
--      performance reporting to the executive authority and sets no day count at all. The 30 days
--      everyone quotes for performance is a National Treasury guideline, which binds as an
--      instruction rather than as a regulation. The interface should not dress one up as the other.
--
--   3. A target may only change where the Annual Performance Plan is revised and re-tabled, under
--      section 4.4.4 of the 2019 Revised Framework. Being about to miss it is not a lawful reason.
--      So targets are versioned rather than mutable.
--
--   4. An entity has one audit outcome per year and any number of findings, or none. Holding the
--      outcome on the finding row meant an entity with no findings had no outcome, which got the
--      two most important cases exactly backwards: a clean audit, and an audit that was never
--      completed at all.

-- ---------------------------------------------------------------------------
-- 1. PFMA schedule
-- ---------------------------------------------------------------------------

alter table public_entity
    add column pfma_schedule varchar(20);

comment on column public_entity.pfma_schedule is
    'PFMA schedule. Decides the reporting line and therefore which deadlines are statutory. '
    'Every DSAC body is SCHEDULE_3A except the Pan South African Language Board (SCHEDULE_1).';

-- ---------------------------------------------------------------------------
-- 2. Deadline provenance
-- ---------------------------------------------------------------------------

alter table reporting_period
    add column deadline_basis    varchar(60),
    add column deadline_citation varchar(300);

comment on column reporting_period.deadline_basis is
    'What the dates rest on. DEPARTMENTAL_INSTRUCTION is not the same as a PFMA section and the '
    'interface says which it is.';

comment on column reporting_period.regulatory_deadline is
    'Null for quarterly performance periods, and the nullability is the honest part: no regulation '
    'sets a day count for Schedule 3A quarterly performance reporting.';

-- ---------------------------------------------------------------------------
-- 3. Target versioning
--
-- None of this exists in V1, including the version column itself. V1's target table stops at
-- revision_count, which was a mutable counter and exactly the wrong shape: a number that can be
-- incremented in place tells you a target moved but not to what, not when, and not on whose
-- authority. The version chain below replaces it as the source of truth, and revision_count stays
-- only so existing rows keep working.
--
-- Existing rows backfill to version 1, which is the correct reading: anything already in the
-- table was tabled once and never re-tabled.
-- ---------------------------------------------------------------------------

alter table target
    add column version             integer not null default 1,
    add column supersedes_id       uuid references target (id),
    add column effective_from      date,
    add column superseded_on       date,
    add column revision_trigger    varchar(40),
    add column retabling_reference varchar(300);

-- The version in force is the one never superseded. This is the index the reader hits most.
create index idx_target_current
    on target (entity_id, financial_year_id)
    where superseded_on is null;

-- A revision must carry its lawful trigger. Version 1 was not a revision, so it carries none.
-- This constraint is the 2019 Framework's section 4.4.4 expressed as something the database
-- will actually refuse, rather than as a policy nobody reads.
alter table target
    add constraint chk_target_revision_has_trigger
    check (version = 1 or revision_trigger is not null);

comment on constraint chk_target_revision_has_trigger on target is
    'A target may only be revised where the APP was re-tabled following a budget adjustment or a '
    'strategic plan revision. A version above 1 with no trigger is the data error the '
    'Auditor-General asks about.';

-- ---------------------------------------------------------------------------
-- 4. Evidence, tagged with the test it satisfies
-- ---------------------------------------------------------------------------

alter table document_record
    add column agsa_criterion varchar(30),
    add column content_hash   varchar(128);

comment on column document_record.agsa_criterion is
    'Which of the Auditor-General''s tests this document is offered against, from the audit of '
    'predetermined objectives under Public Audit Act s20(2). Usefulness: PRESENTATION, '
    'CONSISTENCY, MEASURABILITY, RELEVANCE. Reliability: VALIDITY, ACCURACY, COMPLETENESS. '
    'This column is the difference between a document repository and an audit readiness tool.';

comment on column document_record.content_hash is
    'Hash of the stored bytes. A reviewer opening evidence months later needs to know it is the '
    'file that was attached and not one that replaced it.';

-- ---------------------------------------------------------------------------
-- 5. Audit outcome of record, one row per entity per year
-- ---------------------------------------------------------------------------

create table audit_outcome_record (
    id                uuid primary key,
    entity_id         uuid not null references public_entity (id),
    financial_year_id uuid not null references financial_year (id),
    outcome           varchar(40),
    findings_total    integer,
    findings_repeat   integer,
    targets_achieved  integer,
    targets_total     integer,
    note              varchar(2000),
    source_reference  varchar(500),
    constraint uq_audit_outcome_entity_year unique (entity_id, financial_year_id)
);

create index idx_audit_outcome_entity on audit_outcome_record (entity_id);

comment on table audit_outcome_record is
    'One audit opinion and one targets-achieved figure per entity per year. Both come from '
    'published annual reports and from the Auditor-General''s briefings to the Portfolio '
    'Committee. This table is how we check the risk engine against reality: if it ranks an '
    'entity badly that achieved everything it promised and got a clean audit, the weights are '
    'wrong and this is what proves it.';

comment on column audit_outcome_record.findings_total is
    'Null means not published. Zero means published as zero. Annual reports rarely carry a '
    'numeric findings count; that count lives in AGSA management reports, which are not public. '
    'Collapsing null into zero would quietly invent a clean audit.';

comment on column audit_outcome_record.outcome is
    'AGSA vocabulary. UNQUALIFIED is a clean audit. OUTSTANDING means the audit was not completed '
    'and the entity was excluded from the portfolio outcomes, which is worse than any opinion '
    'because there is no assurance of any kind.';

comment on column audit_outcome_record.targets_achieved is
    'From Part B of the annual report. The single most defensible number an entity publishes, '
    'and the one a portfolio committee quotes back.';

-- ---------------------------------------------------------------------------
-- 6. Workforce counts stop defaulting to zero
--
-- V1 declared these NOT NULL DEFAULT 0, which means an entity that never captured its workforce
-- composition reads back as an entity with no women on staff and nobody with a disability. That
-- is not a harmless default, it is a false statement about real people at a named organisation,
-- and under POPIA it is the one part of this system holding anything close to personal
-- information. Null now means not captured, and the surfaces render it as "not reported".
-- ---------------------------------------------------------------------------

alter table workforce_stat
    alter column headcount        drop not null,
    alter column jobs_created     drop not null,
    alter column female_count     drop not null,
    alter column male_count       drop not null,
    alter column youth_count      drop not null,
    alter column disability_count drop not null;

alter table workforce_stat
    alter column headcount        drop default,
    alter column jobs_created     drop default,
    alter column female_count     drop default,
    alter column male_count       drop default,
    alter column youth_count      drop default,
    alter column disability_count drop default;

comment on table workforce_stat is
    'Null in any count means not captured. It does not mean zero. Do not coalesce these to 0 in a '
    'query and do not render a null as a figure.';
