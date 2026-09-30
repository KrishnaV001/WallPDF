// src/lib/auth/useFirebaseUser.ts
//
// Reads the current Firebase Auth user directly from the SDK, with no
// dependency on React context.
//
// Why this exists instead of just using useAuth() everywhere: Astro mounts
// each `client:only="react"` component as its OWN separate React tree.
// AuthProvider is only mounted once, inside ClientApp (alongside Header, in
// BaseLayout.astro) - it does NOT wrap other islands rendered elsewhere on
// the page, like ToolWorkspace ([tool].astro), WorkflowBuilder
// (workflows.astro), or PricingCards (pricing.astro). Calling useAuth() from
// any of those throws ("must be used within an AuthProvider") because
// there's no Provider anywhere in their tree - it's a different React root
// entirely, not a context boundary that can be bridged with props.
//
// Firebase's onAuthStateChanged, on the other hand, is a plain SDK
// subscription with no React involved at all, so it works identically no
// matter which island calls it. This hook is that subscription wrapped in
// useState/useEffect - the same shape as AuthContext's internal logic,
// intentionally duplicated here rather than shared, so this file has zero
// dependency on the context module and is safe to import from any island.
import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '../../firebase';

export interface FirebaseAppUser {
  uid: string;
  name: string;
  email: string;
  picture: string | null;
}

function mapFirebaseUser(firebaseUser: FirebaseUser): FirebaseAppUser {
  return {
    uid: firebaseUser.uid,
    name: firebaseUser.displayName || 'Anonymous',
    email: firebaseUser.email || '',
    picture: firebaseUser.photoURL || null,
  };
}

export interface UseFirebaseUserResult {
  user: FirebaseAppUser | null;
  loading: boolean;
}

export function useFirebaseUser(): UseFirebaseUserResult {
  const [user, setUser] = useState<FirebaseAppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      setUser(firebaseUser ? mapFirebaseUser(firebaseUser) : null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { user, loading };
}
