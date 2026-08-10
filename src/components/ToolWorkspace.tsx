import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ToolIcon } from './ToolIcon';
import { PdfCropEditor } from './PdfCropEditor';
 import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs for merged pages
import { PDFDocument, PDFDict, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream, PDFPage, rgb, degrees, StandardFonts } from 'pdf-lib'; 
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

interface PdfToImagePreview {
  pageNumber: number;
  blobUrl: string;
  isLoading: boolean;
}

interface ToolWorkspaceProps {
  toolSlug: string;
  toolName: string;
  description: string;
}

// One entry per page in the "working" document the user is building in the
// Edit PDF page manager. Pages can come from the source file (kind: 'original')
// or be freshly inserted blank pages (kind: 'blank'). The array order IS the
// final page order - reordering just moves entries around.
interface EditPageEntry {
  id: string;
  kind: 'original' | 'blank';
  originalIndex: number | null; // index into the source PDF's pages, null for blank pages
  rotationDelta: 0 | 90 | 180 | 270; // additional rotation on top of the page's existing rotation
  width: number; // page size in points, used for the thumbnail aspect ratio and element math
  height: number;
}

type EditElementType = 'text' | 'rectangle' | 'highlight' | 'line';

// A single text/shape/highlight annotation, anchored to a page by its stable id
// (so it stays attached to the right page even if pages get reordered).
// Positions are stored as 0-100 percentages from the top-left of the page so
// they're independent of the page's actual point size.
interface EditElement {
  id: string;
  pageId: string;
  type: EditElementType;
  xPct: number;
  yPct: number;
  widthPct?: number;
  heightPct?: number;
  x2Pct?: number;
  y2Pct?: number;
  text?: string;
  fontSize?: number;
  bold?: boolean;
  color: string; // hex, e.g. #E5252A
  opacity?: number;
  strokeWidth?: number;
  filled?: boolean;
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

// Shows KB for anything under 1 MB (where 2-decimal MB rounding would hide
// a ~10 KB range behind one label) and MB otherwise.
const formatFileSize = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${mb.toFixed(2)} MB`;
};

// Converts a "#RRGGBB" hex color into the 0-1 component range pdf-lib's rgb() expects.
// Falls back to black on anything malformed.
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(match[1], 16) / 255,
    g: parseInt(match[2], 16) / 255,
    b: parseInt(match[3], 16) / 255,
  };
};

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
  const [targetSizeKb, setTargetSizeKb] = useState('');
  const [compressedFileSize, setCompressedFileSize] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [compressedFile, setCompressedFile] = useState<File | null>(null);
  const [compressionNote, setCompressionNote] = useState<string | null>(null);
  const [cropX, setCropX] = useState(0); // Keep this line as it's part of the selection
  const [cropY, setCropY] = useState(0);
  const [cropWidth, setCropWidth] = useState(0);
  const [cropHeight, setCropHeight] = useState(0);
  const [isDrawingCrop, setIsDrawingCrop] = useState(false);
  const [drawStartPoint, setDrawStartPoint] = useState<{ x: number; y: number } | null>(null);

  const [previewRenderedWidth, setPreviewRenderedWidth] = useState(0); // Keep this line as it's part of the selection
  const [previewRenderedHeight, setPreviewRenderedHeight] = useState(0);
  const [editPages, setEditPages] = useState<EditPageEntry[]>([]);
  const [editElements, setEditElements] = useState<EditElement[]>([]);
  const [editElementDraft, setEditElementDraft] = useState<{
    type: EditElementType;
    pageId: string;
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
    x2Pct: number;
    y2Pct: number;
    text: string;
    fontSize: number;
    bold: boolean;
    color: string;
    opacity: number;
    strokeWidth: number;
    filled: boolean;
  }>({
    type: 'text',
    pageId: '',
    xPct: 10,
    yPct: 10,
    widthPct: 30,
    heightPct: 10,
    x2Pct: 40,
    y2Pct: 10,
    text: 'Edited with WallPDF!',
    fontSize: 18,
    bold: false,
    color: '#E5252A',
    opacity: 1,
    strokeWidth: 2,
    filled: false,
  });
  const [isPageManagerOpen, setIsPageManagerOpen] = useState(true);
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [pageSize, setPageSize] = useState<'fit' | 'a4' | 'letter'>('fit');
  const [margin, setMargin] = useState<'none' | 'small' | 'big'>('none');
  const [imageToPdfPreviewFile, setImageToPdfPreviewFile] = useState<Blob | null>(null);
  const [imageFormat, setImageFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [pdfToImagePreviews, setPdfToImagePreviews] = useState<PdfToImagePreview[]>([]);
  const [selectedImagePages, setSelectedImagePages] = useState<Set<number>>(new Set());
  const [isFileListOpen, setIsFileListOpen] = useState(true);
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
  const pdfJsDocs = useRef<Map<File, pdfjsLib.PDFDocumentProxy>>(new Map()); // Cache for pdfjs-dist documents
  const fileProcessingController = useRef<AbortController | null>(null);
  const imagePreviewContainerRef = useRef<HTMLDivElement>(null);

  const hasFilesOrPages = files.length > 0;

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
            <p className="text-[10px] text-slate-400 dark:text-zinc-400">{formatFileSize(file.size)}</p>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onRemove(idx); }} className="p-1 rounded-lg text-slate-400 hover:text-[#E5252A] transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>
    );
  };

  const SortableEditPageThumb: React.FC<{
    entry: EditPageEntry;
    index: number;
    sourceFile: File | undefined;
    onRotate: (id: string, delta: 90 | -90) => void;
    onDelete: (id: string) => void;
    onInsertBlankAfter: (id: string) => void;
  }> = ({ entry, index, sourceFile, onRotate, onDelete, onInsertBlankAfter }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 10 : 'auto',
    };

    const isPortrait = entry.height >= entry.width;

    return (
      <div ref={setNodeRef} style={style} className="relative flex flex-col items-center gap-1.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-2">
        <div {...attributes} {...listeners} className="w-full flex items-center justify-center cursor-grab active:cursor-grabbing" title="Drag to reorder">
          <div
            className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 flex items-center justify-center"
            style={{
              width: isPortrait ? 72 : 96,
              aspectRatio: `${entry.width} / ${entry.height}`,
              transform: `rotate(${entry.rotationDelta}deg)`,
            }}
          >
            {entry.kind === 'original' && sourceFile ? (
              <PdfPreview file={sourceFile} pageNumber={(entry.originalIndex ?? 0) + 1} desiredWidth={96} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[9px] font-semibold text-slate-400 dark:text-zinc-500 bg-white dark:bg-zinc-800">
                Blank
              </div>
            )}
          </div>
        </div>
        <span className="text-[10px] font-semibold text-slate-600 dark:text-zinc-300">Page {index + 1}</span>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => onRotate(entry.id, -90)} title="Rotate left" className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L4 10m0 0l5-5m-5 5h11a4 4 0 010 8h-1" /></svg>
          </button>
          <button type="button" onClick={() => onRotate(entry.id, 90)} title="Rotate right" className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l5-5m0 0l-5-5m5 5H9a4 4 0 000 8h1" /></svg>
          </button>
          <button type="button" onClick={() => onInsertBlankAfter(entry.id)} title="Insert blank page after" className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          </button>
          <button type="button" onClick={() => onDelete(entry.id)} title="Delete page" className="p-1 rounded-md text-slate-400 hover:text-[#E5252A] hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
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

  const generatePagePreviews = useCallback(async (file: File, signal: AbortSignal, setPreviews: React.Dispatch<React.SetStateAction<PdfToImagePreview[]>>, setSelectedPages: React.Dispatch<React.SetStateAction<Set<number>>>) => {
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      if (signal.aborted) return;

      const pdfDocJs = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      if (signal.aborted) return;

      const numPages = pdfDocJs.numPages;
      const initialPreviews: PdfToImagePreview[] = Array.from({ length: numPages }, (_, i) => ({
        pageNumber: i + 1,
        blobUrl: '',
        isLoading: true,
      }));

      setPreviews(initialPreviews);
      setSelectedPages(new Set(Array.from({ length: numPages }, (_, i) => i + 1)));

      for (let i = 1; i <= numPages; i++) {
        if (signal.aborted) return;

        try {
          const page = await pdfDocJs.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;

          const desiredWidth = 150;
          const scale = desiredWidth / viewport.width;
          const scaledViewport = page.getViewport({ scale });

          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;

          await page.render({ canvas, canvasContext: context, viewport: scaledViewport }).promise;
          if (signal.aborted) return;

          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
          if (signal.aborted) return;

          if (blob) {
            const blobUrl = URL.createObjectURL(blob);
            setPreviews((prev) =>
              prev.map((p) => (p.pageNumber === i ? { ...p, blobUrl, isLoading: false } : p))
            );
          }
        } catch (pageError) {
          console.error(`Error generating preview for page ${i}:`, pageError);
          if (signal.aborted) return;
          setPreviews((prev) => prev.map((p) => (p.pageNumber === i ? { ...p, isLoading: false } : p)));
        }
      }
    } catch (error) {
      console.error('Error generating PDF previews:', error);
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

        // Define page sizes (in points)
        const pageSizes: Record<'a4' | 'letter' | 'fit', { width: number; height: number }> = {
          a4: { width: 595, height: 842 },
          letter: { width: 612, height: 792 },
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
          console.log('[generatePreview] Processing file:', file.name, 'type:', file.type);
          const imageBytes = await file.arrayBuffer();
          let image;

          if (file.type === 'image/jpeg') {
            image = await pdfDoc.embedJpg(imageBytes);
          } else if (file.type === 'image/png') {
            image = await pdfDoc.embedPng(imageBytes);
          } else {
            console.warn(`[generatePreview] Unsupported image type: ${file.type}`);
            continue; // Skip unsupported files
          }

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
        }

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

  // Generate previews for pdf-to-images when a single file is present
  useEffect(() => {
    if (toolSlug === 'pdf-to-images' && files.length === 1) {
      const controller = new AbortController();
      fileProcessingController.current = controller;
      generatePagePreviews(files[0], controller.signal, setPdfToImagePreviews, setSelectedImagePages);

      return () => {
        controller.abort();
      };
    } else if (toolSlug === 'pdf-to-images' && files.length !== 1) {
      setPdfToImagePreviews([]);
      setSelectedImagePages(new Set());
    } else if (toolSlug === 'split-pdf' && files.length === 1) {
      const controller = new AbortController();
      fileProcessingController.current = controller;
      generatePagePreviews(files[0], controller.signal, setPdfToImagePreviews, setSelectedImagePages);
      return () => {
        controller.abort();
      };
    } else if (toolSlug === 'split-pdf' && files.length !== 1) {
      setPdfToImagePreviews([]);
      setSelectedImagePages(new Set());
    }
  }, [files, toolSlug, generatePagePreviews]);

  // Scroll image-to-pdf preview to top when it's updated
  useEffect(() => {
    if (toolSlug === 'image-to-pdf' && imageToPdfPreviewFile && imagePreviewContainerRef.current) {
      imagePreviewContainerRef.current.scrollTop = 0;
    }
  }, [imageToPdfPreviewFile, toolSlug]);

  // Build the working page list for the Edit PDF page manager whenever a file
  // is loaded. This just reads page count/sizes - actual edits are only
  // applied when the user hits Process.
  useEffect(() => {
    let cancelled = false;

    const initEditPages = async () => {
      if (toolSlug !== 'edit-pdf' || files.length === 0) {
        setEditPages([]);
        setEditElements([]);
        return;
      }
      try {
        const bytes = await files[0].arrayBuffer();
        const sourceDoc = await PDFDocument.load(bytes);
        if (cancelled) return;

        const pages: EditPageEntry[] = sourceDoc.getPages().map((page, idx) => {
          const { width, height } = page.getSize();
          return {
            id: uuidv4(),
            kind: 'original',
            originalIndex: idx,
            rotationDelta: 0,
            width,
            height,
          };
        });

        setEditPages(pages);
        setEditElements([]);
        setEditElementDraft((prev) => ({ ...prev, pageId: pages[0]?.id ?? '' }));
      } catch (error) {
        console.error('[edit-pdf] failed to read PDF for the page manager', error);
        setEditPages([]);
        setEditElements([]);
      }
    };

    initEditPages();
    return () => {
      cancelled = true;
    };
  }, [files, toolSlug]);

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


  const handleToggleImagePageSelection = (pageNumber: number) => {
    setSelectedImagePages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(pageNumber)) {
        newSet.delete(pageNumber);
      } else {
        newSet.add(pageNumber);
      }
      return newSet;
    });
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const acceptedTypes = getAcceptableFileTypes(toolSlug).split(',');
      const newFiles = Array.from(e.dataTransfer.files).filter(file => 
        acceptedTypes.some(type => file.type === type.trim() || type.trim() === '*/*')
      );
      console.log('[ToolWorkspace] drop files:', newFiles.map((f) => f.name));

      if (fileProcessingController.current) {
        fileProcessingController.current.abort();
      }
      const controller = new AbortController();
      fileProcessingController.current = controller;

      if (['split-pdf', 'compress-pdf', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'word-to-pdf', 'crop-pdf', 'edit-pdf'].includes(toolSlug)) {
        // Tools that only support one file at a time.
        const firstFile = newFiles[0];
        setFiles(firstFile ? [firstFile] : []);
        if (toolSlug === 'crop-pdf' && firstFile.type === 'application/pdf') {
          loadFirstPageForCropPreview(firstFile);
        }
      } else {
        // All other tools that can handle multiple files (e.g., image-to-pdf, pdf-to-images).
        setFiles((prev) => [...prev, ...newFiles]);
      }
      setIsCompleted(false);
      setOriginalFileSize(null);
      if (toolSlug !== 'image-to-pdf') setImageToPdfPreviewFile(null);
      setCompressedFileSize(null);
      setCompressedFile(null);
    }
  }, [toolSlug, loadFirstPageForCropPreview, generatePagePreviews]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // If there's an ongoing process, abort it before starting a new one.
    if (fileProcessingController.current) {
      fileProcessingController.current.abort();
    }
    const controller = new AbortController();
    fileProcessingController.current = controller;
    if (e.target.files && e.target.files.length > 0) {
      const acceptedTypes = getAcceptableFileTypes(toolSlug).split(',');
      let newFiles = Array.from(e.target.files!).filter(file => 
        acceptedTypes.some(type => file.type === type.trim() || type.trim() === '*/*')
      );
      console.log('[ToolWorkspace] input files:', newFiles.map((f) => f.name));

      if (['split-pdf', 'compress-pdf', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'word-to-pdf', 'crop-pdf', 'edit-pdf'].includes(toolSlug)) {
        // Tools that only support one file at a time.
        const firstFile = newFiles[0];
        setFiles(firstFile ? [firstFile] : []);
        if (toolSlug === 'crop-pdf' && firstFile.type === 'application/pdf') {
          loadFirstPageForCropPreview(firstFile);
        }
      } else {
        // All other tools that can handle multiple files (e.g., image-to-pdf, pdf-to-images).
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
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);

    // If the last file was removed, clear all associated UI states
    if (newFiles.length === 0) {
      if (toolSlug === 'crop-pdf') {
        setCropX(0); setCropY(0); setCropWidth(0); setCropHeight(0);
        setPreviewRenderedWidth(0); setPreviewRenderedHeight(0);
        cropDataRef.current = { normalized: { left: 0, top: 0, right: 1, bottom: 1 }, px: { x: 0, y: 0, width: 0, height: 0 }, pt: { x: 0, y: 0, width: 0, height: 0 }, pageRange: '', applyToAll: true };
      }
      if (toolSlug === 'pdf-to-images') {
        setPdfToImagePreviews([]);
        setSelectedImagePages(new Set());
      }
      if (toolSlug === 'edit-pdf') {
        setEditPages([]);
        setEditElements([]);
      }
    }
  };

  const handleClearAll = () => {
    // Abort any ongoing file processing (like preview generation)
    if (fileProcessingController.current) {
      fileProcessingController.current.abort();
      fileProcessingController.current = null;
    }
    setFiles([]);
    setIsCompleted(false);
    setDownloadUrl(null);
    setOriginalFileSize(null);
    setCompressedFileSize(0);
    setCropX(0);
    setCropY(0);
    setCropWidth(0);
    setCropHeight(0);
    setPreviewRenderedWidth(0);
    setPreviewRenderedHeight(0);
    pdfDocuments.current.clear(); // Clear cached PDF documents
    // No need to destroy here since we are not caching them in this version
    pdfJsDocs.current.clear();
    setCompressedFile(null);
    setCompressionNote(null);
    setPageRange('');
    setProgress(0);
    setEditPages([]);
    setEditElements([]);
    setPageOrientation('portrait');
    setPageSize('fit');
    setMargin('none');
    setImageToPdfPreviewFile(null); // For image-to-pdf
    setImageFormat('jpeg');
    setPdfToImagePreviews([]);
    setSelectedImagePages(new Set());
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;
    // Prevent reordering when dragging over a non-droppable area
    if (!over.data.current?.sortable) {
      return;
    }
    if (active.id !== over.id) {
      setFiles((items) => {
        const oldIndex = items.findIndex((f, i) => `${f.name}-${i}` === active.id);
        const newIndex = items.findIndex((f, i) => `${f.name}-${i}` === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // --- Edit PDF: page manager handlers ---

  const handleEditPagesDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setEditPages((items) => {
      const oldIndex = items.findIndex((p) => p.id === active.id);
      const newIndex = items.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const handleRotateEditPage = (id: string, delta: 90 | -90) => {
    setEditPages((items) =>
      items.map((p) =>
        p.id === id
          ? { ...p, rotationDelta: (((p.rotationDelta + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270 }
          : p
      )
    );
  };

  const handleDeleteEditPage = (id: string) => {
    setEditPages((items) => items.filter((p) => p.id !== id));
    // Elements anchored to a deleted page no longer have anywhere to go.
    setEditElements((items) => items.filter((el) => el.pageId !== id));
  };

  const handleInsertBlankEditPage = (afterId: string | null) => {
    setEditPages((items) => {
      const referenceSize = items[0] ? { width: items[0].width, height: items[0].height } : { width: 612, height: 792 };
      const newEntry: EditPageEntry = {
        id: uuidv4(),
        kind: 'blank',
        originalIndex: null,
        rotationDelta: 0,
        width: referenceSize.width,
        height: referenceSize.height,
      };
      if (afterId === null) return [...items, newEntry];
      const idx = items.findIndex((p) => p.id === afterId);
      if (idx === -1) return [...items, newEntry];
      const next = [...items];
      next.splice(idx + 1, 0, newEntry);
      return next;
    });
  };

  const getEditPageLabel = (entry: EditPageEntry, index: number) => {
    const parts = [`Page ${index + 1}`];
    if (entry.kind === 'blank') parts.push('blank');
    if (entry.rotationDelta !== 0) parts.push(`rotated ${entry.rotationDelta}\u00b0`);
    return parts.join(' \u2013 ');
  };

  // --- Edit PDF: element (text/shape/highlight) handlers ---

  const handleAddEditElement = () => {
    if (!editElementDraft.pageId) return;
    if (editElementDraft.type === 'text' && !editElementDraft.text.trim()) return;

    const newElement: EditElement = {
      id: uuidv4(),
      pageId: editElementDraft.pageId,
      type: editElementDraft.type,
      xPct: editElementDraft.xPct,
      yPct: editElementDraft.yPct,
      color: editElementDraft.color,
    };

    if (editElementDraft.type === 'text') {
      newElement.text = editElementDraft.text;
      newElement.fontSize = editElementDraft.fontSize;
      newElement.bold = editElementDraft.bold;
    } else if (editElementDraft.type === 'rectangle') {
      newElement.widthPct = editElementDraft.widthPct;
      newElement.heightPct = editElementDraft.heightPct;
      newElement.filled = editElementDraft.filled;
      newElement.strokeWidth = editElementDraft.strokeWidth;
      newElement.opacity = editElementDraft.opacity;
    } else if (editElementDraft.type === 'highlight') {
      newElement.widthPct = editElementDraft.widthPct;
      newElement.heightPct = editElementDraft.heightPct;
      newElement.opacity = editElementDraft.opacity;
    } else if (editElementDraft.type === 'line') {
      newElement.x2Pct = editElementDraft.x2Pct;
      newElement.y2Pct = editElementDraft.y2Pct;
      newElement.strokeWidth = editElementDraft.strokeWidth;
      newElement.opacity = editElementDraft.opacity;
    }

    setEditElements((prev) => [...prev, newElement]);
  };

  const handleRemoveEditElement = (id: string) => {
    setEditElements((prev) => prev.filter((el) => el.id !== id));
  };

  const describeEditElement = (el: EditElement, pageIndex: number) => {
    const pageLabel = `p.${pageIndex + 1}`;
    switch (el.type) {
      case 'text':
        return `"${el.text}" on ${pageLabel} (${el.fontSize}pt${el.bold ? ', bold' : ''})`;
      case 'rectangle':
        return `${el.filled ? 'Filled' : 'Outlined'} rectangle on ${pageLabel}`;
      case 'highlight':
        return `Highlight on ${pageLabel}`;
      case 'line':
        return `Line on ${pageLabel}`;
      default:
        return `Element on ${pageLabel}`;
    }
  };

  const getDownloadExtension = (slug: string) => {
    switch (slug) {
      case 'compress-pdf':
        return 'pdf';
      case 'pdf-to-images':
        if (selectedImagePages.size > 1) {
          return 'zip';
        }
      case 'pdf-to-word': return 'docx';
      case 'pdf-to-powerpoint': return 'pptx';
      case 'pdf-to-excel': return 'xlsx';
      case 'split-pdf':
        return 'pdf'; // Now it produces a single PDF
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
    if (['crop-pdf'].includes(slug)) {
      return 'application/pdf';
    }
    if (slug === 'image-to-pdf') {
      return 'image/jpeg,image/png,image/gif,image/webp'; // Common image formats
    }
    if (slug === 'merge-pdf') {
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
        if (files.length === 0) return;

        const mergedPdf = await PDFDocument.create();
        let processedCount = 0;
        for (const file of files) {
          const pdfBytes = await file.arrayBuffer();
          const sourcePdf = await PDFDocument.load(pdfBytes);
          const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
          copiedPages.forEach((page) => {
            mergedPdf.addPage(page);
          });
          processedCount++;
          // Use files.length for progress calculation
          setProgress(Math.round((processedCount / files.length) * 100));
        }

        const mergedPdfBytes = await mergedPdf.save();
        const pdfBuffer = mergedPdfBytes.buffer.slice(
          mergedPdfBytes.byteOffset,
          mergedPdfBytes.byteOffset + mergedPdfBytes.byteLength
        ) as ArrayBuffer;
        const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
        setDownloadUrl(URL.createObjectURL(blob));
        setIsCompleted(true);
      } else if (toolSlug === 'split-pdf') {
        if (files.length === 0) return;

        const pdfToSplit = files[0];
        setProgress(25); // Stage 1: Reading file
        const pdfBytes = await pdfToSplit.arrayBuffer();
        
        setProgress(50); // Stage 2: Loading PDF
        const sourcePdfDoc = await PDFDocument.load(pdfBytes);

        // Use selected pages from the visual picker
        const indicesToCopy = Array.from(selectedImagePages).map(p => p - 1).sort((a, b) => a - b);

        if (indicesToCopy.length === 0) return; // Don't process if no pages are selected

        const newPdfDoc = await PDFDocument.create();

        // Copy the selected pages into the new document
        const copiedPages = await newPdfDoc.copyPages(sourcePdfDoc, indicesToCopy);
        copiedPages.forEach((page) => newPdfDoc.addPage(page));

        const newPdfBytes = await newPdfDoc.save();
        const pdfBuffer = newPdfBytes.buffer.slice(
          newPdfBytes.byteOffset,
          newPdfBytes.byteOffset + newPdfBytes.byteLength
        ) as ArrayBuffer;
        const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
        setDownloadUrl(URL.createObjectURL(blob));
        setIsCompleted(true);
      } else if (toolSlug === 'compress-pdf') {
        if (files.length === 0) return;

        const pdfToCompress = files[0];
        setOriginalFileSize(pdfToCompress.size);
        setCompressionNote(null);

        setProgress(10); // Stage 1: Reading file
        const pdfBytes = await pdfToCompress.arrayBuffer();

        setProgress(20); // Stage 2: Loading PDF
        const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });

        // Resolves a PDF /ColorSpace entry down to a simple kind + component
        // count. Handles the common /ICCBased case (an indirect reference to
        // a stream whose /N entry says how many components it has) - most
        // real-world camera/scanner JPEGs use ICCBased (embedded sRGB/Gray
        // profile) rather than plain /DeviceRGB, so this matters a lot.
        const resolveColorSpace = (csObj: any): { kind: 'gray' | 'rgb' | 'cmyk' | 'other'; components: number | null } => {
          if (csObj instanceof PDFName) {
            const n = csObj.asString();
            if (n === '/DeviceGray' || n === '/CalGray') return { kind: 'gray', components: 1 };
            if (n === '/DeviceRGB' || n === '/CalRGB' || n === '/Lab') return { kind: 'rgb', components: 3 };
            if (n === '/DeviceCMYK') return { kind: 'cmyk', components: 4 };
            return { kind: 'other', components: null };
          }
          try {
            const arr = csObj as { lookup: (i: number, t?: any) => any; size: () => number };
            if (arr && typeof arr.lookup === 'function' && arr.size() > 0) {
              const head = arr.lookup(0, PDFName);
              const headStr = head instanceof PDFName ? head.asString() : null;
              if (headStr === '/ICCBased') {
                const streamObj = arr.lookup(1);
                const nEntry = streamObj?.dict?.get?.(PDFName.of('N'));
                const n = nEntry instanceof PDFNumber ? nEntry.asNumber() : null;
                if (n === 1) return { kind: 'gray', components: 1 };
                if (n === 3) return { kind: 'rgb', components: 3 };
                if (n === 4) return { kind: 'cmyk', components: 4 };
                return { kind: 'other', components: null };
              }
              if (headStr === '/CalRGB') return { kind: 'rgb', components: 3 };
              if (headStr === '/CalGray') return { kind: 'gray', components: 1 };
              return { kind: 'other', components: null }; // Indexed, Separation, DeviceN, etc.
            }
          } catch {
            // fall through
          }
          return { kind: 'other', components: null };
        };

        type ImageCandidate = {
          ref: ReturnType<typeof pdfDoc.context.enumerateIndirectObjects>[number][0];
          dict: PDFDict;
          kind: 'jpeg' | 'raster';
          originalSize: number; // bytes this image currently occupies in the file
          getImageData: () => Promise<{ width: number; height: number; blob: Blob }>;
        };

        const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
        const imageCandidates: ImageCandidate[] = [];
        let totalImageObjects = 0;
        let skippedUnsupported = 0;
        const skipReasons: Record<string, number> = {}; // e.g. "filter:/CCITTFaxDecode" -> count

        const recordSkip = (reason: string) => {
          skippedUnsupported++;
          skipReasons[reason] = (skipReasons[reason] || 0) + 1;
        };

        for (const [ref, object] of indirectObjects) {
          if (!(object instanceof PDFRawStream)) continue;
          const dict = object.dict;

          const subtype = dict.get(PDFName.of('Subtype'));
          if (!(subtype instanceof PDFName) || subtype.asString() !== '/Image') continue;
          totalImageObjects++;

          const bpc = dict.get(PDFName.of('BitsPerComponent'));
          if (bpc instanceof PDFNumber && bpc.asNumber() !== 8) { recordSkip('bit-depth'); continue; }

          const filter = dict.get(PDFName.of('Filter'));
          const filterName = filter instanceof PDFName ? filter.asString() : null;
          const colorSpaceRaw = dict.get(PDFName.of('ColorSpace'));
          const colorInfo = resolveColorSpace(colorSpaceRaw);

          // Skip images with an alpha channel - flattening to JPEG would lose transparency.
          if (dict.has(PDFName.of('SMask')) || dict.has(PDFName.of('Mask'))) { recordSkip('transparency'); continue; }
          if (dict.has(PDFName.of('Decode'))) { recordSkip('custom-decode-array'); continue; } // non-standard value mapping

          if (filterName === '/DCTDecode') {
            // The browser's own JPEG decoder reads color info straight out of
            // the JPEG bytes (JFIF/Adobe markers), independent of what the
            // PDF's /ColorSpace dict entry says - so we only need to rule out
            // CMYK JPEGs here (Adobe's inverted-CMYK JPEGs render wrong via
            // canvas). Everything else - DeviceRGB, DeviceGray, and the very
            // common ICCBased (embedded sRGB/Gray profile) - is safe to try.
            if (colorInfo.kind === 'cmyk') { recordSkip('cmyk-jpeg'); continue; }

            // Raw contents of a /DCTDecode stream ARE the JPEG bytes already.
            const jpegBytes = object.getContents();
            imageCandidates.push({
              ref,
              dict,
              kind: 'jpeg',
              originalSize: object.getContentsSize(),
              getImageData: async () => {
                const buf = jpegBytes.buffer.slice(jpegBytes.byteOffset, jpegBytes.byteOffset + jpegBytes.byteLength) as ArrayBuffer;
                const blob = new Blob([buf], { type: 'image/jpeg' });
                const bitmap = await createImageBitmap(blob);
                return { width: bitmap.width, height: bitmap.height, blob };
              },
            });
          } else if (filterName === '/FlateDecode' || filterName === null) {
            // We're reconstructing raw pixels by hand here, so unlike the JPEG
            // case above we DO need to know the exact component layout -
            // only proceed for plain/ICCBased gray or RGB.
            if (colorInfo.kind !== 'gray' && colorInfo.kind !== 'rgb') { recordSkip(`raster-colorspace:${colorInfo.kind}`); continue; }
            const comps = colorInfo.components as 1 | 3;

            // Likely a raw (uncompressed-pixel) bitmap, Flate-compressed for storage.
            // Common for images pasted via Word/Google Docs exports.
            const width = dict.get(PDFName.of('Width'));
            const height = dict.get(PDFName.of('Height'));
            if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber)) { recordSkip('missing-dimensions'); continue; }
            const w = width.asNumber();
            const h = height.asNumber();

            imageCandidates.push({
              ref,
              dict,
              kind: 'raster',
              originalSize: object.getContentsSize(),
              getImageData: async () => {
                const decoded = decodePDFRawStream(object).decode();
                const expectedLength = w * h * comps;
                if (decoded.length < expectedLength) {
                  throw new Error(`unexpected raw image data size (got ${decoded.length}, expected ${expectedLength})`);
                }
                const rgba = new Uint8ClampedArray(w * h * 4);
                for (let p = 0; p < w * h; p++) {
                  if (comps === 3) {
                    rgba[p * 4] = decoded[p * 3];
                    rgba[p * 4 + 1] = decoded[p * 3 + 1];
                    rgba[p * 4 + 2] = decoded[p * 3 + 2];
                  } else {
                    const gray = decoded[p];
                    rgba[p * 4] = gray;
                    rgba[p * 4 + 1] = gray;
                    rgba[p * 4 + 2] = gray;
                  }
                  rgba[p * 4 + 3] = 255;
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('no 2d context');
                ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
                const blob: Blob = await new Promise((resolve, reject) => {
                  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/png');
                });
                return { width: w, height: h, blob };
              },
            });
          } else {
            recordSkip(`filter:${filterName ?? 'unknown'}`); // e.g. CCITTFaxDecode, JBIG2Decode, JPXDecode - scanned docs, not handled yet
          }
        }

        console.info(
          `[compress-pdf] ${totalImageObjects} image object(s) found, ${imageCandidates.length} eligible for recompression, ${skippedUnsupported} skipped.`,
          skipReasons
        );

        setProgress(30);

        const targetBytes = targetSizeKb && !isNaN(parseFloat(targetSizeKb))
          ? parseFloat(targetSizeKb) * 1024
          : null;

        let compressedBytes: Uint8Array | null = null;
        let anyImageShrunk = false;

        // Recompresses every candidate image at the given JPEG quality (always
        // starting from the original pixel data, never compounding across
        // calls) and returns the resulting saved PDF bytes.
        const applyQualityPass = async (quality: number): Promise<Uint8Array> => {
          for (let i = 0; i < imageCandidates.length; i++) {
            const candidate = imageCandidates[i];
            try {
              const { width, height, blob: sourceBlob } = await candidate.getImageData();
              const bitmap = await createImageBitmap(sourceBlob);

              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (!ctx) { bitmap.close(); continue; }
              ctx.drawImage(bitmap, 0, 0);
              bitmap.close();

              const recompressedBlob: Blob = await new Promise((resolve, reject) => {
                canvas.toBlob(
                  (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
                  'image/jpeg',
                  quality
                );
              });
              const newBytes = new Uint8Array(await recompressedBlob.arrayBuffer());

              // Only swap it in if we actually made it smaller.
              if (newBytes.length < candidate.originalSize) {
                const newDict = candidate.dict.clone(pdfDoc.context);
                newDict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
                newDict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
                newDict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
                newDict.set(PDFName.of('Length'), PDFNumber.of(newBytes.length));
                newDict.delete(PDFName.of('DecodeParms'));
                pdfDoc.context.assign(candidate.ref, PDFRawStream.of(newDict, newBytes));
                anyImageShrunk = true;
              }
            } catch (imgErr) {
              console.warn('[compress-pdf] skipped an image that failed to recompress', imgErr);
            }

            setProgress(30 + Math.round(((i + 1) / Math.max(imageCandidates.length, 1)) * 50));
          }

          return pdfDoc.save({ useObjectStreams: true });
        };

        if (!targetBytes) {
          compressedBytes = await applyQualityPass(0.6);
        } else {
          // Binary-search the JPEG quality so the result lands close to the
          // requested target size, instead of jumping through a few fixed
          // quality steps and stopping at the first one that happens to be
          // under the target (which tends to overshoot and compress more
          // than necessary).
          let low = 0.1;
          let high = 0.85;
          let bestUnderTarget: Uint8Array | null = null;
          let smallestSeen: Uint8Array | null = null;
          const maxIterations = 6;
          const closeEnoughRatio = 0.97; // stop once within 3% of the target

          for (let iter = 0; iter < maxIterations; iter++) {
            const quality = (low + high) / 2;
            const result = await applyQualityPass(quality);

            if (!smallestSeen || result.length < smallestSeen.length) {
              smallestSeen = result;
            }

            if (result.length <= targetBytes) {
              bestUnderTarget = result;
              if (result.length >= targetBytes * closeEnoughRatio) break;
              low = quality; // under target with room to spare - try higher quality
            } else {
              high = quality; // still too big - compress harder
            }
          }

          // Prefer the best result that fit under the target; fall back to
          // the smallest one seen if we never got under it.
          compressedBytes = bestUnderTarget ?? smallestSeen;
        }

        setProgress(90);

        if (!compressedBytes) {
          compressedBytes = await pdfDoc.save({ useObjectStreams: true });
        }

        if (imageCandidates.length === 0) {
          if (totalImageObjects === 0) {
            setCompressionNote(
              "This PDF doesn't contain any embedded raster images, so there's very little left to compress - it's likely already close to its minimum size."
            );
          } else {
            const topReason = Object.entries(skipReasons).sort((a, b) => b[1] - a[1])[0];
            const scanFormats = ['filter:/CCITTFaxDecode', 'filter:/JBIG2Decode', 'filter:/JPXDecode'];
            const looksLikeScan = topReason && scanFormats.includes(topReason[0]);
            setCompressionNote(
              looksLikeScan
                ? `Found ${totalImageObjects} image(s), but they're stored in a scanned-document format (${topReason![0].replace('filter:', '')}) that this tool doesn't recompress yet - that's why the size didn't change.`
                : `Found ${totalImageObjects} image(s), but none were in a format we can safely recompress right now (reasons: ${Object.entries(skipReasons).map(([k, v]) => `${k}=${v}`).join(', ')}).`
            );
          }
        } else if (!anyImageShrunk) {
          setCompressionNote('The images in this PDF were already efficiently compressed, so we kept the originals rather than making them larger.');
        }

        const compressedBuffer = compressedBytes.buffer.slice(
          compressedBytes.byteOffset,
          compressedBytes.byteOffset + compressedBytes.byteLength
        ) as ArrayBuffer;
        const blob = new Blob([compressedBuffer], { type: 'application/pdf' });
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
        const pdfBuffer = pdfBytes.buffer.slice(
          pdfBytes.byteOffset,
          pdfBytes.byteOffset + pdfBytes.byteLength
        ) as ArrayBuffer;
        setDownloadUrl(URL.createObjectURL(new Blob([pdfBuffer], { type: 'application/pdf' })));
        setIsCompleted(true);
      } else if (toolSlug === 'edit-pdf') {
        if (files.length === 0 || editPages.length === 0) return;

        const pdfToEdit = files[0];
        const sourceBytes = await pdfToEdit.arrayBuffer();
        const sourceDoc = await PDFDocument.load(sourceBytes);
        const newDoc = await PDFDocument.create();

        const helveticaFont = await newDoc.embedFont(StandardFonts.Helvetica);
        const helveticaBoldFont = await newDoc.embedFont(StandardFonts.HelveticaBold);

        setProgress(10);

        // Step 1: rebuild the document in the page order the user configured
        // (handles reordering, deleted pages, inserted blanks, and rotation).
        const newPageByEditPageId = new Map<string, PDFPage>();

        for (let i = 0; i < editPages.length; i++) {
          const entry = editPages[i];
          let newPage: PDFPage;

          if (entry.kind === 'original' && entry.originalIndex !== null) {
            const [copiedPage] = await newDoc.copyPages(sourceDoc, [entry.originalIndex]);
            newDoc.addPage(copiedPage);
            newPage = copiedPage;
            if (entry.rotationDelta !== 0) {
              const baseAngle = copiedPage.getRotation().angle;
              newPage.setRotation(degrees((baseAngle + entry.rotationDelta) % 360));
            }
          } else {
            newPage = newDoc.addPage([entry.width, entry.height]);
          }

          newPageByEditPageId.set(entry.id, newPage);
          setProgress(10 + Math.round(((i + 1) / editPages.length) * 30));
        }

        setProgress(45);

        // Step 2: draw the text/shape/highlight elements onto the rebuilt pages.
        for (let i = 0; i < editElements.length; i++) {
          const el = editElements[i];
          const page = newPageByEditPageId.get(el.pageId);
          if (!page) continue; // page was deleted after this element was added - skip it

          const { width: pw, height: ph } = page.getSize();
          const { r, g, b } = hexToRgb(el.color);
          const color = rgb(r, g, b);

          if (el.type === 'text' && el.text) {
            const fontSize = el.fontSize ?? 18;
            const font = el.bold ? helveticaBoldFont : helveticaFont;
            const x = (el.xPct / 100) * pw;
            const y = ph - (el.yPct / 100) * ph - fontSize;
            page.drawText(el.text, { x, y, size: fontSize, font, color });
          } else if (el.type === 'rectangle') {
            const w = ((el.widthPct ?? 20) / 100) * pw;
            const h = ((el.heightPct ?? 10) / 100) * ph;
            const x = (el.xPct / 100) * pw;
            const y = ph - (el.yPct / 100) * ph - h;
            if (el.filled) {
              page.drawRectangle({ x, y, width: w, height: h, color, opacity: el.opacity ?? 1 });
            } else {
              page.drawRectangle({
                x, y, width: w, height: h,
                borderColor: color,
                borderWidth: el.strokeWidth ?? 2,
                borderOpacity: el.opacity ?? 1,
              });
            }
          } else if (el.type === 'highlight') {
            const w = ((el.widthPct ?? 20) / 100) * pw;
            const h = ((el.heightPct ?? 5) / 100) * ph;
            const x = (el.xPct / 100) * pw;
            const y = ph - (el.yPct / 100) * ph - h;
            page.drawRectangle({ x, y, width: w, height: h, color, opacity: el.opacity ?? 0.4 });
          } else if (el.type === 'line') {
            const x1 = (el.xPct / 100) * pw;
            const y1 = ph - (el.yPct / 100) * ph;
            const x2 = ((el.x2Pct ?? el.xPct + 20) / 100) * pw;
            const y2 = ph - ((el.y2Pct ?? el.yPct) / 100) * ph;
            page.drawLine({
              start: { x: x1, y: y1 },
              end: { x: x2, y: y2 },
              thickness: el.strokeWidth ?? 2,
              color,
              opacity: el.opacity ?? 1,
            });
          }

          setProgress(45 + Math.round(((i + 1) / Math.max(editElements.length, 1)) * 40));
        }

        setProgress(90);

        const editedPdfBytes = await newDoc.save();
        const editedPdfBuffer = editedPdfBytes.buffer.slice(
          editedPdfBytes.byteOffset,
          editedPdfBytes.byteOffset + editedPdfBytes.byteLength
        ) as ArrayBuffer;
        setDownloadUrl(URL.createObjectURL(new Blob([editedPdfBuffer], { type: 'application/pdf' })));
        setProgress(100);
        setIsCompleted(true);
      } else if (toolSlug === 'pdf-to-images') {
        // This tool is designed for single-file processing with page selection.
        if (files.length === 0 || selectedImagePages.size === 0) return;
        if (files.length === 0) return;
        const pdfToConvert = files[0];
        const pdfBytes = await pdfToConvert.arrayBuffer();
        const zip = new JSZip();
        const pdfName = pdfToConvert.name.replace(/\.pdf$/i, '');

        setProgress(10);

        const pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        const numPages = pdfDoc.numPages;

        const pagesToConvert = Array.from(selectedImagePages).sort((a, b) => a - b);
        let processedCount = 0;

        for (const i of pagesToConvert) {
          const page = await pdfDoc.getPage(i);
          // Use a scale of 2 for higher resolution images (150 DPI)
          const viewport = page.getViewport({ scale: 2.0 });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          if (context) {
            const renderContext = {
              canvas: canvas,
              canvasContext: context,
              viewport: viewport,
            };
            await page.render(renderContext as any).promise;

            const imageBlob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, `image/${imageFormat}`, 0.9)
            );

            if (imageBlob) {
              zip.file(`${pdfName}-page-${i}.${imageFormat === 'jpeg' ? 'jpg' : 'png'}`, imageBlob);
            }
          }
          processedCount++;
          setProgress(10 + Math.round((processedCount / pagesToConvert.length) * 85));
        }

        if (pagesToConvert.length > 1) {
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          setDownloadUrl(URL.createObjectURL(zipBlob));
        } else if (pagesToConvert.length === 1) {
          const singleImageBlob = await zip.files[Object.keys(zip.files)[0]].async('blob');
          setDownloadUrl(URL.createObjectURL(singleImageBlob));
        }

        setProgress(100);
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
    <div className="min-h-[calc(100vh-4rem)] bg-transparent py-12 px-4 sm:px-6 flex items-center justify-center transition-colors duration-200">
      <div className="w-full max-w-5xl">
      
        {/* Main Pitch Black Card Container */}
        <div className="bg-white/20 dark:bg-zinc-900/30 backdrop-blur-2xl rounded-[32px] p-4 sm:p-8 shadow-sm dark:shadow-none border border-slate-200/80 dark:border-zinc-800 transition-colors"> 
          
          {!hasFilesOrPages ? (
            /* Upload Dropzone */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-[24px] p-8 sm:p-16 text-center transition-all duration-200 flex flex-col items-center justify-center ${
                isDragging
                  ? 'border-[#E5252A] bg-red-50/50 dark:bg-red-950/30 scale-[0.99]'
                  : 'border-red-200 dark:border-zinc-800 bg-white/30 dark:bg-zinc-950/40 hover:border-[#E5252A] dark:hover:border-[#E5252A]'
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
            <div className="border-2 border-dashed border-red-200 dark:border-zinc-800 rounded-[24px] p-8 sm:p-12 text-center bg-white/60 dark:bg-zinc-950/70 backdrop-blur-lg space-y-6">
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
            <div className="border-2 border-dashed border-red-200 dark:border-zinc-800 rounded-[24px] p-8 sm:p-12 text-center bg-white/60 dark:bg-zinc-950/70 backdrop-blur-lg space-y-6">
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
                    <PdfPreview file={compressedFile} pageNumber={1} desiredWidth={180} className="w-full h-auto rounded-md bg-white dark:bg-zinc-700 shadow-sm" />
                  </div>
                  {originalFileSize !== null && compressedFileSize !== null && (
                    <div className="text-center text-sm text-slate-600 dark:text-zinc-300">
                      <p>Original: <span className="font-semibold">{formatFileSize(originalFileSize)}</span></p>
                      <p>Compressed: <span className="font-semibold">{formatFileSize(compressedFileSize)}</span></p>
                      {originalFileSize > compressedFileSize && <p className="font-bold text-emerald-600 dark:text-emerald-400">
                        You saved {((1 - compressedFileSize / originalFileSize) * 100).toFixed(0)}%
                      </p>}
                      {compressionNote && (
                        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 max-w-xs mx-auto">{compressionNote}</p>
                      )}
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
            <div className="border-2 border-dashed border-red-200 dark:border-zinc-800 rounded-[24px] p-8 sm:p-12 text-center bg-white/60 dark:bg-zinc-950/70 backdrop-blur-lg space-y-6">
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
            <div className="border-2 border-dashed border-red-200 dark:border-zinc-800 rounded-[24px] p-6 sm:p-10 bg-white/60 dark:bg-zinc-950/70 backdrop-blur-lg space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-4">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Selected Files ({files.length})
                </h3>
                <button onClick={handleClearAll} className="text-xs font-semibold text-[#E5252A] hover:underline">
                  Clear all
                </button>
              </div>
              {toolSlug === 'image-to-pdf' && files.length > 1 ? (
                <div>
                  <button
                    onClick={() => setIsFileListOpen(!isFileListOpen)}
                    className="w-full flex items-center justify-between p-3.5 bg-slate-50 dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700/60 rounded-2xl"
                  >
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">{files.length} files selected</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#E5252A] hover:underline">View Files</span>
                      <svg
                        className={`w-4 h-4 text-slate-500 dark:text-zinc-400 transition-transform ${
                          isFileListOpen ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {isFileListOpen && (
                    <div className="mt-3">
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={files.map((f, i) => `${f.name}-${i}`)} strategy={verticalListSortingStrategy}>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                            {files.map((file, idx) => (<SortableFileItem key={`${file.name}-${idx}`} file={file} idx={idx} onRemove={handleRemoveFile} />))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}
                </div>
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

              {toolSlug === 'edit-pdf' && files.length > 0 && editPages.length > 0 && (
                <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 w-full space-y-6">
                  {/* Page manager: rotate, delete, reorder, insert blank pages */}
                  <div>
                    <button
                      onClick={() => setIsPageManagerOpen(!isPageManagerOpen)}
                      type="button"
                      className="w-full flex items-center justify-between mb-3"
                    >
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">Pages ({editPages.length})</h4>
                      <svg
                        className={`w-4 h-4 text-slate-500 dark:text-zinc-400 transition-transform ${isPageManagerOpen ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isPageManagerOpen && (
                      <>
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEditPagesDragEnd}>
                          <SortableContext items={editPages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                            <div className="flex flex-wrap gap-3 max-h-[360px] overflow-y-auto p-3 rounded-lg bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700">
                              {editPages.map((entry, idx) => (
                                <SortableEditPageThumb
                                  key={entry.id}
                                  entry={entry}
                                  index={idx}
                                  sourceFile={files[0]}
                                  onRotate={handleRotateEditPage}
                                  onDelete={handleDeleteEditPage}
                                  onInsertBlankAfter={handleInsertBlankEditPage}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                        <div className="flex items-center justify-between mt-2">
                          <button
                            type="button"
                            onClick={() => handleInsertBlankEditPage(editPages[editPages.length - 1]?.id ?? null)}
                            className="text-xs font-semibold text-[#E5252A] hover:underline"
                          >
                            + Add blank page
                          </button>
                          <p className="text-[11px] text-slate-400 dark:text-zinc-500">Drag to reorder</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Add text / shapes / highlight to a page */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">Add to page</h4>

                    <div className="grid grid-cols-4 gap-2">
                      {(['text', 'rectangle', 'highlight', 'line'] as EditElementType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setEditElementDraft((prev) => ({ ...prev, type: t }))}
                          className={`py-2 px-2 rounded-lg font-medium text-xs capitalize transition-all ${
                            editElementDraft.type === t
                              ? 'bg-[#E5252A] text-white shadow-md'
                              : 'bg-white dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-600 hover:border-slate-300 dark:hover:border-zinc-500'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Page</label>
                        <select
                          value={editElementDraft.pageId}
                          onChange={(e) => setEditElementDraft((prev) => ({ ...prev, pageId: e.target.value }))}
                          className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                        >
                          {editPages.map((p, idx) => (
                            <option key={p.id} value={p.id}>{getEditPageLabel(p, idx)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">X %</label>
                        <input
                          type="number" min={0} max={100} value={editElementDraft.xPct}
                          onChange={(e) => setEditElementDraft((prev) => ({ ...prev, xPct: Number(e.target.value) }))}
                          className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Y %</label>
                        <input
                          type="number" min={0} max={100} value={editElementDraft.yPct}
                          onChange={(e) => setEditElementDraft((prev) => ({ ...prev, yPct: Number(e.target.value) }))}
                          className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500">X/Y is measured from the top-left corner of the page.</p>

                    {editElementDraft.type === 'text' && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editElementDraft.text}
                          onChange={(e) => setEditElementDraft((prev) => ({ ...prev, text: e.target.value }))}
                          placeholder="Text to add"
                          className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                        />
                        <div className="grid grid-cols-3 gap-2 items-end">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Size</label>
                            <input
                              type="number" min={6} max={200} value={editElementDraft.fontSize}
                              onChange={(e) => setEditElementDraft((prev) => ({ ...prev, fontSize: Number(e.target.value) }))}
                              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Color</label>
                            <input
                              type="color" value={editElementDraft.color}
                              onChange={(e) => setEditElementDraft((prev) => ({ ...prev, color: e.target.value }))}
                              className="w-full h-[38px] px-1 py-1 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                            />
                          </div>
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-300 pb-2">
                            <input
                              type="checkbox" checked={editElementDraft.bold}
                              onChange={(e) => setEditElementDraft((prev) => ({ ...prev, bold: e.target.checked }))}
                              className="rounded border-slate-300"
                            />
                            Bold
                          </label>
                        </div>
                      </div>
                    )}

                    {editElementDraft.type === 'rectangle' && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Width %</label>
                            <input
                              type="number" min={1} max={100} value={editElementDraft.widthPct}
                              onChange={(e) => setEditElementDraft((prev) => ({ ...prev, widthPct: Number(e.target.value) }))}
                              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Height %</label>
                            <input
                              type="number" min={1} max={100} value={editElementDraft.heightPct}
                              onChange={(e) => setEditElementDraft((prev) => ({ ...prev, heightPct: Number(e.target.value) }))}
                              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 items-end">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Color</label>
                            <input
                              type="color" value={editElementDraft.color}
                              onChange={(e) => setEditElementDraft((prev) => ({ ...prev, color: e.target.value }))}
                              className="w-full h-[38px] px-1 py-1 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Stroke</label>
                            <input
                              type="number" min={1} max={20} value={editElementDraft.strokeWidth}
                              disabled={editElementDraft.filled}
                              onChange={(e) => setEditElementDraft((prev) => ({ ...prev, strokeWidth: Number(e.target.value) }))}
                              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg disabled:opacity-40"
                            />
                          </div>
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-300 pb-2">
                            <input
                              type="checkbox" checked={editElementDraft.filled}
                              onChange={(e) => setEditElementDraft((prev) => ({ ...prev, filled: e.target.checked }))}
                              className="rounded border-slate-300"
                            />
                            Filled
                          </label>
                        </div>
                      </div>
                    )}

                    {editElementDraft.type === 'highlight' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Width %</label>
                          <input
                            type="number" min={1} max={100} value={editElementDraft.widthPct}
                            onChange={(e) => setEditElementDraft((prev) => ({ ...prev, widthPct: Number(e.target.value) }))}
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Height %</label>
                          <input
                            type="number" min={1} max={100} value={editElementDraft.heightPct}
                            onChange={(e) => setEditElementDraft((prev) => ({ ...prev, heightPct: Number(e.target.value) }))}
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Color</label>
                          <input
                            type="color" value={editElementDraft.color}
                            onChange={(e) => setEditElementDraft((prev) => ({ ...prev, color: e.target.value }))}
                            className="w-full h-[38px] px-1 py-1 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Opacity</label>
                          <input
                            type="number" min={0.1} max={1} step={0.1} value={editElementDraft.opacity}
                            onChange={(e) => setEditElementDraft((prev) => ({ ...prev, opacity: Number(e.target.value) }))}
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                          />
                        </div>
                      </div>
                    )}

                    {editElementDraft.type === 'line' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">End X %</label>
                          <input
                            type="number" min={0} max={100} value={editElementDraft.x2Pct}
                            onChange={(e) => setEditElementDraft((prev) => ({ ...prev, x2Pct: Number(e.target.value) }))}
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">End Y %</label>
                          <input
                            type="number" min={0} max={100} value={editElementDraft.y2Pct}
                            onChange={(e) => setEditElementDraft((prev) => ({ ...prev, y2Pct: Number(e.target.value) }))}
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Color</label>
                          <input
                            type="color" value={editElementDraft.color}
                            onChange={(e) => setEditElementDraft((prev) => ({ ...prev, color: e.target.value }))}
                            className="w-full h-[38px] px-1 py-1 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">Thickness</label>
                          <input
                            type="number" min={1} max={20} value={editElementDraft.strokeWidth}
                            onChange={(e) => setEditElementDraft((prev) => ({ ...prev, strokeWidth: Number(e.target.value) }))}
                            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleAddEditElement}
                      className="w-full py-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-sm font-semibold text-slate-700 dark:text-zinc-200 transition-colors"
                    >
                      + Add to page
                    </button>
                  </div>

                  {/* List of elements added so far */}
                  {editElements.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">Added elements ({editElements.length})</h4>
                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                        {editElements.map((el) => {
                          const pageIdx = editPages.findIndex((p) => p.id === el.pageId);
                          return (
                            <div key={el.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: el.color }} />
                                <span className="text-xs text-slate-700 dark:text-zinc-300 truncate">{describeEditElement(el, pageIdx)}</span>
                              </div>
                              <button onClick={() => handleRemoveEditElement(el.id)} className="p-1 rounded-md text-slate-400 hover:text-[#E5252A] flex-shrink-0">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-end gap-4 empty:pt-0 empty:border-t-0">
                {toolSlug === 'split-pdf' && files.length === 1 && (
                  <div className="w-full space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
                        Select pages to split ({selectedImagePages.size} / {pdfToImagePreviews.length})
                      </h4>
                      <button
                        onClick={() => {
                          if (selectedImagePages.size === pdfToImagePreviews.length) {
                            setSelectedImagePages(new Set());
                          } else {
                            setSelectedImagePages(new Set(pdfToImagePreviews.map(p => p.pageNumber)));
                          }
                        }}
                        className="text-xs font-semibold text-[#E5252A] hover:underline"
                      >
                        {selectedImagePages.size === pdfToImagePreviews.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[350px] overflow-y-auto rounded-lg bg-slate-50 dark:bg-zinc-800/50 p-5 border border-slate-200 dark:border-zinc-700">
                      {pdfToImagePreviews.map(({ pageNumber, blobUrl, isLoading }) => (
                        <div
                          key={pageNumber}
                          onClick={() => handleToggleImagePageSelection(pageNumber)}
                          className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                            selectedImagePages.has(pageNumber) ? 'border-[#E5252A] ring-2 ring-red-500/20' : 'border-transparent'
                          }`}
                        >
                          {isLoading ? (
                            <div className="aspect-[3/4] bg-slate-200 dark:bg-zinc-700 flex items-center justify-center"><Spinner className="w-6 h-6 text-slate-400" /></div>
                          ) : (
                            <img src={blobUrl} alt={`Page ${pageNumber}`} className="w-full h-full object-cover" />
                          )}
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-white/80 backdrop-blur-sm rounded-md flex items-center justify-center border border-slate-300">
                            {selectedImagePages.has(pageNumber) && (
                              <svg className="w-3.5 h-3.5 text-[#E5252A]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            )}
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] font-bold text-center py-0.5">Page {pageNumber}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {toolSlug === 'compress-pdf' && (
                  <div className="w-full sm:w-auto flex-grow">
                    <div className="relative">
                      <input
                        type="number"
                        id="target-size"
                        value={targetSizeKb}
                        onChange={(e) => setTargetSizeKb(e.target.value)}
                        placeholder="e.g., 500"
                        className="w-full pl-4 pr-12 py-3 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:bg-white dark:focus:bg-black focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                      />
                      <span className="absolute inset-y-0 right-4 flex items-center text-sm text-slate-400 dark:text-zinc-500 pointer-events-none">
                        KB
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5 pl-1">
                      Enter a target file size. The tool will try its best to compress.
                    </p>
                  </div>
                )}
                {toolSlug === 'pdf-to-images' && files.length === 1 && (
                  <div className="w-full space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
                        Select pages to convert ({selectedImagePages.size} / {pdfToImagePreviews.length})
                      </h4>
                      <button
                        onClick={() => {
                          if (selectedImagePages.size === pdfToImagePreviews.length) {
                            setSelectedImagePages(new Set());
                          } else {
                            setSelectedImagePages(new Set(pdfToImagePreviews.map(p => p.pageNumber)));
                          }
                        }}
                        className="text-xs font-semibold text-[#E5252A] hover:underline"
                      >
                        {selectedImagePages.size === pdfToImagePreviews.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[350px] overflow-y-auto  rounded-lg bg-slate-50 dark:bg-zinc-800/50 p-5 border border-slate-200 dark:border-zinc-700">
                      {pdfToImagePreviews.map(({ pageNumber, blobUrl, isLoading }) => (
                        <div
                          key={pageNumber}
                          onClick={() => handleToggleImagePageSelection(pageNumber)}
                          className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                            selectedImagePages.has(pageNumber) ? 'border-[#E5252A] ring-2 ring-red-500/20' : 'border-transparent'
                          }`}
                        >
                          {isLoading ? (
                            <div className="aspect-[3/4] bg-slate-200 dark:bg-zinc-700 flex items-center justify-center"><Spinner className="w-6 h-6 text-slate-400" /></div>
                          ) : (
                            <img src={blobUrl} alt={`Page ${pageNumber}`} className="w-full h-full object-cover" />
                          )}
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-white/80 backdrop-blur-sm rounded-md flex items-center justify-center border border-slate-300">
                            {selectedImagePages.has(pageNumber) && (
                              <svg className="w-3.5 h-3.5 text-[#E5252A]" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] font-bold text-center py-0.5">Page {pageNumber}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {toolSlug === 'pdf-to-images' && (
                  <div className="w-full sm:w-auto flex-grow">
                    <div className="space-y-2">
                      <label htmlFor="image-format" className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">Image Format</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setImageFormat('jpeg')}
                          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                            imageFormat === 'jpeg'
                              ? 'bg-[#E5252A] text-white shadow-sm'
                              : 'bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600'
                          }`}
                        >
                          JPG
                        </button>
                        <button
                          onClick={() => setImageFormat('png')}
                          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                            imageFormat === 'png'
                              ? 'bg-[#E5252A] text-white shadow-sm'
                              : 'bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600'
                          }`}
                        >
                          PNG
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5 pl-1">Choose the output format for the images.</p>
                    </div>
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
                        <div ref={imagePreviewContainerRef} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg p-3 max-h-[400px] overflow-y-auto flex flex-col items-center min-h-[200px]">
                          <PdfPreview
                            key={imageToPdfPreviewFile.size + '-' + pageOrientation + '-' + pageSize + '-' + margin} // Force re-mount on relevant changes
                            file={imageToPdfPreviewFile} // Keep this line as it's part of the selection
                            desiredWidth={250}
                            className="rounded-md shadow-sm"
                          />
                        </div>
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
              </div>

              {/* Action Buttons Container */}
              <div className='flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:justify-end pt-4 border-t border-slate-100 dark:border-zinc-800'>
                <label className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 px-10 py-3.5 flex items-center justify-center rounded-full transition-colors w-full sm:w-auto text-center">
                  + Add more files
                  <input type="file" multiple accept={getAcceptableFileTypes(toolSlug)} onChange={handleFileInput} className="hidden" />
                </label>

                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-10 py-3.5 bg-[#E5252A] hover:bg-[#C51920] disabled:bg-slate-400 text-white font-bold text-sm rounded-full shadow-md transition-all flex items-center justify-center space-x-2"
                >
                  {isProcessing ? (
                    <Spinner className="w-5 h-5" />
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