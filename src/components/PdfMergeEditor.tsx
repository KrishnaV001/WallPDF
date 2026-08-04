import React, { useState, useEffect, useCallback } from 'react';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PdfPreview } from './PdfPreview';
import {
  FileText,
  Grid,
  RotateCw,
  Trash2,
  GripVertical,
  Plus,
  ArrowUpDown,
  Check,
  Download,
  Loader2,
  SortAsc,
  SortDesc,
  Hash,
  RefreshCw,
} from 'lucide-react';

export interface PageItem {
  id: string;
  fileIndex: number;
  fileName: string;
  pageIndex: number; // 0-based
  pageNumber: number; // 1-based
  rotation: number; // 0, 90, 180, 270
}

interface PdfMergeEditorProps {
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  onComplete: (downloadUrl: string, outputFileName: string) => void;
  getAcceptableFileTypes: (slug: string) => string;
}

export const PdfMergeEditor: React.FC<PdfMergeEditorProps> = ({
  files,
  setFiles,
  onComplete,
  getAcceptableFileTypes,
}) => {
  const [viewMode, setViewMode] = useState<'files' | 'pages'>('pages');
  const [pages, setPages] = useState<PageItem[]>([]);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [outputFileName, setOutputFileName] = useState<string>('merged_document.pdf');
  const [addPageNumbers, setAddPageNumbers] = useState<boolean>(false);
  const [pageNumberPosition, setPageNumberPosition] = useState<'bottom-center' | 'bottom-right' | 'top-right'>('bottom-center');

  // Extract page metadata whenever files list changes
  useEffect(() => {
    let isSubscribed = true;

    const extractPages = async () => {
      if (files.length === 0) {
        setPages([]);
        return;
      }

      setIsExtracting(true);
      const extractedPages: PageItem[] = [];

      try {
        for (let fIdx = 0; fIdx < files.length; fIdx++) {
          const file = files[fIdx];
          const arrayBuffer = await file.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
          const count = pdfDoc.getPageCount();

          for (let pIdx = 0; pIdx < count; pIdx++) {
            extractedPages.push({
              id: `${file.name}-${fIdx}-p${pIdx}`,
              fileIndex: fIdx,
              fileName: file.name,
              pageIndex: pIdx,
              pageNumber: pIdx + 1,
              rotation: 0,
            });
          }
        }

        if (isSubscribed) {
          setPages(extractedPages);
        }
      } catch (err) {
        console.error('[PdfMergeEditor] Failed to extract page metadata:', err);
      } finally {
        if (isSubscribed) setIsExtracting(false);
      }
    };

    extractPages();

    return () => {
      isSubscribed = false;
    };
  }, [files]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Handle Drag End for File View
  const handleFileDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = files.findIndex((_, idx) => `${files[idx].name}-${idx}` === active.id);
      const newIndex = files.findIndex((_, idx) => `${files[idx].name}-${idx}` === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        setFiles((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  };

  // Handle Drag End for Page View
  const handlePageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPages((prev) => {
        const oldIndex = prev.findIndex((p) => p.id === active.id);
        const newIndex = prev.findIndex((p) => p.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  // Page Operations
  const rotatePage = (id: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
    );
  };

  const removePage = (id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  };

  const removeFile = (fileIndex: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== fileIndex));
  };

  const rotateAllPages = () => {
    setPages((prev) => prev.map((p) => ({ ...p, rotation: (p.rotation + 90) % 360 })));
  };

  // Auto-Sort Files
  const sortFiles = (type: 'name-asc' | 'name-desc' | 'size-desc') => {
    const sorted = [...files];
    if (type === 'name-asc') sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (type === 'name-desc') sorted.sort((a, b) => b.name.localeCompare(a.name));
    if (type === 'size-desc') sorted.sort((a, b) => b.size - a.size);
    setFiles(sorted);
  };

  // File Input Handler for "+ Add Files"
  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFilesArray = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFilesArray]);
    }
  };

  // Execute Final Merge
  const handleMerge = async () => {
    if (pages.length === 0 || files.length === 0) return;
    setIsMerging(true);

    try {
      const mergedPdf = await PDFDocument.create();

      // Pre-load all source PDFDocument instances to avoid redundant parsing
      const loadedDocs: PDFDocument[] = [];
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        loadedDocs.push(doc);
      }

      // Copy pages according to the ordered `pages` state list
      for (const item of pages) {
        const sourceDoc = loadedDocs[item.fileIndex];
        if (!sourceDoc) continue;

        const [copiedPage] = await mergedPdf.copyPages(sourceDoc, [item.pageIndex]);

        if (item.rotation !== 0) {
          const currentAngle = copiedPage.getRotation().angle;
          copiedPage.setRotation(degrees((currentAngle + item.rotation) % 360));
        }

        mergedPdf.addPage(copiedPage);
      }

      // Add Page Numbers if selected
      if (addPageNumbers && mergedPdf.getPageCount() > 0) {
        const font = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
        const totalMerged = mergedPdf.getPageCount();
        const mergedPages = mergedPdf.getPages();

        for (let i = 0; i < totalMerged; i++) {
          const p = mergedPages[i];
          const { width, height } = p.getSize();
          const text = `Page ${i + 1} of ${totalMerged}`;
          const textSize = 9;
          const textWidth = font.widthOfTextAtSize(text, textSize);

          let x = (width - textWidth) / 2;
          let y = 18;

          if (pageNumberPosition === 'bottom-right') {
            x = width - textWidth - 25;
            y = 18;
          } else if (pageNumberPosition === 'top-right') {
            x = width - textWidth - 25;
            y = height - 25;
          }

          p.drawText(text, {
            x,
            y,
            size: textSize,
            font,
            color: rgb(0.2, 0.2, 0.2),
          });
        }
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);

      let finalName = outputFileName.trim();
      if (!finalName.endsWith('.pdf')) finalName += '.pdf';

      onComplete(downloadUrl, finalName);
    } catch (err) {
      console.error('[PdfMergeEditor] Error merging PDFs:', err);
    } finally {
      setIsMerging(false);
    }
  };

  // Sortable File Item Component
  const SortableFileRow: React.FC<{ file: File; idx: number }> = ({ file, idx }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: `${file.name}-${idx}`,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const filePageCount = pages.filter((p) => p.fileIndex === idx).length;

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center justify-between p-3.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm hover:border-slate-300 dark:hover:border-zinc-700 transition-all"
      >
        <div className="flex items-center space-x-3 min-w-0">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/40 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-[#E5252A]" />
          </div>

          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate">{file.name}</p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-400 flex items-center gap-2">
              <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
              <span>•</span>
              <span className="font-semibold text-slate-600 dark:text-zinc-300">
                {filePageCount} page{filePageCount !== 1 ? 's' : ''}
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => removeFile(idx)}
          className="p-2 text-slate-400 hover:text-[#E5252A] hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors"
          title="Remove file"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  };

  // Sortable Page Tile Component
  const SortablePageTile: React.FC<{ item: PageItem; index: number }> = ({ item, index }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: item.id,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const targetFile = files[item.fileIndex];

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="group relative flex flex-col bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-2.5 shadow-sm hover:shadow-md transition-all"
      >
        {/* Header Badge */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-extrabold text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded-lg">
            Page {index + 1}
          </span>
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-0.5"
            title="Drag to reorder page"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Thumbnail Preview Container */}
        <div className="relative overflow-hidden rounded-xl bg-slate-100 dark:bg-zinc-950 flex items-center justify-center border border-slate-100 dark:border-zinc-850 aspect-[3/4]">
          {targetFile && (
            <div
              className="transition-transform duration-200"
              style={{ transform: `rotate(${item.rotation}deg)` }}
            >
              <PdfPreview
                file={targetFile}
                pageNumber={item.pageNumber}
                desiredWidth={140}
                className="pointer-events-none rounded-md max-w-full h-auto block"
              />
            </div>
          )}
        </div>

        {/* Info & Action Toolbar */}
        <div className="mt-2 flex items-center justify-between pt-1">
          <p className="text-[10px] text-slate-400 dark:text-zinc-400 truncate max-w-[90px]" title={item.fileName}>
            {item.fileName}
          </p>
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => rotatePage(item.id)}
              className="p-1.5 text-slate-500 dark:text-zinc-400 hover:text-[#E5252A] hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="Rotate 90°"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => removePage(item.id)}
              className="p-1.5 text-slate-500 dark:text-zinc-400 hover:text-[#E5252A] hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
              title="Remove page"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col space-y-6">
      
      {/* Top Action Bar & Mode Switcher */}
      <div className="w-full flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        
        {/* View Mode Segmented Controls */}
        <div className="flex items-center space-x-1 bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode('pages')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === 'pages'
                ? 'bg-[#E5252A] text-white shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Grid className="w-3.5 h-3.5" /> Page View ({pages.length} Pages)
          </button>

          <button
            type="button"
            onClick={() => setViewMode('files')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === 'files'
                ? 'bg-[#E5252A] text-white shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> File View ({files.length} Files)
          </button>
        </div>

        {/* Quick Sort & Batch Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === 'pages' && (
            <button
              type="button"
              onClick={rotateAllPages}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition-all flex items-center gap-1.5"
            >
              <RotateCw className="w-3.5 h-3.5 text-[#E5252A]" /> Rotate All
            </button>
          )}

          {viewMode === 'files' && (
            <>
              <button
                type="button"
                onClick={() => sortFiles('name-asc')}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition-all flex items-center gap-1.5"
              >
                <SortAsc className="w-3.5 h-3.5" /> Sort A-Z
              </button>
              <button
                type="button"
                onClick={() => sortFiles('size-desc')}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition-all flex items-center gap-1.5"
              >
                <ArrowUpDown className="w-3.5 h-3.5" /> Sort Size
              </button>
            </>
          )}

          {/* Add Files Button */}
          <label className="cursor-pointer px-3.5 py-1.5 text-xs font-bold rounded-lg bg-red-50 dark:bg-red-950/40 text-[#E5252A] hover:bg-red-100 dark:hover:bg-red-900/60 transition-all flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Files
            <input
              type="file"
              multiple
              accept={getAcceptableFileTypes('merge-pdf')}
              onChange={handleAddFiles}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Extraction Loader */}
      {isExtracting && (
        <div className="w-full py-8 flex flex-col items-center justify-center space-y-2 bg-slate-50 dark:bg-zinc-900/50 rounded-2xl border border-slate-200 dark:border-zinc-800">
          <Loader2 className="w-6 h-6 animate-spin text-[#E5252A]" />
          <p className="text-xs font-semibold text-slate-600 dark:text-zinc-400">Processing PDF pages...</p>
        </div>
      )}

      {/* Workspace Display Area */}
      {!isExtracting && (
        <>
          {viewMode === 'pages' ? (
            /* Page Grid View */
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePageDragEnd}>
              <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 max-h-[600px] overflow-y-auto p-1 scrollbar-thin">
                  {pages.map((item, idx) => (
                    <SortablePageTile key={item.id} item={item} index={idx} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            /* File List View */
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFileDragEnd}>
              <SortableContext
                items={files.map((f, i) => `${f.name}-${i}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2.5 max-h-[450px] overflow-y-auto p-1 scrollbar-thin">
                  {files.map((file, idx) => (
                    <SortableFileRow key={`${file.name}-${idx}`} file={file} idx={idx} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </>
      )}

      {/* Options & Merge Control Panel */}
      <div className="w-full bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm space-y-4">
        
        <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-zinc-800 pb-2.5 flex items-center gap-2">
          <Hash className="w-4 h-4 text-[#E5252A]" /> Output Options
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Output File Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
              Output File Name
            </label>
            <input
              type="text"
              value={outputFileName}
              onChange={(e) => setOutputFileName(e.target.value)}
              placeholder="merged_document.pdf"
              className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:bg-white dark:focus:bg-black focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-[#E5252A] transition-all font-mono"
            />
          </div>

          {/* Add Page Numbers */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2.5 cursor-pointer pt-6">
              <input
                type="checkbox"
                checked={addPageNumbers}
                onChange={(e) => setAddPageNumbers(e.target.checked)}
                className="w-4 h-4 text-[#E5252A] rounded focus:ring-[#E5252A] border-slate-300 dark:border-zinc-700"
              />
              <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200">
                Add page numbers to bottom of merged document
              </span>
            </label>

            {addPageNumbers && (
              <div className="flex items-center space-x-2 pl-6 pt-1">
                <span className="text-xs text-slate-500 dark:text-zinc-400">Position:</span>
                <select
                  value={pageNumberPosition}
                  onChange={(e) => setPageNumberPosition(e.target.value as any)}
                  className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:border-[#E5252A]"
                >
                  <option value="bottom-center">Bottom Center</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="top-right">Top Right</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Process Action Button */}
        <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-zinc-400">
            Total {pages.length} page{pages.length !== 1 ? 's' : ''} from {files.length} PDF file{files.length !== 1 ? 's' : ''} will be merged
          </span>

          <button
            type="button"
            onClick={handleMerge}
            disabled={isMerging || pages.length === 0}
            className="px-8 py-3 bg-[#E5252A] hover:bg-[#C51920] disabled:bg-slate-400 text-white font-bold text-xs rounded-full shadow-md transition-all flex items-center space-x-2"
          >
            {isMerging ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Merging PDFs...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Merge PDF Files</span>
              </>
            )}
          </button>
        </div>

      </div>

    </div>
  );
};
