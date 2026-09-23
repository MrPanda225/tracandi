import { Router } from 'express';
import type { JobQueue, RunState } from '../../jobs/queue.js';
import { NotFoundError } from '../../lib/errors.js';
import { asyncHandler, validate } from '../../lib/http.js';
import { currentUserId } from '../../lib/middleware.js';
import type { ApiModule } from '../../lib/module.js';
import {
  errorResponses,
  jsonResponse,
  type OpenAPIRegistry,
  SESSION_SECURITY,
} from '../../lib/openapi.js';
import { RunIdParamsSchema, RunStateSchema } from './schemas.js';

const TAG = ['Exécutions'];
// A comment line every 20 s: a proxy or a browser drops a stream that says nothing for too long.
const KEEP_ALIVE_MS = 20_000;

const registerJobsDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'get',
    path: '/jobs/{id}',
    summary: 'État d’une exécution',
    description: 'EF-EXE-03. En attente, en cours, terminée ou en échec, avec ses compteurs.',
    request: { params: RunIdParamsSchema },
    responses: { 200: jsonResponse('État de l’exécution', RunStateSchema), ...errorResponses(400, 401, 404) },
  });
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'get',
    path: '/jobs/stream',
    summary: 'Suivi des exécutions en direct',
    description:
      'EF-EXE-04. Flux `text/event-stream` : un événement `run` à chaque changement d’état des exécutions du ' +
      'candidat, et un commentaire toutes les 20 s pour tenir la liaison. Le navigateur se reconnecte seul.',
    responses: {
      200: { description: 'Flux d’événements (text/event-stream)' },
      ...errorResponses(401),
    },
  });
};

/**
 * Executions of the long treatments: their state, and the stream that pushes every change to the interface
 * (EF-EXE-03, EF-EXE-04). Server-sent events rather than a socket: the interface only listens, and a stream needs
 * no protocol upgrade, no library and reconnects on its own.
 * @req EF-EXE-03, EF-EXE-04, EF-AUT-06
 */
export const createJobsModule = (queue: JobQueue): ApiModule => {
  const router = Router();

  router.get(
    '/jobs/stream',
    asyncHandler((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      res.write(': flux ouvert\n\n');
      const send = (state: RunState) => res.write(`event: run\ndata: ${JSON.stringify(state)}\n\n`);
      const stop = queue.follow(currentUserId(res), send);
      const beat = setInterval(() => res.write(': encore là\n\n'), KEEP_ALIVE_MS);
      res.on('close', () => {
        clearInterval(beat);
        stop();
      });
      return Promise.resolve();
    }),
  );

  router.get(
    '/jobs/:id',
    asyncHandler(async (req, res) => {
      const { params } = validate(req, { params: RunIdParamsSchema });
      const state = await queue.stateOf(currentUserId(res), params.id);
      if (!state) throw new NotFoundError('Exécution introuvable');
      res.status(200).json(state);
    }),
  );

  return { router, registerDocs: registerJobsDocs };
};
