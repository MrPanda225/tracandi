import { llmProvider, llmTask } from '../../db/schema.js';
import { OPTIONAL_FEATURES } from '../../lib/features.js';
import { z } from '../../lib/openapi.js';

const ProviderNameSchema = z.enum(llmProvider.enumValues).openapi({ description: 'Fournisseur d’IA' });

/** EF-CFG-02 */
export const AiAssignmentsSchema = z
  .object({
    providers: z
      .array(z.object({ name: ProviderNameSchema, model: z.string() }))
      .openapi({ description: 'Fournisseurs configurés (clé présente) et leur modèle' }),
    tasks: z
      .array(
        z.object({
          task: z.enum(llmTask.enumValues),
          providers: z
            .array(ProviderNameSchema)
            .openapi({ description: 'Fournisseur chargé de la tâche, puis secours (RG-13)' }),
        }),
      )
      .openapi({ description: 'Chaque tâche IA et ses fournisseurs configurés, dans l’ordre d’appel' }),
  })
  .openapi('AiAssignments');

/** ENF-MAI-07 */
export const EnabledFeaturesSchema = z
  .object({
    features: z
      .array(z.enum(OPTIONAL_FEATURES))
      .openapi({
        description: 'Fonctionnalités facultatives activées : `watch` (veille des offres), `cv` (Atelier CV)',
      }),
  })
  .openapi('EnabledFeatures');
