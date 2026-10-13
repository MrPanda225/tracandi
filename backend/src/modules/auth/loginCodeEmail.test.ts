import { describe, expect, it } from 'vitest';
import { buildLoginCodeEmail } from './loginCodeEmail.js';

describe('buildLoginCodeEmail', () => {
  it('[EF-AUT-16] shows the code and its ten-minute validity', () => {
    const email = buildLoginCodeEmail({ code: '042517' });

    expect(email.html).toContain('<strong>042517</strong>');
    expect(email.html).toContain('10 minutes');
  });

  it('[ENF-UTI-01] is written in French and warns whoever did not try to log in', () => {
    const email = buildLoginCodeEmail({ code: '042517' });

    expect(email.subject).toBe('Votre code de connexion Tracandi');
    expect(email.html).toMatch(/Bonjour/);
    expect(email.html).toMatch(/changez votre mot de passe/);
  });

  it('[ENF-RGP-15] carries nothing but the code', () => {
    const email = buildLoginCodeEmail({ code: '042517' });

    expect(email.html).not.toMatch(/http|@/);
  });
});
