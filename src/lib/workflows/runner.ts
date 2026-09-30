// src/lib/workflows/runner.ts
import { CHAINABLE_OPERATIONS } from '../pdf-operations/registry';
import type { WorkflowStep, WorkflowRotateOptions } from './types';

/**
 * Runs each step's operation in order, feeding each step's output bytes into
 * the next. Deliberately sequential (not parallel) since each step depends
 * on the previous one's output - there's nothing to parallelize here anyway.
 */
export async function runWorkflow(
  fileBytes: Uint8Array,
  steps: WorkflowStep[],
  onProgress?: (completedSteps: number, totalSteps: number) => void
): Promise<Uint8Array> {
  let bytes = fileBytes;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const operation = CHAINABLE_OPERATIONS[step.slug];

    if (step.slug === 'rotate-pdf') {
      // The workflow's simplified "rotate everything by X" maps straight
      // onto rotatePdf's uniformDelta option - no per-page map needed.
      const { uniformDelta } = step.options as WorkflowRotateOptions;
      bytes = await operation.run(bytes, { uniformDelta });
    } else {
      bytes = await operation.run(bytes, step.options as any);
    }

    onProgress?.(i + 1, steps.length);
  }

  return bytes;
}
