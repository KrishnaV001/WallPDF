import React, { useState, useRef, useEffect } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { AuthModal } from './AuthModal';
import { useAuth } from '../context/AuthContext'

const ProfileAvatar: React.FC<{ name: string; picture?: string | null; className?: string }> = ({ name, picture, className }) => {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || '?';
  const [imgFailed, setImgFailed] = useState(false);

  if (picture && !imgFailed) {
    return (
      <img
        src={picture}
        alt={name || 'Profile'}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`rounded-full object-cover select-none ${className ?? ''}`}
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-[#E5252A] text-white font-semibold select-none ${className ?? ''}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
};

export const Header: React.FC = () => {
  const { user, logout, loading } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [isProfileMenuOpen, setProfileMenuOpen] = useState(false);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedOutsideDesktop = !desktopMenuRef.current || !desktopMenuRef.current.contains(target);
      const clickedOutsideMobile = !mobileMenuRef.current || !mobileMenuRef.current.contains(target);
      if (clickedOutsideDesktop && clickedOutsideMobile) {
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

  const handleLogout = () => {
    setProfileMenuOpen(false);
    logout();
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 dark:border-zinc-800 bg-white/80 dark:bg-black/80 backdrop-blur-md transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          
          <a href="/" className="flex items-center space-x-2.5 group shrink-">
            <img src="/wallpdf-logo(1).svg"
              alt="WallPDF"
              className=" w-10 h-10 sm:w-12 sm:h-12 group-hover:scale-105 transition-transform"/>
              <span className="font-bold text-2xl text-slate-900 dark:text-white">
               WallPDF
              </span>
          </a>

          <div className="flex items-center gap-1 sm:gap-4">
            <div className='scale-[0.95] sm:scale-100 '><ThemeToggle /></div>

            {/* Desktop: Profile Dropdown or Sign-in Buttons */}
            <div className="hidden md:flex items-center gap-2">
              {user ? (
                <div className="relative" ref={desktopMenuRef}>
                  <button
                    onClick={() => setProfileMenuOpen(!isProfileMenuOpen)}
                    className="block rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-50 dark:focus:ring-offset-black focus:ring-red-500"
                  >
                    <span className="sr-only">Open user menu</span>
                    <ProfileAvatar name={user.name} picture={user.picture} className="h-8 w-8 text-sm" />
                  </button>
                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 origin-top-right bg-white dark:bg-zinc-900 rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none text-sm">
                      <div className="py-1">
                        <div className="px-4 py-2 border-b border-slate-100 dark:border-zinc-800">
                          <p className="font-semibold text-slate-800 dark:text-white truncate" title={user.name}>{user.name}</p>
                          <p className="text-slate-500 dark:text-zinc-400 truncate" title={user.email}>{user.email}</p>
                        </div>
                        <button
                          onClick={handleLogout}
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
                <div className="relative" ref={mobileMenuRef}>
                  <button
                    onClick={() => setProfileMenuOpen(!isProfileMenuOpen)}
                    className="block rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-50 dark:focus:ring-offset-black focus:ring-red-500"
                  >
                    <span className="sr-only">Open user menu</span>
                    <ProfileAvatar name={user.name} picture={user.picture} className="h-8 w-8 text-sm" />
                  </button>
                  {isProfileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 origin-top-right bg-white dark:bg-zinc-900 rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none text-sm">
                      <div className="py-1">
                        <div className="px-4 py-2 border-b border-slate-100 dark:border-zinc-800">
                          <p className="font-semibold text-slate-800 dark:text-white truncate" title={user.name}>{user.name}</p>
                          <p className="text-slate-500 dark:text-zinc-400 truncate" title={user.email}>{user.email}</p>
                        </div>
                        <button
                          onClick={handleLogout}
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
                  <svg className="h-8 w-8 bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-zinc-200 rounded-full p-1 " viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
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