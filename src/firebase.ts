import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from 'firebase/auth';
 const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
  measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID,
};
 // console.log('Firebase Config:', firebaseConfig);

// Initialize Firebase
let app: FirebaseApp | null = null;
try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
  console.error('Firebase initialization error:', e); // check this in console
}


let auth: Auth | null;
try {
  auth = app ? getAuth(app) : null;
} catch (e) {
  console.error('Firebase auth initialization error', e);
  auth = null;
}

// Explicitly pin persistence to IndexedDB-backed local storage.
// Without this, the SDK has to resolve which persistence backend to use
// on first access, which can race with an in-flight setCurrentUser write
// (e.g. right after signInWithPopup) and throw the internal
// "Database is closing/hidden" error. Setting this eagerly avoids that race.
if (auth) {
  setPersistence(auth, browserLocalPersistence).catch((e) => {
    console.error('Firebase persistence setup error:', e);
  });
}

// In dev, Vite/Astro HMR can re-run this module while a previous
// onAuthStateChanged listener / IndexedDB connection from the old
// module instance is still alive, which is the other common trigger
// for the same error. Tearing the old auth instance's connections
// down before the new one takes over avoids the two connections
// fighting over the same IndexedDB database.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    auth = null;
    app = null;
  });
}

export { auth };
export default app;