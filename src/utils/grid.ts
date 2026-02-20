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
