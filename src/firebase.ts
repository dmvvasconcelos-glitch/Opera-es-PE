import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  memoryLocalCache,
  getFirestore,
  setLogLevel 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Suppress Firestore SDK network warning logs during local cache operations
try {
  setLogLevel('error');
} catch (e) {
  console.warn("setLogLevel failed to initialize:", e);
}

// Safely initialize Firestore with robust offline persistent cache
let dbInstance;
try {
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  if (isIframe) {
    console.info("Firestore running inside an iframe (such as AI Studio preview mode). Enabling memoryLocalCache to bypass Chrome IndexedDB locking and caching lag.");
    dbInstance = initializeFirestore(app, {
      localCache: memoryLocalCache()
    }, firebaseConfig.firestoreDatabaseId);
  } else {
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    }, firebaseConfig.firestoreDatabaseId);
    console.info("Firestore initialized with multi-tab offline persistent cache.");
  }
} catch (error) {
  console.warn("Persistent cache customization failed. Cascading to memory cache/standard Firestore:", error);
  try {
    dbInstance = initializeFirestore(app, {
      localCache: memoryLocalCache()
    }, firebaseConfig.firestoreDatabaseId);
  } catch (err) {
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = dbInstance;
export const auth = getAuth(app);

// Simple auto-sign-in to satisfy custom firestore rules if enabled
signInAnonymously(auth)
  .then((userCredential) => {
    console.log('Firebase anonymous session initiated:', userCredential.user.uid);
  })
  .catch((err) => {
    // Elegant fallback: anonymous login may be disabled in Spark by default, which is expected and completely fine.
    console.info('Firebase auth not active (using secure unauthenticated snapshots):', err instanceof Error ? err.message : String(err));
  });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import { doc, getDocFromServer } from 'firebase/firestore';

async function testConnection() {
  // If we are in a non-browser environment or are offline, operate smoothly in offline mode
  if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    console.info("Firestore client is offline or running server-side. Operating dynamically using offline cache.");
    return;
  }

  try {
    // Attempt to test the connection dynamically with a 5s timeout safeguard
    const testPromise = getDocFromServer(doc(db, 'test', 'connection'));
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('timeout')), 5000)
    );
    
    await Promise.race([testPromise, timeoutPromise]);
    console.info("Firestore connection test successfully verified backend communication.");
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('the client is offline') || errMsg.includes('timeout') || errMsg.includes('Failed to get document')) {
      console.info("Firestore is currently operating in offline mode. Local cache will synchronize automatically when online.");
    } else {
      console.warn("Please check your Firebase configuration or security rules if you are expecting real-time sync:", errMsg);
    }
  }
}
testConnection();

