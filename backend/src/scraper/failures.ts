/** Même borne que `watched_sites.last_error`. */
const ERROR_MAX_LENGTH = 500;

/**
 * Ce que Node met dans `cause` quand un appel réseau échoue, et ce que ça veut dire pour le candidat. Sans cette
 * traduction, `fetch()` ne dit que « fetch failed », ce qui n'aide personne à corriger l'adresse d'une source.
 */
const NETWORK_CAUSES: Readonly<Record<string, string>> = {
  ENOTFOUND: 'ce domaine n’existe pas',
  EAI_AGAIN: 'ce domaine n’a pas pu être résolu',
  ECONNREFUSED: 'le site a refusé la connexion',
  ECONNRESET: 'le site a coupé la connexion',
  EHOSTUNREACH: 'le site est injoignable',
  ENETUNREACH: 'le réseau est injoignable',
  ETIMEDOUT: 'le site n’a pas répondu à temps',
  UND_ERR_CONNECT_TIMEOUT: 'le site n’a pas répondu à temps',
  UND_ERR_HEADERS_TIMEOUT: 'le site a commencé à répondre puis s’est arrêté',
  CERT_HAS_EXPIRED: 'le certificat du site a expiré',
  ERR_TLS_CERT_ALTNAME_INVALID: 'le certificat du site ne correspond pas à son adresse',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'le certificat du site n’a pas pu être vérifié',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'le site présente un certificat auto-signé',
};

/** Le code que porte une erreur, ou celui de sa cause : `fetch()` enveloppe la vraie raison. */
const codeOf = (error: unknown): string | null => {
  const candidate = error as { code?: unknown; cause?: unknown } | null;
  if (typeof candidate?.code === 'string') return candidate.code;
  return candidate?.cause === undefined || candidate.cause === null ? null : codeOf(candidate.cause);
};

/**
 * Ce qui est enregistré sur une source dont la consultation a échoué, en français et actionnable : le candidat
 * doit pouvoir décider s'il corrige l'adresse, attend, ou retire la source (EF-VEI-11).
 *
 * Ne contient jamais de pile d'appel ni de contenu collecté (ENF-SEC-08).
 * @req EF-VEI-11, ENF-SEC-08
 */
export const describeCollectionFailure = (error: unknown): string => {
  const code = codeOf(error);
  const known = code === null ? undefined : NETWORK_CAUSES[code];
  if (known) return `Le site n’a pas pu être lu : ${known}. Vérifiez l’adresse de la source.`;

  const message = error instanceof Error ? error.message : '';
  // `fetch failed` est le message de Node quand il n'a rien de plus à dire : le répéter n'apprendrait rien.
  if (message === '' || message === 'fetch failed') {
    return code === null
      ? 'Le site n’a pas pu être lu, pour une raison que le serveur n’a pas su nommer.'
      : `Le site n’a pas pu être lu (${code}). Vérifiez l’adresse de la source.`;
  }
  return message.slice(0, ERROR_MAX_LENGTH);
};
