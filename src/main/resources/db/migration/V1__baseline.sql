-- Vuka baseline schema.
--
-- The accountability chain is the foreign keys:
--   allocation -> target -> target_result -> extraction_result/document_record
-- Unit cost and every risk signal are queries across that path, which is why this
-- is a relational schema rather than a document store.

create extension if not exists "pgcrypto";

create table financial_year (
    id                  uuid primary key,
    label               varchar(20)  not null,
    start_date          date,
    end_date            date,
    is_current          boolean      not null default false
);

create table public_entity (
    id                  uuid primary key,
    name                varchar(500) not null,
    short_name          varchar(100),
    entity_type         varchar(40),
    sector              varchar(40),
    size_band           varchar(40),
    mandate             varchar(2000),
    contact_name        varchar(200),
    contact_email       varchar(200),
    publicly_visible    boolean      not null default false
);

create table reporting_period (
    id                  uuid primary key,
    financial_year_id   uuid references financial_year(id),
    label               varchar(50)  not null,
    quarter             integer,
    period_start        date,
    period_end          date,
    submission_due_date date,
    regulatory_deadline date
);

create table allocation (
    id                  uuid primary key,
    entity_id           uuid references public_entity(id),
    financial_year_id   uuid references financial_year(id),
    programme           varchar(500),
    amount              numeric(18,2),
    date_approved       date
);

create table target (
    id                  uuid primary key,
    entity_id           uuid references public_entity(id),
    financial_year_id   uuid references financial_year(id),
    allocation_id       uuid references allocation(id),
    indicator_ref       varchar(50),
    outcome_statement   varchar(1000),
    output_statement    varchar(1000),
    indicator           varchar(1000),
    unit_of_measure     varchar(200),
    baseline            numeric(18,2),
    annual_target       numeric(18,2),
    q1_target           numeric(18,2),
    q2_target           numeric(18,2),
    q3_target           numeric(18,2),
    q4_target           numeric(18,2),
    planned_unit_cost   numeric(18,2),
    revision_count      integer      not null default 0
);

create table submission (
    id                  uuid primary key,
    entity_id           uuid references public_entity(id),
    reporting_period_id uuid references reporting_period(id),
    status              varchar(40),
    channel             varchar(40),
    submitted_at        timestamptz,
    submitted_by_uid    varchar(128),
    submitted_by_name   varchar(200),
    reviewed_by_uid     varchar(128),
    reviewed_at         timestamptz,
    return_reason       varchar(2000),
    created_at          timestamptz  not null
);

-- Confirmed performance data. There is no update path to this table anywhere in the
-- application: a disputed figure is corrected by returning the submission, which
-- leaves the original row and its author intact.
create table target_result (
    id                  uuid primary key,
    target_id           uuid references target(id),
    submission_id       uuid references submission(id),
    indicator_ref       varchar(50),
    actual_value        numeric(18,2),
    quarter_target      numeric(18,2),
    variance            numeric(18,2),
    variance_explanation varchar(2000),
    spend_to_date       numeric(18,2),
    actual_unit_cost    numeric(18,2),
    status              varchar(40),
    confirmed_by_uid    varchar(128) not null,
    confirmed_by_name   varchar(200),
    confirmed_at        timestamptz  not null
);

create table document_record (
    id                  uuid primary key,
    entity_id           uuid references public_entity(id),
    submission_id       uuid references submission(id),
    document_type       varchar(60),
    file_name           varchar(500),
    storage_path        varchar(1000),
    size_bytes          bigint,
    version             integer      not null default 1,
    uploaded_by_uid     varchar(128),
    uploaded_at         timestamptz,
    approval_status     varchar(40)
);

-- Machine output, awaiting a human. Separate from target_result on purpose: that
-- separation is what makes human-in-the-loop structural rather than a claim.
create table extraction_result (
    id                  uuid primary key,
    submission_id       uuid references submission(id),
    document_record_id  uuid references document_record(id),
    target_id           uuid references target(id),
    indicator_ref       varchar(50),
    field_name          varchar(100),
    extracted_value     varchar(2000),
    source_location     varchar(200),
    confidence          numeric(5,4),
    is_confirmed        boolean      not null default false,
    needs_manual_match  boolean      not null default false
);

create table risk_score (
    id                  uuid primary key,
    entity_id           uuid references public_entity(id),
    reporting_period_id uuid references reporting_period(id),
    score               numeric(18,4),
    band                varchar(40),
    previous_score      numeric(18,4),
    computed_at         timestamptz  not null
);

create table risk_signal (
    id                  uuid primary key,
    risk_score_id       uuid references risk_score(id) on delete cascade,
    type                varchar(60),
    value               numeric(18,4),
    normalised          numeric(18,4),
    weight              numeric(18,4),
    contribution        numeric(18,4),
    description         varchar(500)
);

create table audit_finding (
    id                  uuid primary key,
    entity_id           uuid references public_entity(id),
    financial_year_id   uuid references financial_year(id),
    outcome             varchar(60),
    description         varchar(2000),
    is_repeat_finding   boolean      not null default false,
    resolution_status   varchar(40)
);

-- Aggregate only. The system holds no individual staff records, which is what
-- keeps the POPIA answer short.
create table workforce_stat (
    id                  uuid primary key,
    entity_id           uuid references public_entity(id),
    reporting_period_id uuid references reporting_period(id),
    headcount           integer      not null default 0,
    jobs_created        integer      not null default 0,
    female_count        integer      not null default 0,
    male_count          integer      not null default 0,
    youth_count         integer      not null default 0,
    disability_count    integer      not null default 0
);

create table comment (
    id                  uuid primary key,
    entity_id           uuid references public_entity(id),
    anchor_type         varchar(40),
    anchor_id           uuid,
    parent_id           uuid,
    author_uid          varchar(128),
    author_name         varchar(200),
    author_role         varchar(40),
    body                varchar(4000),
    is_resolved         boolean      not null default false,
    created_at          timestamptz  not null
);

create table task_item (
    id                  uuid primary key,
    entity_id           uuid references public_entity(id),
    submission_id       uuid references submission(id),
    assigned_to_uid     varchar(128),
    assigned_to_name    varchar(200),
    assigned_by_uid     varchar(128),
    description         varchar(2000),
    due_date            date,
    status              varchar(40),
    is_external         boolean      not null default false
);

create table user_profile (
    id                  uuid primary key,
    uid                 varchar(128) not null unique,
    email               varchar(200),
    display_name        varchar(200),
    role                varchar(40),
    entity_id           uuid references public_entity(id)
);

-- Indexes on the paths the dashboard actually walks.
create index idx_target_entity_year      on target(entity_id, financial_year_id);
create index idx_submission_entity       on submission(entity_id);
create index idx_result_submission       on target_result(submission_id);
create index idx_extraction_submission   on extraction_result(submission_id);
create index idx_risk_period_score       on risk_score(reporting_period_id, score desc);
create index idx_document_entity         on document_record(entity_id);
