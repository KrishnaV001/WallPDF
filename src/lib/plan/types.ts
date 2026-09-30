// src/lib/plan/types.ts
export type Plan = 'free' | 'premium';

export interface PlanLimits {
  /** Max files per batch run before an upgrade prompt appears. */
  batchFileLimit: number;
  /** Max steps in a workflow run before an upgrade prompt appears. */
  workflowStepLimit: number;
  /** Whether workflows can be saved to the user's account at all. */
  canSaveWorkflows: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    batchFileLimit: 3,
    workflowStepLimit: 2,
    canSaveWorkflows: false,
  },
  premium: {
    // Still bounded by batch.ts's BATCH_HARD_CAP, which protects the browser
    // tab rather than gating the plan.
    batchFileLimit: Infinity,
    workflowStepLimit: Infinity,
    canSaveWorkflows: true,
  },
};

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}
