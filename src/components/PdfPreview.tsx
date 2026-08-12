import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import PdfJsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set the worker source for pdf.js. This is the most reliable way to avoid bundling issues with Vite.
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfJsWorker;

interface PdfPreviewProps { // Keep this line as it's part of the selection
  file: File | Blob;
  className?: string;
  desiredWidth?: number;
  scale?: number;
  pageNumber?: number;
  onRender?: (width: number, height: number, originalWidth?: number, originalHeight?: number, totalPages?: number) => void;
  // By default the rendered canvas is CSS-clamped to max-width:100% so it can never
  // overflow its container. Zoomable previews (e.g. the crop editor) need the canvas
  // to be able to exceed its container's width so the user can zoom in and scroll -
  // pass allowOverflow to opt out of the clamp for those cases.
  allowOverflow?: boolean;
}

export const PdfPreview: React.FC<PdfPreviewProps> = ({ file, className, desiredWidth, scale: propScale, pageNumber, onRender, allowOverflow }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfDocRef = useRef<any>(null);
  const onRenderRef = useRef(onRender);
  const [totalPages, setTotalPages] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onRenderRef.current = onRender;
  }, [onRender]);

  useEffect(() => {
    if (!file || !containerRef.current) return;
    
    let isSubscribed = true;
    const renderAllPages = async () => {
      setIsRendering(true);
      setError(null);
      const container = containerRef.current;
      if (!container) return;

      // Clear previous renders
      container.innerHTML = '';

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

        const typedArray = new Uint8Array(arrayBuffer);
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
        if (!isSubscribed) return;

        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);

        const startPage = pageNumber ? Math.max(1, Math.min(pageNumber, pdf.numPages)) : 1;
        const endPage = pageNumber ? startPage : pdf.numPages;

        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
          if (!isSubscribed) return;

          const page = await pdf.getPage(pageNum);
          if (!isSubscribed) return;

          const originalViewport = page.getViewport({ scale: 1 });
          const dpr = window.devicePixelRatio || 1;

          let scale = propScale || 1;
          if (!propScale && desiredWidth) {
            scale = desiredWidth / originalViewport.width;
          }

          const cssViewport = page.getViewport({ scale });
          const cssWidth = cssViewport.width;
          const cssHeight = cssViewport.height;

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;

          canvas.width = Math.floor(cssWidth * dpr);
          canvas.height = Math.floor(cssHeight * dpr);
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${cssHeight}px`;
          canvas.style.display = 'block';
          if (!allowOverflow) {
            canvas.style.maxWidth = '100%';
          }
          if (pageNum < endPage) {
            canvas.style.marginBottom = '16px'; // Add space between pages
          }

          container.appendChild(canvas);

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

          if (pageNum === startPage && onRenderRef.current) {
            onRenderRef.current(cssWidth, cssHeight, originalViewport.width, originalViewport.height, pdf.numPages);
          }
        }
      } catch (renderError: any) {
        if (renderError?.name !== 'RenderingCancelledException') {
          console.error('[PdfPreview] Error rendering PDF:', renderError);
          setError('Failed to render PDF. The file may be corrupt or unsupported.');
        }
      } finally {
        setIsRendering(false);
      }
    };

    renderAllPages();

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
  }, [file, desiredWidth, propScale, pageNumber, allowOverflow]);

  if (error) {
    return <div className={`text-red-500 text-xs p-4 bg-red-50 rounded-lg ${className}`}>{error}</div>;
  }

  // This div will now contain multiple canvas elements, one for each page.
  return <div ref={containerRef} className={className} />;
};