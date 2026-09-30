// src/lib/pdf-operations/watermarkPdf.ts
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import type { WatermarkOptions } from './types';

// Converts a "#RRGGBB" hex color into the 0-1 component range pdf-lib's
// rgb() expects. Falls back to black on anything malformed. (Same helper
// that lived inline in ToolWorkspace.)
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(match[1], 16) / 255,
    g: parseInt(match[2], 16) / 255,
    b: parseInt(match[3], 16) / 255,
  };
}

/**
 * Stamps a text watermark onto every page, either centered once or tiled in
 * a repeating grid. Ported unchanged from ToolWorkspace's inline
 * 'watermark-pdf' handler.
 */
export async function watermarkPdf(bytes: Uint8Array, options: WatermarkOptions): Promise<Uint8Array> {
  const text = options.text.trim();
  if (!text) throw new Error('Watermark text cannot be empty.');

  const pdfDoc = await PDFDocument.load(bytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { r, g, b } = hexToRgb(options.color);
  const color = rgb(r, g, b);
  const textWidth = font.widthOfTextAtSize(text, options.fontSize);

  pdfDoc.getPages().forEach((page) => {
    const { width, height } = page.getSize();

    if (options.layout === 'center') {
      page.drawText(text, {
        x: width / 2 - textWidth / 2,
        y: height / 2,
        size: options.fontSize,
        font,
        color,
        opacity: options.opacity,
        rotate: degrees(options.rotationDeg),
      });
    } else {
      // Tiled: repeat the watermark in a grid across (and slightly beyond)
      // the page so the rotated text still covers the corners.
      const stepX = textWidth + 90;
      const stepY = options.fontSize + 90;
      for (let y = -height * 0.5; y < height * 1.5; y += stepY) {
        for (let x = -width * 0.5; x < width * 1.5; x += stepX) {
          page.drawText(text, {
            x,
            y,
            size: options.fontSize,
            font,
            color,
            opacity: options.opacity,
            rotate: degrees(options.rotationDeg),
          });
        }
      }
    }
  });

  return pdfDoc.save();
}
