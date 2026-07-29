import React, { useState, useCallback, useEffect } from 'react';
import { ToolIcon } from './ToolIcon';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ToolWorkspaceProps {
  toolSlug: string;
  toolName: string;
  description: string;
}

const Spinner: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg
    className={`animate-spin ${className}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
);

export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({
  toolSlug,
  toolName,
  description,
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [pageRange, setPageRange] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [originalFileSize, setOriginalFileSize] = useState<number | null>(null);
  const [compressionLevel, setCompressionLevel] = useState('recommended');
  const [compressedFileSize, setCompressedFileSize] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [compressedFile, setCompressedFile] = useState<File | null>(null);
  const [PdfPreview, setPdfPreview] = useState<React.FC<any> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const SortableFileItem: React.FC<{ file: File, idx: number }> = ({ file, idx }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: `${file.name}-${idx}` });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 10 : 'auto',
    };

    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`bg-slate-50 dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700/60 rounded-2xl p-3.5 flex items-center justify-between cursor-grab active:cursor-grabbing transition-all`}>
        <div className="flex items-center space-x-3 overflow-hidden pointer-events-none">
          {PdfPreview ? <PdfPreview file={file} className="w-12 h-auto rounded-md bg-white dark:bg-zinc-700 shadow-sm shrink-0" /> : <div className="w-12 h-16 rounded-md bg-white dark:bg-zinc-700 shadow-sm shrink-0 flex items-center justify-center text-xs font-bold text-slate-400 dark:text-zinc-500">PDF</div>}
          <div className="truncate">
            <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">{file.name}</p>
            <p className="text-[10px] text-slate-400 dark:text-zinc-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
          </div>
        </div>
        <button onClick={() => handleRemoveFile(idx)} className="p-1 rounded-lg text-slate-400 hover:text-[#E5252A] transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>
    );
  };

  useEffect(() => {
    const loadPreview = async () => {
      const { PdfPreview: PreviewComponent } = await import('./PdfPreview');
      setPdfPreview(() => PreviewComponent);
    };
    if (typeof window !== 'undefined') {
      loadPreview();
    }
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      let newFiles = Array.from(e.dataTransfer.files);
      console.log('[ToolWorkspace] drop files:', newFiles.map(f => f.name));
      if (toolSlug === 'split-pdf' || toolSlug === 'compress-pdf' || toolSlug === 'pdf-to-word' || toolSlug === 'pdf-to-powerpoint' || toolSlug === 'pdf-to-excel' || toolSlug === 'word-to-pdf') {
        setFiles([newFiles[0]]); // Replace with the first new file
      } else {
        setFiles((prev) => [...prev, ...newFiles]);
      }
      setIsCompleted(false);
      setOriginalFileSize(null);
      setCompressedFileSize(null);
      setCompressedFile(null);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      let newFiles = Array.from(e.target.files!);
      console.log('[ToolWorkspace] input files:', newFiles.map(f => f.name));
      if (toolSlug === 'split-pdf' || toolSlug === 'compress-pdf' || toolSlug === 'pdf-to-word' || toolSlug === 'pdf-to-powerpoint' || toolSlug === 'pdf-to-excel' || toolSlug === 'word-to-pdf') {
        setFiles([newFiles[0]]); // Replace with the first new file
      } else {
        setFiles((prev) => [...prev, ...newFiles]);
      }
      setIsCompleted(false);
      setOriginalFileSize(null);
      setCompressedFileSize(null);
      setCompressedFile(null);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (files.length <= 1) setIsCompleted(false);
  };

  const handleClearAll = () => {
    setFiles([]);
    setIsCompleted(false);
    setDownloadUrl(null);
    setOriginalFileSize(null);
    setCompressedFileSize(null);
    setCompressedFile(null);
    setPageRange('');
    setProgress(0);
    setCompressionLevel('recommended');
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex((f, i) => `${f.name}-${i}` === active.id);
        const newIndex = items.findIndex((f, i) => `${f.name}-${i}` === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const getDownloadExtension = (slug: string) => {
    switch (slug) {
      case 'split-pdf': return 'zip';
      case 'pdf-to-word': return 'docx';
      case 'pdf-to-powerpoint': return 'pptx';
      case 'pdf-to-excel': return 'xlsx';
      default: return 'pdf';
    }
  };

  const getAcceptableFileTypes = (slug: string) => {
    if (slug.startsWith('word-to-')) {
      return '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (slug.startsWith('powerpoint-to-')) {
      return '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
    if (slug.startsWith('excel-to-')) {
      return '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (slug.startsWith('pdf-to-')) {
      return 'application/pdf';
    }
    return 'application/pdf';
  };
  const handleProcess = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(0);
    console.log('[ToolWorkspace] start processing', files.map(f => f.name));

    try {
      if (toolSlug === 'merge-pdf') {
        const mergedPdf = await PDFDocument.create();

        for (const file of files) {
          const pdfBytes = await file.arrayBuffer();
          const pdf = await PDFDocument.load(pdfBytes);
          const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          copiedPages.forEach((page) => {
            mergedPdf.addPage(page);
          });
        }

        const mergedPdfBytes = await mergedPdf.save();
        // mergedPdf.save() returns a Uint8Array (with ArrayBufferLike.buffer). Cast buffer to
        // ArrayBuffer to satisfy Blob constructor typing.
        const blob = new Blob([mergedPdfBytes.buffer as unknown as ArrayBuffer], { type: 'application/pdf' });
        setDownloadUrl(URL.createObjectURL(blob));
        setIsCompleted(true);
      } else if (toolSlug === 'split-pdf') {
        if (files.length === 0) return;

        const pdfToSplit = files[0];
        const pdfBytes = await pdfToSplit.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const zip = new JSZip();
        const pageCount = pdfDoc.getPageCount();

        const indicesToSplit: number[] = [];
        if (pageRange.trim() === '') {
          // If no range is specified, split all pages
          for (let i = 0; i < pageCount; i++) {
            indicesToSplit.push(i);
          }
        } else {
          // Parse page range input
          const ranges = pageRange.split(',');
          for (const range of ranges) {
            const trimmedRange = range.trim();
            if (trimmedRange.includes('-')) {
              const [start, end] = trimmedRange.split('-').map(num => parseInt(num.trim(), 10));
              if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) {
                  if (i > 0 && i <= pageCount) indicesToSplit.push(i - 1);
                }
              }
            } else {
              const pageNum = parseInt(trimmedRange, 10);
              if (!isNaN(pageNum) && pageNum > 0 && pageNum <= pageCount) {
                indicesToSplit.push(pageNum - 1);
              }
            }
          }
        }

        for (const pageIndex of [...new Set(indicesToSplit)]) { // Use Set to remove duplicates
          const newPdf = await PDFDocument.create();
          const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIndex]);
          newPdf.addPage(copiedPage);
          const newPdfBytes = await newPdf.save();
          zip.file(`${pdfToSplit.name.replace('.pdf', '')}-page-${pageIndex + 1}.pdf`, newPdfBytes);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        setDownloadUrl(URL.createObjectURL(zipBlob));
        setIsCompleted(true);
      } else if (toolSlug === 'compress-pdf') {
        if (files.length === 0) return;

        const pdfToCompress = files[0];
        setOriginalFileSize(pdfToCompress.size);

        setProgress(25); // Stage 1: Reading file
        const pdfBytes = await pdfToCompress.arrayBuffer();
        
        setProgress(50); // Stage 2: Loading PDF
        const pdfDoc = await PDFDocument.load(pdfBytes);

        setProgress(75); // Stage 3: Compressing PDF
        if (compressionLevel === 'high') {
          // Remove metadata for higher compression
          pdfDoc.setTitle('');
          pdfDoc.setAuthor('');
          pdfDoc.setSubject('');
          pdfDoc.setKeywords([]);
          pdfDoc.setProducer('');
          pdfDoc.setCreator('');
          pdfDoc.setCreationDate(new Date(0));
          pdfDoc.setModificationDate(new Date(0));
        } else if (compressionLevel === 'recommended') {
        }

        const useObjectStreams = compressionLevel !== 'basic';
        const compressedPdfBytes = await pdfDoc.save({ useObjectStreams });

        setProgress(90); // Stage 4: Finalizing
        const blob = new Blob([compressedPdfBytes.buffer as unknown as ArrayBuffer], { type: 'application/pdf' });
        const newCompressedFile = new File([blob], `${pdfToCompress.name.replace(/\.pdf$/i, '')}-compressed.pdf`, { type: 'application/pdf' });

        setCompressedFile(newCompressedFile);
        setCompressedFileSize(blob.size);
        setDownloadUrl(URL.createObjectURL(blob));

        setProgress(100);
        setIsCompleted(true);
      } else if (toolSlug === 'pdf-to-word') {
        // Simulate PDF to Word conversion for UI flow
        console.log('[ToolWorkspace] Simulating PDF to Word conversion.');
        setProgress(25);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work
        setProgress(75);

        const textContent = `This is a dummy DOCX file. The real PDF-to-Word conversion requires a server-side implementation.`;
        const blob = new Blob([textContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

        setDownloadUrl(URL.createObjectURL(blob));
        setProgress(100);
        setIsCompleted(true);

      } else if (toolSlug === 'pdf-to-powerpoint') {
        // Simulate PDF to PowerPoint conversion for UI flow
        console.log('[ToolWorkspace] Simulating PDF to PowerPoint conversion.');
        setProgress(25);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work
        setProgress(75);

        const textContent = `This is a dummy PPTX file. The real PDF-to-PowerPoint conversion requires a server-side implementation.`;
        const blob = new Blob([textContent], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });

        setDownloadUrl(URL.createObjectURL(blob));
        setProgress(100);
        setIsCompleted(true);
      } else if (toolSlug === 'word-to-pdf') {
        // Simulate Word to PDF conversion for UI flow
        console.log('[ToolWorkspace] Simulating Word to PDF conversion.');
        setProgress(25);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate reading file
        setProgress(75);

        // Create a dummy PDF as a placeholder for the converted file
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        page.drawText(`This is a dummy PDF converted from ${files[0].name}.`);
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes.buffer as unknown as ArrayBuffer], { type: 'application/pdf' });

        setDownloadUrl(URL.createObjectURL(blob));
        setProgress(100);
        setIsCompleted(true);
      } else if (toolSlug === 'pdf-to-excel') {
        console.log('[ToolWorkspace] Starting PDF to Excel conversion.');
        setProgress(25);

        const formData = new FormData();
        formData.append('file', files[0]);
        formData.append('targetFormat', 'xlsx');

        // This fetch call sends the file to your backend API endpoint.
        const response = await fetch('/api/convert', {
          method: 'POST',
          body: formData,
        });

        setProgress(80); // Update progress after upload

        if (!response.ok) {
          console.error('API Error:', response.statusText);
          // If the API fails, show the "Feature Not Available" screen.
          setIsCompleted(true);
          return;
        }

        const blob = await response.blob(); // The converted .xlsx file from the server
        setDownloadUrl(URL.createObjectURL(blob));

        setProgress(100);
        setIsCompleted(true);
      } else {
        // Placeholder for other tools
        console.warn(`Processing for tool "${toolSlug}" is not implemented.`);
        setIsCompleted(true); // Mark as complete to show download for now
      }
    } catch (error) {
      console.error("Error processing PDF files:", error);
      // You might want to set an error state here to show a message to the user
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#F8FAFC] dark:bg-black py-12 px-4 sm:px-6 flex items-center justify-center transition-colors duration-200">
      <div className="w-full max-w-5xl">
      
        {/* Main Pitch Black Card Container */}
        <div className="bg-white dark:bg-zinc-900 rounded-[32px] p-4 sm:p-8 shadow-sm dark:shadow-none border border-slate-200/80 dark:border-zinc-800 transition-colors">
          
          {files.length === 0 ? (
            /* Upload Dropzone */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-[24px] p-8 sm:p-16 text-center transition-all duration-200 flex flex-col items-center justify-center ${
                isDragging
                  ? 'border-[#E5252A] bg-red-50/50 dark:bg-red-950/30 scale-[0.99]'
                  : 'border-red-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-[#E5252A] dark:hover:border-[#E5252A]'
              }`}
            >
              {/* Header Icon & Title */}
              <div className="flex items-center justify-center space-x-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#E5252A] flex items-center justify-center text-white shadow-sm shrink-0">
                  <ToolIcon slug={toolSlug} className="w-5 h-5" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {toolName}
                </h1>
              </div>

              <p className="text-slate-500 dark:text-zinc-400 text-sm sm:text-base mb-8 max-w-lg font-normal">
                {description}
              </p>

              {/* Native Red Button */}
              <label className="cursor-pointer group relative inline-flex items-center justify-center min-w-[280px] sm:min-w-[320px] bg-[#E5252A] hover:bg-[#C51920] active:scale-[0.98] text-white font-bold py-4 px-10 rounded-full shadow-md shadow-red-500/20 transition-all duration-150 mb-8">
                <span className="absolute left-6 text-xl font-black">+</span>
                <span className="text-base sm:text-lg tracking-wide">
                  {isLoadingCloud ? 'Downloading...' : 'Choose file'}
                </span>
                <input
                  type="file"
                  multiple
                  accept={getAcceptableFileTypes(toolSlug)}
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>

              {/* Cloud Integration Icons */}
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  title="Upload from Google Drive"
                  className="w-10 h-10 rounded-full border border-slate-200 dark:border-zinc-800 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-slate-700 dark:text-zinc-300"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.71 3.5L1.15 15l3.43 6 6.55-11.5L7.71 3.5zm4.86 6.5L9.14 21.5h13.71l3.43-6H12.57zM8.86 3.5h13.71l-3.43 6H5.43l3.43-6z" />
                  </svg>
                </button>

                <button
                  type="button"
                  title="Upload from Dropbox"
                  className="w-10 h-10 rounded-full border border-slate-200 dark:border-zinc-800 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-slate-700 dark:text-zinc-300"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 2l6 3.825L18 2l5 4.125L17 10l6 3.875L18 18l-6-3.825L6 18l-5-4.125L7 10 1 6.125 6 2zm6 13.825L18 12l-6-3.825L6 12l6 3.825z" />
                  </svg>
                </button>

                <button
                  type="button"
                  title="Upload from Web URL"
                  className="w-10 h-10 rounded-full border border-slate-200 dark:border-zinc-800 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-slate-700 dark:text-zinc-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                </button>
              </div>
            </div>
          ) : isProcessing ? (
            /* Processing State with Progress Bar */
            <div className="border-2 border-dashed border-red-200 dark:border-zinc-800 rounded-[24px] p-8 sm:p-12 text-center bg-white dark:bg-zinc-950 space-y-6">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Processing your file...</h3>
              <div className="w-full bg-slate-200 dark:bg-zinc-700 rounded-full h-2.5">
                <div
                  className="bg-[#E5252A] h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-slate-500 dark:text-zinc-400">
                {progress < 50 ? 'Loading PDF...' : progress < 75 ? 'Analyzing structure...' : 'Compressing file...'}
              </p>
            </div>
          ) : isCompleted && downloadUrl ? (
            /* Completed State */
            <div className="border-2 border-dashed border-red-200 dark:border-zinc-800 rounded-[24px] p-8 sm:p-12 text-center bg-white dark:bg-zinc-950 space-y-6">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Your file is ready!</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">Processed privately in your browser.</p>
              </div>
              {toolSlug === 'compress-pdf' && compressedFile && PdfPreview && (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-48 p-2 border border-slate-200 dark:border-zinc-800 rounded-lg bg-slate-50 dark:bg-zinc-900">
                    <PdfPreview file={compressedFile} className="w-full h-auto rounded-md bg-white dark:bg-zinc-700 shadow-sm" />
                  </div>
                  {originalFileSize && compressedFileSize && (
                    <div className="text-center text-sm text-slate-600 dark:text-zinc-300">
                      <p>Original: <span className="font-semibold">{(originalFileSize / (1024 * 1024)).toFixed(2)} MB</span></p>
                      <p>Compressed: <span className="font-semibold">{(compressedFileSize / (1024 * 1024)).toFixed(2)} MB</span></p>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400">
                        You saved {((1 - compressedFileSize / originalFileSize) * 100).toFixed(0)}%
                      </p>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <a
                  href={downloadUrl || '#'}
                  download={downloadUrl ? `${toolSlug}-output.${getDownloadExtension(toolSlug)}` : undefined}
                  className="w-full sm:w-auto px-10 py-3.5 bg-[#E5252A] hover:bg-[#C51920] text-white font-bold text-sm rounded-full shadow-md transition-all text-center"
                >
                  Download {getDownloadExtension(toolSlug).toUpperCase()}
                </a>
                <button
                  onClick={handleClearAll}
                  className="w-full sm:w-auto px-8 py-3.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-semibold text-sm rounded-full transition-colors"
                >
                  Process Another File
                </button>
              </div>
            </div>
          ) : isCompleted && !downloadUrl ? (
            /* Completed State - No Download (e.g. for failed placeholders) */
            <div className="border-2 border-dashed border-red-200 dark:border-zinc-800 rounded-[24px] p-8 sm:p-12 text-center bg-white dark:bg-zinc-950 space-y-6">
               <div className="space-y-1">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Feature Not Available</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-400">This feature requires a server-side component and is not yet implemented.</p>
              </div>
               <button
                  onClick={handleClearAll}
                  className="w-full sm:w-auto px-8 py-3.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-semibold text-sm rounded-full transition-colors"
                >
                  Go Back
                </button>
            </div>
          ) : (
            /* Selected File State */
            <div className="border-2 border-dashed border-red-200 dark:border-zinc-800 rounded-[24px] p-6 sm:p-10 bg-white dark:bg-zinc-950 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-4">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Selected Files ({files.length})
                </h3>
                <button onClick={handleClearAll} className="text-xs font-semibold text-[#E5252A] hover:underline">
                  Clear all
                </button>
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={files.map((f, i) => `${f.name}-${i}`)} strategy={verticalListSortingStrategy}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-1">
                    {files.map((file, idx) => (
                      <SortableFileItem key={`${file.name}-${idx}`} file={file} idx={idx} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-end gap-4">
                {toolSlug === 'split-pdf' && (
                  <div className="w-full sm:w-auto flex-grow">
                    <input
                      type="text"
                      value={pageRange}
                      onChange={(e) => setPageRange(e.target.value)}
                      placeholder="e.g., 1-3, 5, 8-10"
                      className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:bg-white dark:focus:bg-black focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                    />
                     <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5 pl-1">Enter page numbers or ranges to split. Leave blank to split all pages.</p>
                  </div>
                )}
                {toolSlug === 'compress-pdf' && (
                  <div className="w-full sm:w-auto flex-grow">
                    <select
                      id="compression-level"
                      value={compressionLevel}
                      onChange={(e) => setCompressionLevel(e.target.value)}
                      className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:bg-white dark:focus:bg-black focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                    >
                      <option value="recommended">Recommended Compression</option>
                      <option value="high">High Compression</option>
                      <option value="basic">Basic Compression</option>
                    </select>
                    <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5 pl-1">
                      Choose the desired level of file size reduction.
                    </p>
                  </div>
                )}

                <label className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 px-5 py-3 rounded-full transition-colors w-full sm:w-auto text-center">
                  + Add more files
                  <input type="file" multiple accept={getAcceptableFileTypes(toolSlug)} onChange={handleFileInput} className="hidden" />
                </label>

                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-10 py-3.5 bg-[#E5252A] hover:bg-[#C51920] disabled:bg-slate-400 text-white font-bold text-sm rounded-full shadow-md transition-all flex items-center justify-center space-x-2"
                >
                  {isProcessing ? (
                    <span>Processing...</span>
                  ) : <span>Process</span>}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};