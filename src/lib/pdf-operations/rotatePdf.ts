// src/lib/pdf-operations/rotatePdf.ts
import { PDFDocument, degrees } from 'pdf-lib';
import type { RotateOptions } from './types';

/**
 * Applies a per-page rotation delta on top of whatever rotation each page
 * already has. `options.rotations` is keyed by 1-indexed page number; pages
 * with no entry (or a 0 delta) are left untouched.
 *
 * Ported unchanged from ToolWorkspace's inline 'rotate-pdf' handler.
 */
export async function rotatePdf(bytes: Uint8Array, options: RotateOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes);
  const pages = pdfDoc.getPages();

  pages.forEach((page, idx) => {
    const pageNumber = idx + 1;
    const delta = options.uniformDelta ?? options.rotations?.[pageNumber] ?? 0;
    if (delta !== 0) {
      const baseAngle = page.getRotation().angle;
      page.setRotation(degrees((baseAngle + delta) % 360));
    }
  });

  return pdfDoc.save();
}

/** Convenience for batch/workflow use: rotate every page in the document by
 * the same delta, instead of a per-page map. */
export function uniformRotation(delta: 90 | 180 | 270, pageCount: number): RotateOptions['rotations'] {
  const rotations: RotateOptions['rotations'] = {};
  for (let i = 1; i <= pageCount; i++) rotations[i] = delta;
  return rotations;
}
