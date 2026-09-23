import { describe, expect, it } from 'vitest';
import { createFakeGmail, type FakeGmail } from '../../../tests/fixtures/emails/fakeGmail.js';
import { LONG_NEWSLETTER, SENT_APPLICATION } from '../../../tests/fixtures/emails/messages.js';
import { companyLabelOf, createThreadLabeler, type LabelCache, STATUS_LABELS } from './labels.js';
import { createGmailMailbox } from './mailbox.js';

const SENT_THREAD = SENT_APPLICATION.threadId ?? '';
const ALERT_THREAD = LONG_NEWSLETTER.threadId ?? '';

const memoryCache = (initial: Record<string, string> = {}): LabelCache & { entries: Map<string, string> } => {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    load: () => Promise.resolve(new Map(entries)),
    save: (name, id) => {
      entries.set(name, id);
      return Promise.resolve();
    },
    clear: () => {
      entries.clear();
      return Promise.resolve();
    },
  };
};

const setUp = (options: { existingLabels?: string[]; cache?: ReturnType<typeof memoryCache> } = {}) => {
  const gmail: FakeGmail = createFakeGmail([SENT_APPLICATION, LONG_NEWSLETTER], {
    existingLabels: options.existingLabels ?? [],
  });
  const cache = options.cache ?? memoryCache();
  const labeler = createThreadLabeler({ mailbox: createGmailMailbox(gmail.client), cache });
  return { gmail, cache, labeler };
};

describe('RG-05 status labels', () => {
  it('[RG-05] maps each status to its label, À postuler to none', () => {
    expect(STATUS_LABELS).toEqual({
      to_apply: null,
      sent: 'Statut/En attente',
      acknowledged: 'Statut/En attente',
      interview: 'Statut/Entretien',
      offer: 'Statut/Entretien',
      rejected: 'Statut/Refusée',
    });
  });

  it('[EF-GML-13] names the company label « Candidatures/‹Entreprise› », a slash never nesting it further', () => {
    expect(companyLabelOf("McDonald's")).toBe("Candidatures/McDonald's");
    expect(companyLabelOf('Hays / Michael Page')).toBe('Candidatures/Hays - Michael Page');
  });
});

describe('createThreadLabeler — applications', () => {
  it('[EF-GML-13] [EF-GML-14] labels a thread with its company and its status, creating the labels and parents', async () => {
    const { gmail, labeler } = setUp();

    await labeler.labelApplication({ threadIds: [SENT_THREAD], companyName: "McDonald's", status: 'sent' });

    expect(gmail.labelsOfThread(SENT_THREAD)).toEqual([
      "Candidatures/McDonald's",
      'SENT',
      'Statut/En attente',
    ]);
    expect(gmail.createdLabels).toEqual([
      'Candidatures',
      "Candidatures/McDonald's",
      'Statut',
      'Statut/En attente',
    ]);
  });

  it('[EF-GML-13] reuses a label the candidate already holds, whatever its case', async () => {
    const { gmail, labeler } = setUp({ existingLabels: ['candidatures', 'candidatures/atelier nova'] });

    await labeler.labelApplication({
      threadIds: [SENT_THREAD],
      companyName: 'Atelier Nova',
      status: 'sent',
    });

    // Gmail holds one label per name whatever its case: creating it again would be refused.
    expect(gmail.createdLabels).toEqual(['Statut', 'Statut/En attente']);
    expect(gmail.labelsOfThread(SENT_THREAD)).toContain('candidatures/atelier nova');
  });

  it('[EF-GML-13] uses the label Gmail already holds when it refuses to create it', async () => {
    const gmail = createFakeGmail([SENT_APPLICATION, LONG_NEWSLETTER], {
      existingLabels: ['Candidatures', 'Candidatures/Atelier Nova'],
    });
    // The label was created after this pass listed the labels: Gmail answers 409 to the creation.
    let listings = 0;
    const staleFirstListing = {
      ...gmail.client,
      listLabels: (params: Parameters<typeof gmail.client.listLabels>[0]) => {
        listings += 1;
        return listings === 1 ? Promise.resolve({ data: { labels: [] } }) : gmail.client.listLabels(params);
      },
    };
    const labeler = createThreadLabeler({
      mailbox: createGmailMailbox(staleFirstListing),
      cache: memoryCache(),
    });

    await labeler.labelApplication({
      threadIds: [SENT_THREAD],
      companyName: 'Atelier Nova',
      status: 'sent',
    });

    expect(gmail.createdLabels).toEqual(['Statut', 'Statut/En attente']);
    expect(gmail.labelsOfThread(SENT_THREAD)).toContain('Candidatures/Atelier Nova');
  });

  it('[EF-GML-14] keeps a single status label: « En attente » goes when the thread reaches « Entretien »', async () => {
    const { gmail, labeler } = setUp();
    await labeler.labelApplication({
      threadIds: [SENT_THREAD],
      companyName: "McDonald's",
      status: 'acknowledged',
    });

    await labeler.labelApplication({
      threadIds: [SENT_THREAD],
      companyName: "McDonald's",
      status: 'interview',
    });

    expect(gmail.labelsOfThread(SENT_THREAD)).toEqual([
      "Candidatures/McDonald's",
      'SENT',
      'Statut/Entretien',
    ]);
  });

  it('[RG-05] removes every status label from an application back to « À postuler »', async () => {
    const { gmail, labeler } = setUp();
    await labeler.labelApplication({
      threadIds: [SENT_THREAD],
      companyName: 'Atelier Nova',
      status: 'rejected',
    });

    await labeler.labelApplication({
      threadIds: [SENT_THREAD],
      companyName: 'Atelier Nova',
      status: 'to_apply',
    });

    expect(gmail.labelsOfThread(SENT_THREAD)).toEqual(['Candidatures/Atelier Nova', 'SENT']);
  });

  it('[EF-GML-13] labels every thread of the application', async () => {
    const { gmail, labeler } = setUp();
    const threads = [SENT_THREAD, LONG_NEWSLETTER.threadId ?? ''];

    await labeler.labelApplication({ threadIds: threads, companyName: 'Maison Lumen', status: 'offer' });

    for (const thread of threads) expect(gmail.labelsOfThread(thread)).toContain('Statut/Entretien');
  });

  it('[EF-GML-13] reuses a label already in the mailbox, and remembers the ids it learnt', async () => {
    const { gmail, cache, labeler } = setUp({ existingLabels: ['Candidatures', "Candidatures/McDonald's"] });

    await labeler.labelApplication({ threadIds: [SENT_THREAD], companyName: "McDonald's", status: 'sent' });
    await labeler.labelApplication({
      threadIds: [SENT_THREAD],
      companyName: "McDonald's",
      status: 'interview',
    });

    expect(gmail.createdLabels).toEqual(['Statut', 'Statut/En attente', 'Statut/Entretien']);
    expect(gmail.labelListings()).toBe(1);
    expect([...cache.entries.keys()].sort()).toEqual([
      "Candidatures/McDonald's",
      'Statut/En attente',
      'Statut/Entretien',
    ]);
  });

  it('[EF-GML-13] starts from the ids remembered by an earlier synchronisation, without listing the labels', async () => {
    const first = setUp();
    await first.labeler.labelApplication({
      threadIds: [SENT_THREAD],
      companyName: "McDonald's",
      status: 'sent',
    });
    const labeler = createThreadLabeler({
      mailbox: createGmailMailbox(first.gmail.client),
      cache: first.cache,
    });
    const listingsBefore = first.gmail.labelListings();

    await labeler.labelApplication({ threadIds: [SENT_THREAD], companyName: "McDonald's", status: 'sent' });

    expect(first.gmail.labelListings()).toBe(listingsBefore);
  });

  it('[EF-GML-13] forgets the remembered ids when Gmail refuses one, deleted by the user', async () => {
    const { gmail, cache, labeler } = setUp();
    await labeler.labelApplication({ threadIds: [SENT_THREAD], companyName: "McDonald's", status: 'sent' });
    gmail.deleteLabel('Statut/En attente');
    const next = createThreadLabeler({ mailbox: createGmailMailbox(gmail.client), cache });

    await expect(
      next.labelApplication({ threadIds: [SENT_THREAD], companyName: "McDonald's", status: 'sent' }),
    ).rejects.toThrow('Invalid label');
    expect(cache.entries.size).toBe(0);

    await createThreadLabeler({ mailbox: createGmailMailbox(gmail.client), cache }).labelApplication({
      threadIds: [SENT_THREAD],
      companyName: "McDonald's",
      status: 'sent',
    });
    expect(gmail.labelsOfThread(SENT_THREAD)).toContain('Statut/En attente');
  });
});

describe('createThreadLabeler — job alerts', () => {
  it('[EF-GML-15] [EF-GML-16] labels a job alert « Alertes emploi » and takes it out of the inbox', async () => {
    const { gmail, labeler } = setUp();

    await labeler.labelJobAlert(ALERT_THREAD);

    expect(gmail.labelsOfThread(ALERT_THREAD)).toEqual(['Alertes emploi', 'UNREAD']);
    expect(gmail.modifyCalls.at(-1)?.requestBody?.removeLabelIds).toEqual(['INBOX']);
  });
});
