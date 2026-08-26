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
  { id: 'Image Tools', label: 'Image Tools' },
];

export const ToolGrid: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const tools: ToolItem[] = toolsData as ToolItem[];

  const filteredTools = activeCategory === 'all'
    ? tools
    : tools.filter((tool) => tool.category === activeCategory);

  return (
    <div className="min-h-screen bg-[#f5f5fa]/80 dark:bg-black py-8 px-5 sm:px-8  transition-colors duration-200">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Header */}
        <div className="text-center space-y-3 mx-auto">
          <h1 className="text-4xl sm:text-[2.6rem] font-bold  text-gray-850 dark:text-white transition-colors">
            Your complete toolkit for any <span className='text-[#E5252A] dark:text-[#E5252A]'>PDFs</span> work, all in one place
          </h1>
          <p className="text-base leading-snug sm:text-xl text-slate-600 dark:text-zinc-400 max-w-4xl mx-auto font-light transition-colors">
            Your complete toolkit to easily convert, shrink, split, rotate, and watermark documents in a few clicks with 100% private, local processing.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center justify-center gap-4 ">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-1.5 sm:px-4 sm:py-1.5 rounded-full text-sm sm:text-md font-semibold transition-all duration-200 border ${
                  isActive
                    ? ' bg-gray-dark:bg-zink-900  dark:text-white border-gray-600 shadow- shadow-zink-500/20 scale-105'
                    : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-300 dark:border-zinc-800   hover:border-slate-800 dark:hover:border-zinc-300'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Tool Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4 ">
          {filteredTools.map((tool) => (
            <a
              key={tool.slug}
              href={`/${tool.slug}`}
              className="group bg-white dark:bg-zinc-900/50 border border-slate-300 dark:border-zinc-900 rounded-2xl p-4 sm:p-7 transition-all duration-200 hover:border-[#E5252A] dark:hover:border-[#E5252A] hover:shadow-xl dark:hover:shadow-2xl dark:hover:shadow-red-950/20 hover:-translate-y-1 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center sm:flex-col sm:items-start mb-2"> {/* Flex row on mobile, column on larger screens */}
                  {/* SVG Icon Container - Smaller on mobile, original size on sm and up */}
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mr-3 sm:mr-0 sm:mb-3 transition-transform group-hover:scale-110 ${getColorClasses(tool.color)}`}>
                    <ToolIcon slug={tool.slug} className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>

                  {/* Card H1 / Name */}
                  <h3 className="text-lg sm:text-xl font-semibold text-slate-800/90 dark:text-white group-hover:text-[#E5252A] dark:group-hover:text-[#E5252A] transition-colors leading-tight">
                    {tool.h1}
                  </h3>
                </div>

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