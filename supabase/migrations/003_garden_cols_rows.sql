-- Replace the stringly-typed size column ("4x4") with two integer columns.

ALTER TABLE gardens ADD COLUMN cols integer;
ALTER TABLE gardens ADD COLUMN rows integer;

UPDATE gardens
SET
  cols = split_part(size, 'x', 1)::integer,
  rows = split_part(size, 'x', 2)::integer;

ALTER TABLE gardens ALTER COLUMN cols SET NOT NULL;
ALTER TABLE gardens ADD CONSTRAINT gardens_cols_positive CHECK (cols > 0);
ALTER TABLE gardens ALTER COLUMN rows SET NOT NULL;
ALTER TABLE gardens ADD CONSTRAINT gardens_rows_positive CHECK (rows > 0);

ALTER TABLE gardens DROP COLUMN size;
