import { jobName, runCounter, runOutcome, triggerType } from '../../db/schema.js';
import { idParam } from '../../lib/ids.js';
import { z } from '../../lib/openapi.js';

/** EF-EXE-03: state of one execution, as the interface follows it. */
export const RunStateSchema = z
  .object({
    id: z.number().int().positive(),
    job: z.enum(jobName.enumValues),
    trigger: z.enum(triggerType.enumValues),
    outcome: z.enum(runOutcome.enumValues).openapi({
      description: 'queued (en attente), running (en cours), success, failure, skipped',
    }),
    counters: z.record(z.enum(runCounter.enumValues), z.number().int().nonnegative()),
    error: z.string().nullable(),
  })
  .openapi('RunState');

/** EF-EXE-01: what a demand of long treatment answers, without waiting for it. */
export const AcceptedRunSchema = z
  .object({ runId: z.number().int().positive().openapi({ description: 'Exécution à suivre (EF-EXE-03)' }) })
  .openapi('AcceptedRun');

export const RunIdParamsSchema = z.object({ id: idParam() });
