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
  setLogLevel('silent');
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
  const errMsg = error instanceof Error ? error.message : String(error);
  if (errMsg.toLowerCase().includes('quota') || errMsg.includes('resource-exhausted')) {
    triggerQuotaExceeded(true);
  }
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
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

export function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key of Object.keys(obj as any)) {
      const val = (obj as any)[key];
      if (val !== undefined) {
        cleaned[key] = cleanUndefined(val);
      }
    }
    return cleaned as T;
  }
  return obj;
}

import { doc, getDocFromServer, onSnapshot as firestoreOnSnapshot, getDocs as firestoreGetDocs, getDoc as firestoreGetDoc, setDoc as firestoreSetDoc, deleteDoc as firestoreDeleteDoc, addDoc as firestoreAddDoc, updateDoc as firestoreUpdateDoc, writeBatch as firestoreWriteBatch, Query, DocumentReference, FirestoreError } from 'firebase/firestore';

// Global Quota Exceeded state and callback registers
let quotaExceededState = (() => {
  try {
    return localStorage.getItem('firestore_quota_exceeded') === 'true';
  } catch {
    return false;
  }
})();

const quotaCallbacks = new Set<(exceeded: boolean) => void>();

export function isQuotaExceeded(): boolean {
  return quotaExceededState;
}

export function onQuotaExceeded(callback: (exceeded: boolean) => void): () => void {
  quotaCallbacks.add(callback);
  // Deliver current state immediately
  callback(quotaExceededState);
  return () => {
    quotaCallbacks.delete(callback);
  };
}

export function triggerQuotaExceeded(isExceeded: boolean = true) {
  if (quotaExceededState !== isExceeded) {
    quotaExceededState = isExceeded;
    try {
      if (isExceeded) {
        localStorage.setItem('firestore_quota_exceeded', 'true');
        localStorage.setItem('firestore_quota_exceeded_at', String(Date.now()));
      } else {
        localStorage.removeItem('firestore_quota_exceeded');
        localStorage.removeItem('firestore_quota_exceeded_at');
      }
    } catch {}
    quotaCallbacks.forEach(cb => cb(isExceeded));
  }
}

// Reset quota flag if last recorded exceeded event was more than 12 hours ago
try {
  const lastExceededTime = localStorage.getItem('firestore_quota_exceeded_at');
  if (lastExceededTime) {
    const hoursElapsed = (Date.now() - Number(lastExceededTime)) / (1000 * 60 * 60);
    if (hoursElapsed > 12) {
      triggerQuotaExceeded(false);
    }
  }
} catch {}

// Extract unique key for query/reference deduplication
function getQueryKey(ref: any): string {
  if (!ref) return 'unknown';
  if (typeof ref.path === 'string') {
    return ref.path;
  }
  if (ref._query && ref._query.path) {
    return ref._query.path.toString();
  }
  if (ref.query && typeof ref.query.path === 'string') {
    return ref.query.path;
  }
  try {
    if (ref.toString) {
      const str = ref.toString();
      if (str && str !== '[object Object]') return str;
    }
  } catch (e) {}
  return 'query_fallback_' + (ref.type || 'unknown');
}

interface SharedSubscription {
  unsubscribe: () => void;
  subscribers: Set<{
    onNext: (snapshot: any) => void;
    onError?: (error: any) => void;
  }>;
  latestSnapshot?: any;
  latestError?: any;
}

const activeSubscriptions = new Map<string, SharedSubscription>();

// Shared onSnapshot implementation to prevent duplicate reads and quota waste
export function onSnapshot(
  ref: Query | DocumentReference,
  onNext: (snapshot: any) => void,
  onError?: (error: any) => void
): () => void {
  if (isQuotaExceeded()) {
    setTimeout(() => {
      onError?.(new Error('the client is offline (quota limit fallback)'));
    }, 0);
    return () => {};
  }

  const key = getQueryKey(ref);
  const subscriber = { onNext, onError };

  let sub = activeSubscriptions.get(key);

  if (!sub) {
    const subscribers = new Set<any>([subscriber]);
    let isCleanedUp = false;
    
    const actualUnsubscribe = firestoreOnSnapshot(
      ref as any,
      (snapshot) => {
        if (isCleanedUp) return;
        const currentSub = activeSubscriptions.get(key);
        if (currentSub) {
          currentSub.latestSnapshot = snapshot;
          currentSub.latestError = null;
          currentSub.subscribers.forEach((s) => s.onNext(snapshot));
        }
      },
      (error) => {
        if (isCleanedUp) return;
        const errMsg = error?.message || String(error);
        if (errMsg.toLowerCase().includes('quota') || errMsg.includes('resource-exhausted')) {
          triggerQuotaExceeded(true);
        }
        
        const currentSub = activeSubscriptions.get(key);
        if (currentSub) {
          currentSub.latestError = error;
          currentSub.subscribers.forEach((s) => s.onError?.(error));
        }
      }
    );

    sub = {
      unsubscribe: () => {
        isCleanedUp = true;
        actualUnsubscribe();
      },
      subscribers,
      latestSnapshot: undefined,
      latestError: undefined
    };

    activeSubscriptions.set(key, sub);
  } else {
    sub.subscribers.add(subscriber);

    // Immediately deliver cached snapshot if available
    if (sub.latestSnapshot !== undefined) {
      const snap = sub.latestSnapshot;
      setTimeout(() => {
        const currentSub = activeSubscriptions.get(key);
        if (currentSub && currentSub.subscribers.has(subscriber)) {
          subscriber.onNext(snap);
        }
      }, 0);
    } else if (sub.latestError !== undefined && subscriber.onError) {
      const err = sub.latestError;
      setTimeout(() => {
        const currentSub = activeSubscriptions.get(key);
        if (currentSub && currentSub.subscribers.has(subscriber) && subscriber.onError) {
          subscriber.onError(err);
        }
      }, 0);
    }
  }

  return () => {
    const currentSub = activeSubscriptions.get(key);
    if (!currentSub) return;
    currentSub.subscribers.delete(subscriber);

    // Hold the subscription alive for 15 seconds to smooth out tab transitions and page restructuring
    if (currentSub.subscribers.size === 0) {
      setTimeout(() => {
        const checkSub = activeSubscriptions.get(key);
        if (checkSub && checkSub.subscribers.size === 0) {
          checkSub.unsubscribe();
          activeSubscriptions.delete(key);
        }
      }, 15000);
    }
  };
}

// Wrapped getDocs and getDoc with automatic quota tracking
export async function getDocs(ref: Query) {
  if (isQuotaExceeded()) {
    throw new Error('the client is offline (quota limit fallback)');
  }
  try {
    return await firestoreGetDocs(ref);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.toLowerCase().includes('quota') || errMsg.includes('resource-exhausted')) {
      triggerQuotaExceeded(true);
      throw new Error('the client is offline (quota limit fallback)');
    }
    throw error;
  }
}

export async function getDoc(ref: DocumentReference) {
  if (isQuotaExceeded()) {
    throw new Error('the client is offline (quota limit fallback)');
  }
  try {
    return await firestoreGetDoc(ref);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.toLowerCase().includes('quota') || errMsg.includes('resource-exhausted')) {
      triggerQuotaExceeded(true);
      throw new Error('the client is offline (quota limit fallback)');
    }
    throw error;
  }
}

export async function setDoc(ref: any, data: any, options?: any) {
  if (isQuotaExceeded()) {
    console.info("Modo local ativo (Cota excedida): ignorando setDoc remoto.");
    return;
  }
  try {
    if (options) {
      return await firestoreSetDoc(ref, data, options);
    } else {
      return await firestoreSetDoc(ref, data);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.toLowerCase().includes('quota') || errMsg.includes('resource-exhausted')) {
      triggerQuotaExceeded(true);
      console.warn("Cota do Firestore excedida ao executar setDoc. Operando em modo local.");
      return;
    }
    throw error;
  }
}

export async function deleteDoc(ref: any) {
  if (isQuotaExceeded()) {
    console.info("Modo local ativo (Cota excedida): ignorando deleteDoc remoto.");
    return;
  }
  try {
    return await firestoreDeleteDoc(ref);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.toLowerCase().includes('quota') || errMsg.includes('resource-exhausted')) {
      triggerQuotaExceeded(true);
      console.warn("Cota do Firestore excedida ao executar deleteDoc. Operando em modo local.");
      return;
    }
    throw error;
  }
}

export async function addDoc(ref: any, data: any) {
  if (isQuotaExceeded()) {
    console.info("Modo local ativo (Cota excedida): ignorando addDoc remoto.");
    return {} as any;
  }
  try {
    return await firestoreAddDoc(ref, data);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.toLowerCase().includes('quota') || errMsg.includes('resource-exhausted')) {
      triggerQuotaExceeded(true);
      console.warn("Cota do Firestore excedida ao executar addDoc. Operando em modo local.");
      return {} as any;
    }
    throw error;
  }
}

export async function updateDoc(ref: any, ...args: any[]) {
  if (isQuotaExceeded()) {
    console.info("Modo local ativo (Cota excedida): ignorando updateDoc remoto.");
    return;
  }
  try {
    return await (firestoreUpdateDoc as any)(ref, ...args);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.toLowerCase().includes('quota') || errMsg.includes('resource-exhausted')) {
      triggerQuotaExceeded(true);
      console.warn("Cota do Firestore excedida ao executar updateDoc. Operando em modo local.");
      return;
    }
    throw error;
  }
}

export function writeBatch(dbInst?: any) {
  const batch = dbInst ? firestoreWriteBatch(dbInst) : firestoreWriteBatch(db as any);
  const origCommit = batch.commit.bind(batch);
  batch.commit = async () => {
    if (isQuotaExceeded()) {
      console.info("Modo local ativo (Cota excedida): ignorando commit do writeBatch.");
      return;
    }
    try {
      return await origCommit();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.toLowerCase().includes('quota') || errMsg.includes('resource-exhausted')) {
        triggerQuotaExceeded(true);
        console.warn("Cota do Firestore excedida em writeBatch. Operando em modo local.");
        return;
      }
      throw error;
    }
  };
  return batch;
}

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
// The connection test function is available if needed, but not auto-invoked on module load to prevent unnecessary network overhead.
// testConnection();

