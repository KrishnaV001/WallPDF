// src/lib/batch.ts
//
// Generalizes the loop-and-zip pattern that already existed inline for
// compress-image and jpg-to-png (see ToolWorkspace) so the four chainable PDF
// operations (rotate/watermark/page-numbers/compress) can run across many
// files the same way.
//
// Deliberately sequential, not parallel: loading several PDFs into pdf-lib at
// once in a browser tab risks real memory spikes on large files. Sequential
// processing is slower but far safer for a client-only architecture with no
// server to fall back on if a tab crashes.
import JSZip from 'jszip';
import { CHAINABLE_OPERATIONS } from './pdf-operations/registry';
import type { ChainableOperationSlug } from './pdf-operations/types';

export interface BatchFileResult {
  name: string;
  originalSize: number;
  outputSize: number;
  blob: Blob;
  error?: string;
}

export interface BatchResult {
  results: BatchFileResult[];
  /** A single Blob to offer for download: the one output file directly, or a
   * zip of all outputs when there's more than one. */
  downloadBlob: Blob;
  downloadIsZip: boolean;
  failedCount: number;
}

/** Hard cap on files per batch run, independent of the plan-based limits in
 * src/lib/plan/gating.ts. This one exists purely to protect the browser tab
 * from a runaway job, not as a monetization lever. */
export const BATCH_HARD_CAP = 25;

export async function runBatch(
  files: File[],
  slug: ChainableOperationSlug,
  options: any,
  onProgress?: (completed: number, total: number) => void
): Promise<BatchResult> {
  if (files.length === 0) throw new Error('No files provided.');
  if (files.length > BATCH_HARD_CAP) {
    throw new Error(`Batch runs are capped at ${BATCH_HARD_CAP} files at a time to keep the browser tab responsive.`);
  }

  const operation = CHAINABLE_OPERATIONS[slug];
  const results: BatchFileResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const inputBytes = new Uint8Array(await file.arrayBuffer());
      const outputBytes = await operation.run(inputBytes, options);
      const outputBuffer = outputBytes.buffer.slice(
        outputBytes.byteOffset,
        outputBytes.byteOffset + outputBytes.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([outputBuffer], { type: 'application/pdf' });
      const baseName = file.name.replace(/\.pdf$/i, '');
      results.push({
        name: `${baseName}-${slug}.pdf`,
        originalSize: file.size,
        outputSize: blob.size,
        blob,
      });
    } catch (err: any) {
      results.push({
        name: file.name,
        originalSize: file.size,
        outputSize: 0,
        blob: new Blob([]),
        error: err?.message || 'Failed to process this file.',
      });
    }
    onProgress?.(i + 1, files.length);
  }

  const succeeded = results.filter((r) => !r.error);
  const failedCount = results.length - succeeded.length;

  if (succeeded.length === 0) {
    throw new Error('None of the selected files could be processed.');
  }

  let downloadBlob: Blob;
  let downloadIsZip: boolean;

  if (succeeded.length === 1) {
    downloadBlob = succeeded[0].blob;
    downloadIsZip = false;
  } else {
    const zip = new JSZip();
    succeeded.forEach((r) => zip.file(r.name, r.blob));
    downloadBlob = await zip.generateAsync({ type: 'blob' });
    downloadIsZip = true;
  }

  return { results, downloadBlob, downloadIsZip, failedCount };
}
