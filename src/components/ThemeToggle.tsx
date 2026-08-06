import React, { useEffect, useState } from 'react';

export const ThemeToggle: React.FC = () => {
  const [isDark, setIsDark] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    // Check localStorage first, then system preference as a fallback.
    const userTheme = localStorage.getItem('theme');
    const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const newIsDark = userTheme === 'dark' || (userTheme === null && systemIsDark);

    setIsDark(newIsDark);
    if (newIsDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextState = !isDark;
    setIsDark(nextState);

    if (nextState) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  if (!mounted) {
    return <div className="w-20 h-10 rounded-full bg-slate-200 dark:bg-zinc-900 shrink-0" />;
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
      className={`relative inline-flex h-10 w-20  shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors duration-300 focus:outline-none ${
        isDark ? 'bg-[#080b11]' : 'bg-[#f1f5f9]'
      }`}
    >
      {/* Sliding Highlight Capsule */}
      <span
        className={`absolute ml-[1.5px]  h-8 w-9 rounded-full transition-transform duration-300 ease-out shadow-sm ${
          isDark
            ? 'translate-x-8 bg-[#242e42]'
            : 'translate-x-0 bg-[#e2e8f0]'
        }`}
      />

      {/* Fixed Sun & Moon Icons */}
      <div className="relative z-10 flex w-full items-center justify-between px-2">
        {/* Sun Icon (Left Slot) */}
        <span className="flex items-center justify-center w-6 h-6">
          <svg
            className={`w-5 h-5 transition-colors duration-300 ${
              isDark ? 'text-zinc-500' : 'text-slate-800'
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        </span>

        {/* Moon Icon (Right Slot) */}
        <span className="flex items-center justify-center w-6 h-6">
          <svg
            className={`w-5 h-5 transition-colors duration-300 ${
              isDark ? 'text-white' : 'text-slate-400'
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </span>
      </div>
    </button>
  );
};