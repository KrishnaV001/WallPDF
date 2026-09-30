// src/lib/plan/usePlan.ts
//
// Reads the signed-in user's plan. This follows the Firestore convention
// used by Firebase's official "Run Subscription Payments with Stripe"
// extension: once installed and configured with your own Stripe account, the
// extension mirrors each customer's subscriptions into
//   customers/{uid}/subscriptions/{subscriptionId}
// with a `status` field ('active' | 'trialing' | 'past_due' | 'canceled' |
// ...). We treat 'active' or 'trialing' as premium.
//
// IMPORTANT: this hook only reflects reality once you've actually installed
// that extension (or written an equivalent Cloud Function) against your own
// Firebase + Stripe accounts - see SETUP.md. Until then every user reads as
// 'free', which is the correct safe default: nobody gets premium features
// for free just because this code exists.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useFirebaseUser } from '../auth/useFirebaseUser';
import type { Plan } from './types';
import { limitsFor, type PlanLimits } from './types';

export interface UsePlanResult {
  plan: Plan;
  limits: PlanLimits;
  isPremium: boolean;
  /** True while we're waiting on auth state or the first Firestore read. */
  loading: boolean;
}

const ACTIVE_STATUSES = ['active', 'trialing'];

export function usePlan(): UsePlanResult {
  const { user, loading: authLoading } = useFirebaseUser();
  const [plan, setPlan] = useState<Plan>('free');
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setPlan('free');
      setSubLoading(false);
      return;
    }

    setSubLoading(true);
    const subsRef = collection(db, 'customers', user.uid, 'subscriptions');
    const activeSubsQuery = query(subsRef, where('status', 'in', ACTIVE_STATUSES));

    const unsubscribe = onSnapshot(
      activeSubsQuery,
      (snapshot) => {
        setPlan(snapshot.empty ? 'free' : 'premium');
        setSubLoading(false);
      },
      (err) => {
        // Most likely cause: the Stripe extension isn't installed yet, so
        // this collection doesn't exist / rules reject the read. Fail safe
        // to 'free' rather than throwing.
        console.warn('[usePlan] could not read subscription status, defaulting to free plan:', err);
        setPlan('free');
        setSubLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const loading = authLoading || subLoading;

  return {
    plan,
    limits: limitsFor(plan),
    isPremium: plan === 'premium',
    loading,
  };
}
