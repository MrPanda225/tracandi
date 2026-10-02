/**
 * What a provider can take in one call, for the scoring of offers (EF-IA-12): how many offers a batch holds and how
 * many characters of each description it sends.
 */
export interface BatchLimits {
  batchSize: number;
  descriptionChars: number;
}

/** ENF-COU-01, rules/llm.md: the hosted providers take fifteen offers at a time, 2 000 characters of each. */
export const HOSTED_BATCH_LIMITS: BatchLimits = { batchSize: 15, descriptionChars: 2_000 };
