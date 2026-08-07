import React, { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { AuthModal } from './AuthModal';

export const Header: React.FC = () => {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // New state for mobile menu

  const openSignIn = () => {
    setAuthMode('signin');
    setIsAuthOpen(true);
  };

  const openSignUp = () => {
    setAuthMode('signup');
    setIsAuthOpen(true);
    setIsMobileMenuOpen(false); // Close mobile menu when opening auth modal
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 dark:border-zinc-800 bg-white/80 dark:bg-black/80 backdrop-blur-md transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          
          {/* Brand Logo */}
          <a href="/" className="flex items-center space-x-2.5 group shrink-0">
            <div className="w-9 h-9 rounded-lg bg-[#E5252A] flex items-center justify-center text-white font-black text-sm shadow-sm group-hover:scale-105 transition-transform">
              W
            </div>
            <span className="font-extrabold text-xl text-slate-900 dark:text-white tracking-tight">
              WallPDF
            </span>
          </a>

          {/* Desktop Navigation Items (visible on medium screens and up) */}
          <div className="hidden md:flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Image-Style Sliding Theme Toggle */}
            <ThemeToggle />

            {/* Sign In Button */}
            <button
              type="button"
              onClick={openSignIn}
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:text-slate-900 dark:hover:text-white transition-colors rounded-full"
            >
              Sign In
            </button>

            {/* Sign Up Button */}
            <button
              type="button"
              onClick={openSignUp}
              className="px-4 py-2 text-xs sm:text-sm font-bold text-white bg-[#E5252A] hover:bg-[#C51920] active:scale-[0.97] rounded-full shadow-md shadow-red-500/10 transition-all duration-150 whitespace-nowrap"
            >
              Sign Up
            </button>
          </div>

          {/* Mobile Hamburger Menu Button and Theme Toggle (visible only on small screens) */}
          <div className="md:hidden flex items-center gap-2">
            <div className=" scale-90 "> {/* Adjust scale as needed */}
              <ThemeToggle />
            </div>
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-1 rounded-md text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 focus:outline-none  focus:ring-red-500/50 transition-colors"
              aria-controls="mobile-menu"
              aria-expanded={isMobileMenuOpen}
            >
              <span className="sr-only">Open main menu</span>
              {isMobileMenuOpen ? (
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round"  d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu (hidden by default, toggled by isMobileMenuOpen state) */}
        {isMobileMenuOpen && (
          <div id="mobile-menu" className="md:hidden bg-white dark:bg-black border-t border-slate-200/80 dark:border-zinc-800 py-2 px-4 sm:px-6">
            <div className="flex flex-col space-y-2">
              {/* Mobile Sign In Button */}
              <button type="button" onClick={openSignIn} className="w-full px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors rounded-md text-left">Sign In</button>
              {/* Mobile Sign Up Button */}
              <button type="button" onClick={openSignUp} className="w-full px-4 py-2 text-sm font-bold text-white bg-[#E5252A] hover:bg-[#C51920] active:scale-[0.97] rounded-md shadow-md shadow-red-500/10 transition-all duration-150 text-left">Sign Up</button>
              {/* Add other mobile navigation links here if needed */}
            </div>
          </div>
        )}
      </header>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authMode}
        onClose={() => setIsAuthOpen(false)}
      />
    </>
  );
};