// ===== firebase.js — Initialisation Firebase =====
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  memoryLocalCache,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseConfig } from '../firebase-config.js';

// ── Init ──
const app = initializeApp(firebaseConfig);

// Persistence locale (best-effort — désactivée en navigation privée ou multi-onglets)
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache() });
} catch {
  db = initializeFirestore(app, { localCache: memoryLocalCache() });
}
export { db };

export const auth = getAuth(app);

// ── Auth anonyme ──
let currentUser = null;

export function getCurrentUser() { return currentUser; }

export async function ensureAuth() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (user) {
        currentUser = user;
        resolve(user);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          currentUser = cred.user;
          resolve(cred.user);
        } catch (e) {
          reject(e);
        }
      }
    });
  });
}
