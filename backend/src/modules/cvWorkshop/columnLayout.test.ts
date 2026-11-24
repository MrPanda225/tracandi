import { describe, expect, it } from 'vitest';
import {
  type LayoutLine,
  MAX_REGIONS_PER_PAGE,
  type PageLayout,
  parseBboxLayout,
  readingRegions,
} from './columnLayout.js';

const LINE_HEIGHT = 9;
const line = (xMin: number, yMin: number, xMax: number): LayoutLine => ({
  xMin,
  yMin,
  xMax,
  yMax: yMin + LINE_HEIGHT,
});
const page = (lines: LayoutLine[]): PageLayout => ({ width: 595, height: 842, lines });

/** Lines of one column, one every 16 points from `top`. */
const column = ({ xMin, xMax, top, count }: { xMin: number; xMax: number; top: number; count: number }) =>
  Array.from({ length: count }, (_, index) => line(xMin, top + index * 16, xMax));

const SIDEBAR = column({ xMin: 40, xMax: 177, top: 200, count: 6 });
// Rows 8 points apart from the sidebar's: the two columns never share a row.
const MAIN = column({ xMin: 215, xMax: 440, top: 120, count: 14 }).map((item) => ({
  ...item,
  yMin: item.yMin + 8,
  yMax: item.yMax + 8,
}));

describe('parseBboxLayout', () => {
  it('[EF-CVX-45] reads the size of each page and the box of each of its lines, never their words', () => {
    const xhtml = [
      '<doc><page width="595.000000" height="842.000000"><flow><block>',
      '<line xMin="40.5" yMin="191.38" xMax="97.99" yMax="202.48"><word>CONTACT</word></line>',
      '</block></flow></page><page width="300" height="400"></page></doc>',
    ].join('\n');

    expect(parseBboxLayout(xhtml)).toEqual([
      { width: 595, height: 842, lines: [{ xMin: 40.5, yMin: 191.38, xMax: 97.99, yMax: 202.48 }] },
      { width: 300, height: 400, lines: [] },
    ]);
  });

  it('[EF-CVX-45] gives no page for an output without any, and ignores a line outside a page', () => {
    expect(parseBboxLayout('<line xMin="1" yMin="2" xMax="3" yMax="4">')).toEqual([]);
    expect(parseBboxLayout('')).toEqual([]);
  });
});

describe('readingRegions', () => {
  it('[EF-CVX-45] reads a sidebar and a main column one after the other, the column starting higher first', () => {
    expect(readingRegions(page([...SIDEBAR, ...MAIN]))).toEqual([
      { x: 196, y: 0, width: 399, height: 842 },
      { x: 0, y: 0, width: 196, height: 842 },
    ]);
  });

  it('[EF-CVX-45] reads the left column first when both columns start on the same row', () => {
    const left = column({ xMin: 40, xMax: 177, top: 100, count: 5 });
    const right = column({ xMin: 215, xMax: 440, top: 100, count: 9 }).map((item, index) =>
      index === 0 ? item : { ...item, yMin: item.yMin + 8, yMax: item.yMax + 8 },
    );

    expect(readingRegions(page([...left, ...right]))?.map((region) => region.x)).toEqual([0, 196]);
  });

  it('[EF-CVX-45] reads a header across both columns on its own, above them', () => {
    const header = line(40, 40, 400);

    expect(readingRegions(page([header, ...SIDEBAR, ...MAIN]))).toEqual([
      { x: 0, y: 0, width: 595, height: 89 },
      { x: 196, y: 89, width: 399, height: 753 },
      { x: 0, y: 89, width: 196, height: 753 },
    ]);
  });

  it('[EF-CVX-45] reads a footer across both columns after them, without cutting the page twice', () => {
    const footer = [line(40, 600, 540), line(40, 616, 540)];

    const regions = readingRegions(page([...SIDEBAR, ...MAIN, ...footer]));

    expect(regions?.at(-1)).toEqual({ x: 0, y: 473, width: 595, height: 369 });
    expect(regions).toHaveLength(3);
  });

  it('[EF-CVX-45] leaves a one-column page to pdftotext', () => {
    expect(readingRegions(page(column({ xMin: 50, xMax: 540, top: 100, count: 20 })))).toBeNull();
    expect(readingRegions(page([]))).toBeNull();
  });

  it('[EF-CVX-45] leaves dates in a margin, each on the row of its job, to pdftotext', () => {
    const dates = [line(50, 100, 133), line(50, 116, 90), line(50, 180, 133), line(50, 196, 90)];
    const jobs = column({ xMin: 160, xMax: 400, top: 100, count: 8 });

    expect(readingRegions(page([...dates, ...jobs]))).toBeNull();
  });

  it('[EF-CVX-45] sees no column in a gap narrower than a gutter, or beside fewer than three lines', () => {
    const narrow = [
      ...column({ xMin: 40, xMax: 200, top: 200, count: 6 }),
      ...column({ xMin: 205, xMax: 440, top: 128, count: 10 }),
    ];
    const lone = [line(40, 300, 120), line(40, 400, 120), ...MAIN];

    expect(readingRegions(page(narrow))).toBeNull();
    expect(readingRegions(page(lone))).toBeNull();
  });

  it('[EF-CVX-45] leaves to pdftotext a page cut into more areas than it is worth reading one by one', () => {
    const bandsOf = (count: number): LayoutLine[] =>
      Array.from({ length: count }, (_, index) => {
        const top = 40 + index * 64;
        return [
          line(40, top, 540),
          ...column({ xMin: 40, xMax: 177, top: top + 16, count: 3 }).map((item) => ({
            ...item,
            yMax: item.yMax - 4,
          })),
          ...column({ xMin: 215, xMax: 440, top: top + 20, count: 3 }),
        ];
      }).flat();

    expect(readingRegions({ width: 595, height: 842 * 2, lines: bandsOf(2) })).toHaveLength(6);
    expect(readingRegions({ width: 595, height: 842 * 2, lines: bandsOf(MAX_REGIONS_PER_PAGE) })).toBeNull();
  });
});
