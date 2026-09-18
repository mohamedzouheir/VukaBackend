-- V5. Workspaces, document version control, and the Microsoft 365 side of them.
--
-- Requirement (d) of the challenge asks for workspaces that "seamlessly integrate with Microsoft
-- Technologies, have version control of documents triggered at save/upload, [allow] comments
-- visible on screen in real time, allow for setting of specific tasks internally and externally
-- ... [and] indicate approval on receipt of upload". V1 gave document_record a bare integer
-- version column and nothing to hang a version chain on, which is the same mistake target had
-- before V2: a counter tells you a thing changed and not what it changed from.
--
-- Four ideas in this migration.
--
--   1. A document has a KEY and a chain of VERSIONS. The key is the file's path inside the
--      entity's workspace, so the same file arriving from a phone, from the API or from a save
--      in SharePoint lands on the same chain rather than making three unrelated rows.
--
--   2. A version is never edited or deleted. A new upload writes a new row and stamps
--      superseded_on on the one it replaces, so the current version is the one never superseded.
--      This is the target versioning idiom from V2, applied to evidence.
--
--   3. Receipt and approval are different events and are stored separately. A receipt is
--      automatic, carries the content hash, and answers "did it arrive". An approval is a named
--      DSAC officer deciding, and answers "is it accepted". Collapsing them would let an
--      automatic acknowledgement read as a departmental decision.
--
--   4. The Microsoft columns record what happened with Graph rather than assuming it worked.
--      A deployment with no tenant configured is a normal deployment, and the sync state says
--      so rather than leaving null to mean four different things.

-- ---------------------------------------------------------------------------
-- 1. The workspace itself
-- ---------------------------------------------------------------------------

create table entity_workspace (
    id                 uuid primary key,
    entity_id          uuid not null unique references public_entity (id),
    -- Microsoft Graph drive id for the SharePoint document library or OneDrive backing this
    -- workspace. Null means the workspace exists in Vuka only, which is a supported state.
    drive_id           varchar(200),
    -- Folder inside that drive, relative to its root, without leading or trailing slashes.
    folder_path        varchar(500),
    -- Graph's delta cursor. Opaque, long, and the whole reason a save made in Teams or in the
    -- browser version of Excel becomes a version here without anyone uploading anything.
    delta_link         text,
    last_synced_at     timestamptz,
    last_sync_error    varchar(1000),
    -- Incoming webhook for the entity's Teams channel, where the deadline countdown lands.
    -- A capability URL: whoever holds it can post to that channel, so it is written but never
    -- read back over the API.
    teams_webhook_url  varchar(1000),
    created_at         timestamptz not null
);

comment on table entity_workspace is
    'One workspace per public entity. Binds the entity to a Microsoft 365 drive and folder where '
    'one is configured. Absent or with a null drive_id, the workspace still works and documents '
    'live only in Vuka.';

comment on column entity_workspace.delta_link is
    'Microsoft Graph delta cursor for the bound drive. Stored rather than recomputed because a '
    'full enumeration on every poll would re-read every file in the library.';

-- ---------------------------------------------------------------------------
-- 2. Document versioning
-- ---------------------------------------------------------------------------

alter table document_record
    add column document_key    varchar(500),
    add column content_type    varchar(200),
    add column supersedes_id   uuid references document_record (id),
    add column superseded_on   timestamptz,
    add column source          varchar(40),
    add column receipt_number  varchar(60),
    add column received_at     timestamptz,
    add column decided_by_uid  varchar(128),
    add column decided_by_name varchar(200),
    add column decided_at      timestamptz,
    add column decision_note   varchar(2000);

comment on column document_record.document_key is
    'Path of the document inside the entity workspace, e.g. ANNUAL_REPORT/annual-report-2025.pdf. '
    'The version chain is per key, so re-uploading the same document supersedes it rather than '
    'creating a second unrelated document.';

comment on column document_record.superseded_on is
    'Null on the version in force. Set when a newer version arrives. Rows are never updated '
    'otherwise and never deleted: the file a reviewer saw in March is still readable in October.';

comment on column document_record.received_at is
    'When Vuka took custody of the bytes. With content_hash this is the receipt, and it is '
    'automatic. It is not a departmental decision and the interface must not present it as one.';

comment on column document_record.decided_at is
    'When a named DSAC officer approved or rejected this version. Null means nobody has looked '
    'at it yet, which is different from rejected and is shown differently.';

-- ---------------------------------------------------------------------------
-- 3. Microsoft Graph provenance
-- ---------------------------------------------------------------------------

alter table document_record
    add column graph_drive_id      varchar(200),
    add column graph_item_id       varchar(255),
    add column graph_version_label varchar(50),
    add column graph_web_url       varchar(1000),
    add column graph_synced_at     timestamptz,
    add column graph_sync_state    varchar(30),
    add column graph_sync_error    varchar(1000);

comment on column document_record.graph_sync_state is
    'NOT_CONFIGURED (no tenant bound), PENDING (queued for mirroring), SYNCED, FAILED, or '
    'SOURCE (the bytes came from Microsoft 365 in the first place and there is nothing to push '
    'back). Null would have had to mean all five.';

comment on column document_record.graph_version_label is
    'SharePoint''s own version label for the mirrored file, such as 3.0. Kept beside Vuka''s '
    'integer version so a reviewer looking at the document library and a reviewer looking at '
    'Vuka can establish they are discussing the same bytes.';

-- ---------------------------------------------------------------------------
-- 4. Backfill, then the invariants
--
-- Existing rows predate the key. Their key is derived from what they do carry, and evidence rows
-- that V3 linked to a target keep that target and its criterion in the key, because one file
-- offered against two indicators, or for two of the Auditor-General's tests, is two claims and
-- has to stay two documents rather than collapse into one version chain. Then, for each
-- key, every row but the newest is marked superseded, because that is what the version numbers
-- already said and the partial unique index below is about to start enforcing.
-- ---------------------------------------------------------------------------

update document_record
   set document_key = case
           when target_id is not null
               then 'EVIDENCE/' || target_id::text || '/' || coalesce(agsa_criterion, 'UNTAGGED')
                    || '/' || coalesce(file_name, id::text)
           else coalesce(document_type, 'UNFILED') || '/' || coalesce(file_name, id::text)
       end,
       source       = 'VUKA_UPLOAD',
       content_type = 'application/octet-stream',
       received_at  = uploaded_at,
       graph_sync_state = 'NOT_CONFIGURED'
 where document_key is null;

-- now(), not the row's own upload time: we know these were superseded, and we do not know when.
update document_record d
   set superseded_on = now()
  from (select entity_id, document_key, max(version) as top
          from document_record
         group by entity_id, document_key) newest
 where d.entity_id = newest.entity_id
   and d.document_key = newest.document_key
   and d.version < newest.top;

alter table document_record
    alter column document_key set not null,
    alter column source set not null;

-- One row per version of a key, and exactly one version in force.
--
-- Both indexes are on lower(document_key) rather than on the column, because SharePoint resolves
-- paths case-insensitively. Annual Report.pdf saved in the library and annual report.pdf uploaded
-- from a phone are one document to Microsoft, and if they are two documents here then the version
-- history forks silently and the mirror writes over one of them. The key keeps its natural case
-- so the folder reads properly in SharePoint; identity ignores case.
create unique index uq_document_key_version
    on document_record (entity_id, lower(document_key), version);

-- This is the index that makes "the current version" a fact about the database rather than a
-- convention in application code.
create unique index uq_document_key_current
    on document_record (entity_id, lower(document_key))
    where superseded_on is null;

-- The reverse lookup the Microsoft poller does on every changed file.
create index idx_document_graph_item on document_record (graph_item_id)
    where graph_item_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Comments and tasks grow the few columns the workspace needs
--
-- Comments are already anchored to a target, a result or a document, which is the part that
-- mattered. What they lacked was a document reference a reader could follow without knowing
-- which anchor type they were looking at, and tasks had no creation time, so "set a task" could
-- not be distinguished from "task imported with the seed" in any audit of who asked for what.
-- ---------------------------------------------------------------------------

alter table task_item
    add column title        varchar(300),
    add column created_at   timestamptz,
    add column completed_at timestamptz,
    add column created_by_name varchar(200),
    add column document_id  uuid references document_record (id);

update task_item set created_at = now() where created_at is null;

alter table task_item
    alter column created_at set not null;

comment on column task_item.is_external is
    'True when the task was set across the departmental boundary: DSAC asking an entity, or an '
    'entity asking DSAC. The challenge asks for tasks to be set "internally and externally (up or '
    'down in the operations process)" and this column is the only thing that distinguishes them.';

create index idx_task_entity_status on task_item (entity_id, status);
create index idx_comment_anchor on comment (anchor_id, created_at);
