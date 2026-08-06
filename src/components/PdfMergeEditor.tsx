import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PdfPreview } from './PdfPreview';

interface MergedPage {
  id: string; // Unique ID for DND-kit
  originalFile: File; // Reference to the original uploaded file
  originalPageIndex: number; // 0-indexed page number within the original file
  fileName: string; // Name of the original file
  previewBlob: Blob | null; // A Blob representing the rendered page for preview
  isLoadingPreview: boolean; // New flag to indicate if preview is being generated
}

interface PdfMergeEditorProps {
  pages: MergedPage[];
  onReorder: (newPages: MergedPage[]) => void;
  onRemovePage: (pageId: string) => void;
}

// Spinner component (copied from ToolWorkspace for self-containment)
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

const SortableMergedPageItem: React.FC<{ page: MergedPage; onRemove: (id: string) => void }> = ({ page, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-slate-50 dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700/60 rounded-2xl p-3.5 flex items-center justify-between cursor-grab active:cursor-grabbing transition-all"
    >
      <div className="flex items-center space-x-3 overflow-hidden pointer-events-none">
        <div className="w-16 h-20 rounded-lg bg-white dark:bg-zinc-700 shadow-sm shrink-0 overflow-hidden flex items-center justify-center">
          {page.isLoadingPreview ? (
            <Spinner className="w-8 h-8 text-slate-400 dark:text-zinc-500" />
          ) : page.previewBlob ? (
            <PdfPreview file={page.previewBlob} desiredWidth={64} className="w-full h-full object-contain" />
          ) : (
            <div className="text-xs font-bold text-slate-400 dark:text-zinc-500">Error</div> // Fallback for failed preview
          )}
        </div>
        <div className="truncate">
          <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">{page.fileName}</p>
          <p className="text-[10px] text-slate-400 dark:text-zinc-400">Page {page.originalPageIndex + 1}</p>
        </div>
      </div>
      <button onClick={() => onRemove(page.id)} className="p-1 rounded-lg text-slate-400 hover:text-[#E5252A] transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export const PdfMergeEditor: React.FC<PdfMergeEditorProps> = ({ pages, onReorder, onRemovePage }) => {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = pages.findIndex((page) => page.id === active.id);
      const newIndex = pages.findIndex((page) => page.id === over?.id);
      onReorder(arrayMove(pages, oldIndex, newIndex));
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pages.map((page) => page.id)} strategy={verticalListSortingStrategy}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
          {pages.map((page) => (
            <SortableMergedPageItem key={page.id} page={page} onRemove={onRemovePage} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};