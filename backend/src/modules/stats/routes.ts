import { Router } from 'express';
import { asyncHandler } from '../../lib/http.js';
import { currentUserId } from '../../lib/middleware.js';
import type { ApiModule } from '../../lib/module.js';
import { errorResponses, jsonResponse, type OpenAPIRegistry, SESSION_SECURITY } from '../../lib/openapi.js';
import { DashboardSchema } from './schemas.js';
import type { StatsService } from './service.js';

const registerStatsDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    tags: ['Tableau de bord'],
    security: SESSION_SECURITY,
    method: 'get',
    path: '/stats/dashboard',
    summary: 'Indicateurs du tableau de bord',
    description:
      'EF-TDB-01 à 09. Taux de réponse selon RG-07, relances selon RG-06 (délai D des réglages), ' +
      'série hebdomadaire des 16 dernières semaines en UTC.',
    responses: { 200: jsonResponse('Indicateurs', DashboardSchema), ...errorResponses(401) },
  });
};

/**
 * Dashboard route, behind the session guard.
 * @req EF-TDB-01 to EF-TDB-09, EF-AUT-06
 */
export const createStatsModule = (service: StatsService): ApiModule => {
  const router = Router();

  router.get(
    '/stats/dashboard',
    asyncHandler(async (_req, res) => {
      res.status(200).json(await service.dashboard(currentUserId(res)));
    }),
  );

  return { router, registerDocs: registerStatsDocs };
};
