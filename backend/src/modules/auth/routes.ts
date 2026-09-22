import { type CookieOptions, type Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { readCookie } from '../../lib/cookies.js';
import { asyncHandler, validate } from '../../lib/http.js';
import { currentUserId } from '../../lib/middleware.js';
import type { ApiModule } from '../../lib/module.js';
import {
  errorResponses,
  jsonBody,
  jsonResponse,
  type OpenAPIRegistry,
  SESSION_COOKIE_NAME,
  SESSION_SECURITY,
  z,
} from '../../lib/openapi.js';
import { AccountSchema, LoginBodySchema, RegisterBodySchema } from './schemas.js';
import type { AuthService, OpenedSession } from './service.js';

// ENF-SEC-19: at most 10 attempts per 15 minutes and per IP address.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

interface AuthModuleDeps {
  service: AuthService;
  isCookieSecure: boolean;
}

const CreatedSchema = z.object({ id: z.number().int() }).openapi('Created');

const registerDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'post',
    path: '/auth/register',
    tags: ['Comptes'],
    summary: 'Créer un compte et ouvrir une session',
    description: 'EF-AUT-01, EF-AUT-02. Pose le cookie de session. Limité à 10 tentatives par 15 minutes.',
    request: { body: jsonBody(RegisterBodySchema) },
    responses: {
      201: jsonResponse('Compte créé, session ouverte', CreatedSchema),
      ...errorResponses(400, 409, 415, 429),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/login',
    tags: ['Comptes'],
    summary: 'Se connecter',
    description:
      'EF-AUT-03, ENF-SEC-19. Réponse identique pour une adresse inconnue et un mot de passe faux.',
    request: { body: jsonBody(LoginBodySchema) },
    responses: {
      200: jsonResponse('Session ouverte (cookie posé)', AccountSchema),
      ...errorResponses(400, 401, 415, 429),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/logout',
    tags: ['Comptes'],
    summary: 'Se déconnecter',
    description: 'EF-AUT-04. Invalide la session côté serveur et efface le cookie. Sans effet sans session.',
    responses: { 204: { description: 'Session fermée' }, ...errorResponses(415) },
  });
  registry.registerPath({
    method: 'get',
    path: '/auth/me',
    tags: ['Comptes'],
    summary: 'Compte connecté',
    description: 'EF-AUT-08.',
    security: SESSION_SECURITY,
    responses: { 200: jsonResponse('Compte de la session', AccountSchema), ...errorResponses(401) },
  });
};

/**
 * Account routes: public module (register, login, logout) and protected module (`me`).
 * The session cookie is `HttpOnly`, `SameSite=Strict`, limited to `/api` and expires with the session (EF-AUT-03).
 * @req EF-AUT-01, EF-AUT-02, EF-AUT-03, EF-AUT-04, EF-AUT-08, ENF-SEC-19
 */
export const createAuthModules = ({ service, isCookieSecure }: AuthModuleDeps): ApiModule[] => {
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: isCookieSecure,
    path: '/api',
  };
  const setSessionCookie = (res: Response, session: OpenedSession) => {
    res.cookie(SESSION_COOKIE_NAME, session.token, { ...cookieOptions, expires: session.expiresAt });
  };
  const limitAttempts = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    limit: LOGIN_MAX_ATTEMPTS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Trop de tentatives, réessayez dans 15 minutes' },
  });

  const publicRouter = Router();
  publicRouter.post(
    '/auth/register',
    limitAttempts,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: RegisterBodySchema });
      const session = await service.register(body);
      setSessionCookie(res, session);
      res.status(201).json({ id: session.userId });
    }),
  );
  publicRouter.post(
    '/auth/login',
    limitAttempts,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: LoginBodySchema });
      const session = await service.login(body);
      setSessionCookie(res, session);
      res.status(200).json(await service.getAccount(session.userId));
    }),
  );
  publicRouter.post(
    '/auth/logout',
    asyncHandler(async (req, res) => {
      const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
      if (token) await service.logout(token);
      res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
      res.status(204).end();
    }),
  );

  const protectedRouter = Router();
  protectedRouter.get(
    '/auth/me',
    asyncHandler(async (_req, res) => {
      res.status(200).json(await service.getAccount(currentUserId(res)));
    }),
  );

  return [
    { router: publicRouter, isPublic: true, registerDocs },
    { router: protectedRouter, registerDocs: () => undefined },
  ];
};
