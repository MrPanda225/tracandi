import type { SiteAdapterId } from '../../scraper/adapters/types.js';

/**
 * RG-19 : fournisseurs de messagerie grand public. Un message envoyé depuis l'un d'eux ne dit rien du site
 * carrières de l'entreprise — un recruteur écrit parfois depuis son adresse personnelle.
 */
const MAILBOX_PROVIDERS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.fr',
  'hotmail.com',
  'hotmail.fr',
  'live.fr',
  'live.com',
  'yahoo.com',
  'yahoo.fr',
  'orange.fr',
  'wanadoo.fr',
  'free.fr',
  'sfr.fr',
  'laposte.net',
  'icloud.com',
  'me.com',
  'protonmail.com',
  'proton.me',
]);

/**
 * EF-VEI-24 : domaines d'où écrivent les ATS pris en charge. Reconnaître l'expéditeur évite d'aller interroger
 * le site pour savoir quel adaptateur lui convient : c'est gratuit, et sans requête sortante.
 */
const ATS_SENDER_DOMAINS: Readonly<Record<string, SiteAdapterId>> = {
  'greenhouse.io': 'greenhouse',
  'us.greenhouse-mail.io': 'greenhouse',
  'greenhouse-mail.io': 'greenhouse',
  'lever.co': 'lever',
  'hire.lever.co': 'lever',
  'smartrecruiters.com': 'smartrecruiters',
  'smartrecruiters.net': 'smartrecruiters',
  'recruitee.com': 'recruitee',
  'myworkday.com': 'workday',
  'myworkdayjobs.com': 'workday',
  'wd1.myworkdaysite.com': 'workday',
};

/**
 * RG-19 : domaines d'outils de recrutement et de job boards qui ne figurent pas dans `platform_domains`. Une
 * entreprise qui écrit depuis `ateme.teamtailor-mail.com` ou `mail.flatchr.io` écrit depuis **l'outil de son
 * recruteur**, pas depuis son site ; proposer ce domaine ferait surveiller l'outil, ou pire le job board — et
 * les offres relevées seraient celles de tout le monde.
 *
 * Ils sont listés ici, et non dans les types de source, parce qu'aucun adaptateur ne les prend en charge : la
 * bonne réponse est de ne rien proposer, pas de proposer une source qui échouera.
 */
const RECRUITMENT_TOOLING: ReadonlySet<string> = new Set([
  // Outils de recrutement (ATS) sans adaptateur
  'flatchr.io',
  'teamtailor.com',
  'teamtailor-mail.com',
  'werecruit.io',
  'taleez.com',
  'softy.pro',
  'digitalrecruiters.com',
  'beetween.com',
  'jobaffinity.fr',
  'talentsoft.com',
  'cegid.com',
  'icims.com',
  'workable.com',
  'ashbyhq.com',
  'personio.de',
  'personio.com',
  'jobvite.com',
  'successfactors.com',
  'taleo.net',
  'bamboohr.com',
  // Job boards et agrégateurs : leurs offres ne sont pas celles d'une entreprise
  'free-work.com',
  'choosemycompany.com',
  'glassdoor.com',
  'glassdoor.fr',
  'talent.com',
  'jobijoba.com',
  'optioncarriere.com',
  'emploi.org',
  'keljob.com',
  'lesjeudis.com',
]);

// Un domaine a au moins deux étiquettes : « fr » seul ne désigne pas une entreprise.
const MIN_DOMAIN_LABELS = 2;

/** Le domaine d'une adresse, en minuscules, ou null quand l'adresse n'en porte pas. */
export const domainOfAddress = (address: string | null): string | null => {
  const at = (address ?? '').lastIndexOf('@');
  if (at < 0) return null;
  const domain =
    address
      ?.slice(at + 1)
      .trim()
      .toLowerCase() ?? '';
  return domain.split('.').length >= MIN_DOMAIN_LABELS ? domain : null;
};

/** Le domaine et chacun de ses parents, du plus long au plus court : « mail.arkema.com », « arkema.com ». */
export const domainAndParents = (domain: string): string[] => {
  const labels = domain.split('.');
  return labels
    .slice(0, labels.length - MIN_DOMAIN_LABELS + 1)
    .map((_label, index) => labels.slice(index).join('.'));
};

/**
 * EF-VEI-24 : le type de source que désigne le domaine de l'expéditeur, ou null quand il ne désigne aucun ATS
 * connu. Les sous-domaines comptent : un message de `no-reply@eu.greenhouse.io` vient bien de Greenhouse.
 */
export const adapterOfSenderDomain = (domain: string): SiteAdapterId | null => {
  const known = domainAndParents(domain).find((candidate) => candidate in ATS_SENDER_DOMAINS);
  return known === undefined ? null : (ATS_SENDER_DOMAINS[known] ?? null);
};

/**
 * RG-19 : un domaine ne désigne l'entreprise que s'il n'est ni celui d'une plateforme connue, ni celui d'une
 * messagerie grand public, ni celui d'un outil de recrutement ou d'un job board — ces derniers hébergent le
 * board, ils ne sont pas le site de l'entreprise.
 */
export const isCompanyDomain = (domain: string, platformDomains: ReadonlySet<string>): boolean =>
  !domainAndParents(domain).some(
    (candidate) =>
      platformDomains.has(candidate) ||
      MAILBOX_PROVIDERS.has(candidate) ||
      RECRUITMENT_TOOLING.has(candidate),
  ) && adapterOfSenderDomain(domain) === null;

/**
 * Suffixes under which a company registers its name one level lower: « atelier-nova.co.uk » is Atelier Nova, not
 * « Co ».
 */
const SECOND_LEVEL_SUFFIXES: ReadonlySet<string> = new Set([
  'co.uk',
  'org.uk',
  'com.au',
  'co.jp',
  'com.br',
  'co.nz',
  'co.za',
  'com.tr',
  'gouv.fr',
  'asso.fr',
]);

const WORD_SEPARATORS = /[-_]+/;

/**
 * RG-03 (v1.20) : le nom d'entreprise qu'un domaine porte — l'étiquette enregistrée, sous-domaines et suffixe
 * retirés, mots séparés par les tirets mis en capitales : « rh.data-praxis.fr » donne « Data Praxis ».
 * @req RG-03
 */
export const companyNameOfDomain = (domain: string): string => {
  const labels = domain.split('.');
  const suffixLength = SECOND_LEVEL_SUFFIXES.has(labels.slice(-MIN_DOMAIN_LABELS).join('.'))
    ? MIN_DOMAIN_LABELS
    : 1;
  const registered = labels[labels.length - suffixLength - 1] ?? domain;
  return registered
    .split(WORD_SEPARATORS)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * RG-03 (v1.20) : l'entreprise que désigne l'adresse du correspondant d'un message — le destinataire d'un message
 * envoyé, l'expéditeur d'un message reçu — ou null quand son domaine ne la désigne pas (RG-19).
 * @req RG-03, RG-19
 */
export const companyOfCorrespondent = (
  message: { direction: 'inbound' | 'outbound'; fromAddress: string | null; toAddress: string | null },
  platformDomains: ReadonlySet<string>,
): string | null => {
  const domain = domainOfAddress(message.direction === 'outbound' ? message.toAddress : message.fromAddress);
  return domain && isCompanyDomain(domain, platformDomains) ? companyNameOfDomain(domain) : null;
};
