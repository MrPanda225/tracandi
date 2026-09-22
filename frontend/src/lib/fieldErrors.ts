import type { FieldIssue } from '../api/client';

/**
 * Messages of the fields rejected by the API, keyed by the form field that shows them. API paths are prefixed by the
 * request part (`body.companyName`); issues on fields the form does not show are left to the general message.
 */
export const fieldErrorsFrom = <K extends string>(
  details: readonly FieldIssue[],
  fields: Readonly<Record<string, K>>,
): Partial<Record<K, string>> => {
  const errors: Partial<Record<K, string>> = {};
  for (const issue of details) {
    const field = fields[issue.path];
    if (field) errors[field] = issue.message;
  }
  return errors;
};
