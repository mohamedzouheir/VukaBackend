/*
 * Reads a file name for the two things the evidence drawer otherwise asks for by hand: which
 * indicator the file supports, and which part of the Auditor-General's reliability test it meets.
 *
 * Both are guesses offered for confirmation, never written on their own. A reporter dropping a
 * quarter's evidence sees every guess in one table and corrects the few that are wrong, which is
 * the difference between forty trips through a dialog and one look down a list.
 */

export type Criterion = 'VALIDITY' | 'ACCURACY' | 'COMPLETENESS';

export const RELIABILITY: { key: Criterion; label: string; text: string }[] = [
  { key: 'VALIDITY', label: 'Validity', text: 'The reported figure actually occurred and relates to this entity.' },
  { key: 'ACCURACY', label: 'Accuracy', text: 'The amounts and quantities are recorded correctly.' },
  { key: 'COMPLETENESS', label: 'Completeness', text: 'Everything that should have been recorded was.' },
];

/**
 * The pattern for one indicator code. "HER-1.1" matches "HER-1.1", "her 1.1", "HER_1_1" and
 * "HER1.1", but not "HER-1.10" or "HER-1.1.2", which are other indicators. Letters may run
 * straight into digits; two numbers need something between them, or "HER-11" would pass for
 * "HER-1.1".
 */
function patternFor(ref: string): RegExp | null {
  const groups = ref.match(/[A-Za-z]+|\d+/g);
  if (!groups) return null;
  let body = groups[0];
  for (let i = 1; i < groups.length; i++) {
    const bothDigits = /\d/.test(groups[i - 1]) && /\d/.test(groups[i]);
    body += (bothDigits ? '[\\s._-]+' : '[\\s._-]*') + groups[i];
  }
  return new RegExp('(?<![A-Za-z0-9])' + body + '(?![A-Za-z0-9]|\\.\\d)', 'i');
}

export interface IndicatorMatch<T> {
  /** The one indicator named, or null where none is, or where more than one is. */
  row: T | null;
  /** Every indicator the name mentions. More than one means the reporter has to choose. */
  candidates: T[];
}

export function matchIndicator<T extends { indicatorRef: string }>(fileName: string, rows: T[]): IndicatorMatch<T> {
  const candidates = rows.filter((r) => patternFor(r.indicatorRef)?.test(fileName));
  return { row: candidates.length === 1 ? candidates[0] : null, candidates };
}

/*
 * Checked in this order, and the first hit wins, because the kinds overlap: a signed attendance
 * register is a register, but what it proves is that the event happened, which is validity.
 */
const KEYWORDS: [Criterion, RegExp][] = [
  ['VALIDITY', /attendance|signed|signature|invoice|receipt|photo|certificate|minutes|contract|proof/i],
  ['ACCURACY', /reconcil|\brecon\b|calculation|ledger|statement|verification|audit trail/i],
  ['COMPLETENESS', /register|extract|listing|inventory|schedule|database|export/i],
];

export function guessCriterion(fileName: string): Criterion | null {
  for (const [criterion, pattern] of KEYWORDS) {
    if (pattern.test(fileName)) return criterion;
  }
  return null;
}
