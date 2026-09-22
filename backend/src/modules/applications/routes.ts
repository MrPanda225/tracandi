import { Router } from 'express';
import { asyncHandler, validate } from '../../lib/http.js';
import { currentUserId } from '../../lib/middleware.js';
import type { ApiModule } from '../../lib/module.js';
import { registerApplicationsDocs } from './docs.js';
import {
  CreateApplicationBodySchema,
  IdParamsSchema,
  ListApplicationsQuerySchema,
  ReattachEmailBodySchema,
  UpdateApplicationBodySchema,
} from './schemas.js';
import type { ApplicationsService } from './service.js';

/**
 * Application and message routes, behind the session guard.
 * @req EF-CAN-01 to EF-CAN-14, EF-AUT-06, ENF-SEC-04
 */
export const createApplicationsModule = (service: ApplicationsService): ApiModule => {
  const router = Router();

  router.get(
    '/applications',
    asyncHandler(async (req, res) => {
      const { query } = validate(req, { query: ListApplicationsQuerySchema });
      res.status(200).json(await service.list(currentUserId(res), query));
    }),
  );
  router.post(
    '/applications',
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: CreateApplicationBodySchema });
      res.status(201).json({ id: await service.create(currentUserId(res), body) });
    }),
  );
  router.get(
    '/applications/:id',
    asyncHandler(async (req, res) => {
      const { params } = validate(req, { params: IdParamsSchema });
      res.status(200).json(await service.get(currentUserId(res), params.id));
    }),
  );
  router.patch(
    '/applications/:id',
    asyncHandler(async (req, res) => {
      const { params, body } = validate(req, { params: IdParamsSchema, body: UpdateApplicationBodySchema });
      await service.update(currentUserId(res), params.id, body);
      res.status(204).end();
    }),
  );
  router.delete(
    '/applications/:id',
    asyncHandler(async (req, res) => {
      const { params } = validate(req, { params: IdParamsSchema });
      await service.remove(currentUserId(res), params.id);
      res.status(204).end();
    }),
  );
  router.get(
    '/applications/:id/emails',
    asyncHandler(async (req, res) => {
      const { params } = validate(req, { params: IdParamsSchema });
      res.status(200).json(await service.listEmails(currentUserId(res), params.id));
    }),
  );
  router.patch(
    '/emails/:id',
    asyncHandler(async (req, res) => {
      const { params, body } = validate(req, { params: IdParamsSchema, body: ReattachEmailBodySchema });
      await service.reattachEmail(currentUserId(res), params.id, body.applicationId);
      res.status(204).end();
    }),
  );

  return { router, registerDocs: registerApplicationsDocs };
};
