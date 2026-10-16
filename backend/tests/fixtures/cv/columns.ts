import { buildPositionedPdf, type PositionedText } from './positioned.js';

/*
 * Fictitious CVs laid out the way real exports are (EF-CVX-45): in two columns with the content stream interleaved by
 * height, with a wrapped job title, with ligatures and a word hyphenated at a line end, and with a text layer made of
 * private-use glyphs. Each carries the ground truth a reader must find whole in the text.
 */

/** What the CV says, as a candidate would write it (plain letters, no ligature). */
export interface ColumnsTruth {
  titles: string[];
  organizations: string[];
  dates: string[];
  degrees: string[];
  schools: string[];
  skills: string[];
  bullets: string[];
}

/** A fixture CV: the PDF and what must be read back from it. */
export interface ColumnsCv {
  pdf: Buffer;
  truth: ColumnsTruth;
}

const TRUTH: ColumnsTruth = {
  titles: ['Ingénieure DevOps', 'Technicienne systèmes'],
  organizations: ['Nordwave Systems', 'Atelier Brume'],
  dates: ['09/2022 – 06/2024', '2020 – 2022', '2018 – 2020'],
  degrees: ['Master Informatique'],
  schools: ['Université de Rennes'],
  skills: ['Docker', 'Kubernetes', 'Terraform', 'Python'],
  bullets: [
    'Automatisation des déploiements avec GitLab CI.',
    'Supervision Prometheus de 40 services.',
    'Administration de serveurs Linux.',
  ],
};

const SIDEBAR_X = 40;
const MAIN_X = 215;
const TITLE_SIZE = 12;
const LEADING = 6;
const DEFAULT_SIZE = 10;
const ADDRESS = '3 rue des Pins, 44000 Nantes';

interface ColumnsOptions {
  /** The first job title wraps over two lines, as in a narrow column. */
  wrapTitle?: boolean;
  /** The sidebar address sits at the height of a bullet of the main column. */
  addressOnBulletLine?: boolean;
}

/** Stream order of a Canva export: everything sorted by height, left to right on one line. */
const byHeight = (items: PositionedText[]): PositionedText[] =>
  [...items].sort((first, second) => first.y - second.y || first.x - second.x);

const SIDEBAR_TOP = 200;
// CONTACT title, e-mail and phone, each followed by its leading, come before the address in the sidebar.
const ADDRESS_OFFSET = TITLE_SIZE + LEADING + 2 * (DEFAULT_SIZE + LEADING);

const sidebarItems = (top: number): PositionedText[] => {
  const items: PositionedText[] = [];
  let y = top;
  const add = (text: string, size = DEFAULT_SIZE): void => {
    items.push({ x: SIDEBAR_X, y, text, size });
    y += size + LEADING;
  };
  add('CONTACT', TITLE_SIZE);
  add('lucie.marchand@example.com');
  add('06 12 34 56 78');
  add(ADDRESS);
  y += 8;
  add('COMPETENCES', TITLE_SIZE);
  TRUTH.skills.forEach((skill) => {
    add(skill);
  });
  return items;
};

const mainItems = (wrapTitle: boolean): PositionedText[] => {
  const items: PositionedText[] = [
    { x: MAIN_X, y: 50, text: 'Lucie Marchand', size: 20 },
    { x: MAIN_X, y: 76, text: 'Ingénieure DevOps', size: TITLE_SIZE },
  ];
  let y = 120;
  const add = (text: string, size = DEFAULT_SIZE): void => {
    items.push({ x: MAIN_X, y, text, size });
    y += size + LEADING;
  };
  add('EXPERIENCES PROFESSIONNELLES', TITLE_SIZE);
  if (wrapTitle) {
    add('Ingénieure');
    add('DevOps');
  } else {
    add('Ingénieure DevOps');
  }
  add('Nordwave Systems, Nantes');
  add('09/2022 – 06/2024');
  add('• Automatisation des déploiements avec GitLab CI.');
  add('• Supervision Prometheus de 40 services.');
  add('Technicienne systèmes');
  add('Atelier Brume, Rennes');
  add('2020 – 2022');
  add('• Administration de serveurs Linux.');
  add('FORMATION', TITLE_SIZE);
  add('Master Informatique');
  add('Université de Rennes, Rennes');
  add('2018 – 2020');
  return items;
};

/** A two-column CV whose content stream interleaves the sidebar and the main column by height. */
export const buildTwoColumnCv = ({
  wrapTitle = false,
  addressOnBulletLine = false,
}: ColumnsOptions = {}): ColumnsCv => {
  const main = mainItems(wrapTitle);
  // The sidebar is then set so that its address is written at the height of a bullet of the main column.
  const sharedLineY = main.find(({ text }) => text.includes('Supervision'))?.y ?? 0;
  const sidebar = sidebarItems(addressOnBulletLine ? sharedLineY - ADDRESS_OFFSET : SIDEBAR_TOP);
  return { pdf: buildPositionedPdf(byHeight([...sidebar, ...main])), truth: TRUTH };
};

/** A one-column CV with ligatures (« ﬁ », « ﬂ ») and « Développement » cut at a line end by a hyphen or a soft hyphen. */
export const buildHyphenatedCv = ({ softHyphen }: { softHyphen: boolean }): ColumnsCv => {
  const cut = softHyphen ? '­' : '-';
  const lines = [
    ['Lucie Marchand', 18],
    ['Responsable ﬁabilité', 12],
    ['EXPERIENCES PROFESSIONNELLES', 12],
    ['09/2022 – 06/2024  Responsable ﬁabilité - Nordwave Systems, Nantes', 10],
    ['- Pilotage du workﬂow.', 10],
    ['COMPETENCES', 12],
    [`Ofﬁce, Workﬂow, Dévelop${cut}`, 10],
    ['pement, Docker', 10],
  ] as const;
  const pdf = buildPositionedPdf(
    lines.map(([text, size], index) => ({ x: 50, y: 50 + index * 20, text, size })),
  );
  return {
    pdf,
    truth: {
      titles: ['Responsable fiabilité'],
      organizations: ['Nordwave Systems'],
      dates: ['09/2022 – 06/2024'],
      degrees: [],
      schools: [],
      skills: ['Office', 'Workflow', 'Développement', 'Docker'],
      bullets: ['Pilotage du workflow.'],
    },
  };
};

/** A page whose text layer is private-use glyphs (a font without a usable encoding) around a few real words. */
export const buildGarbledCv = (): Buffer =>
  buildPositionedPdf([
    { x: 50, y: 50, text: 'Lucie Marchand' },
    { x: 50, y: 70, text: ''.repeat(60) },
    { x: 50, y: 90, text: ''.repeat(60) },
  ]);
