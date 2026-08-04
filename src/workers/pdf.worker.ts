import * as comlink from 'comlink';
import { PDFDocument, degrees } from 'pdf-lib';

const pdfWorker = {
  async mergePDFs(files: ArrayBuffer[]): Promise<Uint8Array> {
    const mergedPdf = await PDFDocument.create();
    for (const fileBuffer of files) {
      const pdf = await PDFDocument.load(fileBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }
    return await mergedPdf.save();
  },

  async splitPDF(fileBuffer: ArrayBuffer, pageRanges: string): Promise<Uint8Array[]> {
    const srcDoc = await PDFDocument.load(fileBuffer);
    const totalPages = srcDoc.getPageCount();
    const resultFiles: Uint8Array[] = [];
    const ranges = pageRanges ? pageRanges.split(',').map(r => r.trim()) : [];

    if (ranges.length === 0) {
      for (let i = 0; i < totalPages; i++) {
        const newDoc = await PDFDocument.create();
        const [page] = await newDoc.copyPages(srcDoc, [i]);
        newDoc.addPage(page);
        resultFiles.push(await newDoc.save());
      }
    } else {
      for (const range of ranges) {
        const [start, end] = range.split('-').map(n => parseInt(n.trim(), 10) - 1);
        const newDoc = await PDFDocument.create();
        const pageIndices: number[] = [];

        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            if (i >= 0 && i < totalPages) pageIndices.push(i);
          }
        } else if (!isNaN(start) && start >= 0 && start < totalPages) {
          pageIndices.push(start);
        }

        if (pageIndices.length > 0) {
          const copied = await newDoc.copyPages(srcDoc, pageIndices);
          copied.forEach(p => newDoc.addPage(p));
          resultFiles.push(await newDoc.save());
        }
      }
    }
    return resultFiles;
  },

  async rotatePDF(fileBuffer: ArrayBuffer, angleDegrees: number): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pages = pdfDoc.getPages();
    pages.forEach(page => {
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees((currentRotation + angleDegrees) % 360));
    });
    return await pdfDoc.save();
  },

  async compressPDF(fileBuffer: ArrayBuffer): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(fileBuffer, { updateMetadata: false });
    return await pdfDoc.save({ useObjectStreams: true });
  },

  async cropPDF(
    fileBuffer: ArrayBuffer,
    cropRatio: { left: number; top: number; right: number; bottom: number },
    applyToAll: boolean,
    pageRangeStr?: string
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;

    let targetIndices: Set<number> = new Set();
    if (applyToAll || !pageRangeStr || !pageRangeStr.trim()) {
      for (let i = 0; i < totalPages; i++) targetIndices.add(i);
    } else {
      const parts = pageRangeStr.split(',').map(s => s.trim());
      for (const part of parts) {
        if (part.includes('-')) {
          const [startStr, endStr] = part.split('-');
          const start = parseInt(startStr, 10) - 1;
          const end = parseInt(endStr, 10) - 1;
          if (!isNaN(start) && !isNaN(end)) {
            for (let i = Math.max(0, start); i <= Math.min(totalPages - 1, end); i++) {
              targetIndices.add(i);
            }
          }
        } else {
          const p = parseInt(part, 10) - 1;
          if (!isNaN(p) && p >= 0 && p < totalPages) {
            targetIndices.add(p);
          }
        }
      }
    }

    for (let i = 0; i < totalPages; i++) {
      if (!targetIndices.has(i)) continue;
      const page = pages[i];
      const mediaBox = page.getMediaBox();
      const { x: mX, y: mY, width: mWidth, height: mHeight } = mediaBox;
      const rotation = ((page.getRotation().angle % 360) + 360) % 360;

      let cropX: number, cropY: number, cropW: number, cropH: number;

      if (rotation === 90) {
        cropX = mX + cropRatio.top * mWidth;
        cropY = mY + cropRatio.left * mHeight;
        cropW = (cropRatio.bottom - cropRatio.top) * mWidth;
        cropH = (cropRatio.right - cropRatio.left) * mHeight;
      } else if (rotation === 180) {
        cropX = mX + (1 - cropRatio.right) * mWidth;
        cropY = mY + cropRatio.top * mHeight;
        cropW = (cropRatio.right - cropRatio.left) * mWidth;
        cropH = (cropRatio.bottom - cropRatio.top) * mHeight;
      } else if (rotation === 270) {
        cropX = mX + (1 - cropRatio.bottom) * mWidth;
        cropY = mY + (1 - cropRatio.right) * mHeight;
        cropW = (cropRatio.bottom - cropRatio.top) * mWidth;
        cropH = (cropRatio.right - cropRatio.left) * mHeight;
      } else {
        cropX = mX + cropRatio.left * mWidth;
        cropY = mY + (1 - cropRatio.bottom) * mHeight;
        cropW = (cropRatio.right - cropRatio.left) * mWidth;
        cropH = (cropRatio.bottom - cropRatio.top) * mHeight;
      }

      cropW = Math.max(1, cropW);
      cropH = Math.max(1, cropH);

      page.setCropBox(cropX, cropY, cropW, cropH);
      page.setMediaBox(cropX, cropY, cropW, cropH);
    }

    return await pdfDoc.save();
  }
};

comlink.expose(pdfWorker);