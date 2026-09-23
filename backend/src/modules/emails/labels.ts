import type { Database } from '../../db/client.js';
import type { ApplicationStatus } from '../applications/rules.js';
import { type GmailMailbox, hasHttpStatus } from './mailbox.js';
import * as repository from './repository.js';

/** RG-05: status label of each application status; À postuler carries none. */
export const STATUS_LABELS: Readonly<Record<ApplicationStatus, string | null>> = {
  to_apply: null,
  sent: 'Statut/En attente',
  acknowledged: 'Statut/En attente',
  interview: 'Statut/Entretien',
  offer: 'Statut/Entretien',
  rejected: 'Statut/Refusée',
};
const EVERY_STATUS_LABEL = [
  ...new Set(Object.values(STATUS_LABELS).filter((label): label is string => label !== null)),
];

/** EF-GML-15 */
export const JOB_ALERT_LABEL = 'Alertes emploi';
const COMPANY_LABEL_PARENT = 'Candidatures';
// Gmail's id of the inbox, the same in every mailbox.
const INBOX_LABEL_ID = 'INBOX';
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;

/** Gmail holds one label per name whatever its case: two labels differing only by case cannot both exist. */
const labelKey = (name: string): string => name.toLowerCase();

/**
 * EF-GML-13: label of a company's threads, « Candidatures/‹Entreprise› ». Gmail nests labels on « / »: a slash in the
 * company name becomes « - » so that it never creates a sub-label.
 */
export const companyLabelOf = (companyName: string): string =>
  `${COMPANY_LABEL_PARENT}/${companyName.replaceAll('/', '-')}`;

/** Ids of the labels already resolved for a user (table `gmail_labels`), so that a pass rarely lists them. */
export interface LabelCache {
  load: () => Promise<Map<string, string>>;
  save: (name: string, id: string) => Promise<void>;
  clear: () => Promise<void>;
}

/** The label cache of one user, in the database. */
export const databaseLabelCache = (db: Database, userId: number): LabelCache => ({
  load: () => repository.findGmailLabels(db, userId),
  save: (name, gmailLabelId) => repository.saveGmailLabel(db, { userId, name, gmailLabelId }),
  clear: () => repository.deleteGmailLabels(db, userId),
});

/** The threads of one application, its company and its current status. */
export interface LabelTarget {
  threadIds: readonly string[];
  companyName: string;
  status: ApplicationStatus;
}

export interface ThreadLabeler {
  /**
   * EF-GML-13, EF-GML-14: every thread of the application gets the company label and the RG-05 status label, and
   * loses the other status labels. @throws on a Gmail refusal (the cache is forgotten when a label id is refused).
   */
  labelApplication: (target: LabelTarget) => Promise<void>;
  /** EF-GML-15, EF-GML-16: « Alertes emploi » added, inbox removed. */
  labelJobAlert: (threadId: string) => Promise<void>;
}

interface LabelIds {
  /** Id of a label, created with its parent when the mailbox lacks it, then remembered. */
  idOf: (name: string) => Promise<string>;
  /** Id of a label known without asking Gmail (cache, or listing already made); null otherwise. */
  knownIdOf: (name: string) => Promise<string | null>;
  /** Forgets every remembered id, one of them being refused by Gmail. */
  forget: () => Promise<void>;
}

/** Label ids from the cache, else from one listing of the mailbox, else by creating the label on demand. */
const createLabelIds = (mailbox: GmailMailbox, cache: LabelCache): LabelIds => {
  let cached: Map<string, string> | undefined;
  let listed: Map<string, string> | undefined;

  const cachedLabels = async () => (cached ??= await cache.load());
  const listedLabels = async (refresh = false): Promise<Map<string, string>> => {
    if (refresh || !listed) {
      listed = new Map((await mailbox.listLabels()).map((label) => [labelKey(label.name), label.id]));
    }
    return listed;
  };

  /**
   * EF-GML-13: Gmail refuses a name it already holds (409). The label was created outside this pass — by the
   * candidate, or as the parent of a sub-label — so the listing is read again and its id is used.
   */
  const create = async (name: string): Promise<string> => {
    try {
      return await mailbox.createLabel(name);
    } catch (error) {
      if (!hasHttpStatus(error, HTTP_CONFLICT)) throw error;
      const existing = (await listedLabels(true)).get(labelKey(name));
      if (!existing) throw error;
      return existing;
    }
  };

  const createWithParents = async (name: string): Promise<string> => {
    const existing = (await listedLabels()).get(labelKey(name));
    if (existing) return existing;
    const parentEnd = name.lastIndexOf('/');
    if (parentEnd > 0) await createWithParents(name.slice(0, parentEnd));
    const id = await create(name);
    (await listedLabels()).set(labelKey(name), id);
    return id;
  };

  return {
    async idOf(name) {
      const labels = await cachedLabels();
      const known = labels.get(name);
      if (known) return known;
      const id = await createWithParents(name);
      labels.set(name, id);
      await cache.save(name, id);
      return id;
    },
    knownIdOf: async (name) => (await cachedLabels()).get(name) ?? listed?.get(labelKey(name)) ?? null,
    async forget() {
      cached = new Map();
      await cache.clear();
    },
  };
};

/**
 * Label manager of one synchronisation: RG-05 status label and company label on the threads of an application, job
 * alerts out of the inbox. Label ids come from the cache, else from one listing, else from a creation on demand.
 * @req EF-GML-13, EF-GML-14, EF-GML-15, EF-GML-16, RG-05
 */
export const createThreadLabeler = ({
  mailbox,
  cache,
}: {
  mailbox: GmailMailbox;
  cache: LabelCache;
}): ThreadLabeler => {
  const { idOf, knownIdOf, forget } = createLabelIds(mailbox, cache);

  const modify = async (threadId: string, change: { add: string[]; remove: string[] }): Promise<void> => {
    try {
      await mailbox.modifyThread(threadId, change);
    } catch (error) {
      // A label deleted in Gmail leaves a dead id in the cache: forget them all, the next pass resolves them again.
      if (hasHttpStatus(error, HTTP_BAD_REQUEST)) await forget();
      throw error;
    }
  };

  return {
    async labelApplication({ threadIds, companyName, status }) {
      const statusLabel = STATUS_LABELS[status];
      const add = [
        await idOf(companyLabelOf(companyName)),
        ...(statusLabel ? [await idOf(statusLabel)] : []),
      ];
      const others = await Promise.all(
        EVERY_STATUS_LABEL.filter((label) => label !== statusLabel).map(knownIdOf),
      );
      const remove = others.filter((id): id is string => id !== null);
      for (const threadId of threadIds) await modify(threadId, { add, remove });
    },

    async labelJobAlert(threadId) {
      await modify(threadId, { add: [await idOf(JOB_ALERT_LABEL)], remove: [INBOX_LABEL_ID] });
    },
  };
};
