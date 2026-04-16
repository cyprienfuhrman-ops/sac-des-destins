// ===== firebase.js — Initialisation Firebase =====
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  enableIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseConfig } from '../firebase-config.js';

// ── Init ──
const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// Persistence offline légère (best-effort)
enableIndexedDbPersistence(db).catch(() => {
  // Ignoré silencieusement — navigation privée ou onglets multiples
});

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
