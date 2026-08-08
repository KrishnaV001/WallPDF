import React, { createContext, useState, useContext, useEffect, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '../firebase';

interface User {
  uid: string;
  name: string;
  email: string;
  picture: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'wallpdf_cached_user';

const getCachedUser = (): User | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Seed initial state from cache so there's no logged-out flash on refresh
  const [user, setUser] = useState<User | null>(() => getCachedUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const mapped: User = {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || 'Anonymous',
          email: firebaseUser.email || '',
          picture: firebaseUser.photoURL || `https://avatar.vercel.sh/${firebaseUser.uid}.png`,
        };
        setUser(mapped);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
      } else {
        setUser(null);
        localStorage.removeItem(STORAGE_KEY);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const value = { user, loading, logout };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};