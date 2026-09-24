import { describe, expect, it } from 'vitest';
import { companyNameOfDomain, companyOfCorrespondent, contactAddressOf } from './domains.js';

const PLATFORMS = new Set(['apec.fr', 'lhh.com']);

describe('companyNameOfDomain', () => {
  it.each([
    ['data-praxis.fr', 'Data Praxis'],
    ['rh.maison-lumen.example', 'Maison Lumen'],
    ['mail.arkema.com', 'Arkema'],
    ['atelier_nova.co.uk', 'Atelier Nova'],
    ['studio-ardent.com', 'Studio Ardent'],
  ])('[RG-03] [BES-32] names the company of %s « %s »', (domain, name) => {
    expect(companyNameOfDomain(domain)).toBe(name);
  });
});

describe('companyOfCorrespondent', () => {
  it('[RG-03] [BES-32] reads the recipient of an application the candidate sent', () => {
    expect(
      companyOfCorrespondent(
        {
          direction: 'outbound',
          fromAddress: 'alex.martin@gmail.com',
          toAddress: 'christophe.deschamps@data-praxis.example',
        },
        PLATFORMS,
      ),
    ).toBe('Data Praxis');
  });

  it('[RG-03] [BES-32] reads the sender of a message received', () => {
    expect(
      companyOfCorrespondent(
        { direction: 'inbound', fromAddress: 'recrutement@atelier-nova.example', toAddress: 'alex@gmail.com' },
        PLATFORMS,
      ),
    ).toBe('Atelier Nova');
  });

  it.each([
    ['a personal mailbox', 'recruteur@gmail.com'],
    ['a known platform', 'ne-pas-repondre@mail.apec.fr'],
    ['a recruitment tool', 'ateme@mail.flatchr.io'],
    ['an ATS', 'maisonlumen@myworkday.com'],
    ['no address', null],
  ])('[RG-03] [RG-19] names no company from %s', (_case, fromAddress) => {
    expect(companyOfCorrespondent({ direction: 'inbound', fromAddress, toAddress: null }, PLATFORMS)).toBeNull();
  });
});

describe('contactAddressOf', () => {
  const received = (fromAddress: string | null, replyToAddress: string | null = null) => ({
    direction: 'inbound' as const,
    fromAddress,
    replyToAddress,
    toAddress: 'alex.martin@example.com',
  });

  it('[RG-20] [BES-34] answers the reply address of a received message before its sender', () => {
    expect(contactAddressOf(received('recrutement@atelier-nova.example'))).toBe('recrutement@atelier-nova.example');
    expect(contactAddressOf(received('no-reply@atelier-nova.example', 'camille.durand@atelier-nova.example'))).toBe(
      'camille.durand@atelier-nova.example',
    );
  });

  it('[RG-20] writes to the first recipient of an application the candidate sent', () => {
    expect(
      contactAddressOf({
        direction: 'outbound',
        fromAddress: 'alex.martin@example.com',
        replyToAddress: null,
        toAddress: 'christophe.deschamps@data-praxis.example',
      }),
    ).toBe('christophe.deschamps@data-praxis.example');
  });

  it.each([
    'no-reply@atelier-nova.example',
    'noreply@myworkday.com',
    'ne-pas-repondre@mail.apec.fr',
    'donotreply@talent.example',
    'do_not_reply@talent.example',
    'notifications@teamtailor-mail.com',
    'mailer-daemon@googlemail.com',
    'NoReply.Candidats@lhh.example',
  ])('[RG-20] never writes to %s, which takes no answer', (address) => {
    expect(contactAddressOf(received(address))).toBeNull();
  });

  it('[RG-20] has no contact when the message names no address', () => {
    expect(contactAddressOf(received(null))).toBeNull();
    expect(
      contactAddressOf({ direction: 'outbound', fromAddress: 'alex@example.com', replyToAddress: null, toAddress: null }),
    ).toBeNull();
  });
});

