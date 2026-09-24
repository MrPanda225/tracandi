import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import * as repository from './repository.js';

type Applications = Awaited<ReturnType<typeof repository.readApplications>>;
type Messages = Awaited<ReturnType<typeof repository.readMessages>>;
type History = Awaited<ReturnType<typeof repository.readStatusHistory>>;
type Watch = Awaited<ReturnType<typeof repository.readWatch>>;

/**
 * The file handed to the user (EF-AUT-12): readable as is, each company holding its applications, each application
 * its status history and messages. Internal ids are kept: they let the parts of the file refer to one another.
 */
export type UserDataExport = { exportedAt: Date } & Awaited<ReturnType<typeof repository.readAccountData>> & {
    companies: unknown[];
    unattachedEmails: Messages['emails'];
    watchedSites: unknown[];
  } & Omit<Messages, 'emails'> &
  Awaited<ReturnType<typeof repository.readActivity>>;

export interface AccountService {
  /** EF-AUT-12: every datum held on the user, nothing of anyone else, no secret (ENF-SEC-02). */
  exportData(userId: number): Promise<UserDataExport>;
}

/** Companies with their applications, each with its history and messages, and their CV versions. */
const nestCompanies = (data: Applications, history: History, messages: Messages['emails']) =>
  data.companies.map((company) => ({
    ...company,
    applications: data.applications
      .filter((application) => application.companyId === company.id)
      .map((application) => ({
        ...application,
        statusHistory: history.filter((change) => change.applicationId === application.id),
        emails: messages.filter((email) => email.applicationId === application.id),
      })),
    cvVersions: data.cvVersions.filter((version) => version.companyId === company.id),
  }));

const nestWatch = (watch: Watch) =>
  watch.watchedSites.map((site) => ({
    ...site,
    offers: watch.jobOffers.filter((offer) => offer.siteId === site.id),
  }));

/**
 * Creates the account service (GDPR rights exercised in the application).
 * @req EF-AUT-12, EF-AUT-06
 */
export const createAccountService = ({ db, clock }: { db: Database; clock: Clock }): AccountService => ({
  async exportData(userId) {
    const [account, owned, messages, activity] = await Promise.all([
      repository.readAccountData(db, userId),
      repository.readApplications(db, userId),
      repository.readMessages(db, userId),
      repository.readActivity(db, userId),
    ]);
    const [history, watch] = await Promise.all([
      repository.readStatusHistory(
        db,
        owned.applications.map((application) => application.id),
      ),
      repository.readWatch(
        db,
        owned.companies.map((company) => company.id),
      ),
    ]);
    return {
      exportedAt: clock(),
      ...account,
      companies: nestCompanies(owned, history, messages.emails),
      unattachedEmails: messages.emails.filter((email) => email.applicationId === null),
      watchedSites: nestWatch(watch),
      processedMessages: messages.processedMessages,
      ...activity,
    };
  },
});
