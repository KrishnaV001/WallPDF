import React, { useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import PdfJsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set the worker source for pdf.js. This is the most reliable way to avoid bundling issues with Vite.
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfJsWorker;

interface PdfPreviewProps {
  file: File;
  className?: string;
}

export const PdfPreview: React.FC<PdfPreviewProps> = ({ file, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!file || !canvasRef.current) return;

    const renderPdf = async () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;

      try {
        const fileReader = new FileReader();
        fileReader.onload = async function () {
          if (this.result) {
            const typedarray = new Uint8Array(this.result as ArrayBuffer);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            const page = await pdf.getPage(1); // Get the first page

            const viewport = page.getViewport({ scale: 1 });
            const scale = canvas.width / viewport.width; // Use canvas width for scaling
            const scaledViewport = page.getViewport({ scale });

            canvas.height = scaledViewport.height;
            
            await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
          }
        };
        fileReader.readAsArrayBuffer(file);
      } catch (error) {
        console.error('Error rendering PDF preview:', error);
      }
    };

    renderPdf();
  }, [file]);

  return <canvas ref={canvasRef} className={className} width="80" />;
};