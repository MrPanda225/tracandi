import { foldText } from './text.js';

/** A point of a period: a year, and a month when the CV gives one. */
export interface DatePoint {
  y: number;
  m?: number;
}
/** The period a CV writes: its start, and its end — a point, `'open'` when it goes on, `null` when none is written. */
export interface DatePeriod {
  start: DatePoint;
  end: DatePoint | 'open' | null;
}
/** A period found in a text, with where it is. */
export interface DateSpan {
  period: DatePeriod;
  start: number;
  end: number;
}

const MONTHS: Readonly<Record<string, number>> = {
  janvier: 1, janv: 1, jan: 1, january: 1,
  fevrier: 2, fevr: 2, fev: 2, feb: 2, february: 2,
  mars: 3, mar: 3, march: 3,
  avril: 4, avr: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juillet: 7, juil: 7, jul: 7, july: 7,
  aout: 8, aug: 8, august: 8,
  septembre: 9, sept: 9, sep: 9, september: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  decembre: 12, dec: 12, december: 12,
};
const MONTH_NUMBER_MAX = 12;

// One date, an open end, in this order of preference; « Sept. 2021 », « 09/2021 », « 2021 », « présent ».
const ATOM = new RegExp(
  [
    '(?<![\\p{L}\\p{N}])(?:',
    '(\\p{L}{3,9})\\.?\\s*(\\d{4})(?!\\d)', // 1, 2: month name, year
    '|(\\d{1,2})\\s*[/.-]\\s*(\\d{4})(?!\\d)', // 3, 4: month number, year
    '|(\\d{4})(?!\\d)', // 5: year
    '|(en\\s+cours|à\\s+ce\\s+jour|aujourd[\'’]?hui|pr[ée]sent|actuel(?:le)?|now|current|today)(?![\\p{L}\\p{N}])', // 6: open
    ')',
  ].join(''),
  'giu',
);
const BETWEEN = /^[\s\-–—−→]*(?:to|a|au|jusqu['’]?a)?[\s\-–—−→]*$/u;

interface Atom {
  point: DatePoint | 'open';
  start: number;
  end: number;
}

const atomsOf = (text: string): Atom[] => {
  const atoms: Atom[] = [];
  const pattern = new RegExp(ATOM.source, ATOM.flags);
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const [whole, word, wordYear, monthNumber, numberYear, year, open] = match;
    const start = match.index;
    const end = start + whole.length;
    if (word !== undefined && wordYear !== undefined) {
      const month = MONTHS[foldText(word)];
      if (month === undefined) {
        // Not a month (« Développeur 2021 »): the year alone is a date.
        pattern.lastIndex = start + word.length;
        continue;
      }
      atoms.push({ point: { y: Number(wordYear), m: month }, start, end });
    } else if (monthNumber !== undefined && numberYear !== undefined) {
      const month = Number(monthNumber);
      if (month < 1 || month > MONTH_NUMBER_MAX) continue;
      atoms.push({ point: { y: Number(numberYear), m: month }, start, end });
    } else if (year !== undefined) atoms.push({ point: { y: Number(year) }, start, end });
    else if (open !== undefined) atoms.push({ point: 'open', start, end });
  }
  return atoms;
};

const toPeriod = (first: Atom, second?: Atom): DatePeriod | null => {
  if (first.point === 'open') return null;
  return { start: first.point, end: second ? second.point : null };
};

/**
 * Every period written in a text — « Sept. 2021 – Présent », « 09/2021 - 06/2023 », « 2019 », « Jan 2020 to now » —
 * ranges first, then single dates. A period is read the same whatever the language, the abbreviation or the separator.
 * @req EF-CVX-46
 */
export const datePeriodsIn = (text: string): DateSpan[] => {
  const atoms = atomsOf(text);
  const ranges: DateSpan[] = [];
  const singles: DateSpan[] = [];
  atoms.forEach((atom, index) => {
    const next = atoms[index + 1];
    if (next && BETWEEN.test(foldText(text.slice(atom.end, next.start)))) {
      const period = toPeriod(atom, next);
      if (period) ranges.push({ period, start: atom.start, end: next.end });
    }
    const alone = toPeriod(atom);
    if (alone) singles.push({ period: alone, start: atom.start, end: atom.end });
  });
  return [...ranges, ...singles];
};

/** The period a text states as a whole (its first one), or null when it does not state one. */
export const parseDatePeriod = (text: string): DatePeriod | null => datePeriodsIn(text)[0]?.period ?? null;

const samePoint = (a: DatePoint, b: DatePoint): boolean => a.y === b.y && a.m === b.m;

/** Whether two periods start and end at the same moments. */
export const samePeriod = (a: DatePeriod, b: DatePeriod): boolean => {
  if (!samePoint(a.start, b.start)) return false;
  if (a.end === null || b.end === null) return a.end === b.end;
  if (a.end === 'open' || b.end === 'open') return a.end === b.end;
  return samePoint(a.end, b.end);
};
