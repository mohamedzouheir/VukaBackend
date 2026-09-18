-- V6. Live commenting.
--
-- Touches only the comment table, which V1 created, so it depends on nothing after V1 and is
-- numbered last simply so that it runs last.
--
-- Requirement (d) asks for "the ability to allow comments and have comments visible on screen in
-- real time". V1 created the comment table. This migration adds what turns a table of rows into
-- a thread a client can watch, and records who closed a point.
--
-- The position on "real time", stated here because the schema is where it is enforced rather than
-- where it is decided: Vuka does not open a websocket. A reviewer disputing a figure and a
-- reporter answering are seconds apart at worst, and a five second poll that transfers nothing
-- when nothing changed is indistinguishable from a socket at that cadence, on a phone, on mobile
-- data. What a socket would buy is a live cursor. What the department needs is the comment
-- attached to the figure being disputed, which is the anchor columns V1 already had.
--
-- Two ideas here.
--
--   1. updated_at, so a poll can be answered without reading any rows. A comment is never edited
--      and never deleted, so (count, max(updated_at)) over a thread changes if and only if the
--      thread changed, and that pair is the whole validator. An append-only table is what makes
--      that sound: with deletes in the picture a count could return to a value it already had.
--
--   2. Resolution is attributed. is_resolved on its own says a dispute is closed and not who
--      closed it, and a dispute between a department and the body it funds is exactly the kind
--      of thing both sides later remember differently.

alter table comment
    add column updated_at       timestamptz,
    add column resolved_by_uid  varchar(128),
    add column resolved_by_name varchar(200),
    add column resolved_at      timestamptz;

update comment set updated_at = created_at where updated_at is null;
update comment set body = '' where body is null;

alter table comment
    alter column updated_at set not null,
    alter column body set not null;

comment on column comment.updated_at is
    'Creation time, then the time is_resolved last flipped. The only column on this table that '
    'ever changes after insert, and it exists so that a poll can be answered from an aggregate '
    'rather than by reading the thread.';

comment on column comment.resolved_at is
    'When the point was closed, beside who closed it. Null while the point is open.';

-- The digest query behind every poll: count and max(updated_at) for one entity. Also the
-- workspace listing, which is the same rows ordered by that column.
create index idx_comment_entity_updated on comment (entity_id, updated_at desc);

-- V5 indexes (anchor_id, created_at), which is what a single thread reads.
