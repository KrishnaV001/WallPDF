// src/lib/stripe/checkout.ts
//
// Starts a Stripe Checkout session using the Firestore convention documented
// by Firebase's official "Run Subscription Payments with Stripe" extension
// (github.com/invertase/stripe-firebase-extensions):
//
//   1. Client writes a new doc to customers/{uid}/checkout_sessions with the
//      price ID and redirect URLs.
//   2. The extension's Cloud Function trigger (which runs in YOUR Firebase
//      project once the extension is installed) picks it up, creates a real
//      Stripe Checkout Session, and writes `url` (and `sessionId`) back onto
//      that same document.
//   3. The client listens for `url` to appear and redirects the browser.
//
// This file only does step 1 and 3 - the client side. Step 2 is the
// extension's job and only exists once you've installed it against your own
// Firebase + Stripe accounts. Until then, writing this doc will just sit
// there with no `url` ever appearing (harmless, but non-functional) - see
// SETUP.md for the install steps this depends on.
import { addDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

export interface StartCheckoutOptions {
  uid: string;
  /** A Stripe Price ID (e.g. "price_123..."), created in your Stripe
   * Dashboard and synced into Firestore by the extension. */
  priceId: string;
  mode?: 'subscription' | 'payment';
  successUrl?: string;
  cancelUrl?: string;
}

/**
 * Kicks off Checkout and resolves once Stripe's hosted page is ready,
 * redirecting the browser there. Rejects if the extension never populates a
 * `url` (e.g. because it isn't installed) within `timeoutMs`.
 */
export function startCheckoutSession(options: StartCheckoutOptions, timeoutMs = 15000): Promise<void> {
  const { uid, priceId, mode = 'subscription', successUrl, cancelUrl } = options;

  if (!db) {
    return Promise.reject(new Error('Firestore is not initialized - check your Firebase config.'));
  }

  return new Promise((resolve, reject) => {
    const checkoutSessionsRef = collection(db!, 'customers', uid, 'checkout_sessions');

    let unsubscribe: (() => void) | null = null;
    const timeout = setTimeout(() => {
      unsubscribe?.();
      reject(new Error(
        'Checkout session was created but never got a URL back. This usually means the ' +
        'Stripe extension isn\u2019t installed/configured yet - see SETUP.md.'
      ));
    }, timeoutMs);

    addDoc(checkoutSessionsRef, {
      price: priceId,
      mode,
      success_url: successUrl ?? `${window.location.origin}/pricing?checkout=success`,
      cancel_url: cancelUrl ?? `${window.location.origin}/pricing?checkout=cancelled`,
    })
      .then((docRef) => {
        unsubscribe = onSnapshot(docRef, (snap) => {
          const data = snap.data();
          if (data?.error) {
            clearTimeout(timeout);
            unsubscribe?.();
            reject(new Error(data.error.message || 'Stripe Checkout could not be started.'));
          }
          if (data?.url) {
            clearTimeout(timeout);
            unsubscribe?.();
            window.location.assign(data.url as string);
            resolve();
          }
        });
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}
