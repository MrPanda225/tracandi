import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/http.js';
import { currentUserId } from '../../lib/middleware.js';
import type { ApiModule } from '../../lib/module.js';
import type { GmailConnectionService } from './connection.js';
import { registerGmailDocs } from './docs.js';
import { AuthorizationAnswerQuerySchema } from './schemas.js';

// Stricter limit on the OAuth routes (rules/security.md): no guessing of a state in bursts (ENF-SEC-14).
const OAUTH_WINDOW_MS = 15 * 60_000;
export const OAUTH_MAX_REQUESTS = 20;

interface GmailModulesDeps {
  service: GmailConnectionService;
  /** The settings screen of this origin receives the outcome of the connection. */
  frontendOrigin: string;
}

/**
 * Gmail connection routes: Google's redirection is public (it arrives without the session cookie, the state
 * identifies the user); the consent address, the status and the disconnection need a session.
 * @req EF-GML-01, EF-GML-02, EF-CFG-01, ENF-SEC-14
 */
export const createGmailModules = ({ service, frontendOrigin }: GmailModulesDeps): ApiModule[] => {
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

  return [
    { router: publicRouter, isPublic: true, registerDocs: registerGmailDocs },
    { router: protectedRouter, registerDocs: () => undefined },
  ];
};
