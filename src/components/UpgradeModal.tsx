import React from 'react';

interface UpgradeModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
}

/**
 * Shown wherever a free-plan limit is hit (batch file cap, workflow step
 * cap, saving a workflow). Deliberately just a prompt with a link to
 * /pricing rather than triggering Checkout directly - keeps the "what am I
 * buying and for how much" decision on one page instead of splitting it
 * across every gate in the app.
 */
export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, message, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-3xl shadow-2xl dark:shadow-black/40 w-full max-w-sm p-6 sm:p-8 relative overflow-hidden text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#E5252A]/10 text-[#E5252A] flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">That's a Premium feature</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">{message}</p>

        <div className="flex flex-col gap-2.5">
          <a
            href="/pricing"
            className="w-full py-2.5 px-4 bg-[#E5252A] hover:bg-[#C51920] text-white font-semibold text-sm rounded-xl shadow-md transition-all active:scale-[0.99]"
          >
            See plans
          </a>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 font-semibold text-sm rounded-xl transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};
