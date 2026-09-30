// src/lib/pdf-operations/types.ts
//
// Shared types for the pure PDF-operation functions in this folder.
// Each operation takes raw PDF bytes plus tool-specific options and returns
// new PDF bytes, with no dependency on React state or the DOM beyond the
// browser APIs (canvas, createImageBitmap) that pdf-lib/image recompression
// already relied on.
//
// Keeping these functions state-free is what lets the SAME logic run from
// three different call sites:
//   1. A single-file run inside ToolWorkspace (today's behaviour)
//   2. A batch run across many files (src/lib/batch.ts)
//   3. A step inside a saved Workflow (src/lib/workflows)

export type ChainableOperationSlug =
  | 'rotate-pdf'
  | 'watermark-pdf'
  | 'add-page-numbers'
  | 'compress-pdf';

// merge-pdf (N files -> 1) and split-pdf (1 file -> 1 file, page subset) have
// different input/output shapes than the four operations above, so they're
// extracted too (mergePdf.ts / splitPdf.ts) but are NOT part of the
// "chainable" set used by batch mode or the workflow builder - see the
// registry.ts comment for why.

export interface RotateOptions {
  /** 1-indexed page number -> cumulative rotation delta to apply. Pages with
   * no entry (or a 0 delta) are left untouched. Ignored if `uniformDelta` is
   * set. */
  rotations?: Record<number, 0 | 90 | 180 | 270>;
  /** When set, applies this delta to every page, regardless of page count -
   * used by batch mode and workflow steps, where there's no rendered
   * per-page thumbnail grid to build a `rotations` map from. */
  uniformDelta?: 90 | 180 | 270;
}

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  /** 0-1 */
  opacity: number;
  rotationDeg: number;
  /** hex, e.g. "#E5252A" */
  color: string;
  layout: 'center' | 'tile';
}

export interface AddPageNumbersOptions {
  position: 'bottom-center' | 'bottom-left' | 'bottom-right' | 'top-center' | 'top-left' | 'top-right';
  start: number;
  format: 'number' | 'number-of-total';
  fontSize: number;
}

export interface CompressOptions {
  /** Target size in KB. Omit/null for a single default-quality pass. */
  targetSizeKb?: number | null;
}

export interface CompressResult {
  bytes: Uint8Array;
  /** User-facing note about what happened (e.g. "no images found to compress"). */
  note: string | null;
}

export interface SplitOptions {
  /** 1-indexed pages to keep, in the order they should appear in the output. */
  pageNumbers: number[];
}

export type ProgressCallback = (percent: number) => void;

// Every "chainable" operation shares this shape: one PDF in, one PDF out.
// compressPdf is the one exception in return type (it also returns a note),
// so it's wrapped by a thin adapter in the registry rather than matching this
// signature directly.
export type PdfTransform<TOptions> = (
  bytes: Uint8Array,
  options: TOptions,
  onProgress?: ProgressCallback
) => Promise<Uint8Array>;
