import { describe, expect, it } from 'vitest';
import { buildActivationEmail } from './activationEmail.js';

const TOKEN = 'FAKE-TOKEN-xyz_123';
const FRONTEND_ORIGIN = 'http://127.0.0.1:5173';

describe('buildActivationEmail', () => {
  it('[EF-AUT-14] links to /activation with the token as the code query parameter', () => {
    const email = buildActivationEmail({ frontendOrigin: FRONTEND_ORIGIN, token: TOKEN });

    expect(email.html).toContain(`${FRONTEND_ORIGIN}/activation?code=${TOKEN}`);
  });

  it('[ENF-UTI-01] is written in French', () => {
    const email = buildActivationEmail({ frontendOrigin: FRONTEND_ORIGIN, token: TOKEN });

    expect(email.subject).toMatch(/[Aa]ctivez/);
    expect(email.html).toMatch(/Bonjour/);
  });

  it('[ENF-RGP-15] never includes anything but the token and the interface origin', () => {
    const email = buildActivationEmail({ frontendOrigin: FRONTEND_ORIGIN, token: TOKEN });

    expect(email.html).not.toMatch(/mot de passe|password/i);
  });

  it('URL-encodes a token holding characters special to a query string', () => {
    const email = buildActivationEmail({ frontendOrigin: FRONTEND_ORIGIN, token: 'a+b/c=' });

    expect(email.html).toContain(encodeURIComponent('a+b/c='));
    expect(email.html).not.toContain('code=a+b/c=');
  });
});
