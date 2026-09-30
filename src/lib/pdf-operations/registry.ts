// src/lib/pdf-operations/registry.ts
//
// Central list of the "chainable" operations - the ones that are exactly
// one-PDF-in, one-PDF-out with no per-file-count-changing behaviour. These
// are the operations batch mode can loop over and the workflow builder can
// chain together.
//
// merge-pdf (N->1) and split-pdf (1 file, page subset) are deliberately left
// out of this registry: they change the shape of what's flowing through a
// chain (how many files, how many pages) rather than transforming a single
// PDF end-to-end, so - same as iLovePDF's own "workflow" tool - they aren't
// offered as workflow steps here either. They still work fine as standalone
// tools; see mergePdf.ts / splitPdf.ts.
import type {
  ChainableOperationSlug,
  RotateOptions,
  WatermarkOptions,
  AddPageNumbersOptions,
  CompressOptions,
  ProgressCallback,
} from './types';
import { rotatePdf } from './rotatePdf';
import { watermarkPdf } from './watermarkPdf';
import { addPageNumbers } from './addPageNumbers';
import { compressPdf } from './compressPdf';

export interface ChainableOperationMeta<TOptions = any> {
  slug: ChainableOperationSlug;
  label: string;
  /** Runs the operation and returns only the resulting bytes - the shape
   * batch mode and workflow steps need. compress-pdf's extra "note" is
   * available separately via runCompressPdfWithNote below when a caller
   * (e.g. the single-file ToolWorkspace UI) wants to show it. */
  run: (bytes: Uint8Array, options: TOptions, onProgress?: ProgressCallback) => Promise<Uint8Array>;
  /** A reasonable starting point for a new workflow step or a fresh batch run. */
  defaultOptions: TOptions;
}

export const CHAINABLE_OPERATIONS: Record<ChainableOperationSlug, ChainableOperationMeta> = {
  'rotate-pdf': {
    slug: 'rotate-pdf',
    label: 'Rotate PDF',
    run: (bytes, options: RotateOptions) => rotatePdf(bytes, options),
    defaultOptions: { rotations: {} } as RotateOptions,
  },
  'watermark-pdf': {
    slug: 'watermark-pdf',
    label: 'Watermark PDF',
    run: (bytes, options: WatermarkOptions) => watermarkPdf(bytes, options),
    defaultOptions: {
      text: 'CONFIDENTIAL',
      fontSize: 48,
      opacity: 0.3,
      rotationDeg: 45,
      color: '#E5252A',
      layout: 'center',
    } as WatermarkOptions,
  },
  'add-page-numbers': {
    slug: 'add-page-numbers',
    label: 'Add Page Numbers',
    run: (bytes, options: AddPageNumbersOptions) => addPageNumbers(bytes, options),
    defaultOptions: {
      position: 'bottom-center',
      start: 1,
      format: 'number',
      fontSize: 12,
    } as AddPageNumbersOptions,
  },
  'compress-pdf': {
    slug: 'compress-pdf',
    label: 'Compress PDF',
    run: async (bytes, options: CompressOptions, onProgress) => (await compressPdf(bytes, options, onProgress)).bytes,
    defaultOptions: { targetSizeKb: null } as CompressOptions,
  },
};

export const CHAINABLE_SLUGS = Object.keys(CHAINABLE_OPERATIONS) as ChainableOperationSlug[];

/** For call sites (like the single-file ToolWorkspace UI) that want
 * compress-pdf's user-facing note as well as the bytes. */
export { compressPdf as runCompressPdfWithNote } from './compressPdf';
