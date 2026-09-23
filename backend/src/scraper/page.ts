import * as cheerio from 'cheerio';

/** ENF-COU-01: what is sent to a model of a career page, and no more. */
export const PAGE_TEXT_MAX_LENGTH = 12_000;
/** A career page lists a few dozen offers; beyond that the page is a search engine, not a board. */
export const MAX_LINKS = 120;
const LINK_LABEL_MAX_LENGTH = 200;
const HTTPS = 'https:';

/** Parts of a page that hold no text at all for a reader: dropped before anything is read. */
const CODE = 'script, style, noscript, svg, template, iframe';
/** Furniture of the site: dropped from the text, but their links are kept, some boards listing offers there. */
const FURNITURE = 'nav, header, footer, form';

/** A link of the page, with the text the candidate would have clicked on. */
export interface PageLink {
  url: string;
  label: string;
}

/** A career page as the extraction sees it: readable text, and the links it can point an offer at. */
export interface ReadablePage {
  text: string;
  links: PageLink[];
}

// A career page is full of non-breaking spaces; they are spaces like the others once the page is read.
const HORIZONTAL_SPACES = /[ \t\u00a0]+/g;

const collapse = (text: string): string =>
  text
    .replace(HORIZONTAL_SPACES, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * The https address a href designates, resolved against the page it was found on. Anything else — another scheme,
 * a mail address, a fragment, an unparsable value — is dropped rather than guessed.
 */
const resolveLink = (href: string, pageUrl: string): string | null => {
  const resolved = URL.parse(href, pageUrl);
  return resolved?.protocol === HTTPS ? resolved.href : null;
};

/**
 * What a model needs to read a career page: its visible text and its links, both bounded (ENF-COU-01). Scripts,
 * styles and the furniture of the site are dropped, because they hold no offer and would only cost tokens.
 *
 * Links are resolved against the page, so a relative `href` becomes an address the application can check against
 * the domain of the source afterwards (security.md: an address the AI proposes is kept only if it matches).
 * @req EF-VEI-08, ENF-COU-01
 */
export const readPage = (html: string, pageUrl: string): ReadablePage => {
  const $ = cheerio.load(html);
  $(CODE).remove();
  const links: PageLink[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_index, element) => {
    if (links.length >= MAX_LINKS) return;
    const href = $(element).attr('href') ?? '';
    const url = resolveLink(href, pageUrl);
    const label = collapse($(element).text()).slice(0, LINK_LABEL_MAX_LENGTH);
    if (url === null || label === '' || seen.has(url)) return;
    seen.add(url);
    links.push({ url, label });
  });

  $(FURNITURE).remove();
  return { text: collapse($('body').text() || $.root().text()).slice(0, PAGE_TEXT_MAX_LENGTH), links };
};
