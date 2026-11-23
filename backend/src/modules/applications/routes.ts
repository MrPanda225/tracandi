import { Router } from 'express';
import { asyncHandler, validate } from '../../lib/http.js';
import { currentUserId } from '../../lib/middleware.js';
import type { ApiModule } from '../../lib/module.js';
import { registerApplicationsDocs } from './docs.js';
import {
  CreateApplicationBodySchema,
  IdParamsSchema,
  ImportBodySchema,
  ImportPreviewBodySchema,
  ListApplicationsQuerySchema,
  ReattachEmailBodySchema,
  UpdateApplicationBodySchema,
} from './schemas.js';
import type { ApplicationsService } from './service.js';
import { CSV_MAX_BASE64_LENGTH } from './csvImport.js';

/** EF-CAN-23: the routes that receive a CSV file, the only ones of this module allowed a body larger than 100 kB. */
export const IMPORT_PREVIEW_PATH = '/applications/import/preview';
export const IMPORT_PATH = '/applications/import';
// The base64 of a 1 MB file, the mapping and the JSON around them: a larger body is refused (413) before decoding.
const JSON_ENVELOPE_BYTES = 1024;
export const IMPORT_BODY_LIMIT = CSV_MAX_BASE64_LENGTH + JSON_ENVELOPE_BYTES;

/**
 * Application and message routes, behind the session guard.
 * @req EF-CAN-01 to EF-CAN-14, EF-CAN-23, EF-AUT-06, ENF-SEC-04
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
  // Declared before `/applications/:id`, whose parameter would otherwise read « import ».
  router.post(
    IMPORT_PREVIEW_PATH,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: ImportPreviewBodySchema });
      res.status(200).json(service.previewImport(body.file));
    }),
  );
  router.post(
    IMPORT_PATH,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: ImportBodySchema });
      res.status(200).json(await service.importCsv(currentUserId(res), body));
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
