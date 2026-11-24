import express, { type Request, type RequestHandler, Router } from 'express';
import { HttpError, ValidationError } from '../../lib/errors.js';
import { asyncHandler, validate } from '../../lib/http.js';
import type { z } from '../../lib/openapi.js';
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
import { CSV_MAX_BASE64_LENGTH, CSV_TOO_LARGE } from './schemas.js';

/** EF-CAN-23: the routes that receive a CSV file, the only ones of this module allowed a body larger than 100 kB. */
export const IMPORT_PREVIEW_PATH = '/applications/import/preview';
export const IMPORT_PATH = '/applications/import';
// The base64 of a 1 MB file, the mapping and the JSON around them: a larger body is refused (413) before decoding.
const JSON_ENVELOPE_BYTES = 1024;
export const IMPORT_BODY_LIMIT = CSV_MAX_BASE64_LENGTH + JSON_ENVELOPE_BYTES;

const parseImportJson = express.json({ limit: IMPORT_BODY_LIMIT });
const isBodyTooLarge = (error: unknown): boolean =>
  error instanceof Error && Reflect.get(error, 'type') === 'entity.too.large';

/**
 * EF-CAN-23: reads the JSON body of an import route, up to IMPORT_BODY_LIMIT. A larger body is answered 413 with the
 * message of a file beyond 1 MB, not the generic one of the body parser; every other parsing error passes unchanged.
 * @req EF-CAN-23
 */
export const parseImportBody: RequestHandler = (req, res, next) => {
  parseImportJson(req, res, (error?: unknown) => {
    next(isBodyTooLarge(error) ? new HttpError(413, CSV_TOO_LARGE) : error);
  });
};

/**
 * EF-CAN-23: validates the body of an import route. A file beyond 1 MB — the bound of `CsvFileSchema` — is answered
 * 413 with its message, like every other check of the size, never 400.
 * @throws HttpError 413 for a file beyond 1 MB; ValidationError (400) for any other invalid field.
 */
const validateImportBody = <S extends z.ZodType>(req: Request, schema: S): z.infer<S> => {
  try {
    return validate(req, { body: schema }).body;
  } catch (error) {
    const isTooLarge =
      error instanceof ValidationError &&
      error.details.some((issue) => issue.path === 'body.file' && issue.message === CSV_TOO_LARGE);
    throw isTooLarge ? new HttpError(413, CSV_TOO_LARGE) : error;
  }
};

/** EF-CAN-23: preview and import of a CSV file. */
const addImportRoutes = (router: Router, service: ApplicationsService): void => {
  router.post(
    IMPORT_PREVIEW_PATH,
    asyncHandler(async (req, res) => {
      const body = validateImportBody(req, ImportPreviewBodySchema);
      res.status(200).json(service.previewImport(body.file));
    }),
  );
  router.post(
    IMPORT_PATH,
    asyncHandler(async (req, res) => {
      const body = validateImportBody(req, ImportBodySchema);
      res.status(200).json(await service.importCsv(currentUserId(res), body));
    }),
  );
};

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
  addImportRoutes(router, service);
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
