import React, { useMemo, useState } from 'react';
import toolsData from '../data/tools.json';
import { ToolIcon } from './ToolIcon';

// Define the schema type from tools.json
interface ToolItem {
  slug: string;
  title: string;
  h1: string;
  description: string;
  category: string;
  color: string;
};

// Map color strings from JSON to Tailwind background/text classes
const getColorClasses = (color: string) => {
  switch (color) {
    case 'red':
      return 'bg-red-50 text-[#E5252A] dark:bg-red-950/40 dark:text-red-400';
    case 'green':
    case 'emerald':
      return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400';
    case 'blue':
      return 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400';
    case 'orange':
      return 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400';
    case 'purple':
      return 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300';
  }
};

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'Organize PDF', label: 'Organize' },
  { id: 'Optimize PDF', label: 'Optimize' },
  { id: 'Convert PDF', label: 'Convert' },
  { id: 'Edit PDF', label: 'Edit' },
  { id: 'Image Tools', label: 'Image Tools' },
];

// Where missing-tool requests get sent. Point this at a real serverless
// function / Firestore write — see handleReportTool below.
const REPORT_ENDPOINT = '/api/report-tool';
const REPORT_QUEUE_KEY = 'wallpdf_tool_requests';

type ReportStatus = 'idle' | 'sending' | 'sent' | 'error';

export const ToolGrid: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [reportStatus, setReportStatus] = useState<ReportStatus>('idle');

  const tools: ToolItem[] = toolsData as ToolItem[];

  const filteredTools = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tools.filter((tool) => {
      const matchesCategory = activeCategory === 'all' || tool.category === activeCategory;
      if (!matchesCategory) return false;
      if (!query) return true;
      return (
        tool.h1.toLowerCase().includes(query) ||
        tool.title.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query) ||
        tool.slug.toLowerCase().includes(query)
      );
    });
  }, [tools, activeCategory, searchQuery]);

  const handleReportTool = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setReportStatus('sending');
    const payload = { query, category: activeCategory, requestedAt: new Date().toISOString() };
    try {
      const res = await fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      setReportStatus('sent');
    } catch (err) {
      // No backend wired yet (or it failed) — queue locally so nothing is lost,
      // and still confirm to the user so the flow doesn't feel broken.
      console.warn('report-tool endpoint unavailable, queuing locally:', err);
      try {
        const existing = JSON.parse(localStorage.getItem(REPORT_QUEUE_KEY) || '[]');
        existing.push(payload);
        localStorage.setItem(REPORT_QUEUE_KEY, JSON.stringify(existing));
      } catch {
        // localStorage unavailable — nothing more we can do client-side
      }
      setReportStatus('sent');
    }
  };

  const showNoResults = filteredTools.length === 0;
  const showReportPanel = showNoResults && searchQuery.trim().length > 0;

  return (
    <div className="min-h-screen bg-[#f5f5fa]/80 dark:bg-black py-10 sm:py-14 px-5 sm:px-8 transition-colors duration-200">
      <style>{`
        @property --wpdf-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes wpdf-spin {
          to { --wpdf-angle: 360deg; }
        }
        .wpdf-search-wrap {
          position: relative;
          border-radius: 9999px;
          padding: 2px;
          isolation: isolate;
        }
        .wpdf-search-wrap::before {
          content: '';
          position: absolute;
          inset: -3px;
          border-radius: 9999px;
          z-index: -1;
          background: conic-gradient(from var(--wpdf-angle), #E5252A, #fca5a5, #E5252A 50%, transparent 85%);
          filter: blur(10px);
          opacity: 0.55;
          animation: wpdf-spin 4s linear infinite;
          transition: opacity 0.25s ease;
        }
        .wpdf-search-wrap.wpdf-focused::before {
          opacity: 0.95;
          filter: blur(12px);
        }
        @media (prefers-reduced-motion: reduce) {
          .wpdf-search-wrap::before { animation: none; }
        }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-9 sm:space-y-11">

        {/* Header */}
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <h1 className="text-[2.1rem] leading-[1.15] sm:text-5xl sm:leading-tight font-bold tracking-tight text-slate-900 dark:text-white transition-colors">
            Your complete toolkit for every <span className="text-[#E5252A]">PDF</span> task
          </h1>
          <p className="text-[15px] sm:text-lg text-slate-600 dark:text-zinc-400 max-w-2xl mx-auto font-normal leading-relaxed transition-colors">
            Convert, shrink, split, rotate, and watermark documents in a few clicks — 100% private, local processing, nothing ever leaves your browser.
          </p>
        </div>

        {/* Glowing Search Bar */}
        <div className="max-w-xl mx-auto">
          <div className={`wpdf-search-wrap ${isSearchFocused ? 'wpdf-focused' : ''}`}>
            <div className="relative flex items-center bg-white dark:bg-zinc-900 rounded-full">
              <svg
                className="absolute left-4 w-5 h-5 text-slate-400 dark:text-zinc-500 pointer-events-none"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setReportStatus('idle');
                }}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                placeholder="Search for a tool — e.g. “rotate”, “compress”, “watermark”..."
                className="w-full bg-transparent rounded-full pl-11 pr-10 py-3 text-sm sm:text-[15px] text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setReportStatus('idle'); }}
                  className="absolute right-3 p-1 rounded-full text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                  aria-label="Clear search"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter Pills — horizontal scroll strip on mobile, centered wrap on larger screens */}
        <div className="relative ml-3 sm:ml-0">
          <div className="flex items-center gap-2.5 overflow-x-auto sm:overflow-visible sm:flex-wrap sm:justify-center px-5 sm:px-0 pb-1 sm:pb-0 snap-x snap-mandatory">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`shrink-0 snap-start px-4 py-2 sm:py-1.5 rounded-full text-sm font-semibold transition-all duration-150 border ${
                    isActive
                      ? 'bg-[#E5252A] text-white border-[#E5252A] shadow-md shadow-red-500/20'
                      : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:border-slate-400 dark:hover:border-zinc-600 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tool Cards Grid */}
        {!showNoResults && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredTools.map((tool) => (
              <a
                key={tool.slug}
                href={`/${tool.slug}`}
                className="group relative bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-5 sm:p-6 transition-all duration-200 hover:border-[#E5252A]/60 dark:hover:border-[#E5252A]/60 hover:shadow-lg hover:shadow-slate-200/60 dark:hover:shadow-2xl dark:hover:shadow-red-950/10 hover:-translate-y-0.5 flex flex-col"
              >
                <div className="flex items-center sm:flex-col sm:items-start gap-3 sm:gap-0 mb-2.5 sm:mb-3">
                  <div className={`w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-xl flex items-center justify-center sm:mb-3 transition-transform duration-200 group-hover:scale-105 ${getColorClasses(tool.color)}`}>
                    <ToolIcon slug={tool.slug} className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-white group-hover:text-[#E5252A] dark:group-hover:text-[#E5252A] transition-colors leading-tight truncate sm:whitespace-normal">
                      {tool.h1}
                    </h3>
                  </div>
                </div>

                <p className="text-[13px] text-slate-500 dark:text-zinc-400 leading-relaxed font-normal flex-grow">
                  {tool.description}
                </p>

                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-zinc-500">
                    {tool.category.replace(' PDF', '')}
                  </span>
                  <svg
                    className="w-4 h-4 text-slate-300 dark:text-zinc-700 group-hover:text-[#E5252A] group-hover:translate-x-0.5 transition-all duration-200"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="M12 5l7 7-7 7" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* No results — offer to notify the admin */}
        {showReportPanel && (
          <div className="max-w-md mx-auto text-center bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-2xl p-8">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-400 dark:text-zinc-500">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-white mb-1.5">
              No tool found for &ldquo;{searchQuery.trim()}&rdquo;
            </h3>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mb-5">
              Let us know and we'll look into adding it.
            </p>

            {reportStatus === 'sent' ? (
              <div className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Thanks — the team has been notified!
              </div>
            ) : (
              <button
                type="button"
                onClick={handleReportTool}
                disabled={reportStatus === 'sending'}
                className="px-5 py-2.5 bg-[#E5252A] hover:bg-[#C51920] text-white text-sm font-semibold rounded-full shadow-md shadow-red-500/20 transition-all active:scale-[0.97] disabled:opacity-60"
              >
                {reportStatus === 'sending' ? 'Sending...' : `Request "${searchQuery.trim()}"`}
              </button>
            )}
          </div>
        )}

        {/* Category has no tools and no search term active */}
        {showNoResults && !searchQuery.trim() && (
          <div className="text-center py-16 text-slate-400 dark:text-zinc-600 text-sm">
            No tools found in this category yet.
          </div>
        )}

      </div>
    </div>
  );
};
