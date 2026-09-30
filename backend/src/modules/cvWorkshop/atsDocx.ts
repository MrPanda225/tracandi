import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import type { AdaptedCv } from './adaptedCv.js';
import type { CvContacts } from './contacts.js';
import { type CvBlock, cvBlocks, densityFor, PAGE_DENSITIES, type PageDensity } from './onePage.js';

export { ATS_SECTION_TITLES } from './onePage.js';

// A widespread font; sizes in half-points, lengths in twips (1 pt = 20 twips, 1 cm = 567 twips).
const FONT = 'Calibri';
const TWIPS_PER_PT = 20;
const TWIPS_PER_CM = 567;
const A4_WIDTH_TWIPS = 11_906;
const A4_HEIGHT_TWIPS = 16_838;
const SINGLE_LINE = 240;
// The tightest density of RG-24, used only if a CV that passed the check still needed more room.
const TIGHTEST = PAGE_DENSITIES[PAGE_DENSITIES.length - 1] as PageDensity;

const halfPoints = (pt: number): number => Math.round(pt * 2);

const run = (text: string, sizePt: number, bold = false): TextRun =>
  new TextRun({ text, font: FONT, size: halfPoints(sizePt), bold });

/** One block as a Word paragraph, at the density chosen for the page (RG-24). */
const paragraphOf = (block: CvBlock, density: PageDensity): Paragraph => {
  switch (block.kind) {
    case 'name':
      return new Paragraph({ children: [run(block.text, density.namePt, true)] });
    case 'headline':
      return new Paragraph({ children: [run(block.text, density.headlinePt)] });
    case 'heading':
      return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: density.headingBeforePt * TWIPS_PER_PT, after: density.headingAfterPt * TWIPS_PER_PT },
        children: [run(block.text, density.headingPt, true)],
      });
    case 'entry':
      return new Paragraph({
        spacing: { before: density.entryBeforePt * TWIPS_PER_PT },
        children: [run(block.text, density.bodyPt, true)],
      });
    case 'bullet':
      return new Paragraph({ bullet: { level: 0 }, children: [run(block.text, density.bodyPt)] });
    default:
      return new Paragraph({ children: [run(block.text, density.bodyPt)] });
  }
};

/**
 * Writes the adapted CV as a Word file readable by recruiting software (RG-22) on one A4 page (RG-24): one column of
 * real text; contact details at the top of the body; the usual section titles as Word headings, in their order, empty
 * sections left out; no table, image, text box, header or footer. The skills the candidate ticked are added to
 * « Compétences ». The page is set at the most comfortable density that holds it, never below 10 pt and 1.5 cm.
 * @returns the bytes of the .docx, ready to download.
 * @req EF-CVX-28, EF-CVX-31, EF-CVX-36, RG-22, RG-24
 */
export const renderAtsDocx = async (input: {
  cv: AdaptedCv;
  contacts: CvContacts;
  addedSkills: readonly string[];
}): Promise<Buffer> => {
  const blocks = cvBlocks(input);
  const density = densityFor(blocks) ?? TIGHTEST;
  const margin = Math.round(density.marginCm * TWIPS_PER_CM);
  const document = new Document({
    creator: 'Tracandi',
    title: input.contacts.name ? `CV — ${input.contacts.name}` : 'CV',
    styles: {
      default: {
        document: {
          run: { font: FONT, size: halfPoints(density.bodyPt) },
          paragraph: { spacing: { before: 0, after: 0, line: SINGLE_LINE } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_WIDTH_TWIPS, height: A4_HEIGHT_TWIPS },
            margin: { top: margin, bottom: margin, left: margin, right: margin },
          },
        },
        children: blocks.map((block) => paragraphOf(block, density)),
      },
    ],
  });
  return Packer.toBuffer(document);
};
