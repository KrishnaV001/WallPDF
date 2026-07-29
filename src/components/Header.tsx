import React, { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { AuthModal } from './AuthModal';

export const Header: React.FC = () => {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const openSignIn = () => {
    setAuthMode('signin');
    setIsAuthOpen(true);
  };

  const openSignUp = () => {
    setAuthMode('signup');
    setIsAuthOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 dark:border-zinc-800 bg-white/80 dark:bg-black/80 backdrop-blur-md transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          
          {/* Brand Logo */}
          <a href="/" className="flex items-center space-x-2.5 group shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#E5252A] flex items-center justify-center text-white font-black text-sm shadow-sm group-hover:scale-105 transition-transform">
              W
            </div>
            <span className="font-extrabold text-lg text-slate-900 dark:text-white tracking-tight">
              WallPDF
            </span>
          </a>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Image-Style Sliding Theme Toggle */}
            <ThemeToggle />

            {/* Sign In Button */}
            <button
              type="button"
              onClick={openSignIn}
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Sign In
            </button>

            {/* Sign Up Button */}
            <button
              type="button"
              onClick={openSignUp}
              className="px-4 py-2 text-xs sm:text-sm font-bold text-white bg-[#E5252A] hover:bg-[#C51920] active:scale-[0.97] rounded-full shadow-md shadow-red-500/10 transition-all duration-150"
            >
              Sign Up
            </button>
          </div>

        </div>
      </header>

      {/* Auth Modal */}
      <AuthModal
        {...({ isOpen: isAuthOpen, mode: authMode, onClose: () => setIsAuthOpen(false) } as any)}
      />
    </>
  );
};