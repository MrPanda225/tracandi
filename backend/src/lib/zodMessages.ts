import type { z } from 'zod';

type RawIssue = z.core.$ZodRawIssue;
type SizeIssue = RawIssue & { code: 'too_small' | 'too_big' };

const joinValues = (values: readonly unknown[], separator = ' | '): string =>
  values.map((value) => (typeof value === 'string' ? `'${value}'` : String(value))).join(separator);

const isPromiseLike = (value: object): boolean =>
  'then' in value && typeof value.then === 'function' && 'catch' in value && typeof value.catch === 'function';

const objectTypeOf = (value: object | null): string => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (isPromiseLike(value)) return 'promise';
  if (value instanceof Map) return 'map';
  if (value instanceof Set) return 'set';
  if (value instanceof Date) return 'date';
  return 'object';
};

// The type names zod 3 printed in « Expected …, received … ».
const parsedTypeOf = (value: unknown): string => {
  if (typeof value === 'number') return Number.isNaN(value) ? 'nan' : 'number';
  if (typeof value === 'object') return objectTypeOf(value);
  return typeof value;
};

const invalidType = (issue: RawIssue & { code: 'invalid_type' }): string => {
  if (issue.input === undefined) return 'Required';
  // zod 3 reported a decimal given to `.int()` as a type error: « Expected integer, received float ».
  if (issue.expected === 'int') {
    return `Expected integer, received ${typeof issue.input === 'number' ? 'float' : parsedTypeOf(issue.input)}`;
  }
  return `Expected ${issue.expected}, received ${parsedTypeOf(issue.input)}`;
};

// zod 4 merged zod 3's `invalid_enum_value` and `invalid_literal` into `invalid_value`: the schema tells them apart.
const invalidValue = (issue: RawIssue & { code: 'invalid_value' }): string => {
  const definition = issue.inst?._zod.def;
  const kind = definition && 'type' in definition ? definition.type : undefined;
  if (kind === 'literal') {
    const expected = issue.values.length === 1 ? issue.values[0] : issue.values;
    return `Invalid literal value, expected ${JSON.stringify(expected, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value))}`;
  }
  if (kind !== 'enum') return 'Invalid input';
  if (issue.input === undefined) return 'Required';
  if (typeof issue.input !== 'string') return `Expected ${joinValues(issue.values)}, received ${parsedTypeOf(issue.input)}`;
  return `Invalid enum value. Expected ${joinValues(issue.values)}, received '${issue.input}'`;
};

const invalidFormat = (issue: RawIssue & { code: 'invalid_format' }): string => {
  if ('prefix' in issue) return `Invalid input: must start with "${String(issue.prefix)}"`;
  if ('suffix' in issue) return `Invalid input: must end with "${String(issue.suffix)}"`;
  if ('includes' in issue) return `Invalid input: must include "${String(issue.includes)}"`;
  return issue.format === 'regex' ? 'Invalid' : `Invalid ${issue.format}`;
};

type Bound = 'exact' | 'inclusive' | 'exclusive';

interface SizeWording {
  subject: string;
  words: Record<Bound, string>;
  unit: string;
}

const NUMBER_MINIMUM: SizeWording = {
  subject: 'Number must be',
  words: { exact: 'exactly equal to', inclusive: 'greater than or equal to', exclusive: 'greater than' },
  unit: '',
};
const NUMBER_MAXIMUM_WORDS = { exact: 'exactly', inclusive: 'less than or equal to', exclusive: 'less than' };
const NUMBER_MAXIMUM: SizeWording = { subject: 'Number must be', words: NUMBER_MAXIMUM_WORDS, unit: '' };

// Keyed by the issue's origin (what was measured); `int` is zod 4's name for a number checked by `.int()`.
const MINIMUM_WORDING: Partial<Record<string, SizeWording>> = {
  array: {
    subject: 'Array must contain',
    words: { exact: 'exactly', inclusive: 'at least', exclusive: 'more than' },
    unit: ' element(s)',
  },
  string: {
    subject: 'String must contain',
    words: { exact: 'exactly', inclusive: 'at least', exclusive: 'over' },
    unit: ' character(s)',
  },
  number: NUMBER_MINIMUM,
  int: NUMBER_MINIMUM,
  bigint: NUMBER_MINIMUM,
};

const MAXIMUM_WORDING: Partial<Record<string, SizeWording>> = {
  array: {
    subject: 'Array must contain',
    words: { exact: 'exactly', inclusive: 'at most', exclusive: 'less than' },
    unit: ' element(s)',
  },
  string: {
    subject: 'String must contain',
    words: { exact: 'exactly', inclusive: 'at most', exclusive: 'under' },
    unit: ' character(s)',
  },
  number: NUMBER_MAXIMUM,
  int: NUMBER_MAXIMUM,
  bigint: { subject: 'BigInt must be', words: NUMBER_MAXIMUM_WORDS, unit: '' },
};

const boundOf = (issue: SizeIssue): Bound => {
  if (issue.exact) return 'exact';
  return issue.inclusive ? 'inclusive' : 'exclusive';
};

const sizeMessage = (wording: SizeWording | undefined, issue: SizeIssue, limit: number | bigint): string =>
  wording ? `${wording.subject} ${wording.words[boundOf(issue)]} ${limit}${wording.unit}` : 'Invalid input';

interface NumberCheck {
  check: string;
  format?: string;
  value?: unknown;
  inclusive?: boolean;
}

const INTEGER_FORMATS = new Set(['safeint', 'int32', 'uint32']);

// The checks of the schema that raised the issue; none when a check raised it.
const numberChecksOf = (issue: RawIssue): NumberCheck[] => {
  const definition = issue.inst?._zod.def;
  const checks = definition && 'checks' in definition ? (definition.checks ?? []) : [];
  return checks.map((check) => check._zod.def as NumberCheck);
};

const boundMessage = (wording: SizeWording, check: NumberCheck): string =>
  `${wording.subject} ${wording.words[check.inclusive === false ? 'exclusive' : 'inclusive']} ${String(check.value)}`;

/*
 * zod 4 refuses ±Infinity (1e400 in a JSON body) as a type error, before any other check. zod 3 let it through to the
 * checks: `.int()` answered « Expected integer, received float », a bound its own message. Null for any other input.
 */
const nonFiniteMessage = (issue: RawIssue & { code: 'invalid_type' }): string | null => {
  const { input } = issue;
  if (typeof input !== 'number' || Number.isNaN(input) || Number.isFinite(input)) return null;
  const checks = numberChecksOf(issue);
  if (checks.some((check) => check.check === 'number_format' && INTEGER_FORMATS.has(check.format ?? ''))) {
    return 'Expected integer, received float';
  }
  const crossed = checks.find((check) => check.check === (input > 0 ? 'less_than' : 'greater_than'));
  if (crossed) return boundMessage(input > 0 ? NUMBER_MAXIMUM : NUMBER_MINIMUM, crossed);
  return 'Number must be finite';
};

const messageOf = (issue: RawIssue): string => {
  switch (issue.code) {
    case 'invalid_type':
      return nonFiniteMessage(issue) ?? invalidType(issue);
    case 'invalid_value':
      return invalidValue(issue);
    case 'invalid_format':
      return invalidFormat(issue);
    case 'too_small':
      return sizeMessage(MINIMUM_WORDING[issue.origin], issue, issue.minimum);
    case 'too_big':
      return sizeMessage(MAXIMUM_WORDING[issue.origin], issue, issue.maximum);
    case 'unrecognized_keys':
      return `Unrecognized key(s) in object: ${joinValues(issue.keys, ', ')}`;
    case 'not_multiple_of':
      return `Number must be a multiple of ${issue.divisor}`;
    default:
      return 'Invalid input';
  }
};

/**
 * zod 3's English wording for the issues a schema leaves without a message of its own. The interface shows
 * `details[].message` as the API returns it (ENF-SEC-04), so moving to zod 4 (ENF-SEC-10) must not change what the
 * candidate reads. A message given by the schema (`'Code INSEE invalide.'`) still wins, as it did in zod 3.
 * Never throws; an issue zod 3 did not know reads « Invalid input ».
 * @req ENF-SEC-04, ENF-SEC-10
 */
export const zod3Messages = (issue: RawIssue): string => messageOf(issue);

type Issue = z.core.$ZodIssue;

const samePath = (left: Issue, right: Issue): boolean =>
  left.path.length === right.path.length && left.path.every((key, index) => key === right.path[index]);

// zod 4's `.int()` also bounds an integer to the safe range; zod 3 did not, and the schema's own bound already speaks.
const isSafeIntegerBound = (issue: Issue): boolean =>
  (issue.code === 'too_big' || issue.code === 'too_small') &&
  issue.origin === 'int' &&
  Math.abs(Number(issue.code === 'too_big' ? issue.maximum : issue.minimum)) === Number.MAX_SAFE_INTEGER;

/**
 * The issues of a failed parse, less zod 4's safe-integer bound when another issue already refuses the same field:
 * `{ id: 1e20 }` reads « Number must be less than or equal to 2147483647 » alone, as with zod 3 (ENF-SEC-04).
 * An unsafe integer that nothing else refuses keeps its issue: the value stays refused. Never throws.
 * @req ENF-SEC-04, ENF-SEC-10
 */
export const withoutRedundantSafeIntegerBounds = (issues: readonly Issue[]): Issue[] =>
  issues.filter(
    (issue) => !isSafeIntegerBound(issue) || !issues.some((other) => other !== issue && samePath(other, issue)),
  );
