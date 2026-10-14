import { z } from 'zod';
import { PARSED_EXPERIENCES_MAX, PARSED_LIST_ITEMS_MAX } from './parseCvAnswer.js';

// Bounds of an adapted CV: those of what a parsed CV may hold (parseCvAnswer.ts), so that none of its facts is refused.
const LINE_MAX_LENGTH = 400;
const PARAGRAPH_MAX_LENGTH = 1_200;
const BULLET_MAX_LENGTH = 300;
const ITEM_MAX_LENGTH = 400;
const MAX_EXPERIENCES = PARSED_EXPERIENCES_MAX;
const MAX_BULLETS = 12;
const MAX_EDUCATION = PARSED_EXPERIENCES_MAX;
const MAX_SKILLS = PARSED_LIST_ITEMS_MAX;
const MAX_ITEMS = PARSED_LIST_ITEMS_MAX;

const line = z.string().trim().min(1).max(LINE_MAX_LENGTH);
const optionalLine = line.nullable();
const items = z.array(z.string().trim().min(1).max(ITEM_MAX_LENGTH));

/**
 * The CV adapted to an offer, section by section, without contact details (ENF-RGP-07) — what the code assembles from the parsed CV and the model's choices, and what the Word file is written from (RG-22). A
 * fact the CV does not give (organization, dates, school) is null and simply left out of the page.
 * @req EF-CVX-25, EF-CVX-31, RG-22
 */
export const AdaptedCvSchema = z.object({
  headline: line,
  profile: z.string().trim().max(PARAGRAPH_MAX_LENGTH),
  experiences: z
    .array(
      z.object({
        title: line,
        organization: optionalLine,
        place: optionalLine,
        dates: optionalLine,
        bullets: z.array(z.string().trim().min(1).max(BULLET_MAX_LENGTH)).max(MAX_BULLETS),
      }),
    )
    .max(MAX_EXPERIENCES),
  education: z
    .array(
      z.object({ degree: line, school: optionalLine, place: optionalLine, dates: optionalLine, detail: z.string().trim().min(1).max(PARAGRAPH_MAX_LENGTH).nullable() }),
    )
    .max(MAX_EDUCATION),
  skills: items.max(MAX_SKILLS),
  certifications: items.max(MAX_ITEMS),
  languages: items.max(MAX_ITEMS),
  interests: items.max(MAX_ITEMS),
});
export type AdaptedCv = z.infer<typeof AdaptedCvSchema>;
