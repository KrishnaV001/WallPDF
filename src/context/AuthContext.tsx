import React, { createContext, useState, useContext, useEffect, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '../firebase';

interface User {
  uid: string;
  name: string;
  email: string;
  picture: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const mapFirebaseUser = (firebaseUser: FirebaseUser): User => ({
  uid: firebaseUser.uid,
  name: firebaseUser.displayName || 'Anonymous',
  email: firebaseUser.email || '',
  picture: firebaseUser.photoURL || null,
});

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      setLoading(false);
      return;
    }
    // Firebase is the single source of truth for auth state.
    // onAuthStateChanged fires on mount with the current session (restored
    // from Firebase's own persisted storage) and on every subsequent
    // sign-in/sign-out.
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      setUser(firebaseUser ? mapFirebaseUser(firebaseUser) : null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      // onAuthStateChanged will fire and set user to null.
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  // Profile edits (e.g. updateProfile after signup) don't trigger
  // onAuthStateChanged, so callers can invoke this to re-sync context
  // state from the latest auth.currentUser.
  const refreshUser = async () => {
    if (!auth?.currentUser) return;
    await auth.currentUser.reload();
    if (auth.currentUser) {
      setUser(mapFirebaseUser(auth.currentUser));
    }
  };

  const value = { user, loading, logout, refreshUser };

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