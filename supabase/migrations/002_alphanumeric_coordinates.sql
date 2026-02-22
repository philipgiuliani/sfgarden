-- Migrate plantings.square and notes.square from integer to alphanumeric
-- coordinate labels (e.g. 5 in a 4x4 garden → "A2").
--
-- Column letter is derived via chr(64 + col_num) which covers A–Z (cols 1–26),
-- sufficient for any practical square-foot garden size.

-- plantings.square: integer NOT NULL → text NOT NULL
ALTER TABLE plantings ADD COLUMN square_label text;

UPDATE plantings p
SET square_label = (
  SELECT
    chr(64 + ((p.square - 1) % split_part(g.size, 'x', 1)::integer) + 1)
    || ceil(p.square::float / split_part(g.size, 'x', 1)::integer)::integer::text
  FROM gardens g
  WHERE g.id = p.garden_id
);

ALTER TABLE plantings ALTER COLUMN square_label SET NOT NULL;
ALTER TABLE plantings DROP COLUMN square;
ALTER TABLE plantings RENAME COLUMN square_label TO square;

-- notes.square: integer (nullable) → text (nullable)
ALTER TABLE notes ADD COLUMN square_label text;

UPDATE notes n
SET square_label = (
  SELECT
    chr(64 + ((n.square - 1) % split_part(g.size, 'x', 1)::integer) + 1)
    || ceil(n.square::float / split_part(g.size, 'x', 1)::integer)::integer::text
  FROM gardens g
  WHERE g.id = n.garden_id
)
WHERE n.square IS NOT NULL;

ALTER TABLE notes DROP COLUMN square;
ALTER TABLE notes RENAME COLUMN square_label TO square;
