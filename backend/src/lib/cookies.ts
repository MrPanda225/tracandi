/**
 * Returns the value of cookie `name` from a raw `Cookie` header, or `null` when absent or malformed.
 * Avoids a dependency for the single cookie the API reads (ADR-09).
 * @req EF-AUT-05
 */
export const readCookie = (header: string | undefined, name: string): string | null => {
  if (!header) return null;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator > 0 && pair.slice(0, separator).trim() === name) {
      const value = pair.slice(separator + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
};
