-- V3. Evidence points at the target it supports.
--
-- The known-limitations section of the README said this out loud, and it was the honest thing to
-- say rather than the right thing to ship:
--
--     Evidence-to-target linking in the export falls back to a filename convention where an
--     extraction row does not carry the link. Good enough to demonstrate, not good enough to ship.
--
-- A filename convention is not a link. It fails the moment somebody uploads "scan001.pdf", and it
-- fails silently, which is the worst way for an accountability chain to fail. The whole claim this
-- product makes is that a reported figure carries the document behind it, so the join that carries
-- that claim belongs in the schema as a foreign key.
--
-- The column is nullable on purpose. A reporting template or an annual report is evidence about the
-- filing as a whole and is not attached to any one indicator, and forcing a target onto those rows
-- would mean inventing a link rather than recording one.

alter table document_record
    add column target_id uuid references target(id);

comment on column document_record.target_id is
    'The target this document is offered as evidence for. Null where the document belongs to the '
    'filing as a whole, such as the uploaded reporting template. A null here means not attached to '
    'an indicator; it never means the indicator has no evidence, which is a different question '
    'answered by the absence of any row.';

-- The reviewer's screen asks "what is attached to this target" once per indicator per submission,
-- which is roughly twenty questions per entity per quarter and twenty eight entities a quarter.
create index idx_document_record_target on document_record(target_id);
