import React, { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
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
import { Dropzone } from '../Dropzone';
import { ToolIcon } from '../ToolIcon';
import { UpgradeModal } from '../UpgradeModal';
import { useFirebaseUser } from '../../lib/auth/useFirebaseUser';
import { usePlan } from '../../lib/plan/usePlan';
import { PLAN_LIMITS } from '../../lib/plan/types';
import { checkWorkflowStepsAllowed, checkCanSaveWorkflow } from '../../lib/plan/gating';
import { CHAINABLE_SLUGS, CHAINABLE_OPERATIONS } from '../../lib/pdf-operations/registry';
import type { ChainableOperationSlug, WatermarkOptions, AddPageNumbersOptions, CompressOptions } from '../../lib/pdf-operations/types';
import { runWorkflow } from '../../lib/workflows/runner';
import { saveWorkflow, listWorkflows, deleteWorkflow } from '../../lib/workflows/storage';
import type { Workflow, WorkflowStep, WorkflowRotateOptions } from '../../lib/workflows/types';

const STEP_LABELS: Record<ChainableOperationSlug, string> = {
  'rotate-pdf': 'Rotate',
  'watermark-pdf': 'Watermark',
  'add-page-numbers': 'Page numbers',
  'compress-pdf': 'Compress',
};

function defaultOptionsFor(slug: ChainableOperationSlug): WorkflowStep['options'] {
  const base = slug === 'rotate-pdf' ? ({ uniformDelta: 90 } as WorkflowRotateOptions) : CHAINABLE_OPERATIONS[slug].defaultOptions;
  // Clone so multiple steps of the same tool never share one options object.
  return typeof structuredClone === 'function' ? structuredClone(base) : JSON.parse(JSON.stringify(base));
}

interface StepCardProps {
  step: WorkflowStep;
  index: number;
  onChange: (id: string, options: WorkflowStep['options']) => void;
  onRemove: (id: string) => void;
}

const StepCard: React.FC<StepCardProps> = ({ step, index, onChange, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-zinc-600" title="Drag to reorder">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
            </svg>
          </span>
          <div className="w-8 h-8 rounded-lg bg-[#E5252A]/10 text-[#E5252A] flex items-center justify-center">
            <ToolIcon slug={step.slug} className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold text-slate-800 dark:text-zinc-200">{index + 1}. {STEP_LABELS[step.slug]}</span>
        </div>
        <button onClick={() => onRemove(step.id)} className="p-1 rounded-md text-slate-400 hover:text-[#E5252A]" aria-label="Remove step">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {step.slug === 'rotate-pdf' && (
        <div className="flex gap-2">
          {([90, 180, 270] as const).map((deg) => (
            <button
              key={deg}
              type="button"
              onClick={() => onChange(step.id, { uniformDelta: deg } as WorkflowRotateOptions)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                (step.options as WorkflowRotateOptions).uniformDelta === deg
                  ? 'bg-[#E5252A] text-white'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'
              }`}
            >
              {deg}\u00b0
            </button>
          ))}
        </div>
      )}

      {step.slug === 'watermark-pdf' && (
        <div className="space-y-2">
          <input
            type="text"
            value={(step.options as WatermarkOptions).text}
            onChange={(e) => onChange(step.id, { ...(step.options as WatermarkOptions), text: e.target.value })}
            placeholder="Watermark text"
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChange(step.id, { ...(step.options as WatermarkOptions), layout: 'center' })}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${(step.options as WatermarkOptions).layout === 'center' ? 'bg-[#E5252A] text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
            >
              Centered
            </button>
            <button
              type="button"
              onClick={() => onChange(step.id, { ...(step.options as WatermarkOptions), layout: 'tile' })}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${(step.options as WatermarkOptions).layout === 'tile' ? 'bg-[#E5252A] text-white' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300'}`}
            >
              Tiled
            </button>
          </div>
        </div>
      )}

      {step.slug === 'add-page-numbers' && (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={(step.options as AddPageNumbersOptions).position}
            onChange={(e) => onChange(step.id, { ...(step.options as AddPageNumbersOptions), position: e.target.value as AddPageNumbersOptions['position'] })}
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
          >
            <option value="bottom-center">Bottom center</option>
            <option value="bottom-left">Bottom left</option>
            <option value="bottom-right">Bottom right</option>
            <option value="top-center">Top center</option>
            <option value="top-left">Top left</option>
            <option value="top-right">Top right</option>
          </select>
          <input
            type="number"
            min={0}
            value={(step.options as AddPageNumbersOptions).start}
            onChange={(e) => onChange(step.id, { ...(step.options as AddPageNumbersOptions), start: Number(e.target.value) })}
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
            placeholder="Start at"
          />
        </div>
      )}

      {step.slug === 'compress-pdf' && (
        <div className="relative">
          <input
            type="number"
            min={1}
            value={(step.options as CompressOptions).targetSizeKb ?? ''}
            onChange={(e) => onChange(step.id, { targetSizeKb: e.target.value ? Number(e.target.value) : null })}
            placeholder="Target size (optional)"
            className="w-full px-3 py-2 pr-10 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg"
          />
          <span className="absolute inset-y-0 right-3 flex items-center text-xs text-slate-400 dark:text-zinc-500">KB</span>
        </div>
      )}
    </div>
  );
};

export const WorkflowBuilder: React.FC = () => {
  const { user } = useFirebaseUser();
  const { plan, isPremium } = usePlan();

  const [file, setFile] = useState<File | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [workflowName, setWorkflowName] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const [savedWorkflows, setSavedWorkflows] = useState<Workflow[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!user) {
      setSavedWorkflows([]);
      return;
    }
    listWorkflows(user.uid)
      .then(setSavedWorkflows)
      .catch((err) => console.warn('[WorkflowBuilder] could not load saved workflows', err));
  }, [user]);

  const addStep = (slug: ChainableOperationSlug) => {
    setSteps((prev) => [...prev, { id: uuidv4(), slug, options: defaultOptionsFor(slug) }]);
    setResultBlob(null);
  };

  const updateStepOptions = (id: string, options: WorkflowStep['options']) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, options } : s)));
    setResultBlob(null);
  };

  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    setResultBlob(null);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSteps((items) => {
      const oldIndex = items.findIndex((s) => s.id === active.id);
      const newIndex = items.findIndex((s) => s.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const handleRun = async () => {
    if (!file || steps.length === 0) return;
    setError(null);

    const gate = checkWorkflowStepsAllowed(plan, steps.length);
    if (!gate.allowed) {
      setUpgradeMessage(gate.message ?? 'Upgrade to run longer workflows.');
      return;
    }

    setIsRunning(true);
    setProgress(0);
    setResultBlob(null);
    try {
      const inputBytes = new Uint8Array(await file.arrayBuffer());
      const outputBytes = await runWorkflow(inputBytes, steps, (done, total) => setProgress(Math.round((done / total) * 100)));
      const outputBuffer = outputBytes.buffer.slice(
        outputBytes.byteOffset,
        outputBytes.byteOffset + outputBytes.byteLength
      ) as ArrayBuffer;
      setResultBlob(new Blob([outputBuffer], { type: 'application/pdf' }));
    } catch (err: any) {
      setError(err?.message || 'This workflow could not be run.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSave = async () => {
    if (!user) {
      setError('Sign in to save workflows.');
      return;
    }
    const gate = checkCanSaveWorkflow(plan);
    if (!gate.allowed) {
      setUpgradeMessage(gate.message ?? 'Upgrade to save workflows.');
      return;
    }
    if (!workflowName.trim() || steps.length === 0) return;

    setIsSaving(true);
    setError(null);
    try {
      await saveWorkflow(user.uid, { name: workflowName.trim(), steps });
      const refreshed = await listWorkflows(user.uid);
      setSavedWorkflows(refreshed);
    } catch (err: any) {
      setError(err?.message || 'Could not save this workflow.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = (workflow: Workflow) => {
    setSteps(workflow.steps.map((s) => ({ ...s, id: uuidv4() })));
    setWorkflowName(workflow.name);
    setResultBlob(null);
  };

  const handleDelete = async (id?: string) => {
    if (!user || !id) return;
    try {
      await deleteWorkflow(user.uid, id);
      setSavedWorkflows((prev) => prev.filter((w) => w.id !== id));
    } catch (err: any) {
      setError(err?.message || 'Could not delete this workflow.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Workflows</h1>
        <p className="text-slate-500 dark:text-zinc-400 max-w-xl mx-auto text-sm">
          Chain rotate, watermark, page numbers, and compress into one pass.
          {!isPremium && ` Free plan: up to ${PLAN_LIMITS.free.workflowStepLimit} steps per run.`}
        </p>
      </div>

      {!file ? (
        <Dropzone onFilesSelected={(files) => setFile(files[0])} acceptMultiple={false} />
      ) : (
        <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200 truncate">{file.name}</span>
          <button
            onClick={() => { setFile(null); setResultBlob(null); }}
            className="text-xs font-semibold text-[#E5252A] hover:underline shrink-0 ml-3"
          >
            Change file
          </button>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200 mb-3">Steps</h3>

        {steps.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3 mb-4">
                {steps.map((step, idx) => (
                  <StepCard key={step.id} step={step} index={idx} onChange={updateStepOptions} onRemove={removeStep} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CHAINABLE_SLUGS.map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => addStep(slug)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:border-[#E5252A] hover:text-[#E5252A] transition-colors"
            >
              <ToolIcon slug={slug} className="w-5 h-5" />
              <span className="text-xs font-semibold">+ {STEP_LABELS[slug]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400 text-center">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={handleRun}
          disabled={!file || steps.length === 0 || isRunning}
          className="px-8 py-3 bg-[#E5252A] hover:bg-[#C51920] disabled:bg-slate-300 dark:disabled:bg-zinc-700 text-white font-bold text-sm rounded-full shadow-md transition-all"
        >
          {isRunning ? `Running... ${progress}%` : 'Run workflow'}
        </button>

        {resultBlob && (
          <a
            href={URL.createObjectURL(resultBlob)}
            download="workflow-output.pdf"
            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-full shadow-md transition-all text-center"
          >
            Download result
          </a>
        )}
      </div>

      {user && (
        <div className="border-t border-slate-100 dark:border-zinc-800 pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="Name this workflow to save it"
              className="flex-1 px-4 py-2.5 text-sm bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl"
            />
            <button
              onClick={handleSave}
              disabled={!workflowName.trim() || steps.length === 0 || isSaving}
              className="px-6 py-2.5 bg-slate-800 dark:bg-zinc-700 hover:bg-slate-900 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save workflow'}
            </button>
          </div>

          {savedWorkflows.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-zinc-500">Saved workflows</h4>
              {savedWorkflows.map((w) => (
                <div key={w.id} className="flex items-center justify-between bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-zinc-200">{w.name}</p>
                    <p className="text-xs text-slate-400 dark:text-zinc-500">{w.steps.length} step{w.steps.length === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleLoad(w)} className="text-xs font-semibold text-[#E5252A] hover:underline">Load</button>
                    <button onClick={() => handleDelete(w.id)} className="text-xs font-semibold text-slate-400 hover:text-rose-500">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <UpgradeModal isOpen={!!upgradeMessage} message={upgradeMessage ?? ''} onClose={() => setUpgradeMessage(null)} />
    </div>
  );
};
