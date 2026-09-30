// src/lib/workflows/types.ts
import type { ChainableOperationSlug, WatermarkOptions, AddPageNumbersOptions, CompressOptions } from '../pdf-operations/types';

// rotate-pdf's standalone tool options are a per-page map (see
// pdf-operations/types.ts's RotateOptions), which only makes sense once
// you've rendered page thumbnails to rotate individually. A workflow step
// runs on whatever bytes the previous step produced, with no thumbnails
// rendered in between - so a workflow's rotate step is deliberately simpler:
// "rotate every page by this much". runner.ts expands this into a full
// RotateOptions map (using the current page count) right before calling
// rotatePdf.
export interface WorkflowRotateOptions {
  uniformDelta: 90 | 180 | 270;
}

export type WorkflowStepOptions =
  | { slug: 'rotate-pdf'; options: WorkflowRotateOptions }
  | { slug: 'watermark-pdf'; options: WatermarkOptions }
  | { slug: 'add-page-numbers'; options: AddPageNumbersOptions }
  | { slug: 'compress-pdf'; options: CompressOptions };

export interface WorkflowStep {
  id: string;
  slug: ChainableOperationSlug;
  options: WorkflowRotateOptions | WatermarkOptions | AddPageNumbersOptions | CompressOptions;
}

export interface Workflow {
  id?: string;
  name: string;
  steps: WorkflowStep[];
  createdAt?: number;
  updatedAt?: number;
}
