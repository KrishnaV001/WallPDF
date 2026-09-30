// src/lib/pdf-operations/mergePdf.ts
import { PDFDocument } from 'pdf-lib';
import type { ProgressCallback } from './types';

/**
 * Merges N PDFs (in the given order) into a single PDF. This is the one
 * operation that's N-files-in instead of 1-file-in, so it isn't part of the
 * shared PdfTransform<T> shape used by the other operations - batch mode and
 * the workflow builder don't apply to it for the same reason merging doesn't
 * appear as a step type in iLovePDF's own "workflow" tool: merging changes
 * how many files you're even chaining onto the next step.
 */
export async function mergePdfs(files: Uint8Array[], onProgress?: ProgressCallback): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const sourcePdf = await PDFDocument.load(files[i]);
    const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
    onProgress?.(Math.round(((i + 1) / files.length) * 100));
  }

  return mergedPdf.save();
}
