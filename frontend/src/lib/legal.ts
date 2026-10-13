/**
 * EF-LEG-01: who publishes the site, how to reach them, who hosts it. Defaults chosen by the Business Owner
 * (24/09/2026); a deployment may override each of them through the configuration of the build (`VITE_LEGAL_*`).
 */
export const LEGAL = {
  publisher: import.meta.env.VITE_LEGAL_PUBLISHER?.trim() || 'Sahiré YAPI',
  contact: import.meta.env.VITE_LEGAL_CONTACT?.trim() || 'sahireyapi33@gmail.com',
  host:
    import.meta.env.VITE_LEGAL_HOST?.trim() ||
    'Vercel Inc. (vercel.com) pour l’interface, et Northflank Ltd (northflank.com) pour le serveur de l’application',
} as const;

/** Date of the version of the legal pages, shown on each of them. */
export const LEGAL_UPDATED_ON = '13 octobre 2026';
