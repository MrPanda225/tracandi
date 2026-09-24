import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler, validate } from '../../lib/http.js';
import { currentUserId } from '../../lib/middleware.js';
import type { ApiModule } from '../../lib/module.js';
import type { GmailConnectionService } from './connection.js';
import { registerGmailDocs } from './docs.js';
import { AuthorizationAnswerQuerySchema, GmailSettingsBodySchema } from './schemas.js';
import type { GmailSync } from './sync.js';

// Stricter limit on the OAuth routes (rules/security.md): no guessing of a state in bursts (ENF-SEC-14).
const OAUTH_WINDOW_MS = 15 * 60_000;
export const OAUTH_MAX_REQUESTS = 20;

interface GmailModulesDeps {
  service: GmailConnectionService;
  sync: GmailSync;
  /** The settings screen of this origin receives the outcome of the connection. */
  frontendOrigin: string;
}

/**
 * EF-EXE-01: the executions reading the mailbox are queued, the answer never waits for them (ENF-PERF-06): the
 * manual synchronisation, and the reading again of the acknowledgements (EF-GML-20).
 */
const mountQueuedRuns = (router: Router, sync: GmailSync): void => {
  router.post(
    '/gmail/sync',
    asyncHandler(async (_req, res) => {
      res.status(202).json({ runId: await sync.synchronise(currentUserId(res), 'manual') });
    }),
  );
  router.post(
    '/gmail/reclassify',
    asyncHandler(async (_req, res) => {
      res.status(202).json({ runId: await sync.reclassify(currentUserId(res)) });
    }),
  );
};

/**
 * Gmail routes: Google's redirection is public (it arrives without the session cookie, the state identifies the
 * user); the consent address, the status, the disconnection, the manual synchronisation and the reading again of
 * the acknowledgements need a session.
 * @req EF-GML-01, EF-GML-02, EF-GML-04, EF-GML-17, EF-GML-20, EF-CFG-01, ENF-SEC-14
 */
export const createGmailModules = ({ service, sync, frontendOrigin }: GmailModulesDeps): ApiModule[] => {
  const limitOAuth = rateLimit({
    windowMs: OAUTH_WINDOW_MS,
    limit: OAUTH_MAX_REQUESTS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Trop de tentatives de connexion Gmail, réessayez dans 15 minutes' },
  });

  const publicRouter = Router();
  publicRouter.get(
    '/gmail/callback',
    limitOAuth,
    asyncHandler(async (req, res) => {
      const answer = AuthorizationAnswerQuerySchema.safeParse(req.query);
      const outcome = answer.success ? await service.completeAuthorization(answer.data) : 'failed';
      res.redirect(302, `${frontendOrigin}/reglages?gmail=${outcome}`);
    }),
  );

  const protectedRouter = Router();
  protectedRouter.get(
    '/gmail/authorization-url',
    limitOAuth,
    asyncHandler((_req, res) => {
      res.status(200).json({ url: service.authorizationUrl(currentUserId(res)) });
      return Promise.resolve();
    }),
  );
  protectedRouter.get(
    '/gmail/status',
    asyncHandler(async (_req, res) => {
      res.status(200).json(await service.status(currentUserId(res)));
    }),
  );
  protectedRouter.delete(
    '/gmail/connection',
    asyncHandler(async (_req, res) => {
      await service.disconnect(currentUserId(res));
      res.status(204).end();
    }),
  );
  protectedRouter.patch(
    '/gmail/settings',
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: GmailSettingsBodySchema });
      await service.setSyncPreferences(currentUserId(res), body);
      res.status(204).end();
    }),
  );
  mountQueuedRuns(protectedRouter, sync);

  return [
    { router: publicRouter, isPublic: true, registerDocs: registerGmailDocs },
    { router: protectedRouter, registerDocs: () => undefined },
  ];
};
