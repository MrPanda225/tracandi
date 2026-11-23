/*
 * EF-CVX-45: reading order of a page laid out in columns. `pdftotext` sorts its blocks by height when the lines of a
 * sidebar and of the main column sit side by side, so a bullet ends up after the sidebar's skills. The geometry of its
 * lines (`-bbox-layout`) tells where the gutter is; each column is then read on its own by cropping the page.
 */

/** A line of text as `pdftotext -bbox-layout` places it, in points from the top left corner of the page. */
export interface LayoutLine {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface PageLayout {
  width: number;
  height: number;
  lines: LayoutLine[];
}

/** An area of a page read as one piece, in whole points, ready for `pdftotext -x -y -W -H`. */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

// A gutter is at least this wide; the space between two words of a line stays well below it.
const MIN_GUTTER_PT = 12;
// Each side of a gutter holds at least this many lines: a lone label beside a paragraph is no column.
const MIN_COLUMN_LINES = 3;
// Lines crossing a gutter (a header above both columns): at most this share of the page.
const MAX_CROSSING_SHARE = 0.15;
// Two lines whose bottoms are this close share a row.
const SAME_ROW_PT = 2;
// From this share of aligned lines on, the two sides are rows of one column (dates in a margin), never two columns.
const MAX_ALIGNED_SHARE = 0.5;
/** Beyond this many areas, the page is read as `pdftotext` reads it rather than with one call per area. */
export const MAX_REGIONS_PER_PAGE = 12;

const NUMBER = String.raw`(-?[\d.]+)`;
const LAYOUT_TAG = new RegExp(
  `<page width="${NUMBER}" height="${NUMBER}">|` +
    `<line xMin="${NUMBER}" yMin="${NUMBER}" xMax="${NUMBER}" yMax="${NUMBER}">`,
  'g',
);

/**
 * The pages of a `pdftotext -bbox-layout` output and the box of each of their lines; the words are never read. A
 * line outside any page is ignored; an output without page gives an empty list.
 * @req EF-CVX-45
 */
export const parseBboxLayout = (xhtml: string): PageLayout[] => {
  const pages: PageLayout[] = [];
  for (const [, width, height, xMin, yMin, xMax, yMax] of xhtml.matchAll(LAYOUT_TAG)) {
    if (width !== undefined && height !== undefined) {
      pages.push({ width: Number(width), height: Number(height), lines: [] });
    } else {
      pages
        .at(-1)
        ?.lines.push({ xMin: Number(xMin), yMin: Number(yMin), xMax: Number(xMax), yMax: Number(yMax) });
    }
  }
  return pages;
};

interface Gutter {
  start: number;
  end: number;
}

const widthOf = (gutter: Gutter): number => gutter.end - gutter.start;
const isLeftOf = (line: LayoutLine, gutter: Gutter): boolean => line.xMax <= gutter.start;
const isRightOf = (line: LayoutLine, gutter: Gutter): boolean => line.xMin >= gutter.end;

/** Number of lines covering each whole point of the page width. */
const coverageOf = (page: PageLayout): number[] => {
  const coverage = new Array<number>(Math.ceil(page.width) + 1).fill(0);
  for (const line of page.lines) {
    for (let x = Math.max(0, Math.ceil(line.xMin)); x < Math.min(coverage.length, line.xMax); x += 1) {
      coverage[x] = (coverage[x] ?? 0) + 1;
    }
  }
  return coverage;
};

/** Runs of the page width covered by at most `allowed` lines, margins included. */
const sparseRuns = (coverage: readonly number[], allowed: number): Gutter[] => {
  const runs: Gutter[] = [];
  let start: number | null = null;
  coverage.forEach((count, x) => {
    if (count <= allowed) {
      start ??= x;
    } else if (start !== null) {
      runs.push({ start, end: x });
      start = null;
    }
  });
  return runs;
};

const isGutter = (run: Gutter, lines: readonly LayoutLine[]): boolean =>
  widthOf(run) >= MIN_GUTTER_PT &&
  lines.filter((line) => isLeftOf(line, run)).length >= MIN_COLUMN_LINES &&
  lines.filter((line) => isRightOf(line, run)).length >= MIN_COLUMN_LINES;

/**
 * The gutter crossed by the fewest lines — none if possible, a header otherwise — the widest of them, with enough
 * lines entirely on each side; null when there is none. Allowing crossings first would let a column sparsely
 * covered by its own longer lines (an e-mail address in a sidebar) pass for the gutter.
 */
const findGutter = (page: PageLayout): Gutter | null => {
  const coverage = coverageOf(page);
  const maxCrossings = Math.floor(page.lines.length * MAX_CROSSING_SHARE);
  for (let allowed = 0; allowed <= maxCrossings; allowed += 1) {
    const widest = sparseRuns(coverage, allowed)
      .filter((run) => isGutter(run, page.lines))
      .reduce<Gutter | null>((best, run) => (best && widthOf(best) >= widthOf(run) ? best : run), null);
    if (widest) return widest;
  }
  return null;
};

/** Lines following each other from top to bottom: a run of side-by-side lines, or of lines across the gutter. */
interface Band {
  isAcross: boolean;
  lines: LayoutLine[];
}

const bandsOf = (lines: readonly LayoutLine[], gutter: Gutter): Band[] => {
  const bands: Band[] = [];
  for (const line of [...lines].sort((first, second) => first.yMin - second.yMin)) {
    const isAcross = !isLeftOf(line, gutter) && !isRightOf(line, gutter);
    const last = bands.at(-1);
    if (last?.isAcross === isAcross) last.lines.push(line);
    else bands.push({ isAcross, lines: [line] });
  }
  return bands;
};

const sharesRow = (line: LayoutLine, others: readonly LayoutLine[]): boolean =>
  others.some((other) => Math.abs(other.yMax - line.yMax) <= SAME_ROW_PT);

/**
 * Whether the two sides of a band are columns read one after the other: each holds enough lines, and most lines of
 * the shorter side are not on a row of the other — dates in a margin, each beside its job, are rows of one column.
 */
const isTwoColumns = (band: Band, gutter: Gutter): boolean => {
  const left = band.lines.filter((line) => isLeftOf(line, gutter));
  const right = band.lines.filter((line) => isRightOf(line, gutter));
  if (band.isAcross || left.length < MIN_COLUMN_LINES || right.length < MIN_COLUMN_LINES) return false;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  const aligned = shorter.filter((line) => sharesRow(line, longer)).length;
  return aligned / shorter.length < MAX_ALIGNED_SHARE;
};

const topOf = (band: Band): number => Math.min(...band.lines.map((line) => line.yMin));

/**
 * The two columns of a band, the one starting higher on the page first — the left one when both start on the same
 * row — so that a CV whose name heads its main column still starts with the name.
 */
const columnsOf = ({ band, gutter, area }: { band: Band; gutter: Gutter; area: Region }): Region[] => {
  const middle = Math.round((gutter.start + gutter.end) / 2);
  const left: Region = { ...area, width: middle };
  const right: Region = { ...area, x: middle, width: area.width - middle };
  const topOfSide = (isSide: (line: LayoutLine) => boolean) =>
    Math.min(...band.lines.filter(isSide).map((line) => line.yMin));
  const isRightHigher =
    topOfSide((line) => isRightOf(line, gutter)) < topOfSide((line) => isLeftOf(line, gutter)) - SAME_ROW_PT;
  return isRightHigher ? [right, left] : [left, right];
};
const bottomOf = (band: Band): number => Math.max(...band.lines.map((line) => line.yMax));

/** The vertical limit below each band: halfway to the next one, the bottom of the page for the last. */
const limitsOf = (bands: readonly Band[], pageHeight: number): number[] =>
  bands.map((band, index) => {
    const next = bands[index + 1];
    return next ? Math.round((bottomOf(band) + topOf(next)) / 2) : Math.ceil(pageHeight);
  });

/** Appends a whole-width area, merged with the area above when that one is whole-width too. */
const withWholeWidth = (regions: Region[], area: Region): Region[] => {
  const previous = regions.at(-1);
  if (previous?.width !== area.width || previous.y + previous.height !== area.y) return [...regions, area];
  return [...regions.slice(0, -1), { ...previous, height: previous.height + area.height }];
};

/**
 * EF-CVX-45: the areas of a page in reading order when it holds side-by-side columns — each column of a band read
 * whole, the one starting higher first, a header across both read on its own — or null when the page reads as one column, so that
 * the text `pdftotext` gives for the whole page is kept. Null too beyond `MAX_REGIONS_PER_PAGE` areas.
 * @req EF-CVX-45
 */
export const readingRegions = (page: PageLayout): Region[] | null => {
  const gutter = findGutter(page);
  if (!gutter) return null;
  const bands = bandsOf(page.lines, gutter);
  const isSplit = bands.map((band) => isTwoColumns(band, gutter));
  if (!isSplit.includes(true)) return null;
  const width = Math.ceil(page.width);
  const limits = limitsOf(bands, page.height);
  let regions: Region[] = [];
  bands.forEach((band, index) => {
    const y = index === 0 ? 0 : (limits[index - 1] ?? 0);
    const height = (limits[index] ?? y) - y;
    const area = { x: 0, y, width, height };
    regions = isSplit[index]
      ? [...regions, ...columnsOf({ band, gutter, area })]
      : withWholeWidth(regions, area);
  });
  return regions.length <= MAX_REGIONS_PER_PAGE ? regions : null;
};
