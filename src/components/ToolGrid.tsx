import React, { useState } from 'react';
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
  { id: 'Organize PDF', label: 'Organize PDF' },
  { id: 'Optimize PDF', label: 'Optimize PDF' },
  { id: 'Convert PDF', label: 'Convert PDF' },
  { id: 'Edit PDF', label: 'Edit PDF' },
];

export const ToolGrid: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const tools: ToolItem[] = toolsData as ToolItem[];

  const filteredTools = activeCategory === 'all'
    ? tools
    : tools.filter((tool) => tool.category === activeCategory);

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-black py-16 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white transition-colors">
            Fast, Private PDF Tools — Right in Your Browser
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-zinc-400 max-w-2xl mx-auto font-normal transition-colors">
            Merge, split, compress, and convert documents in seconds.{' '}
            <span className="font-semibold text-slate-800 dark:text-zinc-300">
              100% free with zero file uploads
            </span>
            —your documents never leave your device.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 border ${
                  isActive
                    ? 'bg-[#E5252A] text-white border-[#E5252A] shadow-md shadow-red-500/20 scale-105'
                    : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Tool Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {filteredTools.map((tool) => (
            <a
              key={tool.slug}
              href={`/${tool.slug}`}
              className="group bg-white dark:bg-zinc-900/90 border border-slate-200/80 dark:border-zinc-800 rounded-3xl p-6 transition-all duration-200 hover:border-[#E5252A] dark:hover:border-[#E5252A] hover:shadow-xl dark:hover:shadow-2xl dark:hover:shadow-red-950/20 hover:-translate-y-1 flex flex-col justify-between"
            >
              <div>
                {/* SVG Icon Container */}
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 transition-transform group-hover:scale-110 ${getColorClasses(tool.color)}`}>
                  <ToolIcon slug={tool.slug} className="w-6 h-6" />
                </div>

                {/* Card H1 / Name */}
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 group-hover:text-[#E5252A] dark:group-hover:text-[#E5252A] transition-colors">
                  {tool.h1}
                </h3>

                {/* Card Description */}
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed font-normal">
                  {tool.description}
                </p>
              </div>
            </a>
          ))}
        </div>

      </div>
    </div>
  );
};