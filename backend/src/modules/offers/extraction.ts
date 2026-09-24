import { z } from 'zod';

/**
 * Bounds of what one extraction may answer. A career page lists a few dozen offers; a model that answers more is
 * inventing, and the batch is cut rather than trusted (EF-IA-03).
 */
export const MAX_EXTRACTED_OFFERS = 40;
const TITLE_MAX_LENGTH = 300;
const LOCATION_MAX_LENGTH = 200;
const CONTRACT_MAX_LENGTH = 80;
const URL_MAX_LENGTH = 1000;
const SUMMARY_MAX_LENGTH = 2000;

/** A text the model answers, cut to its bound; blank counts as absent. */
const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((value) => {
      const kept = (value ?? '').trim();
      return kept === '' ? null : kept.slice(0, maxLength);
    });

/**
 * One offer read on a career page. The address is checked against the domain of the source **by the code**, after
 * this schema: a model must never be the thing that decides where the candidate is sent (security.md).
 */
export const ExtractedOfferSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX_LENGTH),
  url: optionalText(URL_MAX_LENGTH),
  location: optionalText(LOCATION_MAX_LENGTH),
  /** The wording of the page — « CDI », « Alternance »… — mapped to the glossary afterwards (EF-VEI-22). */
  contract: optionalText(CONTRACT_MAX_LENGTH),
  summary: optionalText(SUMMARY_MAX_LENGTH),
});

/**
 * Output of the `extract_offers` task (prompt `llm/prompts/extractOffers.ts`): the only barrier against an
 * aberrant answer (EF-IA-03).
 * @req EF-VEI-08, EF-IA-03
 */
export const ExtractedOffersSchema = z.object({
  offers: z.array(ExtractedOfferSchema).max(MAX_EXTRACTED_OFFERS),
  /**
   * EF-VEI-27 : l'adresse de la page qui liste les offres, quand celle qui a été lue n'en publie aucune mais y
   * renvoie. Second recours : la détection déterministe (`scraper/careerLink.ts`) passe avant. Comme pour une
   * offre, c'est le code qui vérifie cette adresse — présente sur la page, et sur le site de la source.
   */
  careerPageUrl: optionalText(URL_MAX_LENGTH),
});

export type ExtractedOffer = z.infer<typeof ExtractedOfferSchema>;
export type ExtractedOffers = z.infer<typeof ExtractedOffersSchema>;
