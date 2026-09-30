import React, { useState } from 'react';
import { useFirebaseUser } from '../lib/auth/useFirebaseUser';
import { usePlan } from '../lib/plan/usePlan';
import { startCheckoutSession } from '../lib/stripe/checkout';

// Price IDs come from your own Stripe Dashboard + the Firebase Stripe
// extension's product sync (see SETUP.md). Reading them from env vars keeps
// this component free of hardcoded IDs that would only work in one Stripe
// account.
const MONTHLY_PRICE_ID = import.meta.env.PUBLIC_STRIPE_PRICE_MONTHLY as string | undefined;
const YEARLY_PRICE_ID = import.meta.env.PUBLIC_STRIPE_PRICE_YEARLY as string | undefined;

const FREE_FEATURES = [
  'Every single-file PDF tool, unlimited use',
  'Batch runs up to 3 files at a time',
  'Build & run workflows up to 2 steps',
  '100% private - nothing leaves your browser',
];

const PREMIUM_FEATURES = [
  'Everything in Free',
  'Batch runs across unlimited files',
  'Unlimited workflow steps',
  'Save workflows to your account and re-run them anytime',
  'Priority support',
];

export const PricingCards: React.FC = () => {
  const { user } = useFirebaseUser();
  const { isPremium, loading } = usePlan();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceId = billingCycle === 'monthly' ? MONTHLY_PRICE_ID : YEARLY_PRICE_ID;

  const handleUpgrade = async () => {
    setError(null);

    if (!user) {
      setError('Sign in first, then come back here to upgrade.');
      return;
    }
    if (!priceId) {
      setError('This deployment hasn\u2019t configured Stripe price IDs yet (PUBLIC_STRIPE_PRICE_MONTHLY / PUBLIC_STRIPE_PRICE_YEARLY). See SETUP.md.');
      return;
    }

    setIsRedirecting(true);
    try {
      await startCheckoutSession({ uid: user.uid, priceId, mode: 'subscription' });
      // On success, startCheckoutSession redirects the browser away from this
      // page itself, so there's nothing further to do here.
    } catch (err: any) {
      setError(err?.message || 'Could not start checkout.');
      setIsRedirecting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <div className="text-center space-y-3 mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">Simple, honest pricing</h1>
        <p className="text-slate-500 dark:text-zinc-400 max-w-xl mx-auto">
          Every tool works free, forever. Premium is for people who want to process a lot of files at once,
          or automate a repeatable sequence of steps.
        </p>
      </div>

      {isPremium && !loading && (
        <div className="max-w-md mx-auto mb-8 text-center text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl py-2.5 px-4">
          You're on Premium \u2014 thanks for supporting WallPDF!
        </div>
      )}

      <div className="flex items-center justify-center gap-2 mb-8">
        <button
          type="button"
          onClick={() => setBillingCycle('monthly')}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
            billingCycle === 'monthly'
              ? 'bg-[#E5252A] text-white border-[#E5252A]'
              : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-800'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setBillingCycle('yearly')}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
            billingCycle === 'yearly'
              ? 'bg-[#E5252A] text-white border-[#E5252A]'
              : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-800'
          }`}
        >
          Yearly <span className="opacity-75">(save ~20%)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Free</h3>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mb-4">$0</p>
          <ul className="space-y-2.5 mb-6">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-zinc-300">
                <svg className="w-4 h-4 text-slate-400 dark:text-zinc-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
          <div className="w-full py-2.5 px-4 text-center text-sm font-semibold text-slate-400 dark:text-zinc-500 bg-slate-50 dark:bg-zinc-800 rounded-xl">
            Your current plan
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900/50 border-2 border-[#E5252A] rounded-2xl p-6 sm:p-8 relative">
          <span className="absolute -top-3 left-6 bg-[#E5252A] text-white text-[11px] font-bold px-3 py-1 rounded-full">
            RECOMMENDED
          </span>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Premium</h3>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
            {billingCycle === 'monthly' ? '$6' : '$58'}
            <span className="text-sm font-medium text-slate-400 dark:text-zinc-500"> /{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
          </p>
          <ul className="space-y-2.5 mb-6">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-zinc-300">
                <svg className="w-4 h-4 text-[#E5252A] mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={isRedirecting || isPremium}
            className="w-full py-2.5 px-4 bg-[#E5252A] hover:bg-[#C51920] disabled:opacity-60 text-white font-semibold text-sm rounded-xl shadow-md transition-all active:scale-[0.99]"
          >
            {isPremium ? 'Already Premium' : isRedirecting ? 'Redirecting to Stripe...' : 'Upgrade to Premium'}
          </button>
          {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-3">{error}</p>}
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-zinc-500 mt-8">
        Prices shown are placeholders \u2014 set your real Stripe prices, then update them here and in your Stripe Dashboard.
      </p>
    </div>
  );
};
