import type { CvLine } from './cvLines.js';
import { datePeriodsIn, parseDatePeriod, samePeriod } from './datePeriods.js';
import type { CvRef, ParseCvAnswer } from './parseCvAnswer.js';
import { foldText } from './text.js';

/** A fact of the CV: `text` is the exact substring of the source, copied by the code (RG-21). */
export interface AnchoredItem {
  id: string;
  text: string;
}
export interface ParsedExperience {
  /** `exp_0`, `exp_1`… */
  id: string;
  title: string;
  organization: string | null;
  place: string | null;
  dates: string | null;
  /** Ids `exp_0.b0`… */
  bullets: AnchoredItem[];
}
export interface ParsedEducation {
  /** `edu_0`… */
  id: string;
  degree: string;
  school: string | null;
  place: string | null;
  dates: string | null;
  /** Ids `edu_0.d0`… */
  details: AnchoredItem[];
}
/** The CV as the model structured it and the code anchored it: every text is a substring of the source. */
export interface ParsedCv {
  headline: string | null;
  profile: string | null;
  experiences: ParsedExperience[];
  education: ParsedEducation[];
  /** Ids `skill_0`… */
  skills: AnchoredItem[];
  /** Ids `cert_0`… */
  certifications: AnchoredItem[];
  /** Ids `lang_0`… */
  languages: AnchoredItem[];
  /** Ids `int_0`… */
  interests: AnchoredItem[];
  /** How many references (or entries) could not be anchored and were left out; a number, never a text. */
  dropped: number;
}

/** Foreign tokens tolerated between the tokens of a reference (interleaved leftovers of a two-column layout). */
export const ANCHOR_MAX_FOREIGN_TOKENS = 2;
/** A fact is looked for on its lines and the neighbouring ones. */
const LINE_SLACK = 1;

interface Token {
  key: string;
  /** Position in the flattened tokens searched. */
  pos: number;
  /** Index in the array of lines. */
  line: number;
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}]+/gu;
const NOT_WORD = /[^\p{L}\p{N}]+/u;

/** The tokens of a text as compared: folded (case, accents, ligatures), punctuation and dashes ignored. */
export const keysOf = (text: string): string[] => foldText(text).split(NOT_WORD).filter((key) => key !== '');

const tokensOfLine = (text: string, line: number): Omit<Token, 'pos'>[] =>
  [...text.matchAll(WORD)].flatMap((match) => {
    const key = keysOf(match[0]).join('');
    return key === '' ? [] : [{ key, line, start: match.index, end: match.index + match[0].length }];
  });

/** Where `wanted` is in `tokens`: contiguous, or (when `maxGap` allows) with a few foreign tokens in between. */
const findRun = (tokens: readonly Token[], wanted: readonly string[], maxGap: number): Token[] | null => {
  const [head] = wanted;
  if (head === undefined) return null;
  for (let from = 0; from < tokens.length; from += 1) {
    if (tokens[from]?.key !== head) continue;
    const run: Token[] = [tokens[from] as Token];
    let cursor = from + 1;
    let gap = 0;
    for (let index = 1; index < wanted.length; index += 1) {
      let found = -1;
      for (let probe = cursor; probe < tokens.length && probe - cursor <= maxGap - gap; probe += 1)
        if (tokens[probe]?.key === wanted[index]) {
          found = probe;
          break;
        }
      if (found === -1) break;
      gap += found - cursor;
      run.push(tokens[found] as Token);
      cursor = found + 1;
    }
    if (run.length === wanted.length) return run;
  }
  return null;
};

/** The source text of tokens that follow each other (a fact wrapped over lines is joined with one space). */
const sourceOfGroup = (group: readonly Token[], lines: readonly CvLine[]): string => {
  const first = group[0] as Token;
  const last = group[group.length - 1] as Token;
  if (first.line === last.line) return (lines[first.line] as CvLine).text.slice(first.start, last.end);
  return lines
    .slice(first.line, last.line + 1)
    .map((line, offset) => {
      if (offset === 0) return line.text.slice(first.start);
      return first.line + offset === last.line ? line.text.slice(0, last.end) : line.text;
    })
    .join(' ');
};

/** Only the matched tokens are copied: runs of consecutive ones as in the source, joined by one space where foreign tokens were skipped. */
const sourceOf = (run: readonly Token[], lines: readonly CvLine[]): string => {
  const groups: Token[][] = [];
  for (const token of run) {
    const group = groups[groups.length - 1];
    if (group && (group[group.length - 1] as Token).pos + 1 === token.pos) group.push(token);
    else groups.push([token]);
  }
  return groups.map((group) => sourceOfGroup(group, lines)).join(' ');
};

/** The lines of the reference, with one more on each side, as indexes into the array of lines. */
const windowOf = (ref: CvRef, count: number): number[] => {
  const from = Math.max(ref.line - LINE_SLACK, 1);
  const to = Math.min(Math.max(ref.toLine ?? ref.line, ref.line) + LINE_SLACK, count);
  return Array.from({ length: Math.max(to - from + 1, 0) }, (_, offset) => from + offset - 1);
};

const alignTokens = (wanted: readonly string[], tokens: readonly Token[], lines: readonly CvLine[]): string | null => {
  const run = findRun(tokens, wanted, 0) ?? findRun(tokens, wanted, ANCHOR_MAX_FOREIGN_TOKENS);
  return run ? sourceOf(run, lines) : null;
};

/** A period written another way (« Sept. 2021 – Présent », « 09/2021 - aujourd'hui »): the source's own spelling. */
const alignPeriod = (text: string, indexes: readonly number[], lines: readonly CvLine[]): string | null => {
  const wanted = parseDatePeriod(text);
  if (!wanted) return null;
  for (const index of indexes) {
    const line = lines[index] as CvLine;
    const span = datePeriodsIn(line.text).find(({ period }) => samePeriod(period, wanted));
    if (span) return line.text.slice(span.start, span.end);
  }
  return null;
};

/**
 * The exact source text a reference points to, or null. The referenced lines (one more on each side) are searched
 * first, then the whole CV; the text of the model is only a key — what is returned is the substring of the source from
 * the first to the last token matched, in its own case, accents and spelling. For a date, a period equal to the one
 * the model wrote is also accepted. A figure the line does not carry is never found, since every token must match.
 * @req EF-CVX-46, RG-21
 */
const anchorRef = (ref: CvRef, lines: readonly CvLine[], isDate: boolean): string | null => {
  const wanted = keysOf(ref.text);
  if (wanted.length === 0) return null;
  const everyLine = lines.map((_, index) => index);
  const near = windowOf(ref, lines.length);
  for (const indexes of [near, everyLine]) {
    if (indexes.length === 0) continue;
    const tokens = indexes
      .flatMap((index) => tokensOfLine((lines[index] as CvLine).text, index))
      .map((token, pos) => ({ ...token, pos }));
    const text = alignTokens(wanted, tokens, lines) ?? (isDate ? alignPeriod(ref.text, indexes, lines) : null);
    if (text !== null) return text;
  }
  return null;
};

/**
 * RG-21, EF-CVX-46: turns the references of the model into the CV, copying the text from the source. A reference that
 * cannot be found is dropped — the field becomes null, the item disappears — and counted; an experience without an
 * anchored title, an education entry without an anchored degree, goes whole. Ids come from the code, in order.
 * @req EF-CVX-46, RG-21
 */
export const anchorParsedCv = (answer: ParseCvAnswer, lines: readonly CvLine[]): ParsedCv => {
  let dropped = 0;
  const anchor = (ref: CvRef | null, isDate = false): string | null => {
    if (ref === null) return null;
    const text = anchorRef(ref, lines, isDate);
    if (text === null) dropped += 1;
    return text;
  };
  const items = (refs: readonly CvRef[], idOf: (index: number) => string): AnchoredItem[] =>
    refs.flatMap((ref) => {
      const text = anchor(ref);
      return text === null ? [] : [text];
    }).map((text, index) => ({ id: idOf(index), text }));
  const joined = (refs: readonly CvRef[]): string | null => {
    const texts = items(refs, String).map(({ text }) => text);
    return texts.length > 0 ? texts.join(' ') : null;
  };

  const experiences = answer.experiences.flatMap((entry) => {
    const title = anchor(entry.title);
    return title === null ? [] : [{ entry, title }];
  });
  const education = answer.education.flatMap((entry) => {
    const degree = anchor(entry.degree);
    return degree === null ? [] : [{ entry, degree }];
  });

  return {
    headline: anchor(answer.headline),
    profile: joined(answer.profile),
    experiences: experiences.map(({ entry, title }, index) => ({
      id: `exp_${index}`,
      title,
      organization: anchor(entry.organization),
      place: anchor(entry.place),
      dates: anchor(entry.dates, true),
      bullets: items(entry.bullets, (bullet) => `exp_${index}.b${bullet}`),
    })),
    education: education.map(({ entry, degree }, index) => ({
      id: `edu_${index}`,
      degree,
      school: anchor(entry.school),
      place: anchor(entry.place),
      dates: anchor(entry.dates, true),
      details: items(entry.details, (detail) => `edu_${index}.d${detail}`),
    })),
    skills: items(answer.skills, (index) => `skill_${index}`),
    certifications: items(answer.certifications, (index) => `cert_${index}`),
    languages: items(answer.languages, (index) => `lang_${index}`),
    interests: items(answer.interests, (index) => `int_${index}`),
    dropped,
  };
};
