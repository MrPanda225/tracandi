import { Router } from 'express';
import type { AiAssignments } from '../../llm/assignments.js';
import type { EnabledFeatures } from '../../lib/features.js';
import type { ApiModule } from '../../lib/module.js';
import { errorResponses, jsonResponse, type OpenAPIRegistry, SESSION_SECURITY } from '../../lib/openapi.js';
import { AiAssignmentsSchema, EnabledFeaturesSchema } from './schemas.js';

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
  registry.registerPath({
    tags: ['Réglages'],
    security: SESSION_SECURITY,
    method: 'get',
    path: '/settings/features',
    summary: 'Fonctionnalités facultatives activées',
    description:
      'ENF-MAI-07. Fonctionnalités facultatives que ce déploiement exécute ; l’interface n’affiche que leurs écrans. ' +
      'Une fonctionnalité absente n’expose aucune route.',
    responses: {
      200: jsonResponse('Fonctionnalités activées', EnabledFeaturesSchema),
      ...errorResponses(401),
    },
  });
};

/**
 * Settings read by the interface, behind the session guard. The AI configuration and the enabled features are the
 * server's: the same for every user, computed once at start.
 * @req EF-CFG-02, ENF-MAI-07
 */
export const createSettingsModule = ({
  aiAssignments,
  features,
}: {
  aiAssignments: AiAssignments;
  features: EnabledFeatures;
}): ApiModule => {
  const router = Router();
  const enabledFeatures = { features: [...features] };

  router.get('/settings/ai', (_req, res) => {
    res.status(200).json(aiAssignments);
  });

  router.get('/settings/features', (_req, res) => {
    res.status(200).json(enabledFeatures);
  });

  return { router, registerDocs: registerSettingsDocs };
};
