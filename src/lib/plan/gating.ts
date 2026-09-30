// src/lib/plan/gating.ts
import type { Plan } from './types';
import { limitsFor } from './types';

export type GateReason = 'batch-file-limit' | 'workflow-step-limit' | 'save-workflow';

export interface GateCheck {
  allowed: boolean;
  reason?: GateReason;
  message?: string;
}

/** Call before running a batch job. */
export function checkBatchAllowed(plan: Plan, fileCount: number): GateCheck {
  const limit = limitsFor(plan).batchFileLimit;
  if (fileCount <= limit) return { allowed: true };
  return {
    allowed: false,
    reason: 'batch-file-limit',
    message: `Free plan batches are capped at ${limit} files at a time. Upgrade to run this on all ${fileCount} files in one go.`,
  };
}

/** Call before running (not saving) a workflow with the given step count. */
export function checkWorkflowStepsAllowed(plan: Plan, stepCount: number): GateCheck {
  const limit = limitsFor(plan).workflowStepLimit;
  if (stepCount <= limit) return { allowed: true };
  return {
    allowed: false,
    reason: 'workflow-step-limit',
    message: `Free plan workflows are limited to ${limit} steps. Upgrade to chain as many steps as you need.`,
  };
}

/** Call before letting a user save a workflow to their account. */
export function checkCanSaveWorkflow(plan: Plan): GateCheck {
  const limits = limitsFor(plan);
  if (limits.canSaveWorkflows) return { allowed: true };
  return {
    allowed: false,
    reason: 'save-workflow',
    message: 'Saving workflows to your account is a premium feature. You can still build and run one-off workflows for free.',
  };
}
