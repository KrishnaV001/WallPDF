import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ToolIcon } from './ToolIcon';
import { PdfCropEditor } from './PdfCropEditor';
import { PdfMergeEditor } from './PdfMergeEditor';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs for merged pages
import { PDFDocument } from 'pdf-lib'; 
import * as pdfjsLib from 'pdfjs-dist';
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
import { CSS } from '@dnd-kit/utilities'; // Keep this line as it's part of the selection
import { PdfPreview } from './PdfPreview'; // Import the dedicated PdfPreview component

interface MergedPage {
  id: string; // Unique ID for DND-kit
  originalFile: File; // Reference to the original uploaded file
  originalPageIndex: number; // 0-indexed page number within the original file
  fileName: string; // Name of the original file
  previewBlob: Blob | null; // A Blob representing the rendered page for preview
  isLoadingPreview: boolean; // New flag to indicate if preview is being generated
}

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
  const [customDownloadFileName, setCustomDownloadFileName] = useState<string>('');
  const [originalFileSize, setOriginalFileSize] = useState<number | null>(null);
  const [compressionLevel, setCompressionLevel] = useState('recommended');
  const [compressedFileSize, setCompressedFileSize] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [compressedFile, setCompressedFile] = useState<File | null>(null);
  const [cropX, setCropX] = useState(0); // Keep this line as it's part of the selection
  const [cropY, setCropY] = useState(0);
  const [cropWidth, setCropWidth] = useState(0);
  const [cropHeight, setCropHeight] = useState(0);
  const [isDrawingCrop, setIsDrawingCrop] = useState(false);
  const [drawStartPoint, setDrawStartPoint] = useState<{ x: number; y: number } | null>(null);

  const [previewRenderedWidth, setPreviewRenderedWidth] = useState(0); // Keep this line as it's part of the selection
  const [previewRenderedHeight, setPreviewRenderedHeight] = useState(0);
  const [editText, setEditText] = useState('Edited with WallPDF!');
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [pageSize, setPageSize] = useState<'fit' | 'a4' | 'letter'>('fit');
  const [margin, setMargin] = useState<'none' | 'small' | 'big'>('none');
  const [mergedPages, setMergedPages] = useState<MergedPage[]>([]);
  const [imageToPdfPreviewFile, setImageToPdfPreviewFile] = useState<Blob | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const pdfDocuments = useRef<Map<File, PDFDocument>>(new Map()); // Cache loaded PDF documents

  const cropDataRef = useRef<{
    normalized: { left: number; top: number; right: number; bottom: number };
    px: { x: number; y: number; width: number; height: number };
    pt: { x: number; y: number; width: number; height: number };
    pageRange: string;
    applyToAll: boolean;
  }>({
    normalized: { left: 0, top: 0, right: 1, bottom: 1 },
    px: { x: 0, y: 0, width: 0, height: 0 },
    pt: { x: 0, y: 0, width: 0, height: 0 },
    pageRange: '',
    applyToAll: true,
  });

  const hasFilesOrPages = toolSlug === 'merge-pdf' ? mergedPages.length > 0 : files.length > 0;

  const handleMergedPageReorder = useCallback((newPages: MergedPage[]) => {
    setMergedPages(newPages);
  }, []);

  const handleCropChange = useCallback((cropData: any) => {
    cropDataRef.current = cropData;
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const SortableFileItem: React.FC<{ file: File; idx: number; onRemove: (index: number) => void }> = ({ file, idx, onRemove }) => {
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

    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

    useEffect(() => {
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setImagePreviewUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    }, [file]);

    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`bg-slate-50 dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700/60 rounded-2xl p-3.5 flex items-center justify-between cursor-grab active:cursor-grabbing transition-all`}>
        <div className="flex items-center space-x-3 overflow-hidden pointer-events-none">
          <div className="w-12 h-12 rounded-lg bg-white dark:bg-zinc-700 shadow-sm shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-slate-400 dark:text-zinc-500">
            {imagePreviewUrl ? (
              <img src={imagePreviewUrl} alt={file.name} className="w-full h-full object-cover" />
            ) : PdfPreview ? (
              <PdfPreview file={file} desiredWidth={48} className="w-full h-full object-cover pointer-events-none" />
            ) : (
              <div className="text-xs font-bold text-slate-400 dark:text-zinc-500">PDF</div>
            )}
          </div>
          <div className="truncate">
            <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">{file.name}</p>
            <p className="text-[10px] text-slate-400 dark:text-zinc-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
          </div>
        </div>
        <button onClick={() => onRemove(idx)} className="p-1 rounded-lg text-slate-400 hover:text-[#E5252A] transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>
    );
  };

  const loadFirstPageForCropPreview = useCallback(async (pdfFile: File | null) => { // Keep this line as it's part of the selection
    try {
      if (!pdfFile) {
        console.warn('No PDF file provided for crop preview.');
        return;
      }
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });

      // Set initial crop dimensions to full page in PDF points.
      // These will be converted to preview pixels when rendered by PdfPreview.
      setCropX(0);
      setCropY(0);
      setCropWidth(viewport.width);
      setCropHeight(viewport.height);

    } catch (error) {
      console.error('Error loading first page for crop preview:', error);
    }
  }, []);

  // Generate preview PDF for image-to-pdf when options or files change
  useEffect(() => { // Keep this line as it's part of the selection
    console.log('[ToolWorkspace] useEffect for image-to-pdf preview triggered.');
    console.log('[generatePreview Effect] toolSlug:', toolSlug, 'files length:', files.length, 'imageToP dfPreviewFile:', !!imageToPdfPreviewFile);
    
    const generateImageToPdfPreview = async () => {
      if (toolSlug !== 'image-to-pdf') {
        console.log('[generatePreview] Not image-to-pdf tool, skipping');
        setImageToPdfPreviewFile(null);
        return;
      } else {
        console.log('[generateImageToPdfPreview] Function entered. Current options:', { pageOrientation, pageSize, margin });
      }
      
      if (files.length === 0) {
        console.log('[generatePreview] No files, clearing preview');
        setImageToPdfPreviewFile(null);
        return;
      }

      console.log('[generatePreview] Starting preview generation for', files.length, 'files');
      setIsGeneratingPreview(true);
      try {
        const pdfDoc = await PDFDocument.create();
        
        // Use only the first image for preview
        const firstFile = files[0];
        console.log('[generatePreview] First file:', firstFile.name, 'type:', firstFile.type);
        const imageBytes = await firstFile.arrayBuffer();
        let image;
        
        if (firstFile.type === 'image/jpeg') {
          image = await pdfDoc.embedJpg(imageBytes);
        } else if (firstFile.type === 'image/png') {
          image = await pdfDoc.embedPng(imageBytes);
        } else {
          console.warn(`[generatePreview] Unsupported image type: ${firstFile.type}`);
          setIsGeneratingPreview(false);
          return;
        }

        // Define page sizes (in points)
        const pageSizes: Record<'a4' | 'letter' | 'fit', { width: number; height: number }> = {
          a4: { width: 595, height: 842 },
          letter: { width: 612, height: 792 },
          fit: { width: 800, height: 600 },
        };

        // Define margins (in points)
        const margins: Record<'none' | 'small' | 'big', number> = {
          none: 0,
          small: 20,
          big: 40,
        };

        const marginValue = margins[margin];
        let selectedPageSize = pageSizes[pageSize as 'a4' | 'letter' | 'fit'];
        
        if (pageSize === 'fit') {
          const imageWidth = image.width;
          const imageHeight = image.height;
          selectedPageSize = { width: imageWidth + marginValue * 2, height: imageHeight + marginValue * 2 };
          console.log('[generatePreview] Fit mode: image', imageWidth, 'x', imageHeight, '-> page', selectedPageSize.width, 'x', selectedPageSize.height);
        } else if (pageOrientation === 'landscape') {
          [selectedPageSize.width, selectedPageSize.height] = [selectedPageSize.height, selectedPageSize.width];
          console.log('[generatePreview] Landscape mode: page', selectedPageSize.width, 'x', selectedPageSize.height);
        }

        const page = pdfDoc.addPage([selectedPageSize.width, selectedPageSize.height]);
        
        const availableWidth = selectedPageSize.width - marginValue * 2;
        const availableHeight = selectedPageSize.height - marginValue * 2;
        
        const imageDims = image.scaleToFit(availableWidth, availableHeight);
        
        const x = marginValue + (availableWidth - imageDims.width) / 2;
        const y = marginValue + (availableHeight - imageDims.height) / 2;
        
        page.drawImage(image, { ...imageDims, x, y });

        const pdfBytes = await pdfDoc.save();
        const pdfBuffer = pdfBytes.buffer.slice(
          pdfBytes.byteOffset,
          pdfBytes.byteOffset + pdfBytes.byteLength
        ) as ArrayBuffer;
        const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
        console.log('[generatePreview] Generated PDF blob:', blob.size, 'bytes, new object:', blob !== imageToPdfPreviewFile);
        console.log('[generatePreview] Generated PDF blob:', blob.size, 'bytes');
        
        setImageToPdfPreviewFile(blob);
      } catch (error) {
        console.error('[generatePreview] Error generating image-to-pdf preview:', error);
        setImageToPdfPreviewFile(null);
      } finally {
        setIsGeneratingPreview(false);
      }
    };

    generateImageToPdfPreview();
  }, [files, pageOrientation, pageSize, margin, toolSlug]);

  // Callback to get the actual rendered dimensions of the PdfPreview component
  const handlePreviewRender = useCallback((width: number, height: number) => { // Keep this line as it's part of the selection
    setPreviewRenderedWidth(width);
    setPreviewRenderedHeight(height);
    // When the preview renders, if crop dimensions haven't been set (e.g., first load),
    // set them to the full preview size. This ensures the visual crop box matches the preview initially.
    // We only do this if cropWidth/Height are 0, to avoid resetting user-defined crop area.
    if (cropWidth === 0 && cropHeight === 0) {
      setCropWidth(width);
      setCropHeight(height);
    }
  }, []);


  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      console.log('[ToolWorkspace] drop files:', newFiles.map((f) => f.name));

      if (toolSlug === 'merge-pdf') {
        const pagesWithLoadingState: MergedPage[] = [];
        const newMergedPages: MergedPage[] = [];
        for (const file of newFiles) {
          if (file.type === 'application/pdf') {
            const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
            pdfDocuments.current.set(file, pdfDoc);

            // For preview, use pdfjsLib to render each page to a canvas and create a Blob
            const pdfDocJs = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
            for (let i = 0; i < pdfDocJs.numPages; i++) {
              pagesWithLoadingState.push({
                id: uuidv4(),
                originalFile: file,
                originalPageIndex: i,
                fileName: file.name,
                previewBlob: null, // Initially null
                isLoadingPreview: true, // Initially true
              });
            }
          }
        }
        // Add all new pages to state immediately with loading indicators
        setMergedPages((prev) => [...prev, ...pagesWithLoadingState]);

        // Now, asynchronously generate previews and update state
        pagesWithLoadingState.forEach(async (pageToProcess) => {
          try {
            const pdfDocJs = await pdfjsLib.getDocument({ data: await pageToProcess.originalFile.arrayBuffer() }).promise;
            const pageJs = await pdfDocJs.getPage(pageToProcess.originalPageIndex + 1);
            const viewport = pageJs.getViewport({ scale: 1 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) throw new Error("Could not get canvas context");

            const desiredWidth = 64;
            const scale = desiredWidth / viewport.width;
            const scaledViewport = pageJs.getViewport({ scale });

            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            await pageJs.render({ canvas: canvas, canvasContext: context, viewport: scaledViewport }).promise;

            const previewBlob = await new Promise<Blob | null>((resolve) => {
              canvas.toBlob((blob) => resolve(blob), 'image/png');
            });

            setMergedPages((prev) =>
              prev.map((p) =>
                p.id === pageToProcess.id
                  ? { ...p, previewBlob: previewBlob, isLoadingPreview: false }
                  : p
              )
            );
          } catch (error) {
            console.error(`Error generating preview for page ${pageToProcess.originalPageIndex} of ${pageToProcess.fileName}:`, error);
            setMergedPages((prev) =>
              prev.map((p) =>
                p.id === pageToProcess.id
                  ? { ...p, isLoadingPreview: false } // Set to false even on error
                  : p
              )
            );
          }
        });
      } else if (['split-pdf', 'compress-pdf', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'word-to-pdf', 'crop-pdf'].includes(toolSlug)) {
        setFiles([newFiles[0]]); // Replace with the first new file
        if (toolSlug === 'crop-pdf' && newFiles[0].type === 'application/pdf') {
          loadFirstPageForCropPreview(newFiles[0]);
        } // image-to-pdf is handled by the general else block below, as it supports multiple files.
      } else {
        setFiles((prev) => [...prev, ...newFiles]);
      }
      setIsCompleted(false);
      setOriginalFileSize(null);
      if (toolSlug !== 'image-to-pdf') setImageToPdfPreviewFile(null);
      setCompressedFileSize(null);
      setCompressedFile(null);
    }
  }, [toolSlug, loadFirstPageForCropPreview]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      let newFiles = Array.from(e.target.files!);
      console.log('[ToolWorkspace] input files:', newFiles.map((f) => f.name));

      if (toolSlug === 'merge-pdf') {
        const pagesWithLoadingState: MergedPage[] = [];
        for (const file of newFiles) {
          if (file.type === 'application/pdf') {
            // Load with pdf-lib for merging later
            const pdfDocLib = await PDFDocument.load(await file.arrayBuffer());
            pdfDocuments.current.set(file, pdfDocLib);
            // Load with pdfjs-dist for preview generation
            const pdfDocJs = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
            for (let i = 0; i < pdfDocJs.numPages; i++) {
              pagesWithLoadingState.push({
                id: uuidv4(),
                originalFile: file,
                originalPageIndex: i,
                fileName: file.name,
                previewBlob: null, // Initially null
                isLoadingPreview: true, // Initially true
              });
            }
          }
        }
        // Add all new pages to state immediately with loading indicators
        setMergedPages((prev) => [...prev, ...pagesWithLoadingState]);

        // Now, asynchronously generate previews and update state
        pagesWithLoadingState.forEach(async (pageToProcess) => {
          try {
            const pdfDocJs = await pdfjsLib.getDocument({ data: await pageToProcess.originalFile.arrayBuffer() }).promise;
            const pageJs = await pdfDocJs.getPage(pageToProcess.originalPageIndex + 1);
            const viewport = pageJs.getViewport({ scale: 1 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) throw new Error("Could not get canvas context");

            const desiredWidth = 64;
            const scale = desiredWidth / viewport.width;
            const scaledViewport = pageJs.getViewport({ scale });

            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;

            await pageJs.render({ canvas: canvas, canvasContext: context, viewport: scaledViewport }).promise;

            const previewBlob = await new Promise<Blob | null>((resolve) => {
              canvas.toBlob((blob) => resolve(blob), 'image/png');
            });

            setMergedPages((prev) =>
              prev.map((p) =>
                p.id === pageToProcess.id
                  ? { ...p, previewBlob: previewBlob, isLoadingPreview: false }
                  : p
              )
            );
          } catch (error) {
            console.error(`Error generating preview for page ${pageToProcess.originalPageIndex} of ${pageToProcess.fileName}:`, error);
            setMergedPages((prev) =>
              prev.map((p) =>
                p.id === pageToProcess.id
                  ? { ...p, isLoadingPreview: false } // Set to false even on error
                  : p
              )
            );
          }
        });
      } else if (['split-pdf', 'compress-pdf', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'word-to-pdf', 'crop-pdf'].includes(toolSlug)) {
        setFiles([newFiles[0]]); // Replace with the first new file
        if (toolSlug === 'crop-pdf' && newFiles[0].type === 'application/pdf') {
          loadFirstPageForCropPreview(newFiles[0]);
        }
      } else {
        setFiles((prev) => [...prev, ...newFiles]);
      }
      setIsCompleted(false);
      setOriginalFileSize(null);
      setCompressedFileSize(null);
      setCompressedFile(null);
      setCropX(0); setCropY(0); setCropWidth(0); setCropHeight(0);
      setPreviewRenderedWidth(0); setPreviewRenderedHeight(0);
      // Clear imageToPdfPreviewFile if not image-to-pdf tool
      if (toolSlug !== 'image-to-pdf') setImageToPdfPreviewFile(null);
    }
  };

  const handleRemoveFile = (index: number) => {
    if (toolSlug === 'merge-pdf') {
      const pageToRemove = mergedPages[index];
      if (pageToRemove) {
        setMergedPages((prev) => prev.filter((_, i) => i !== index));
        // Check if any other pages from this original file exist in mergedPages
        const remainingPagesFromSameFile = mergedPages.filter(
          (p) => p.originalFile === pageToRemove.originalFile && p.id !== pageToRemove.id
        );
        if (remainingPagesFromSameFile.length === 0) {
          pdfDocuments.current.delete(pageToRemove.originalFile);
        }
      }
    } else {
      setFiles((prev) => prev.filter((_, i) => i !== index));
    }
    if ((toolSlug === 'merge-pdf' ? mergedPages.length <= 1 : files.length <= 1)) {
      if (toolSlug === 'crop-pdf') {
        setCropX(0);
        setCropY(0);
        setCropWidth(0);
        setCropHeight(0);
        setPreviewRenderedWidth(0);
        setPreviewRenderedHeight(0);
      }
    }
  };

  const handleClearAll = () => {
    setFiles([]);
    setIsCompleted(false);
    setDownloadUrl(null);
    setOriginalFileSize(null); // For compress-pdf
    setMergedPages([]); // For merge-pdf
    setCompressedFileSize(null);
    setCropX(0);
    setCropY(0);
    setCropWidth(0);
    setCropHeight(0);
    setPreviewRenderedWidth(0);
    setPreviewRenderedHeight(0);
    pdfDocuments.current.clear(); // Clear cached PDF documents
    setCompressedFile(null);
    setPageRange('');
    setProgress(0);
    setEditText('Edited with WallPDF!');
    setCompressionLevel('recommended');
    setPageOrientation('portrait');
    setPageSize('fit');
    setMargin('none');
    setImageToPdfPreviewFile(null); // For image-to-pdf
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      if (toolSlug === 'merge-pdf') {
        const oldIndex = mergedPages.findIndex((page) => page.id === active.id);
        const newIndex = mergedPages.findIndex((page) => page.id === over.id);
        setMergedPages(arrayMove(mergedPages, oldIndex, newIndex));
      } else {
        setFiles((items) => {
          const oldIndex = items.findIndex((f) => `${f.name}-${f.lastModified}-${f.size}` === active.id);
          const newIndex = items.findIndex((f) => `${f.name}-${f.lastModified}-${f.size}` === over.id);
          return arrayMove(items, oldIndex, newIndex);
        });
      }
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
    if (slug === 'crop-pdf') {
      return 'application/pdf';
    }
    if (slug === 'image-to-pdf') {
      return 'image/jpeg,image/png,image/gif,image/webp'; // Common image formats
    }
    return 'application/pdf';
  };
  const handleProcess = async () => {
    if (files.length === 0 && toolSlug !== 'merge-pdf') return; // General check for tools using 'files'
    if (mergedPages.length === 0 && toolSlug === 'merge-pdf') return; // Specific check for merge-pdf

    setIsProcessing(true);
    setProgress(0);
    console.log('[ToolWorkspace] start processing', toolSlug === 'merge-pdf' ? `${mergedPages.length} pages` : files.map(f => f.name));

    try {
      if (toolSlug === 'merge-pdf') {
        if (mergedPages.length === 0) return;

        const mergedPdf = await PDFDocument.create();
        let processedCount = 0;
        for (const pageToMerge of mergedPages) {
          const sourcePdf = pdfDocuments.current.get(pageToMerge.originalFile);
          if (!sourcePdf) continue; // Should not happen if pdfDocuments is correctly managed
          const [copiedPage] = await mergedPdf.copyPages(sourcePdf, [pageToMerge.originalPageIndex]);
          mergedPdf.addPage(copiedPage);
          processedCount++;
          setProgress(Math.round((processedCount / mergedPages.length) * 100));
        }

        const mergedPdfBytes = await mergedPdf.save();
        const pdfBuffer = new Uint8Array(mergedPdfBytes);
        const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
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
        const compressedPdfBuffer = compressedPdfBytes.buffer.slice(
          compressedPdfBytes.byteOffset,
          compressedPdfBytes.byteOffset + compressedPdfBytes.byteLength
        ) as ArrayBuffer;

        setProgress(90); // Stage 4: Finalizing
        const blob = new Blob([compressedPdfBuffer], { type: 'application/pdf' });
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
        const pdfBuffer = pdfBytes.buffer.slice(
          pdfBytes.byteOffset,
          pdfBytes.byteOffset + pdfBytes.byteLength
        ) as ArrayBuffer;
        const blob = new Blob([pdfBuffer], { type: 'application/pdf' });

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
      } else if (toolSlug === 'image-to-pdf') {
        if (files.length === 0) return;
        const pdfDoc = await PDFDocument.create();
        
        // Define page sizes (in points)
        const pageSizes: Record<'a4' | 'letter' | 'fit', { width: number; height: number }> = {
          a4: { width: 595, height: 842 }, // 210mm x 297mm
          letter: { width: 612, height: 792 }, // 8.5in x 11in
          fit: { width: 800, height: 600 }, // Default, will be adjusted per image
        };

        // Define margins (in points)
        const margins: Record<'none' | 'small' | 'big', number> = {
          none: 0,
          small: 20,
          big: 40,
        };

        const marginValue = margins[margin];
        
        for (const file of files) {
          const imageBytes = await file.arrayBuffer();
          let image;
          if (file.type === 'image/jpeg') {
            image = await pdfDoc.embedJpg(imageBytes);
          } else if (file.type === 'image/png') {
            image = await pdfDoc.embedPng(imageBytes);
          } else {
            console.warn(`Unsupported image type: ${file.type}`);
            continue;
          }

          // Determine page dimensions based on orientation and size
          let selectedPageSize = pageSizes[pageSize as 'a4' | 'letter' | 'fit'];
          if (pageSize === 'fit') {
            // For fit mode, use image dimensions or a reasonable default
            const imageWidth = image.width;
            const imageHeight = image.height;
            selectedPageSize = { width: imageWidth + marginValue * 2, height: imageHeight + marginValue * 2 };
          } else if (pageOrientation === 'landscape') {
            // Swap dimensions for landscape
            [selectedPageSize.width, selectedPageSize.height] = [selectedPageSize.height, selectedPageSize.width];
          }

          const page = pdfDoc.addPage([selectedPageSize.width, selectedPageSize.height]);
          
          // Calculate available space for the image (excluding margins)
          const availableWidth = selectedPageSize.width - marginValue * 2;
          const availableHeight = selectedPageSize.height - marginValue * 2;
          
          // Scale image to fit available space while maintaining aspect ratio
          const imageDims = image.scaleToFit(availableWidth, availableHeight);
          
          // Center the image within the available space
          const x = marginValue + (availableWidth - imageDims.width) / 2;
          const y = marginValue + (availableHeight - imageDims.height) / 2;
          
          page.drawImage(image, { ...imageDims, x, y });
        }
        const pdfBytes = await pdfDoc.save();
        const pdfArrayBuffer = pdfBytes.buffer.slice(
          pdfBytes.byteOffset,
          pdfBytes.byteOffset + pdfBytes.byteLength
        ) as ArrayBuffer;
        setDownloadUrl(URL.createObjectURL(new Blob([pdfArrayBuffer], { type: 'application/pdf' })));
        setIsCompleted(true);
      } else if (toolSlug === 'edit-pdf') {
        // Basic placeholder implementation for Edit PDF.
        // This adds a sample text to the first page. A full implementation requires a UI for editing.
        if (files.length === 0) return;

        const pdfToEdit = files[0];
        const pdfBytes = await pdfToEdit.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const firstPage = pdfDoc.getPages()[0];

        if (firstPage) {
          firstPage.drawText(editText, { x: 50, y: firstPage.getHeight() - 50, size: 24 });
        }

        const editedPdfBytes = await pdfDoc.save();
        const editedPdfArrayBuffer = editedPdfBytes.buffer.slice(
          editedPdfBytes.byteOffset,
          editedPdfBytes.byteOffset + editedPdfBytes.byteLength
        ) as ArrayBuffer;
        setDownloadUrl(URL.createObjectURL(new Blob([editedPdfArrayBuffer], { type: 'application/pdf' })));
        setIsCompleted(true);
      } else if (toolSlug === 'crop-pdf') {
        if (files.length === 0) return;
        const pdfToCrop = files[0];
        const pdfBytes = await pdfToCrop.arrayBuffer();

        setProgress(25);

        const cropInfo = cropDataRef.current;
        const cropRatio = cropInfo.normalized;
        const applyToAll = cropInfo.applyToAll;
        const pageRangeStr = cropInfo.pageRange;

        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();
        const totalPages = pages.length;

        setProgress(50);

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

        setProgress(85);

        const croppedPdfBytes = await pdfDoc.save();
        const croppedArrayBuffer = croppedPdfBytes.buffer.slice(
          croppedPdfBytes.byteOffset,
          croppedPdfBytes.byteOffset + croppedPdfBytes.byteLength
        ) as ArrayBuffer;

        const blob = new Blob([croppedArrayBuffer], { type: 'application/pdf' });
        setDownloadUrl(URL.createObjectURL(blob));
        setProgress(100);
        setIsCompleted(true);
      }
    } catch (err) {
      console.error('Error processing PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#F8FAFC] dark:bg-black py-12 px-4 sm:px-6 flex items-center justify-center transition-colors duration-200">
      <div className="w-full max-w-5xl">
      
        {/* Main Pitch Black Card Container */}
        <div className="bg-white dark:bg-zinc-900 rounded-[32px] p-4 sm:p-8 shadow-sm dark:shadow-none border border-slate-200/80 dark:border-zinc-800 transition-colors"> 
          
          {!hasFilesOrPages ? (
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
              <div className="flex flex-col sm:flex-row items-center justify-center space-x-0 sm:space-x-3 mb-3">
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
              <label className="cursor-pointer group relative inline-flex items-center justify-center w-full max-w-[280px] sm:max-w-[320px] bg-[#E5252A] hover:bg-[#C51920] active:scale-[0.98] text-white font-bold py-3 sm:py-4 px-8 sm:px-10 rounded-full shadow-md shadow-red-500/20 transition-all duration-150 mb-8">
                <span className="absolute left-6 text-xl font-black">+</span>
                <span className="text-base tracking-wide">
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
                    <PdfPreview file={compressedFile} desiredWidth={180} className="w-full h-auto rounded-md bg-white dark:bg-zinc-700 shadow-sm" />
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
                  Selected Files ({toolSlug === 'merge-pdf' ? mergedPages.length : files.length})
                </h3>
                <button onClick={handleClearAll} className="text-xs font-semibold text-[#E5252A] hover:underline">
                  Clear all
                </button>
              </div>
              
              {toolSlug === 'merge-pdf' ? (
                <PdfMergeEditor
                  pages={mergedPages}
                  onReorder={handleMergedPageReorder}
                  onRemovePage={(id) => setMergedPages((prev) => prev.filter((page) => page.id !== id))}
                />
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={files.map((f, i) => `${f.name}-${i}`)} strategy={verticalListSortingStrategy}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1"> 
                      {files.map((file, idx) => (<SortableFileItem key={`${file.name}-${idx}`} file={file} idx={idx} onRemove={handleRemoveFile} />))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {toolSlug === 'crop-pdf' && files.length > 0 && (
                <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 w-full">
                  <PdfCropEditor file={files[0]} onCropChange={handleCropChange} />
                </div>
              )}

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
                {toolSlug === 'edit-pdf' && (
                  <div className="w-full sm:w-auto flex-grow">
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      placeholder="Text to add to PDF"
                      className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:bg-white dark:focus:bg-black focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                    />
                     <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5 pl-1">Enter the text you want to add to the first page of the PDF.</p>
                  </div>
                )}

                {toolSlug === 'image-to-pdf' && (
                  <div className="w-full space-y-4 bg-slate-50 dark:bg-zinc-800/50 p-5 rounded-xl border border-slate-200 dark:border-zinc-700">
                    <h4 className="font-semibold text-slate-900 dark:text-white text-sm mb-4">PDF Options</h4>
                    
                    {/* Page Orientation */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">Page Orientation</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPageOrientation('portrait')}
                          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                            pageOrientation === 'portrait'
                              ? 'bg-[#E5252A] text-white shadow-md'
                              : 'bg-white dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-600 hover:border-slate-300 dark:hover:border-zinc-500'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="6" y="2" width="12" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" rx="1"/>
                            <line x1="10" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1"/>
                          </svg>
                          Portrait
                        </button>
                        <button
                          onClick={() => setPageOrientation('landscape')}
                          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                            pageOrientation === 'landscape'
                              ? 'bg-[#E5252A] text-white shadow-md'
                              : 'bg-white dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-600 hover:border-slate-300 dark:hover:border-zinc-500'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="2" y="6" width="20" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" rx="1"/>
                            <line x1="7" y1="10" x2="7" y2="14" stroke="currentColor" strokeWidth="1"/>
                          </svg>
                          Landscape
                        </button>
                      </div>
                    </div>

                    {/* Page Size */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">Page Size</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setPageSize('fit')}
                          className={`py-2.5 px-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1.5 ${
                            pageSize === 'fit'
                              ? 'bg-[#E5252A] text-white shadow-md'
                              : 'bg-white dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-600 hover:border-slate-300 dark:hover:border-zinc-500'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 3h18v18H3z" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M6 12l4-4 3 3 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Fit
                        </button>
                        <button
                          onClick={() => setPageSize('a4')}
                          className={`py-2.5 px-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1.5 ${
                            pageSize === 'a4'
                              ? 'bg-[#E5252A] text-white shadow-md'
                              : 'bg-white dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-600 hover:border-slate-300 dark:hover:border-zinc-500'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="5" y="2" width="14" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                            <line x1="8" y1="6" x2="16" y2="6" stroke="currentColor" strokeWidth="1"/>
                            <line x1="8" y1="10" x2="16" y2="10" stroke="currentColor" strokeWidth="1"/>
                            <line x1="8" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1"/>
                          </svg>
                          A4
                        </button>
                        <button
                          onClick={() => setPageSize('letter')}
                          className={`py-2.5 px-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1.5 ${
                            pageSize === 'letter'
                              ? 'bg-[#E5252A] text-white shadow-md'
                              : 'bg-white dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-600 hover:border-slate-300 dark:hover:border-zinc-500'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="5" y="2" width="14" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                            <line x1="8" y1="6" x2="16" y2="6" stroke="currentColor" strokeWidth="1"/>
                            <line x1="8" y1="10" x2="16" y2="10" stroke="currentColor" strokeWidth="1"/>
                            <line x1="8" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1"/>
                          </svg>
                          Letter
                        </button>
                      </div>
                    </div>

                    {/* Margin */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">Margin</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setMargin('none')}
                          className={`py-2.5 px-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1.5 ${
                            margin === 'none'
                              ? 'bg-[#E5252A] text-white shadow-md'
                              : 'bg-white dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-600 hover:border-slate-300 dark:hover:border-zinc-500'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                          </svg>
                          None
                        </button>
                        <button
                          onClick={() => setMargin('small')}
                          className={`py-2.5 px-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1.5 ${
                            margin === 'small'
                              ? 'bg-[#E5252A] text-white shadow-md'
                              : 'bg-white dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-600 hover:border-slate-300 dark:hover:border-zinc-500'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                            <rect x="5" y="5" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
                          </svg>
                          Small
                        </button>
                        <button
                          onClick={() => setMargin('big')}
                          className={`py-2.5 px-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-1.5 ${
                            margin === 'big'
                              ? 'bg-[#E5252A] text-white shadow-md'
                              : 'bg-white dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-600 hover:border-slate-300 dark:hover:border-zinc-500'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="2" y="2" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                            <rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
                          </svg>
                          Big
                        </button>
                      </div>
                    </div>

                    {/* PDF Preview */}
                    {imageToPdfPreviewFile && !isGeneratingPreview && (
                      <div className="space-y-2 border-t border-slate-200 dark:border-zinc-600 pt-4 mt-4">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"> // Keep this line as it's part of the selection
                          Preview
                          {/* Add a visual indicator for changes if needed for debugging */}
                          {/* <span className="ml-2 text-red-500">{Math.random().toFixed(2)}</span> */} 
                        </label>
                        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-3 max-h-[400px] overflow-y-auto flex flex-col items-center justify-center min-h-[200px]">
                          <PdfPreview
                            key={imageToPdfPreviewFile.size + '-' + pageOrientation + '-' + pageSize + '-' + margin} // Force re-mount on relevant changes
                            file={imageToPdfPreviewFile} // Keep this line as it's part of the selection
                            desiredWidth={250}
                            className="rounded-md shadow-sm"
                          />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-zinc-400">Live preview of your PDF with current settings</p>
                      </div>
                    )}

                    {!imageToPdfPreviewFile && files.length > 0 && !isGeneratingPreview && toolSlug === 'image-to-pdf' && (
                      <div className="space-y-2 border-t border-slate-200 dark:border-zinc-600 pt-4 mt-4">
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          ⚠️ Preview could not be generated. Check browser console for errors.
                        </p>
                      </div>
                    )}

                    {isGeneratingPreview && (
                      <div className="space-y-2 border-t border-slate-200 dark:border-zinc-600 pt-4 mt-4">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">Preview</label>
                        <div className="bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg p-4 h-[200px] flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2">
                            <Spinner className="w-6 h-6 text-slate-600 dark:text-zinc-300" />
                            <p className="text-xs text-slate-600 dark:text-zinc-300">Generating preview...</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <label className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 px-5 py-3 rounded-full transition-colors w-full sm:w-auto text-center">
                  + Add more files
                  <input type="file" multiple accept={getAcceptableFileTypes(toolSlug)} onChange={handleFileInput} className="hidden" />
                </label> {/* This button is for adding files to the general 'files' state or for merge-pdf */}

                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-10 py-3.5 bg-[#E5252A] hover:bg-[#C51920] disabled:bg-slate-400 text-white font-bold text-sm rounded-full shadow-md transition-all flex items-center justify-center space-x-2"
                >
                  {isProcessing ? (
                    <span>Processing... <Spinner className="w-4 h-4" /></span>
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