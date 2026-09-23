import { describe, expect, it } from 'vitest';
import {
  adapterOfSenderDomain,
  chooseAdapter,
  chooseCompanyDomain,
  domainOfAddress,
  isCompanyDomain,
} from './suggestion-rules.js';

const PLATFORMS = new Set(['apec.fr', 'indeed.com', 'hellowork.com']);

describe('domainOfAddress', () => {
  it.each([
    ['recrutement@arkema.com', 'arkema.com'],
    ['Recrutement@Mail.Arkema.COM', 'mail.arkema.com'],
    ['  rh@exemple.fr  ', 'exemple.fr'],
  ])('[RG-19] reads the domain of « %s »', (address, expected) => {
    expect(domainOfAddress(address)).toBe(expected);
  });

  it.each([null, '', 'sans-arobase', 'rh@localhost'])('[RG-19] reads no domain from « %s »', (address) => {
    expect(domainOfAddress(address)).toBeNull();
  });
});

describe('isCompanyDomain — RG-19', () => {
  it('[RG-19] keeps the domain of the company itself', () => {
    expect(isCompanyDomain('arkema.com', PLATFORMS)).toBe(true);
    expect(isCompanyDomain('mail.arkema.com', PLATFORMS)).toBe(true);
  });

  it('[RG-19] drops a known platform, and its subdomains', () => {
    expect(isCompanyDomain('apec.fr', PLATFORMS)).toBe(false);
    expect(isCompanyDomain('notification.apec.fr', PLATFORMS)).toBe(false);
  });

  it('[RG-19] drops a mailbox provider: a recruiter writing from their own address says nothing', () => {
    expect(isCompanyDomain('gmail.com', PLATFORMS)).toBe(false);
    expect(isCompanyDomain('orange.fr', PLATFORMS)).toBe(false);
  });

  it('[RG-19] drops an ATS: it hosts the board, it is not the site of the company', () => {
    expect(isCompanyDomain('greenhouse.io', PLATFORMS)).toBe(false);
    expect(isCompanyDomain('hire.lever.co', PLATFORMS)).toBe(false);
  });
});

describe('chooseCompanyDomain — RG-19', () => {
  it('[RG-19] [EF-VEI-23] keeps the domain seen most often', () => {
    const seen = [
      { domain: 'gmail.com', count: 9 },
      { domain: 'arkema.com', count: 3 },
      { domain: 'jobs.arkema.com', count: 1 },
    ];

    expect(chooseCompanyDomain(seen, PLATFORMS)).toBe('arkema.com');
  });

  it('[RG-19] settles a tie the same way every time', () => {
    const seen = [
      { domain: 'zeta.fr', count: 2 },
      { domain: 'alpha.fr', count: 2 },
    ];

    expect(chooseCompanyDomain(seen, PLATFORMS)).toBe('alpha.fr');
    expect(chooseCompanyDomain([...seen].reverse(), PLATFORMS)).toBe('alpha.fr');
  });

  it('[RG-19] proposes nothing when every sender is a platform or a mailbox', () => {
    const seen = [
      { domain: 'apec.fr', count: 5 },
      { domain: 'gmail.com', count: 2 },
    ];

    expect(chooseCompanyDomain(seen, PLATFORMS)).toBeNull();
  });
});

describe('chooseAdapter — EF-VEI-24', () => {
  it.each([
    ['greenhouse.io', 'greenhouse'],
    ['eu.greenhouse.io', 'greenhouse'],
    ['hire.lever.co', 'lever'],
    ['smartrecruiters.com', 'smartrecruiters'],
    ['recruitee.com', 'recruitee'],
    ['myworkday.com', 'workday'],
  ])('[EF-VEI-24] reads « %s » as the %s board', (domain, adapter) => {
    expect(adapterOfSenderDomain(domain)).toBe(adapter);
  });

  it('[EF-VEI-24] proposes the ATS seen, even when the company writes more often itself', () => {
    const seen = [
      { domain: 'arkema.com', count: 9 },
      { domain: 'greenhouse.io', count: 1 },
    ];

    expect(chooseAdapter(seen)).toBe('greenhouse');
  });

  it('[EF-VEI-24] falls back on the career page when no ATS wrote', () => {
    expect(chooseAdapter([{ domain: 'arkema.com', count: 4 }])).toBe('generic');
    expect(chooseAdapter([])).toBe('generic');
  });
});
