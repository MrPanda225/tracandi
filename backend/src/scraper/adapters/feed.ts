import * as cheerio from 'cheerio';
import type { CollectedPage } from '../http.js';
import { SourceFetchError } from './types.js';

const HTTP_OK = 200;

/** One element of a feed — an RSS `item`, a Personio `position` — read by the names of its children. */
export interface FeedItem {
  /** The trimmed text of the first element at this path (« tt:locations tt:location tt:city »), or null. */
  text: (path: string) => string | null;
  /** The trimmed texts of every element at this path, empty ones left out. */
  texts: (path: string) => string[];
}

/** « tt:city » is a selector only once its colon is escaped. */
const selectorOf = (path: string): string => path.replaceAll(':', '\\:');

/**
 * The items of the XML feed a source answered (RSS of Teamtailor and Talentsoft, XML of Personio), read with the
 * parser already used for the career pages — no dependency added. XML mode keeps the escaped HTML of a description
 * as text, to be turned into words by `htmlToText`.
 * @throws SourceFetchError on any status other than 200, or on a body that holds no `root` element.
 * @req EF-VEI-08
 */
export const feedItemsOf = (
  page: CollectedPage,
  { label, root, item }: { label: string; root: string; item: string },
): FeedItem[] => {
  if (page.status !== HTTP_OK) throw new SourceFetchError(`${label} a répondu ${String(page.status)}.`);
  const $ = cheerio.load(page.body, { xml: true });
  if ($(root).length === 0) throw new SourceFetchError(`${label} n’a pas renvoyé le flux attendu.`);
  return $(`${root} ${item}`)
    .toArray()
    .map((node) => {
      const element = $(node);
      const texts = (path: string): string[] =>
        element
          .find(selectorOf(path))
          .toArray()
          .map((found) => $(found).text().trim())
          .filter((text) => text !== '');
      return { texts, text: (path) => texts(path)[0] ?? null };
    });
};
