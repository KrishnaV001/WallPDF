import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PdfPreview } from './PdfPreview';
import { 
  Maximize2, 
  Layers, 
  Move, 
  Check, 
  MousePointerClick
} from 'lucide-react';

export interface CropArea {
  // Crop bounds in CSS pixels relative to rendered preview element
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfCropEditorProps {
  file: File;
  onCropChange: (crop: {
    normalized: { left: number; top: number; right: number; bottom: number }; // 0.0 - 1.0 ratios
    px: CropArea;
    pt: { x: number; y: number; width: number; height: number };
    pageRange: string;
    applyToAll: boolean;
  }) => void;
}

type DragMode = 'draw' | 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null;

export const PdfCropEditor: React.FC<PdfCropEditorProps> = ({ file, onCropChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Active page & dimensions
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const [renderedWidth, setRenderedWidth] = useState<number>(0);
  const [renderedHeight, setRenderedHeight] = useState<number>(0);
  const [originalPdfWidth, setOriginalPdfWidth] = useState<number>(0);
  const [originalPdfHeight, setOriginalPdfHeight] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Crop box state (starts uninitialized / 0x0)
  const [crop, setCrop] = useState<CropArea>({ x: 0, y: 0, width: 0, height: 0 });
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cropStart, setCropStart] = useState<CropArea>({ x: 0, y: 0, width: 0, height: 0 });

  // Target page settings
  const [applyToAll, setApplyToAll] = useState<boolean>(true);
  const [pageRange, setPageRange] = useState<string>('');

  // Callback when PdfPreview finishes rendering canvas
  const handleRender = useCallback((width: number, height: number, origW?: number, origH?: number, pageCount?: number) => {
    setRenderedWidth(width);
    setRenderedHeight(height);
    if (origW) setOriginalPdfWidth(origW);
    if (origH) setOriginalPdfHeight(origH);
    if (pageCount) setTotalPages(pageCount);
  }, []);

  // Compute normalized & PDF points crop whenever crop or rendered dimensions change
  useEffect(() => {
    if (renderedWidth === 0 || renderedHeight === 0) return;

    let leftRatio = 0;
    let topRatio = 0;
    let rightRatio = 1;
    let bottomRatio = 1;

    if (crop.width > 0 && crop.height > 0) {
      leftRatio = Math.max(0, Math.min(1, crop.x / renderedWidth));
      topRatio = Math.max(0, Math.min(1, crop.y / renderedHeight));
      rightRatio = Math.max(0, Math.min(1, (crop.x + crop.width) / renderedWidth));
      bottomRatio = Math.max(0, Math.min(1, (crop.y + crop.height) / renderedHeight));
    }

    const ptX = Math.round(leftRatio * originalPdfWidth * 10) / 10;
    const ptY = Math.round(topRatio * originalPdfHeight * 10) / 10;
    const ptWidth = Math.round((rightRatio - leftRatio) * originalPdfWidth * 10) / 10;
    const ptHeight = Math.round((bottomRatio - topRatio) * originalPdfHeight * 10) / 10;

    onCropChange({
      normalized: { left: leftRatio, top: topRatio, right: rightRatio, bottom: bottomRatio },
      px: crop,
      pt: { x: ptX, y: ptY, width: ptWidth, height: ptHeight },
      pageRange,
      applyToAll
    });
  }, [crop, renderedWidth, renderedHeight, originalPdfWidth, originalPdfHeight, pageRange, applyToAll, onCropChange]);

  const resetToFullPage = () => {
    if (renderedWidth > 0 && renderedHeight > 0) {
      setCrop({ x: 0, y: 0, width: renderedWidth, height: renderedHeight });
    }
  };

  const clearSelection = () => {
    setCrop({ x: 0, y: 0, width: 0, height: 0 });
  };

  // Pointer/Mouse Events for Dragging Selection & Resizing
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clientX = Math.max(0, Math.min(e.clientX - rect.left, renderedWidth));
    const clientY = Math.max(0, Math.min(e.clientY - rect.top, renderedHeight));

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Safe fallback
    }

    setDragMode(mode);
    setDragStart({ x: clientX, y: clientY });
    setCropStart({ ...crop });

    if (mode === 'draw') {
      setCrop({
        x: clientX,
        y: clientY,
        width: 0,
        height: 0
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMode || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(e.clientX - rect.left, renderedWidth));
    const currentY = Math.max(0, Math.min(e.clientY - rect.top, renderedHeight));
    const dx = currentX - dragStart.x;
    const dy = currentY - dragStart.y;

    const minSize = 15;

    if (dragMode === 'draw') {
      const left = Math.min(dragStart.x, currentX);
      const top = Math.min(dragStart.y, currentY);
      const w = Math.abs(currentX - dragStart.x);
      const h = Math.abs(currentY - dragStart.y);
      setCrop({ x: left, y: top, width: w, height: h });
      return;
    }

    let { x, y, width, height } = cropStart;

    if (dragMode === 'move') {
      x = Math.max(0, Math.min(cropStart.x + dx, renderedWidth - cropStart.width));
      y = Math.max(0, Math.min(cropStart.y + dy, renderedHeight - cropStart.height));
    } else {
      // Handle-based resizing
      if (dragMode.includes('e')) {
        width = Math.max(minSize, Math.min(cropStart.width + dx, renderedWidth - cropStart.x));
      }
      if (dragMode.includes('s')) {
        height = Math.max(minSize, Math.min(cropStart.height + dy, renderedHeight - cropStart.y));
      }
      if (dragMode.includes('w')) {
        const possibleWidth = cropStart.width - dx;
        if (possibleWidth >= minSize && cropStart.x + dx >= 0) {
          x = cropStart.x + dx;
          width = possibleWidth;
        }
      }
      if (dragMode.includes('n')) {
        const possibleHeight = cropStart.height - dy;
        if (possibleHeight >= minSize && cropStart.y + dy >= 0) {
          y = cropStart.y + dy;
          height = possibleHeight;
        }
      }
    }

    setCrop({ x, y, width, height });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMode) return;

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Safe fallback
    }

    // If drag was tiny (< 8px), keep previous crop if valid or clear
    if (dragMode === 'draw' && (crop.width < 8 || crop.height < 8)) {
      if (cropStart.width > 8 && cropStart.height > 8) {
        setCrop(cropStart);
      } else {
        clearSelection();
      }
    }

    setDragMode(null);
  };

  // Helper for displaying current point dimensions
  const getPtDisplay = () => {
    if (!renderedWidth || !renderedHeight || !originalPdfWidth || !originalPdfHeight) return '';
    const ptWidth = Math.round((crop.width / renderedWidth) * originalPdfWidth);
    const ptHeight = Math.round((crop.height / renderedHeight) * originalPdfHeight);
    return `${ptWidth} × ${ptHeight} pt`;
  };

  return (
    <div className="w-full flex flex-col items-center space-y-6">
      
      {/* Main Visual Crop Workspace Container */}
      <div className="w-full flex flex-col lg:flex-row items-start gap-6">
        
        {/* Left / Center: Interactive Canvas Preview */}
        <div className="w-full lg:flex-1 flex flex-col items-center min-w-0">
          
          <div className="w-full flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
              <MousePointerClick className="w-4 h-4 text-[#E5252A]" />
              {crop.width > 0 && crop.height > 0
                ? "Drag handles to resize or click & drag page to draw a new box"
                : "Click and drag anywhere on the page to draw crop area"}
            </span>
            <div className="flex items-center gap-2">
              {crop.width > 0 && crop.height > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200"
                >
                  Clear Selection
                </button>
              )}
              <button
                type="button"
                onClick={resetToFullPage}
                className="text-xs font-semibold text-[#E5252A] hover:underline flex items-center gap-1"
              >
                <Maximize2 className="w-3.5 h-3.5" /> Full Page
              </button>
            </div>
          </div>

          <div className="relative group p-2 bg-slate-100 dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-md max-w-full overflow-hidden flex items-center justify-center">
            
            <div
              ref={containerRef}
              onPointerDown={(e) => handlePointerDown(e, 'draw')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative select-none touch-none cursor-crosshair overflow-hidden rounded-xl bg-white dark:bg-zinc-950 max-w-full"
              style={{ width: renderedWidth || '100%', height: renderedHeight || 'auto' }}
            >
              {/* High Quality PDF Preview Render */}
              <PdfPreview
                file={file}
                pageNumber={selectedPage}
                desiredWidth={560}
                className="pointer-events-none rounded-xl max-w-full h-auto block"
                onRender={handleRender}
              />

              {/* Highlighted Crop Box & Overlay (Only visible when crop is drawn) */}
              {renderedWidth > 0 && renderedHeight > 0 && crop.width > 0 && crop.height > 0 && (
                <>
                  {/* Top Mask */}
                  <div
                    className="absolute bg-slate-950/60 backdrop-blur-[1px] pointer-events-none"
                    style={{ left: 0, top: 0, width: '100%', height: `${crop.y}px` }}
                  />
                  {/* Bottom Mask */}
                  <div
                    className="absolute bg-slate-950/60 backdrop-blur-[1px] pointer-events-none"
                    style={{
                      left: 0,
                      top: `${crop.y + crop.height}px`,
                      width: '100%',
                      bottom: 0
                    }}
                  />
                  {/* Left Mask */}
                  <div
                    className="absolute bg-slate-950/60 backdrop-blur-[1px] pointer-events-none"
                    style={{
                      left: 0,
                      top: `${crop.y}px`,
                      width: `${crop.x}px`,
                      height: `${crop.height}px`
                    }}
                  />
                  {/* Right Mask */}
                  <div
                    className="absolute bg-slate-950/60 backdrop-blur-[1px] pointer-events-none"
                    style={{
                      left: `${crop.x + crop.width}px`,
                      top: `${crop.y}px`,
                      right: 0,
                      height: `${crop.height}px`
                    }}
                  />

                  {/* Active Highlighted Crop Box */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'move')}
                    className="absolute border-2 border-[#E5252A] bg-red-500/10 cursor-move group/crop shadow-xl"
                    style={{
                      left: `${crop.x}px`,
                      top: `${crop.y}px`,
                      width: `${crop.width}px`,
                      height: `${crop.height}px`
                    }}
                  >
                    {/* Inner 3x3 Rule-of-Thirds Grid Lines */}
                    <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30 group-hover/crop:opacity-60 transition-opacity">
                      <div className="border-r border-b border-white" />
                      <div className="border-r border-b border-white" />
                      <div className="border-b border-white" />
                      <div className="border-r border-b border-white" />
                      <div className="border-r border-b border-white" />
                      <div className="border-b border-white" />
                      <div className="border-r border-white" />
                      <div className="border-r border-white" />
                      <div />
                    </div>

                    {/* Dimensions Badge */}
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-900/90 text-white text-[11px] font-bold py-0.5 px-2.5 rounded-full border border-zinc-700 shadow-md whitespace-nowrap pointer-events-none flex items-center gap-1">
                      <Move className="w-3 h-3 text-[#E5252A]" />
                      {getPtDisplay()}
                    </div>

                    {/* 8 Resize Handles */}
                    {/* Top-Left */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, 'nw')}
                      className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-[#E5252A] rounded-full cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
                    />
                    {/* Top */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, 'n')}
                      className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-[#E5252A] rounded-full cursor-ns-resize shadow-md hover:scale-125 transition-transform"
                    />
                    {/* Top-Right */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, 'ne')}
                      className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-[#E5252A] rounded-full cursor-nesw-resize shadow-md hover:scale-125 transition-transform"
                    />
                    {/* Right */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, 'e')}
                      className="absolute top-1/2 -right-2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-[#E5252A] rounded-full cursor-ew-resize shadow-md hover:scale-125 transition-transform"
                    />
                    {/* Bottom-Right */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, 'se')}
                      className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-[#E5252A] rounded-full cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
                    />
                    {/* Bottom */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, 's')}
                      className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-[#E5252A] rounded-full cursor-ns-resize shadow-md hover:scale-125 transition-transform"
                    />
                    {/* Bottom-Left */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, 'sw')}
                      className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-[#E5252A] rounded-full cursor-nesw-resize shadow-md hover:scale-125 transition-transform"
                    />
                    {/* Left */}
                    <div
                      onPointerDown={(e) => handlePointerDown(e, 'w')}
                      className="absolute top-1/2 -left-2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-[#E5252A] rounded-full cursor-ew-resize shadow-md hover:scale-125 transition-transform"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Target Pages & Info */}
        <div className="w-full lg:w-72 flex flex-col space-y-4 bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm flex-shrink-0">
          
          {/* Target Pages Options */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#E5252A]" /> Target Pages ({totalPages} Total)
            </h4>

            <div className="space-y-2">
              <label className="flex items-center space-x-2.5 cursor-pointer p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                <input
                  type="radio"
                  name="applyTo"
                  checked={applyToAll}
                  onChange={() => setApplyToAll(true)}
                  className="w-4 h-4 text-[#E5252A] focus:ring-[#E5252A] border-slate-300 dark:border-zinc-700"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200">
                  Apply crop to all {totalPages} page{totalPages > 1 ? 's' : ''}
                </span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800/50 transition-colors">
                <input
                  type="radio"
                  name="applyTo"
                  checked={!applyToAll}
                  onChange={() => setApplyToAll(false)}
                  className="w-4 h-4 text-[#E5252A] focus:ring-[#E5252A] border-slate-300 dark:border-zinc-700"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200">
                  Specific Page Range
                </span>
              </label>
            </div>

            {!applyToAll && (
              <div className="pl-6 space-y-1">
                <input
                  type="text"
                  placeholder="e.g. 1-3, 5, 8-10"
                  value={pageRange}
                  onChange={(e) => setPageRange(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:bg-white dark:focus:bg-black focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-[#E5252A] transition-all"
                />
                <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                  Comma-separated page numbers or ranges
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={resetToFullPage}
            className="w-full py-2 px-3 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-700 dark:text-zinc-200 hover:text-[#E5252A] transition-all flex items-center justify-center gap-1.5"
          >
            <Maximize2 className="w-3.5 h-3.5 text-[#E5252A]" /> Select Full Page
          </button>

          {/* Quick Details Box */}
          <div className="p-3 bg-red-50/50 dark:bg-red-950/30 rounded-xl border border-red-100 dark:border-red-900/30 text-slate-600 dark:text-zinc-300 text-xs space-y-1">
            <div className="font-semibold text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-[#E5252A]" /> Clean Vector Crop
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Only the highlighted region will remain in the output PDF file.
            </p>
          </div>
        </div>

      </div>

      {/* Bottom Scrollable Preview Container for All Pages */}
      {totalPages > 0 && (
        <div className="w-full bg-slate-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#E5252A]" /> Live Page Previews ({totalPages} Page{totalPages > 1 ? 's' : ''})
            </h4>
            <span className="text-[11px] text-slate-400 dark:text-zinc-500">
              Click any thumbnail to view in main editor
            </span>
          </div>

          {/* Horizontal Scroll Gallery */}
          <div className="flex gap-4 overflow-x-auto pb-2 pt-1 px-1 scrollbar-thin">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => {
              const hasCrop = crop.width > 0 && crop.height > 0 && renderedWidth > 0 && renderedHeight > 0;
              const cropLeftPct = hasCrop ? (crop.x / renderedWidth) * 100 : 0;
              const cropTopPct = hasCrop ? (crop.y / renderedHeight) * 100 : 0;
              const cropWidthPct = hasCrop ? (crop.width / renderedWidth) * 100 : 100;
              const cropHeightPct = hasCrop ? (crop.height / renderedHeight) * 100 : 100;

              return (
                <div
                  key={pNum}
                  onClick={() => setSelectedPage(pNum)}
                  className={`relative group shrink-0 p-2 rounded-xl border-2 transition-all cursor-pointer ${
                    selectedPage === pNum
                      ? 'border-[#E5252A] bg-white dark:bg-zinc-900 shadow-md ring-2 ring-red-500/20'
                      : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="relative overflow-hidden rounded-lg bg-white dark:bg-zinc-950">
                    <PdfPreview
                      file={file}
                      pageNumber={pNum}
                      desiredWidth={150}
                      className="pointer-events-none rounded-lg block"
                    />

                    {/* Overlaid Highlighted Crop Box matching main crop selection */}
                    {hasCrop && (
                      <div className="absolute inset-0 pointer-events-none">
                        {/* Top Mask */}
                        <div
                          className="absolute bg-slate-950/60"
                          style={{ left: 0, top: 0, width: '100%', height: `${cropTopPct}%` }}
                        />
                        {/* Bottom Mask */}
                        <div
                          className="absolute bg-slate-950/60"
                          style={{
                            left: 0,
                            top: `${cropTopPct + cropHeightPct}%`,
                            width: '100%',
                            bottom: 0
                          }}
                        />
                        {/* Left Mask */}
                        <div
                          className="absolute bg-slate-950/60"
                          style={{
                            left: 0,
                            top: `${cropTopPct}%`,
                            width: `${cropLeftPct}%`,
                            height: `${cropHeightPct}%`
                          }}
                        />
                        {/* Right Mask */}
                        <div
                          className="absolute bg-slate-950/60"
                          style={{
                            left: `${cropLeftPct + cropWidthPct}%`,
                            top: `${cropTopPct}%`,
                            right: 0,
                            height: `${cropHeightPct}%`
                          }}
                        />

                        {/* Crop Highlight Rectangle */}
                        <div
                          className="absolute border-2 border-[#E5252A] bg-red-500/10 shadow-sm"
                          style={{
                            left: `${cropLeftPct}%`,
                            top: `${cropTopPct}%`,
                            width: `${cropWidthPct}%`,
                            height: `${cropHeightPct}%`
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-200">Page {pNum}</span>
                    {selectedPage === pNum && (
                      <span className="text-[10px] font-extrabold text-[#E5252A] bg-red-50 dark:bg-red-950/60 px-1.5 py-0.5 rounded">Active</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
