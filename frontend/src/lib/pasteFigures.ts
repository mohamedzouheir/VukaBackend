/*
 * Reads what a reporter copied out of their own spreadsheet into figures for the confirmation
 * screen. Nothing here writes anything: the figures land in the boxes, and the reporter still
 * confirms them, which is what puts their name on the result.
 *
 * Two shapes are accepted and nothing else is guessed at:
 *
 *   one column of figures, filled into the rows in the order the screen shows them
 *   two columns, an indicator code and a figure, matched by code whatever the order
 *
 * Anything wider is refused with a sentence, because picking "the number" out of a row that also
 * holds the annual target and four quarterly targets is how a target gets filed as an actual.
 */
import { matchIndicator } from './evidenceMatch';

/**
 * A figure as a spreadsheet writes it, as the number input expects it. Spaces are thousands
 * separators here ("1 234"), a lone comma followed by three digits is too ("1,234"), and any
 * other lone comma is the decimal comma ("12,5"). Null for a blank or a dash; undefined for
 * something that is not a number at all.
 */
export function normaliseFigure(cell: string): string | null | undefined {
  let s = cell.replace(/[\s  ]/g, '');
  if (s === '' || s === '-' || s === '–') return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return s !== '' && !Number.isNaN(Number(s)) ? s : undefined;
}

export type Pasted<T> =
  | { kind: 'column'; figures: (string | null | undefined)[] }
  | { kind: 'byCode'; matches: { row: T; figure: string | null | undefined }[]; unmatched: number }
  | { kind: 'refused'; reason: string };

export function readPaste<T extends { indicatorRef: string }>(text: string, rows: T[]): Pasted<T> {
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  const cells = lines.map((l) => l.split('\t'));

  // One column copied down, or one row of figures copied across: either way a list of figures.
  // A row across is taken only when every cell in it is a figure, because a row that also holds
  // a code and a name is a row of the template, and its numbers are targets.
  if (cells.every((c) => c.length === 1)) return { kind: 'column', figures: cells.map((c) => normaliseFigure(c[0])) };
  if (cells.length === 1 && cells[0].every((c) => normaliseFigure(c) !== undefined)) {
    return { kind: 'column', figures: cells[0].map(normaliseFigure) };
  }

  if (cells.every((c) => c.length === 2)) {
    const matches: { row: T; figure: string | null | undefined }[] = [];
    let unmatched = 0;
    for (const [code, figure] of cells) {
      const row = matchIndicator(code.trim(), rows).row;
      if (row) matches.push({ row, figure: normaliseFigure(figure) });
      else unmatched++;
    }
    if (matches.length > 0) return { kind: 'byCode', matches, unmatched };
  }

  return {
    kind: 'refused',
    reason:
      'Nothing was filled in. Copy one column of figures, or two columns: the indicator code and '
      + 'the figure. A wider selection also holds targets, and a target filed as a result is '
      + 'worse than a gap.',
  };
}
