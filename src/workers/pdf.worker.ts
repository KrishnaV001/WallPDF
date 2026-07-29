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
  }
};

comlink.expose(pdfWorker);