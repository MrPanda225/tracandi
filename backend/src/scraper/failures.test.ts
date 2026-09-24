import { describe, expect, it } from 'vitest';
import { describeCollectionFailure } from './failures.js';

/** Ce que `fetch()` de Node lève : un message vide de sens, et la vraie raison dans `cause`. */
const fetchFailure = (code: string): Error =>
  Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('boom'), { code }) });

describe('describeCollectionFailure — EF-VEI-11', () => {
  it.each([
    ['ENOTFOUND', 'ce domaine n’existe pas'],
    ['ECONNREFUSED', 'le site a refusé la connexion'],
    ['ETIMEDOUT', 'le site n’a pas répondu à temps'],
    ['CERT_HAS_EXPIRED', 'le certificat du site a expiré'],
  ])('[EF-VEI-11] says what %s means, in words the candidate can act on', (code, expected) => {
    const message = describeCollectionFailure(fetchFailure(code));

    expect(message).toContain(expected);
    expect(message).toContain('Vérifiez l’adresse');
    // Jamais le message opaque de Node, qui n'apprend rien.
    expect(message).not.toContain('fetch failed');
  });

  it('[EF-VEI-11] reads the cause however deep `fetch` buried it', () => {
    const nested = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('outer'), {
        cause: Object.assign(new Error('inner'), { code: 'ENOTFOUND' }),
      }),
    });

    expect(describeCollectionFailure(nested)).toContain('ce domaine n’existe pas');
  });

  it('[EF-VEI-11] names the code when it does not know it, rather than repeating « fetch failed »', () => {
    const message = describeCollectionFailure(fetchFailure('EPROTO'));

    expect(message).toContain('EPROTO');
    expect(message).not.toBe('fetch failed');
  });

  it('[EF-VEI-11] says plainly when nothing at all was named', () => {
    expect(describeCollectionFailure(new TypeError('fetch failed'))).toContain('n’a pas su nommer');
  });

  it('[EF-VEI-11] keeps a message that already says something', () => {
    // Celui des erreurs du collecteur, déjà écrit pour le candidat (robots.txt, quota, taille).
    const refused = new Error('Greenhouse a répondu 503.');

    expect(describeCollectionFailure(refused)).toBe('Greenhouse a répondu 503.');
  });

  it('[ENF-SEC-08] never carries a stack nor an object dump', () => {
    const message = describeCollectionFailure(fetchFailure('ENOTFOUND'));

    expect(message).not.toContain('at ');
    expect(message.length).toBeLessThan(200);
  });
});
