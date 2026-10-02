import { z } from 'zod';
import { CriteriaTargetSchema } from '../criteria/schemas.js';
import { tidyKeywords } from '../cvTypes/leniency.js';
import { type Level, levelOfTitle, levelOfYears } from '../criteria/experience.js';

const TITLE_MAX_LENGTH = 80;

/**
 * EF-VEI-49, EF-IA-03: what the model answers when it reads an offer — a title and from one to fifteen keywords, in the
 * bounds of the targets of the criteria. There is no place for years nor for a level: a model that volunteers them is
 * not read, the code reads them from the text (RG-29, RG-28).
 */
export const OfferTraitsAnswerSchema = z.object({
  // A title a little too long is cut, not refused: the candidate corrects it anyway.
  title: z.preprocess(
    (title) => (typeof title === 'string' ? title.trim().slice(0, TITLE_MAX_LENGTH).trim() : title),
    CriteriaTargetSchema.shape.label,
  ),
  keywords: z.preprocess(tidyKeywords, CriteriaTargetSchema.shape.keywords),
});

export type OfferTraitsAnswer = z.infer<typeof OfferTraitsAnswerSchema>;

/**
 * RG-28: the level a chosen offer points to — by the years it demands when it states them, by its title otherwise,
 * and « non précisé » (null) when neither tells. Worked out from what is kept, so a correction moves it too.
 * @req RG-28, EF-VEI-49
 */
export const suggestedLevelOf = ({ years, title }: { years: number | null; title: string }): Level | null =>
  years === null ? levelOfTitle(title) : levelOfYears(years);
