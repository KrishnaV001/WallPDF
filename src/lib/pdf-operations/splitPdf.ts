// src/lib/pdf-operations/splitPdf.ts
import { PDFDocument } from 'pdf-lib';
import type { SplitOptions } from './types';

/**
 * Extracts the given 1-indexed page numbers into a new single PDF, preserving
 * the order they're given in. This is what the "split-pdf" tool actually does
 * today - it's really a page-extraction tool, not a 1-to-many splitter (see
 * the note in the strategy report about this doubling as "remove/extract
 * pages" once a "keep everything except selected" variant is added).
 */
export async function splitPdf(bytes: Uint8Array, options: SplitOptions): Promise<Uint8Array> {
  if (options.pageNumbers.length === 0) {
    throw new Error('Select at least one page to keep.');
  }

  const sourcePdfDoc = await PDFDocument.load(bytes);
  const indicesToCopy = options.pageNumbers.map((p) => p - 1);

  const newPdfDoc = await PDFDocument.create();
  const copiedPages = await newPdfDoc.copyPages(sourcePdfDoc, indicesToCopy);
  copiedPages.forEach((page) => newPdfDoc.addPage(page));

  return newPdfDoc.save();
}
