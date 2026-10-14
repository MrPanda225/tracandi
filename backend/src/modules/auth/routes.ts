import { type CookieOptions, type RequestHandler, type Response, Router } from 'express';
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
import {
  AccountSchema,
  ActivateBodySchema,
  DeleteAccountBodySchema,
  LoginBodySchema,
  LoginChallengeSchema,
  LoginResendBodySchema,
  LoginVerifyBodySchema,
  RegisterBodySchema,
  ResendActivationBodySchema,
} from './schemas.js';
import type { AuthService, OpenedSession } from './service.js';

// ENF-SEC-19: at most 10 attempts per 15 minutes and per IP address.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
// EF-AUT-15: a fourth resend request within a minute, for the same address, is refused.
const RESEND_WINDOW_MS = 60 * 1000;
const RESEND_MAX_ATTEMPTS = 3;
const UNKNOWN_RESEND_KEY = 'unknown';

interface AuthModuleDeps {
  service: AuthService;
  isCookieSecure: boolean;
}

const CreatedSchema = z.object({ id: z.number().int() }).openapi('Created');
const SessionSchema = z.object({ account: AccountSchema.nullable() }).openapi('Session');

const registerDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'post',
    path: '/auth/register',
    tags: ['Comptes'],
    summary: 'Créer un compte (inactif) et envoyer l’e-mail d’activation',
    description:
      'EF-AUT-01, EF-AUT-14. Ne pose aucun cookie de session : le compte reste inactif jusqu’à son activation. ' +
      'Limité à 10 tentatives par 15 minutes.',
    request: { body: jsonBody(RegisterBodySchema) },
    responses: {
      201: jsonResponse('Compte créé, e-mail d’activation envoyé', CreatedSchema),
      ...errorResponses(400, 409, 415, 429, 502),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/login',
    tags: ['Comptes'],
    summary: 'Se connecter (étape 1 : mot de passe)',
    description:
      'EF-AUT-03, EF-AUT-14, EF-AUT-16, ENF-SEC-19. Réponse identique (401) pour une adresse inconnue et un mot de passe faux. ' +
      'Un compte existant mais non activé répond 403 avec `code: "account_not_activated"`. Un mot de passe correct ' +
      'n’ouvre aucune session : un code à six chiffres est envoyé par e-mail et un jeton de défi est renvoyé.',
    request: { body: jsonBody(LoginBodySchema) },
    responses: {
      200: jsonResponse('Code envoyé par e-mail, aucun cookie posé', LoginChallengeSchema),
      ...errorResponses(400, 401, 403, 415, 429, 502),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/login/verify',
    tags: ['Comptes'],
    summary: 'Se connecter (étape 2 : code reçu par e-mail)',
    description:
      'EF-AUT-16, ENF-SEC-26. Un code correct et non expiré (10 minutes) ouvre la session (cookie posé). Sinon 401 ' +
      'avec `code` : `login_code_invalid`, `login_code_locked` (cinquième code erroné consécutif : code invalidé) ou ' +
      '`login_code_expired` (aussi pour un défi inconnu).',
    request: { body: jsonBody(LoginVerifyBodySchema) },
    responses: {
      200: jsonResponse('Session ouverte (cookie posé)', AccountSchema),
      ...errorResponses(400, 401, 415, 429),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/login/resend',
    tags: ['Comptes'],
    summary: 'Renvoyer le code de connexion',
    description:
      'EF-AUT-17, ENF-COU-03. Remplace le code et remet les tentatives à zéro. Réponse identique (204) pour un défi ' +
      'inconnu. Limité à 3 demandes par minute pour le même défi ; la quatrième répond 429.',
    request: { body: jsonBody(LoginResendBodySchema) },
    responses: { 204: { description: 'Code renvoyé si le défi existe' }, ...errorResponses(400, 415, 429) },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/activate',
    tags: ['Comptes'],
    summary: 'Activer un compte',
    description:
      'EF-AUT-14, ENF-SEC-26. Consomme le code (ou lien) d’activation à usage unique. `code` dans la réponse ' +
      'd’erreur distingue un code expiré (`activation_code_expired`), déjà utilisé ' +
      '(`activation_code_already_used`) ou invalide (`activation_code_invalid`).',
    request: { body: jsonBody(ActivateBodySchema) },
    responses: { 204: { description: 'Compte activé' }, ...errorResponses(400, 415) },
  });
  registry.registerPath({
    method: 'post',
    path: '/auth/activate/resend',
    tags: ['Comptes'],
    summary: 'Renvoyer l’e-mail d’activation',
    description:
      'EF-AUT-15, ENF-COU-03. Réponse identique (204) que l’adresse ait un compte en attente d’activation ou non. ' +
      'Limité à 3 demandes par minute pour la même adresse ; la quatrième répond 429.',
    request: { body: jsonBody(ResendActivationBodySchema) },
    responses: {
      204: { description: 'E-mail renvoyé si le compte existe et est inactif' },
      ...errorResponses(400, 415, 429),
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
    path: '/auth/session',
    tags: ['Comptes'],
    summary: 'État de la session',
    description: 'EF-AUT-13. Toujours 200 : le compte de la session, ou `null` sans session valide.',
    responses: { 200: jsonResponse('État de la session', SessionSchema) },
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
  registry.registerPath({
    method: 'delete',
    path: '/auth/account',
    tags: ['Comptes'],
    summary: 'Supprimer son compte et toutes ses données',
    description:
      'EF-AUT-11 (droit à l’effacement). Demande le mot de passe ; révoque l’accès Gmail chez Google, supprime ' +
      'toutes les données de l’utilisateur, ferme toutes ses sessions et efface le cookie. Limité comme la connexion.',
    security: SESSION_SECURITY,
    request: { body: jsonBody(DeleteAccountBodySchema) },
    responses: { 204: { description: 'Compte supprimé' }, ...errorResponses(400, 401, 403, 415, 429) },
  });
};

/**
 * EF-AUT-11: deletion of the account. The password is checked again, so guessing it here is limited like a login
 * (ENF-SEC-19); the cookie goes with the account.
 */
const mountAccountDeletion = (
  router: Router,
  {
    service,
    cookieOptions,
    limitAttempts,
  }: { service: AuthService; cookieOptions: CookieOptions; limitAttempts: RequestHandler },
): void => {
  router.delete(
    '/auth/account',
    limitAttempts,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: DeleteAccountBodySchema });
      await service.deleteAccount(currentUserId(res), body.password);
      res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
      res.status(204).end();
    }),
  );
};

/**
 * Account routes: public module (register, login, activate, resend, logout, session state) and protected module
 * (`me`, deletion). The session cookie is `HttpOnly`, `SameSite=Strict`, limited to `/api` and expires with the
 * session (EF-AUT-03). Registering never opens one (EF-AUT-14): the account stays inactive until its activation
 * e-mail is confirmed.
 * @req EF-AUT-01, EF-AUT-02, EF-AUT-03, EF-AUT-04, EF-AUT-08, EF-AUT-11, EF-AUT-13, EF-AUT-14, EF-AUT-15,
 * EF-AUT-16, EF-AUT-17, ENF-SEC-19, ENF-SEC-26, ENF-RGP-15
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
  const createAttemptsLimiter = () =>
    rateLimit({
      windowMs: LOGIN_WINDOW_MS,
      limit: LOGIN_MAX_ATTEMPTS,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Trop de tentatives, réessayez dans 15 minutes' },
    });
  const limitAttempts = createAttemptsLimiter();
  // EF-AUT-16: codes typed get their own count per IP, so confirming a login does not eat the password attempts.
  const limitCodeAttempts = createAttemptsLimiter();
  // EF-AUT-15: keyed by the address itself, not the caller's IP — the limit is "for the same address" and must hold
  // even if the abuse is spread over many addresses from one visitor, or one address probed from many.
  const limitResendAttempts = rateLimit({
    windowMs: RESEND_WINDOW_MS,
    limit: RESEND_MAX_ATTEMPTS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const email = (req.body as { email?: unknown } | undefined)?.email;
      return typeof email === 'string' ? email.trim().toLowerCase() : UNKNOWN_RESEND_KEY;
    },
    message: { error: 'Trop de demandes, réessayez dans une minute' },
  });

  // EF-AUT-17: keyed by the challenge, so a new code is limited for the pending login whatever the caller's address.
  const limitLoginResendAttempts = rateLimit({
    windowMs: RESEND_WINDOW_MS,
    limit: RESEND_MAX_ATTEMPTS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const challenge = (req.body as { challenge?: unknown } | undefined)?.challenge;
      return typeof challenge === 'string' ? challenge : UNKNOWN_RESEND_KEY;
    },
    message: { error: 'Trop de demandes, réessayez dans une minute' },
  });

  const publicRouter = Router();
  publicRouter.post(
    '/auth/register',
    limitAttempts,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: RegisterBodySchema });
      const account = await service.register(body);
      res.status(201).json({ id: account.id });
    }),
  );
  publicRouter.post(
    '/auth/login',
    limitAttempts,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: LoginBodySchema });
      res.status(200).json(await service.login(body));
    }),
  );
  publicRouter.post(
    '/auth/login/verify',
    limitCodeAttempts,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: LoginVerifyBodySchema });
      const session = await service.verifyLogin(body.challenge, body.code);
      setSessionCookie(res, session);
      res.status(200).json(await service.getAccount(session.userId));
    }),
  );
  publicRouter.post(
    '/auth/login/resend',
    limitAttempts,
    limitLoginResendAttempts,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: LoginResendBodySchema });
      await service.resendLoginCode(body.challenge);
      res.status(204).end();
    }),
  );
  publicRouter.post(
    '/auth/activate',
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: ActivateBodySchema });
      await service.activateAccount(body.code);
      res.status(204).end();
    }),
  );
  publicRouter.post(
    '/auth/activate/resend',
    limitAttempts,
    limitResendAttempts,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: ResendActivationBodySchema });
      await service.requestActivationResend(body.email);
      res.status(204).end();
    }),
  );
  // EF-AUT-13: a visitor without a session is an expected state, not an error the browser should report.
  publicRouter.get(
    '/auth/session',
    asyncHandler(async (req, res) => {
      const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
      const userId = token ? await service.authenticate(token) : null;
      res.status(200).json({ account: userId === null ? null : await service.findAccount(userId) });
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
  mountAccountDeletion(protectedRouter, { service, cookieOptions, limitAttempts });

  return [
    { router: publicRouter, isPublic: true, registerDocs },
    { router: protectedRouter, registerDocs: () => undefined },
  ];
};
