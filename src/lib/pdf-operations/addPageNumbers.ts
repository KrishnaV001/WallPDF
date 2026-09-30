// src/lib/pdf-operations/addPageNumbers.ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { AddPageNumbersOptions } from './types';

/**
 * Stamps a page number (or "N / total") onto every page at the chosen
 * corner/edge. Ported unchanged from ToolWorkspace's inline
 * 'add-page-numbers' handler.
 */
export async function addPageNumbers(bytes: Uint8Array, options: AddPageNumbersOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(bytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const total = pages.length;
  const margin = 24;

  pages.forEach((page, idx) => {
    const { width, height } = page.getSize();
    const num = options.start + idx;
    const label = options.format === 'number-of-total' ? `${num} / ${total}` : `${num}`;
    const textWidth = font.widthOfTextAtSize(label, options.fontSize);

    let x = width / 2 - textWidth / 2;
    let y = margin;
    if (options.position.startsWith('top')) {
      y = height - margin - options.fontSize;
    }
    if (options.position.endsWith('left')) {
      x = margin;
    } else if (options.position.endsWith('right')) {
      x = width - margin - textWidth;
    }

    page.drawText(label, { x, y, size: options.fontSize, font, color: rgb(0, 0, 0) });
  });

  return pdfDoc.save();
}
