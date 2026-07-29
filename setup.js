const fs = require('fs');
const path = require('path');

const files = {
  'package.json': `{
  "name": "wallpdf",
  "type": "module",
  "version": "1.0.0",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "@astrojs/react": "^4.1.0",
    "@astrojs/tailwind": "^5.1.0",
    "astro": "^5.0.0",
    "clsx": "^2.1.1",
    "comlink": "^4.4.1",
    "lucide-react": "^0.470.0",
    "pdf-lib": "^1.17.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwind-merge": "^2.5.5",
    "tailwindcss": "^3.4.17"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.2"
  }
}`,

  'astro.config.mjs': `import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: true,
    }),
  ],
  vite: {
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      exclude: ['pdf-lib'],
    },
  },
});`,

  'tsconfig.json': `{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "target": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}`,

  'public/robots.txt': `User-agent: *
Allow: /`,

  'src/types/pdf.ts': `export type ToolType = 
  | 'merge-pdf' 
  | 'split-pdf' 
  | 'compress-pdf' 
  | 'rotate-pdf';

export interface WorkerAPI {
  mergePDFs(files: ArrayBuffer[]): Promise<Uint8Array>;
  splitPDF(file: ArrayBuffer, pageRanges: string): Promise<Uint8Array[]>;
  rotatePDF(file: ArrayBuffer, degrees: number): Promise<Uint8Array>;
  compressPDF(file: ArrayBuffer): Promise<Uint8Array>;
}`,

  'src/workers/pdf.worker.ts': `import * as comlink from 'comlink';
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

comlink.expose(pdfWorker);`,

  'src/hooks/useWorker.ts': `import { useEffect, useRef } from 'react';
import * as comlink from 'comlink';
import type { WorkerAPI } from '../types/pdf';

export function useWorker() {
  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<comlink.Remote<WorkerAPI> | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/pdf.worker.ts', import.meta.url),
      { type: 'module' }
    );
    apiRef.current = comlink.wrap<WorkerAPI>(workerRef.current);

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  return apiRef;
}`,

  'src/components/Dropzone.tsx': `import React, { useCallback } from 'react';
import { Upload, FileText } from 'lucide-react';

interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  acceptMultiple?: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFilesSelected, acceptMultiple = true }) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
      if (files.length > 0) onFilesSelected(files);
    },
    [onFilesSelected]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
      if (files.length > 0) onFilesSelected(files);
    }
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="border-2 border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/50 dark:bg-slate-900/50 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all rounded-2xl p-10 text-center cursor-pointer group"
    >
      <input
        type="file"
        accept="application/pdf"
        multiple={acceptMultiple}
        onChange={handleFileInput}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center space-y-4">
        <div className="p-4 bg-indigo-600 text-white rounded-full group-hover:scale-110 transition-transform shadow-lg shadow-indigo-500/20">
          <Upload className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Drop your PDF files here
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            or click to browse from your device
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
          <FileText className="w-3.5 h-3.5" />
          <span>100% Client-Side Processing \u2022 Maximum Privacy</span>
        </div>
      </label>
    </div>
  );
};`,

  'src/components/ToolWorkspace.tsx': `import React, { useState } from 'react';
import { Dropzone } from './Dropzone';
import { useWorker } from '../hooks/useWorker';
import { FileCheck, ArrowRight, Loader2, Download, Trash2, RefreshCw } from 'lucide-react';
import type { ToolType } from '../types/pdf';

interface ToolWorkspaceProps {
  toolType: ToolType;
  title: string;
}

export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({ toolType, title }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState(90);
  const workerApi = useWorker();

  const handleFilesSelected = (selectedFiles: File[]) => {
    if (toolType === 'merge-pdf') {
      setFiles((prev) => [...prev, ...selectedFiles]);
    } else {
      setFiles([selectedFiles[0]]);
    }
    setResultUrl(null);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (files.length <= 1) setResultUrl(null);
  };

  const executeOperation = async () => {
    if (!workerApi.current || files.length === 0) return;
    setProcessing(true);

    try {
      if (toolType === 'merge-pdf') {
        const buffers = await Promise.all(files.map((f) => f.arrayBuffer()));
        const mergedBytes = await workerApi.current.mergePDFs(buffers);
        const blob = new Blob([mergedBytes], { type: 'application/pdf' });
        setResultUrl(URL.createObjectURL(blob));
      } 
      else if (toolType === 'rotate-pdf') {
        const buffer = await files[0].arrayBuffer();
        const rotatedBytes = await workerApi.current.rotatePDF(buffer, rotation);
        const blob = new Blob([rotatedBytes], { type: 'application/pdf' });
        setResultUrl(URL.createObjectURL(blob));
      } 
      else if (toolType === 'compress-pdf') {
        const buffer = await files[0].arrayBuffer();
        const compressedBytes = await workerApi.current.compressPDF(buffer);
        const blob = new Blob([compressedBytes], { type: 'application/pdf' });
        setResultUrl(URL.createObjectURL(blob));
      }
    } catch (err) {
      console.error("PDF Processing Error:", err);
      alert("Failed to process PDF.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {files.length === 0 ? (
        <Dropzone onFilesSelected={handleFilesSelected} acceptMultiple={toolType === 'merge-pdf'} />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Selected Files ({files.length})
            </h2>
            <button
              onClick={() => { setFiles([]); setResultUrl(null); }}
              className="text-xs text-rose-500 hover:underline flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {files.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-700/50"
              >
                <div className="flex items-center space-x-3 overflow-hidden">
                  <FileCheck className="w-5 h-5 text-indigo-600 shrink-0" />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                    {file.name}
                  </span>
                </div>
                <button
                  onClick={() => removeFile(idx)}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {toolType === 'rotate-pdf' && (
            <div className="flex items-center space-x-4 bg-indigo-50/50 dark:bg-slate-800/40 p-4 rounded-xl">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Rotation Angle:
              </span>
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700"
              >
                <RefreshCw className="w-4 h-4" /> {rotation}\u00B0 Clockwise
              </button>
            </div>
          )}

          <div className="flex items-center justify-end space-x-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            {!resultUrl ? (
              <button
                onClick={executeOperation}
                disabled={processing}
                className="flex items-center space-x-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/20 transition-all"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Processing in Browser...</span>
                  </>
                ) : (
                  <>
                    <span>Process {title}</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            ) : (
              <a
                href={resultUrl}
                download={'wallpdf_' + toolType + '_output.pdf'}
                className="flex items-center space-x-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/20 transition-all animate-bounce"
              >
                <Download className="w-5 h-5" />
                <span>Download Result</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};`,

  'src/data/tools.json': `[
  {
    "slug": "merge-pdf",
    "title": "Merge PDF Files Online - WallPDF",
    "description": "Combine multiple PDF documents into a single organized file directly in your browser.",
    "h1": "Free Online PDF Merger"
  },
  {
    "slug": "split-pdf",
    "title": "Split PDF Pages Instantly - WallPDF",
    "description": "Separate single pages or specific page ranges into new PDF files instantly.",
    "h1": "Split PDF Files Online"
  },
  {
    "slug": "compress-pdf",
    "title": "Compress PDF Size Client-Side - WallPDF",
    "description": "Reduce PDF file size without sacrificing document quality. Private and ultra-fast.",
    "h1": "Compress PDF Online"
  },
  {
    "slug": "rotate-pdf",
    "title": "Rotate PDF Pages Online - WallPDF",
    "description": "Rotate upside-down PDF pages 90, 180, or 270 degrees clockwise instantly.",
    "h1": "Rotate PDF Online"
  }
]`,

  'src/layouts/BaseLayout.astro': `---
interface Props {
  title: string;
  description: string;
}
const { title, description } = Astro.props;
---
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    <meta name="description" content={description} />
  </head>
  <body class="bg-slate-950 text-slate-100 font-sans antialiased">
    <slot />
  </body>
</html>`,

  'src/pages/index.astro': `---
import BaseLayout from '../layouts/BaseLayout.astro';
import toolsData from '../data/tools.json';
---
<BaseLayout title="WallPDF.com - 100% Private Local PDF Tools" description="Fast, private PDF tools that process files completely inside your browser. Zero server uploads.">
  <main class="min-h-screen max-w-5xl mx-auto px-4 py-20 text-center">
    <div class="inline-block px-4 py-1.5 mb-6 text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800 rounded-full">
      Zero Uploads \u2022 Local WebAssembly Engine
    </div>
    <h1 class="text-5xl md:text-6xl font-black text-white tracking-tight mb-4">
      WallPDF.com
    </h1>
    <p class="text-xl text-slate-400 max-w-2xl mx-auto mb-16">
      Fast, free, and completely private PDF utilities. Files are processed locally on your device without touching an external server.
    </p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
      {toolsData.map((tool) => (
        <a href={"/" + tool.slug} class="p-6 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-2xl transition group">
          <h2 class="text-xl font-bold text-white group-hover:text-indigo-400 mb-2">{tool.h1}</h2>
          <p class="text-sm text-slate-400">{tool.description}</p>
        </a>
      ))}
    </div>
  </main>
</BaseLayout>`,

  'src/pages/[tool].astro': `---
import BaseLayout from '../layouts/BaseLayout.astro';
import { ToolWorkspace } from '../components/ToolWorkspace';
import toolsData from '../data/tools.json';
import type { ToolType } from '../types/pdf';

export async function getStaticPaths() {
  return toolsData.map((tool) => ({
    params: { tool: tool.slug },
    props: { toolInfo: tool },
  }));
}

const { toolInfo } = Astro.props;
---
<BaseLayout title={toolInfo.title} description={toolInfo.description}>
  <main class="min-h-screen bg-slate-950 text-slate-100 py-16 px-4">
    <div class="max-w-4xl mx-auto text-center space-y-4 mb-10">
      <a href="/" class="text-xs text-indigo-400 hover:underline">\u2190 Back to all WallPDF tools</a>
      <h1 class="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
        {toolInfo.h1}
      </h1>
      <p class="text-lg text-slate-400 max-w-2xl mx-auto">
        {toolInfo.description}
      </p>
    </div>

    <ToolWorkspace 
      client:load 
      toolType={toolInfo.slug as ToolType} 
      title={toolInfo.h1} 
    />
  </main>
</BaseLayout>`
};

console.log("\u26A1 Generating WallPDF project structure...");

Object.entries(files).forEach(([filePath, content]) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content.trim());
  console.log(`  \u2714 Created: ${filePath}`);
});

console.log("\n\u2705 Setup Complete! Run the following commands in VS Code terminal:");
console.log("   1. npm install");
console.log("   2. npm run dev\n");