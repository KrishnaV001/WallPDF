import React, { useState, useRef, useEffect } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { AuthModal } from './AuthModal';
import { useAuth } from '../context/AuthContext'

export const Header: React.FC = () => {
  const { user, logout, loading } = useAuth();
  console.log('Header: Render with user:', user);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [isProfileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const openSignIn = () => {
    setAuthMode('signin');
    setIsAuthOpen(true);
  };

  const openSignUp = () => {
    setAuthMode('signup');
    setIsAuthOpen(true);
  };
  
  const openAuthModalFromMobile = () => {
    setAuthMode('signup');
    setIsAuthOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 dark:border-zinc-800 bg-white/80 dark:bg-black/80 backdrop-blur-md transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          
          <a href="/" className="flex items-center space-x-2.5 group shrink-0">
            <div className="w-9 h-9 rounded-lg bg-[#E5252A] flex items-center justify-center text-white font-black text-sm shadow-sm group-hover:scale-105 transition-transform">
              W
            </div>
            <span className="font-extrabold text-xl text-slate-900 dark:text-white tracking-tight">
              WallPDF
            </span>
          </a>

          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />

            {/* Desktop: Profile Dropdown or Sign-in Buttons */}
            <div className="hidden md:flex items-center gap-2">
              {user ? (
                <div className="relative" ref={profileMenuRef}>
                  <button
                    onClick={() => setProfileMenuOpen(!isProfileMenuOpen)}
                    className="block rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-50 dark:focus:ring-offset-black focus:ring-red-500"
                  >
                    <span className="sr-only">Open user menu</span>
                    <img
                      className="h-8 w-8 rounded-full"
                      src={user.picture}
                      alt={user.name}
                    />
                  </button>
                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 origin-top-right bg-white dark:bg-zinc-900 rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none text-sm">
                      <div className="py-1">
                        <div className="px-4 py-2 border-b border-slate-100 dark:border-zinc-800">
                          <p className="font-semibold text-slate-800 dark:text-white truncate" title={user.name}>{user.name}</p>
                          <p className="text-slate-500 dark:text-zinc-400 truncate" title={user.email}>{user.email}</p>
                        </div>
                        <button
                          onClick={logout}
                          className="block w-full text-left px-4 py-2 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
                        >
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={openSignIn}
                    className="px-3.5 py-2 text-sm font-semibold text-slate-700 dark:text-zinc-200 hover:text-slate-900 dark:hover:text-white transition-colors rounded-full"
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={openSignUp}
                    className="px-4 py-2 text-sm font-bold text-white bg-[#E5252A] hover:bg-[#C51920] active:scale-[0.97] rounded-full shadow-md shadow-red-500/10 transition-all duration-150 whitespace-nowrap"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>

            {/* Mobile: Profile Icon or Generic Icon */}
            <div className="md:hidden">
              {user ? (
                <div className="relative" ref={profileMenuRef}>
                  <button
                    onClick={() => setProfileMenuOpen(!isProfileMenuOpen)}
                    className="block rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-50 dark:focus:ring-offset-black focus:ring-red-500"
                  >
                    <span className="sr-only">Open user menu</span>
                    <img
                      className="h-8 w-8 rounded-full"
                      src={user.picture}
                      alt={user.name}
                    />
                  </button>
                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 origin-top-right bg-white dark:bg-zinc-900 rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none text-sm">
                      <div className="py-1">
                        <div className="px-4 py-2 border-b border-slate-100 dark:border-zinc-800">
                          <p className="font-semibold text-slate-800 dark:text-white truncate" title={user.name}>{user.name}</p>
                          <p className="text-slate-500 dark:text-zinc-400 truncate" title={user.email}>{user.email}</p>
                        </div>
                        <button
                          onClick={logout}
                          className="block w-full text-left px-4 py-2 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
                        >
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openAuthModalFromMobile}
                  className="p-1 rounded-md text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
                >
                  <span className="sr-only">Open user menu</span>
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                     <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                     <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {!user && (
        <AuthModal
          isOpen={isAuthOpen}
          mode={authMode}
          setMode={setAuthMode}
          onClose={() => setIsAuthOpen(false)}
        />
      )}
    </>
  );
};
