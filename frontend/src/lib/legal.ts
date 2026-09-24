/** Shown instead of an information the deployment has not given yet: visible, so that it is never forgotten. */
const TO_COMPLETE = (what: string) => `[à compléter : ${what}]`;

const valueOr = (value: string | undefined, what: string): string => value?.trim() || TO_COMPLETE(what);

/**
 * EF-LEG-01: who publishes the site, how to reach them, who hosts it. Given by the configuration of the build
 * (`VITE_LEGAL_*`), never written in the code: they are personal data of the publisher.
 */
export const LEGAL = {
  publisher: valueOr(import.meta.env.VITE_LEGAL_PUBLISHER, 'nom de l’éditeur'),
  contact: valueOr(import.meta.env.VITE_LEGAL_CONTACT, 'adresse e-mail de contact'),
  host: valueOr(import.meta.env.VITE_LEGAL_HOST, 'hébergeur de l’application, nom et adresse'),
} as const;

/** Date of the version of the legal pages, shown on each of them. */
export const LEGAL_VERSION_DATE = '24 septembre 2026';
