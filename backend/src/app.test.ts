import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { HttpError } from './lib/errors.js';
import { createLogger } from './lib/logger.js';

const FRONTEND_ORIGIN = 'http://127.0.0.1:5173';

interface LogEntry {
  level: string;
  message: string;
}

/** Real logger whose output lines are captured, so sanitization is tested end to end. */
const createCapturedLogger = () => {
  const lines: string[] = [];
  const logger = createLogger({ write: (line) => lines.push(line) });
  return {
    logger,
    lines,
    entries: (): LogEntry[] => lines.map((line) => JSON.parse(line) as LogEntry),
  };
};

const buildTestRouter = (): Router => {
  const router = Router();
  router.get('/boom', () => {
    throw new Error('connection to postgresql://app:s3cret@db.example/prod failed');
  });
  router.get('/teapot', () => {
    throw new HttpError(409, 'Cette source est déjà surveillée');
  });
  router.post('/echo', (req, res) => {
    res.status(200).json({ received: req.body as unknown });
  });
  router.delete('/items/1', (_req, res) => {
    res.status(204).end();
  });
  return router;
};

const VALID_SESSION = 'tracandi_session=valid-token';

const buildProtectedRouter = (): Router => {
  const router = Router();
  router.get('/private', (_req, res) => {
    res.status(200).json({ userId: res.locals.userId });
  });
  return router;
};

const buildApp = () => {
  const captured = createCapturedLogger();
  const app = createApp({
    config: { frontendOrigin: FRONTEND_ORIGIN },
    logger: captured.logger,
    authenticate: (token) => Promise.resolve(token === 'valid-token' ? 7 : null),
    modules: [
      { router: buildTestRouter(), isPublic: true, registerDocs: () => undefined },
      { router: buildProtectedRouter(), registerDocs: () => undefined },
    ],
  });
  return { app, logs: captured };
};

describe('GET /api/health', () => {
  it('[ENF-SEC-11] answers requests coming from the frontend origin, with the matching CORS header', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/health').set('Origin', FRONTEND_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBe(FRONTEND_ORIGIN);
  });

  it('[ENF-SEC-11] answers same-origin requests that carry no Origin header', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
  });
});

describe('cross-origin guard', () => {
  it('[ENF-SEC-11] rejects a request from another origin with 403 and no CORS header', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/health').set('Origin', 'https://evil.example');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Origine non autorisée' });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('[ENF-SEC-11] never executes a write handler for a foreign origin', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/echo')
      .set('Origin', 'http://localhost:5173')
      .set('Content-Type', 'application/json')
      .send({ a: 1 });

    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty('received');
  });

  it("[ENF-SEC-11] accepts a same-origin request from the API's own pages (Swagger UI)", async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/echo')
      .set('Host', '127.0.0.1:4000')
      .set('Origin', 'http://127.0.0.1:4000')
      .set('Content-Type', 'application/json')
      .send({ a: 1 });

    expect(response.status).toBe(200);
  });

  it('[ENF-SEC-11] answers the preflight request of the frontend origin', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .options('/api/echo')
      .set('Origin', FRONTEND_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(FRONTEND_ORIGIN);
    expect(response.headers['access-control-allow-headers']).toMatch(/content-type/i);
  });
});

describe('JSON-only guard', () => {
  it.each([
    ['text/plain', 'a=1'],
    ['application/x-www-form-urlencoded', 'a=1'],
    ['multipart/form-data; boundary=x', '--x--'],
  ])('[ENF-SEC-12] rejects a POST sent as %s with 415', async (contentType, payload) => {
    const { app } = buildApp();

    const response = await request(app).post('/api/echo').set('Content-Type', contentType).send(payload);

    expect(response.status).toBe(415);
    expect(response.body).toEqual({ error: 'Le type de contenu doit être application/json' });
  });

  it('[ENF-SEC-12] rejects a POST without Content-Type with 415', async () => {
    const { app } = buildApp();

    const response = await request(app).post('/api/echo');

    expect(response.status).toBe(415);
  });

  it('[ENF-SEC-12] rejects a DELETE without Content-Type with 415', async () => {
    const { app } = buildApp();

    const response = await request(app).delete('/api/items/1');

    expect(response.status).toBe(415);
  });

  it('[ENF-SEC-12] accepts application/json with a charset parameter', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/echo')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(JSON.stringify({ a: 1 }));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: { a: 1 } });
  });

  it('[ENF-SEC-12] accepts a DELETE declared as application/json', async () => {
    const { app } = buildApp();

    const response = await request(app).delete('/api/items/1').set('Content-Type', 'application/json');

    expect(response.status).toBe(204);
  });

  it('[ENF-SEC-04] rejects malformed JSON with 400', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/api/echo')
      .set('Content-Type', 'application/json')
      .send('{"a":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Corps JSON invalide' });
  });
});

describe('central error handler', () => {
  it('[ENF-SEC-08] masks an unexpected error behind a generic 500 message', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Erreur interne du serveur' });
    expect(JSON.stringify(response.body)).not.toMatch(/postgresql|s3cret|stack/);
  });

  it('[ENF-SEC-08] logs the unexpected error without the credentials it contains', async () => {
    const { app, logs } = buildApp();

    await request(app).get('/api/boom');

    const errorEntry = logs.entries().find((entry) => entry.level === 'error');
    expect(errorEntry).toBeDefined();
    expect(logs.lines.join('\n')).not.toContain('s3cret');
  });

  it('[ENF-SEC-04] exposes the status and message of an operational HttpError', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/teapot');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Cette source est déjà surveillée' });
  });

  it('[ENF-SEC-04] answers an unknown API route with a JSON 404 once authenticated', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/unknown').set('Cookie', VALID_SESSION);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Ressource introuvable' });
  });

  it('[EF-AUT-05] does not reveal which API routes exist without a session', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/unknown');

    expect(response.status).toBe(401);
  });
});

describe('session guard', () => {
  it('[EF-AUT-05] rejects a protected route without session cookie with 401', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/private');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authentification requise' });
  });

  it('[EF-AUT-05] rejects an unknown or expired session token with 401', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/private').set('Cookie', 'tracandi_session=forged');

    expect(response.status).toBe(401);
  });

  it('[EF-AUT-06] exposes the authenticated user to protected handlers', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/private').set('Cookie', `theme=dark; ${VALID_SESSION}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: 7 });
  });

  it('[EF-AUT-05] keeps health and documentation public', async () => {
    const { app } = buildApp();

    const [health, spec] = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/openapi.json'),
    ]);

    expect(health.status).toBe(200);
    expect(spec.status).toBe(200);
  });
});

describe('API documentation', () => {
  it('[EF-DOC-01] publishes an OpenAPI 3 document with the session security scheme', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/openapi.json');

    expect(response.body).toMatchObject({
      openapi: expect.stringMatching(/^3\./) as unknown,
      paths: { '/health': { get: expect.any(Object) as unknown } },
      components: { securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie' } } },
    });
  });

  it('[EF-DOC-02] serves the Swagger UI page', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/docs/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger-ui');
  });
});

describe('request logging', () => {
  it('[ENF-SEC-08] logs method, path and status but never the query string', async () => {
    const { app, logs } = buildApp();

    await request(app).get('/api/health?code=oauth-secret-code');

    const serialized = logs.lines.join('\n');
    expect(serialized).toContain('/api/health');
    expect(serialized).not.toContain('oauth-secret-code');
  });
});

describe('hardening', () => {
  it('[T-001] sets standard security headers and hides the framework', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('[T-001] applies a global rate limit', async () => {
    const { app } = buildApp();

    const response = await request(app).get('/api/health');

    expect(response.headers['ratelimit-policy']).toBeDefined();
  });
});
