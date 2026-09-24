import { describe, expect, it } from 'vitest';
import { companyNameOfDomain, companyOfCorrespondent } from './domains.js';

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
