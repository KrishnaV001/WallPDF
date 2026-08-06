import React, { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import PdfJsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set the worker source for pdf.js. This is the most reliable way to avoid bundling issues with Vite.
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfJsWorker;

interface PdfPreviewProps {
  file: File | Blob;
  className?: string;
  desiredWidth?: number;
  scale?: number;
  pageNumber?: number;
  onRender?: (width: number, height: number, originalWidth?: number, originalHeight?: number, totalPages?: number) => void;
}

export const PdfPreview: React.FC<PdfPreviewProps> = ({ file, className, desiredWidth, scale: propScale, pageNumber = 1, onRender }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfDocRef = useRef<any>(null);
  const onRenderRef = useRef(onRender);

  useEffect(() => {
    onRenderRef.current = onRender;
  }, [onRender]);

  useEffect(() => {
    if (!file || !canvasRef.current) return;

    let isSubscribed = true;

    const renderPdf = async () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;

      // Cancel previous render task if running
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore cancellation errors
        }
        renderTaskRef.current = null;
      }

      // Destroy previous PDF document instance if any
      if (pdfDocRef.current) {
        // pdfjs-dist's PDFDocumentProxy does not have a destroy method.
        pdfDocRef.current = null;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        if (!isSubscribed) return;

        const typedarray = new Uint8Array(arrayBuffer);
        const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
        if (!isSubscribed) {
          // pdf.destroy(); // PDFDocumentProxy does not have a destroy method.
          return;
        }
        pdfDocRef.current = pdf;

        const targetPage = Math.max(1, Math.min(pageNumber, pdf.numPages));
        const page = await pdf.getPage(targetPage);
        if (!isSubscribed) return;

        const originalViewport = page.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;

        // Determine effective scale
        let scale = propScale || 1;
        if (!propScale && desiredWidth) {
          scale = desiredWidth / originalViewport.width;
        }

        const cssViewport = page.getViewport({ scale });
        const cssWidth = cssViewport.width;
        const cssHeight = cssViewport.height;

        // Set high-DPI canvas buffer resolution
        canvas.width = Math.floor(cssWidth * dpr);
        canvas.height = Math.floor(cssHeight * dpr);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';

        const renderViewport = page.getViewport({ scale: scale * dpr });
        const renderTask = page.render({
          canvas: canvas,
          canvasContext: context,
          viewport: renderViewport,
        });
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        renderTaskRef.current = null;

        if (!isSubscribed) return;

        // Notify parent of rendered dimensions and original PDF size after render completes
        if (onRenderRef.current) {
          onRenderRef.current(cssWidth, cssHeight, originalViewport.width, originalViewport.height, pdf.numPages);
        }
      } catch (renderError: any) {
        // Ignore expected cancellation exceptions from PDF.js
        if (renderError?.name !== 'RenderingCancelledException') {
          console.error('[PdfPreview] Error rendering PDF:', renderError);
        }
      }
    };

    renderPdf();

    return () => {
      isSubscribed = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore
        }
        renderTaskRef.current = null;
      }
      if (pdfDocRef.current) {
        // pdfjs-dist's PDFDocumentProxy does not have a destroy method.
        pdfDocRef.current = null;
      }
    };
  }, [file, desiredWidth, propScale, pageNumber]);

  return (
    <canvas 
      ref={canvasRef} 
      className={className} 
      style={{ imageRendering: '-webkit-optimize-contrast', display: 'block' }}
    />
  );
};