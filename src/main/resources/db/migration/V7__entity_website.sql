-- The entity's own public website, for the citizen surface.
--
-- Vuka holds one thing about a funded body: what it was given and what it reported against it.
-- A citizen who has read that page and wants to know what is actually on at the museum has, up
-- to now, had nowhere to go from it. This column is the way out of the page to the body itself.
--
-- Nullable on purpose, and left null rather than guessed. The citizen page omits the link where
-- there is no address, because a wrong address on a named national institution sends a reader
-- to somebody else's domain under a government masthead.

alter table public_entity
    add column website varchar(500);

comment on column public_entity.website is
    'The body''s own public website, shown as a link on the citizen page. Null where no address '
    'is on record, and the page then shows no link. Loaded from data/dsac-entities.csv, which is '
    'the one column in that file not taken from a published Treasury or Auditor-General document.';
