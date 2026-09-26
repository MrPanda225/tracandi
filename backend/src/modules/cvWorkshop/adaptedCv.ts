import { z } from 'zod';

// Bounds of an adapted CV: generous for a two-page CV, tight enough to stop an aberrant answer (EF-IA-03).
const LINE_MAX_LENGTH = 200;
const PARAGRAPH_MAX_LENGTH = 1_200;
const BULLET_MAX_LENGTH = 300;
const ITEM_MAX_LENGTH = 120;
const MAX_EXPERIENCES = 12;
const MAX_BULLETS = 8;
const MAX_EDUCATION = 8;
const MAX_SKILLS = 40;
const MAX_ITEMS = 15;

const line = z.string().trim().min(1).max(LINE_MAX_LENGTH);
const optionalLine = line.nullable();
const items = z.array(z.string().trim().min(1).max(ITEM_MAX_LENGTH));

/**
 * The CV adapted to an offer, section by section, without contact details (ENF-RGP-07) — what T-512's AI task
 * answers and what the Word file is written from (RG-22). Its faithfulness to the imported CV is checked by RG-21.
 * @req EF-CVX-25, EF-CVX-31, RG-22
 */
export const AdaptedCvSchema = z.object({
  headline: line,
  profile: z.string().trim().max(PARAGRAPH_MAX_LENGTH),
  experiences: z
    .array(
      z.object({
        title: line,
        organization: line,
        place: optionalLine,
        dates: line,
        bullets: z.array(z.string().trim().min(1).max(BULLET_MAX_LENGTH)).max(MAX_BULLETS),
      }),
    )
    .max(MAX_EXPERIENCES),
  education: z
    .array(
      z.object({ degree: line, school: line, place: optionalLine, dates: line, detail: optionalLine }),
    )
    .max(MAX_EDUCATION),
  skills: items.max(MAX_SKILLS),
  certifications: items.max(MAX_ITEMS),
  languages: items.max(MAX_ITEMS),
  interests: items.max(MAX_ITEMS),
});
export type AdaptedCv = z.infer<typeof AdaptedCvSchema>;
