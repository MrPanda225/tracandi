import { Router } from 'express';
import type { AiAssignments } from '../../llm/assignments.js';
import type { ApiModule } from '../../lib/module.js';
import { errorResponses, jsonResponse, type OpenAPIRegistry, SESSION_SECURITY } from '../../lib/openapi.js';
import { AiAssignmentsSchema } from './schemas.js';

const registerSettingsDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    tags: ['Réglages'],
    security: SESSION_SECURITY,
    method: 'get',
    path: '/settings/ai',
    summary: 'Fournisseurs d’IA configurés et tâches confiées',
    description:
      'EF-CFG-02. Fournisseurs dont la clé est configurée, avec leur modèle, et pour chaque tâche les fournisseurs ' +
      'dans l’ordre d’appel (RG-13). Aucune clé n’est renvoyée.',
    responses: { 200: jsonResponse('Configuration de l’IA', AiAssignmentsSchema), ...errorResponses(401) },
  });
};

/**
 * Settings read by the settings screen, behind the session guard. The AI configuration is the server's: the same
 * for every user, computed once at start.
 * @req EF-CFG-02
 */
export const createSettingsModule = (aiAssignments: AiAssignments): ApiModule => {
  const router = Router();

  router.get('/settings/ai', (_req, res) => {
    res.status(200).json(aiAssignments);
  });

  return { router, registerDocs: registerSettingsDocs };
};
