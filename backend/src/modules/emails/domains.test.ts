import { describe, expect, it } from 'vitest';
import {
  companyNameOfDomain,
  companyOfCorrespondent,
  contactAddressOf,
  isContactAddress,
  latestContactOf,
} from './domains.js';

const PLATFORMS = new Set(['apec.fr', 'lhh.com', 'indeed.com']);

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
    ['a recruitment tool', 'atelier-nova@mail.flatchr.io'],
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
  const contactOf = (message: Parameters<typeof contactAddressOf>[0]) => contactAddressOf(message, PLATFORMS);

  it('[RG-20] [BES-34] answers the reply address of a received message before its sender', () => {
    expect(contactOf(received('recrutement@atelier-nova.example'))).toBe('recrutement@atelier-nova.example');
    expect(contactOf(received('no-reply@atelier-nova.example', 'camille.durand@atelier-nova.example'))).toBe(
      'camille.durand@atelier-nova.example',
    );
  });

  it('[RG-20] prefers the recruiter named as Reply-To of a message a recruitment tool sent', () => {
    expect(contactOf(received('atelier-nova@teamtailor-mail.com', 'camille.durand@atelier-nova.example'))).toBe(
      'camille.durand@atelier-nova.example',
    );
  });

  it('[RG-20] writes to the first recipient of an application the candidate sent', () => {
    expect(
      contactOf({
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
    // Reported in production (30/09/2026): the no-reply word after a prefix.
    'jobs-noreply@linkedin.example',
    'invitations.noreply@talent.example',
    'recrutement+noreply@atelier-nova.example',
    'candidats-notification@talent.example',
  ])('[RG-20] never writes to %s, which takes no answer', (address) => {
    expect(contactOf(received(address))).toBeNull();
  });

  // BES-45 (30/09/2026): the follow-up proposed the address of the tool the recruiter answered through.
  it.each([
    ['a recruitment tool', 'atelier-nova@mail.flatchr.io'],
    ['a recruitment tool, sub-domain included', 'atelier-nova.recrutement@atelier-nova.teamtailor-mail.com'],
    ['an ATS an adapter reads', 'talent@us.greenhouse-mail.io'],
    ['a job board', 'candidature@free-work.com'],
    ['a known platform', 'conseiller@apec.fr'],
    ['a known platform, sub-domain included', 'offres@mail.indeed.com'],
  ])('[RG-20] [RG-19] never writes to %s', (_case, address) => {
    expect(contactOf(received(address))).toBeNull();
    expect(
      contactOf({ direction: 'outbound', fromAddress: 'alex.martin@example.com', replyToAddress: null, toAddress: address }),
    ).toBeNull();
  });

  it('[RG-20] still writes to a recruiter from a personal mailbox, which is no platform', () => {
    expect(contactOf(received('camille.durand@gmail.com'))).toBe('camille.durand@gmail.com');
  });

  it('[RG-20] still writes to a recruiter whose name merely contains « notification » or « bounce »', () => {
    expect(contactOf(received('notificationsmith@atelier-nova.example'))).toBe('notificationsmith@atelier-nova.example');
    expect(contactOf(received('j.bounceur@atelier-nova.example'))).toBe('j.bounceur@atelier-nova.example');
  });

  it('[RG-20] has no contact when the message names no address', () => {
    expect(contactOf(received(null))).toBeNull();
    expect(
      contactOf({ direction: 'outbound', fromAddress: 'alex@example.com', replyToAddress: null, toAddress: null }),
    ).toBeNull();
  });
});

describe('isContactAddress', () => {
  it('[RG-20] accepts a recruiter of the company, refuses a no-reply or a platform address', () => {
    expect(isContactAddress('camille.durand@atelier-nova.example', PLATFORMS)).toBe(true);
    expect(isContactAddress('jobs-noreply@atelier-nova.example', PLATFORMS)).toBe(false);
    expect(isContactAddress('atelier-nova@mail.flatchr.io', PLATFORMS)).toBe(false);
  });
});

describe('latestContactOf', () => {
  const contact = (address: string) => ({ address, gmailThreadId: `thread-${address}` });

  it('[RG-20] answers the contact of the most recent message that carries one', () => {
    expect(
      latestContactOf([contact('camille.durand@atelier-nova.example'), contact('rh@atelier-nova.example')], PLATFORMS),
    ).toEqual(contact('camille.durand@atelier-nova.example'));
  });

  it('[RG-20] falls back on the previous message when the latest was stored with a platform or no-reply address', () => {
    expect(
      latestContactOf(
        [
          contact('atelier-nova@teamtailor-mail.com'),
          contact('jobs-noreply@atelier-nova.example'),
          contact('offres@mail.indeed.com'),
          contact('camille.durand@atelier-nova.example'),
        ],
        PLATFORMS,
      ),
    ).toEqual(contact('camille.durand@atelier-nova.example'));
  });

  it('[RG-20] has no contact when every stored address is refused, or none is stored', () => {
    expect(latestContactOf([contact('atelier-nova@mail.flatchr.io')], PLATFORMS)).toBeNull();
    expect(latestContactOf([], PLATFORMS)).toBeNull();
  });
});
