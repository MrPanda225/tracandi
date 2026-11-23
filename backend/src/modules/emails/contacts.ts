import { isContactAddress } from './domains.js';
import * as repository from './repository.js';
import type { Executor } from './repository.js';

/**
 * RG-20, RG-06: forgets the contact addresses kept before the rule refused them (no-reply, platform, recruitment tool,
 * job board, RG-19), so that a stored contact address is always one a follow-up can be written to. « À relancer »
 * (EF-CAN-12), the follow-ups of the dashboard (EF-TDB-07) and the follow-up draft (EF-CAN-17) then agree on old
 * messages as on new ones. Idempotent: a second call clears nothing.
 * @returns how many addresses were forgotten.
 * @req RG-20, RG-06
 */
export const clearRefusedContacts = async (db: Executor, userId: number): Promise<number> => {
  const [stored, platforms] = await Promise.all([
    repository.listEmailContacts(db, userId),
    repository.findPlatformDomains(db),
  ]);
  const platformDomains: ReadonlySet<string> = new Set(platforms.keys());
  const refused = stored
    .filter(({ contactAddress }) => !isContactAddress(contactAddress, platformDomains))
    .map(({ emailId }) => emailId);
  await repository.clearEmailContacts(db, userId, refused);
  return refused.length;
};
