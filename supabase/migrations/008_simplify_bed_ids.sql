-- Simplify garden IDs to a single uppercase letter.
-- The last character of the garden name is used as the new id (uppercased).
-- Example: name 'Hochbeet N' → 'N', name 'Hochbeet H' → 'H'
--
-- When users write "HA1", it means garden H, square A1.

-- 1. Drop FK constraints referencing gardens(id)
ALTER TABLE plantings DROP CONSTRAINT plantings_garden_id_fkey;
ALTER TABLE notes DROP CONSTRAINT notes_garden_id_fkey;

-- 2. Build old → new mapping (derive new ID from the last character of the name)
CREATE TEMP TABLE _garden_id_map AS
SELECT id AS old_id, upper(right(name, 1)) AS new_id FROM gardens;

-- 3. Update child tables
UPDATE plantings p
SET garden_id = m.new_id
FROM _garden_id_map m
WHERE p.garden_id = m.old_id;

UPDATE notes n
SET garden_id = m.new_id
FROM _garden_id_map m
WHERE n.garden_id = m.old_id;

-- 4. Update gardens
UPDATE gardens g
SET id = m.new_id
FROM _garden_id_map m
WHERE g.id = m.old_id;

-- 4b. Remove gardens whose names do not end with a letter and therefore could
--     not be mapped to a single uppercase ID (e.g. names ending in a digit).
DELETE FROM gardens WHERE id !~ '^[A-Z]$';

DROP TABLE _garden_id_map;

-- 5. Remove UUID default — IDs are now user-assigned single letters
ALTER TABLE gardens ALTER COLUMN id DROP DEFAULT;

-- 6. Enforce single uppercase letter
ALTER TABLE gardens ADD CONSTRAINT gardens_id_single_letter CHECK (id ~ '^[A-Z]$');

-- 7. Re-add FK constraints
ALTER TABLE plantings
  ADD CONSTRAINT plantings_garden_id_fkey
  FOREIGN KEY (garden_id) REFERENCES gardens(id) ON DELETE CASCADE;

ALTER TABLE notes
  ADD CONSTRAINT notes_garden_id_fkey
  FOREIGN KEY (garden_id) REFERENCES gardens(id) ON DELETE CASCADE;
