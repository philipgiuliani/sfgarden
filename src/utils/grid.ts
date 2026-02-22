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
 * Validates that all coordinate labels are within the given grid bounds.
 * Throws on the first invalid label.
 */
export function validateLabels(labels: string[], cols: number, rows: number): void {
  for (const label of labels) {
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
        `Column "${match[1]}" is out of range for this grid (A–${colToLetter(cols)}).`,
      );
    }
    if (row < 1 || row > rows) {
      throw new Error(
        `Row ${row} is out of range for this grid (1–${rows}).`,
      );
    }
  }
}
