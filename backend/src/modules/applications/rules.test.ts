import { describe, expect, it } from 'vitest';
import { normalizeKey } from '../../lib/text.js';
import {
  type ApplicationStatus,
  decideAttachment,
  isFollowUpDue,
  laterOf,
  lastActivityAfterDateChange,
  resolveCompanyName,
  shouldReplaceStatus,
  statusOfCategory,
} from './rules.js';

const day = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

describe('normalizeKey', () => {
  it.each([
    ["McDonald's", 'mcdonald s'],
    ['  Société   Générale ', 'societe generale'],
    ['Équipier polyvalent (H/F)', 'equipier polyvalent h f'],
    ['DATA-Engineer_Junior', 'data engineer junior'],
    ['***', ''],
  ])('[RG-14] normalizes %j to %j', (name, key) => {
    expect(normalizeKey(name)).toBe(key);
  });
});

describe('shouldReplaceStatus', () => {
  it.each<[ApplicationStatus, ApplicationStatus, boolean]>([
    ['sent', 'acknowledged', true],
    ['acknowledged', 'interview', true],
    ['interview', 'acknowledged', false],
    ['interview', 'sent', false],
    ['interview', 'interview', false],
    ['interview', 'rejected', true],
    ['rejected', 'offer', true],
    ['offer', 'rejected', true],
    ['rejected', 'interview', false],
    ['to_apply', 'sent', true],
  ])('[RG-04] current %s, incoming %s → replace = %s', (current, incoming, expected) => {
    expect(shouldReplaceStatus(current, incoming)).toBe(expected);
  });
});

describe('statusOfCategory', () => {
  it('[RG-02] maps each application message category to its status', () => {
    expect(statusOfCategory('sent_application')).toBe('sent');
    expect(statusOfCategory('acknowledged')).toBe('acknowledged');
    expect(statusOfCategory('interview')).toBe('interview');
    expect(statusOfCategory('offer')).toBe('offer');
    expect(statusOfCategory('rejected')).toBe('rejected');
  });

  it('[RG-02] a job alert changes no application', () => {
    expect(statusOfCategory('job_alert')).toBeNull();
  });
});

describe('isFollowUpDue', () => {
  const now = day('2026-09-22');

  it('[RG-06] flags a sent application without activity for 11 days with D = 10 (EF-CAN-12)', () => {
    expect(isFollowUpDue({ status: 'sent', lastActivityAt: day('2026-09-11'), hasContact: true }, now, 10)).toBe(true);
  });

  it('[RG-06] flags an acknowledged application past the delay', () => {
    expect(isFollowUpDue({ status: 'acknowledged', lastActivityAt: day('2026-09-01'), hasContact: true }, now, 10)).toBe(true);
  });

  it('[RG-06] does not flag exactly D days of inactivity', () => {
    expect(isFollowUpDue({ status: 'sent', lastActivityAt: day('2026-09-12'), hasContact: true }, now, 10)).toBe(false);
  });

  it('[RG-06] [BES-34] never flags an application nobody can be written to', () => {
    expect(isFollowUpDue({ status: 'sent', lastActivityAt: day('2026-09-01'), hasContact: false }, now, 10)).toBe(
      false,
    );
  });

  it.each<ApplicationStatus>(['to_apply', 'interview', 'offer', 'rejected'])(
    '[RG-06] never flags an application in status %s',
    (status) => {
      expect(isFollowUpDue({ status, lastActivityAt: day('2026-01-01'), hasContact: true }, now, 10)).toBe(false);
    },
  );
});

describe('resolveCompanyName', () => {
  it('[RG-03] keeps the real employer when identified', () => {
    expect(resolveCompanyName({ employer: 'Innova Solutions', platform: 'APEC' })).toBe('Innova Solutions');
  });

  it('[RG-03] falls back to the platform when the employer is unknown', () => {
    expect(resolveCompanyName({ employer: null, platform: 'LHH' })).toBe('LHH');
  });

  it('[RG-03] falls back to « Entreprise inconnue » without employer nor platform', () => {
    expect(resolveCompanyName({ employer: '  ', platform: null })).toBe('Entreprise inconnue');
  });
});

describe('decideAttachment', () => {
  const applications = [
    { id: 1, jobTitleKey: 'equipier polyvalent', lastActivityAt: day('2026-09-01') },
    { id: 2, jobTitleKey: 'data analyst', lastActivityAt: day('2026-09-10') },
  ];

  it('[RG-03] (b) attaches to the application with the same normalized title', () => {
    expect(decideAttachment('Équipier Polyvalent', applications)).toEqual({
      kind: 'existing',
      applicationId: 1,
    });
  });

  it('[RG-03] (b→d) creates an application with the mentioned title when none matches', () => {
    expect(decideAttachment(' Vendeur ', applications)).toEqual({ kind: 'new', jobTitle: 'Vendeur' });
  });

  it('[RG-03] (c) attaches a message without title to the most recently active application', () => {
    expect(decideAttachment(null, applications)).toEqual({ kind: 'existing', applicationId: 2 });
  });

  it('[RG-03] (d) creates « Candidature » when the company has no application and no title is mentioned', () => {
    expect(decideAttachment(null, [])).toEqual({ kind: 'new', jobTitle: 'Candidature' });
  });

  it('[RG-03] treats a title without letters or digits as no title', () => {
    expect(decideAttachment('---', applications)).toEqual({ kind: 'existing', applicationId: 2 });
  });
});

describe('laterOf', () => {
  it('[RG-04] keeps the later of two activity dates', () => {
    expect(laterOf(day('2026-09-10'), day('2026-09-01'))).toEqual(day('2026-09-10'));
    expect(laterOf(day('2026-09-01'), day('2026-09-10'))).toEqual(day('2026-09-10'));
  });
});

describe('lastActivityAfterDateChange', () => {
  const applied = new Date('2026-09-10T12:00:00.000Z');

  it('[RG-16] follows the new date when nothing happened since the creation', () => {
    const current = { appliedAt: applied, lastActivityAt: applied };

    expect(lastActivityAfterDateChange(current, new Date('2026-09-01T12:00:00.000Z'))).toEqual(
      new Date('2026-09-01T12:00:00.000Z'),
    );
    expect(lastActivityAfterDateChange(current, new Date('2026-09-15T12:00:00.000Z'))).toEqual(
      new Date('2026-09-15T12:00:00.000Z'),
    );
  });

  it('[RG-16] keeps a more recent activity, and takes a later date otherwise', () => {
    const current = { appliedAt: applied, lastActivityAt: new Date('2026-09-18T09:00:00.000Z') };

    expect(lastActivityAfterDateChange(current, new Date('2026-09-01T12:00:00.000Z'))).toEqual(
      new Date('2026-09-18T09:00:00.000Z'),
    );
    expect(lastActivityAfterDateChange(current, new Date('2026-09-20T12:00:00.000Z'))).toEqual(
      new Date('2026-09-20T12:00:00.000Z'),
    );
  });
});
