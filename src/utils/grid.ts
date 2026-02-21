/**
 * Parses a grid size string like "4x4" or "3x6" into { cols, rows }.
 */
export function parseGridSize(size: string): { cols: number; rows: number } {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) {
    throw new Error(`Invalid grid size format: "${size}". Expected COLSxROWS (e.g. "4x4").`);
  }
  return { cols: parseInt(match[1], 10), rows: parseInt(match[2], 10) };
}

/**
 * Returns total number of squares in a grid.
 */
export function totalSquares(size: string): number {
  const { cols, rows } = parseGridSize(size);
  return cols * rows;
}

/**
 * Converts a 1-based column index to a letter label (1→"A", 26→"Z", 27→"AA", …).
 */
export function colToLetter(col: number): string {
  let label = "";
  while (col > 0) {
    const rem = (col - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    col = Math.floor((col - 1) / 26);
  }
  return label;
}

/**
 * Converts a column letter label back to a 1-based column index ("A"→1, "Z"→26, "AA"→27, …).
 * Returns NaN if the input is not a valid letter string.
 */
export function letterToCol(letter: string): number {
  const upper = letter.toUpperCase();
  if (!/^[A-Z]+$/.test(upper)) return NaN;
  let col = 0;
  for (const ch of upper) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return col;
}

/**
 * Converts a 1-based square number to an alphanumeric coordinate label like "A1".
 * Columns are letters (X axis), rows are numbers (Y axis).
 * Square 1 is top-left (A1), numbered left-to-right then top-to-bottom.
 */
export function squareToLabel(square: number, size: string): string {
  const { cols, rows } = parseGridSize(size);
  const total = cols * rows;

  if (square < 1 || square > total) {
    throw new Error(
      `Square ${square} is out of range for a ${size} grid (1-${total}).`,
    );
  }

  const row = Math.ceil(square / cols);
  const col = ((square - 1) % cols) + 1;
  return `${colToLetter(col)}${row}`;
}

/**
 * Parses an alphanumeric coordinate label like "A1" or "B3" into a 1-based square number.
 * Validates that the coordinate is within the grid bounds.
 */
export function labelToSquare(label: string, size: string): number {
  const { cols, rows } = parseGridSize(size);
  const match = label.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);

  if (!match) {
    throw new Error(
      `Invalid coordinate "${label}". Expected format like "A1" or "B3" (letter column, number row).`,
    );
  }

  const col = letterToCol(match[1]);
  const row = parseInt(match[2], 10);

  if (col < 1 || col > cols) {
    throw new Error(
      `Column "${match[1]}" is out of range for a ${size} grid (A–${colToLetter(cols)}).`,
    );
  }
  if (row < 1 || row > rows) {
    throw new Error(
      `Row ${row} is out of range for a ${size} grid (1–${rows}).`,
    );
  }

  return (row - 1) * cols + col;
}

/**
 * Validates that all coordinate labels are valid for the given grid size.
 */
export function validateLabels(labels: string[], size: string): void {
  for (const label of labels) {
    labelToSquare(label, size); // throws on invalid
  }
}

/**
 * Converts a 1-based square number to (row, col) coordinates.
 * Square 1 is top-left, numbered left-to-right then top-to-bottom.
 */
export function squareToCoords(
  square: number,
  size: string,
): { row: number; col: number } {
  const { cols, rows } = parseGridSize(size);
  const total = cols * rows;

  if (square < 1 || square > total) {
    throw new Error(
      `Square ${square} is out of range for a ${size} grid (1-${total}).`,
    );
  }

  const row = Math.ceil(square / cols);
  const col = ((square - 1) % cols) + 1;
  return { row, col };
}

/**
 * Converts (row, col) coordinates to a 1-based square number.
 */
export function coordsToSquare(
  row: number,
  col: number,
  size: string,
): number {
  const { cols, rows } = parseGridSize(size);

  if (row < 1 || row > rows || col < 1 || col > cols) {
    throw new Error(
      `Coordinates (${row}, ${col}) are out of range for a ${size} grid.`,
    );
  }

  return (row - 1) * cols + col;
}

/**
 * Validates that all square numbers are valid for the given grid size.
 */
export function validateSquares(squares: number[], size: string): void {
  const total = totalSquares(size);
  for (const sq of squares) {
    if (sq < 1 || sq > total) {
      throw new Error(
        `Square ${sq} is out of range for a ${size} grid (1-${total}).`,
      );
    }
  }
}
