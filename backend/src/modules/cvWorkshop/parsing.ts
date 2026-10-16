import type { LlmRouter } from '../../llm/router.js';
import { buildParseCvPrompt } from '../../llm/prompts/parseCv.js';
import { anchorParsedCv, type ParsedCv } from './anchoring.js';
import { numberCvLines } from './cvLines.js';
import { ParseCvAnswerSchema } from './parseCvAnswer.js';

/**
 * EF-CVX-46, RG-21: the CV structured. The lines of the text (contact details already taken out) are numbered, the
 * model points to them, and the code copies the text of the source: every value of the result is a substring of `text`.
 * @param text the `text` of a `ReadCv`, never the original with its contact details
 * @throws LlmUnavailableError when no provider gave a usable answer — the caller decides what the candidate reads
 * @req EF-CVX-46, RG-21
 */
export const parseCv = async (
  router: LlmRouter,
  { userId, text }: { userId: number; text: string },
): Promise<ParsedCv> => {
  const lines = numberCvLines(text);
  const { data } = await router.runTask('parse_cv', {
    userId,
    ...buildParseCvPrompt(lines),
    schema: ParseCvAnswerSchema,
  });
  return anchorParsedCv(data, lines);
};
