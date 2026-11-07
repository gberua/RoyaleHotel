-- The starting cancellation policy had its last heading run into the sentence before it
-- (". ## How to cancel"), so the website printed "## How to cancel" as text.
-- Put any heading that follows other text on the same line onto its own paragraph; nothing else changes.
UPDATE "Policy" p
SET "body" = (
  SELECT jsonb_object_agg(e.key, regexp_replace(e.value, '([^\n]) (## )', E'\\1\n\n\\2', 'g'))
  FROM jsonb_each_text(p."body") e
)
WHERE jsonb_typeof(p."body") = 'object'
  AND EXISTS (SELECT 1 FROM jsonb_each_text(p."body") e WHERE e.value ~ '[^\n] ## ');
