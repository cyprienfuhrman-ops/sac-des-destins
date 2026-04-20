// ===== room.js — Gestion Firestore de la session =====
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  runTransaction,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, getCurrentUser } from './firebase.js';
import {
  createFreshBag,
  calcResult,
  calcTension,
  generateCharId,
} from './bag.js';

// ── État local ──
let roomId = null;
let roomData = null;
let unsubRoom = null;
let changeCallbacks = [];

export function getRoomData() { return roomData; }
export function getRoomId()   { return roomId; }

/** Abonne un callback aux changements temps réel */
export function onRoomChange(cb) {
  changeCallbacks.push(cb);
}

/** Initialise l'écoute Firestore d'une room */
export function listenRoom(id) {
  roomId = id;
  if (unsubRoom) unsubRoom();
  const ref = doc(db, 'rooms', id);
  unsubRoom = onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      roomData = snap.data();
      changeCallbacks.forEach(cb => cb(roomData));
    }
  });
  return unsubRoom;
}

/** Vérifie qu'une room existe */
export async function roomExists(id) {
  const snap = await getDoc(doc(db, 'rooms', id));
  return snap.exists();
}

/** Crée une nouvelle room */
export async function createRoom(id, gmName, sessionName) {
  const user = getCurrentUser();
  const freshPlayer = createFreshBag();
  const freshGm     = createFreshBag();

  const data = {
    createdAt:    serverTimestamp(),
    gmUid:        user.uid,
    name:         sessionName,
    playerBag:    freshPlayer,
    gmBag:        freshGm,
    drawHistory:  [],
    characters:   {},
    groupMorale:  3,
    currentScene: '',
    connectedUsers: {
      [user.uid]: { name: gmName, role: 'gm', lastSeen: serverTimestamp() }
    }
  };
  await setDoc(doc(db, 'rooms', id), data);
  return data;
}

/** Rejoint une room (met à jour la présence) */
export async function joinRoom(id, playerName) {
  const user = getCurrentUser();
  const ref = doc(db, 'rooms', id);
  await updateDoc(ref, {
    [`connectedUsers.${user.uid}`]: {
      name:     playerName,
      role:     'player',
      lastSeen: serverTimestamp(),
    }
  });
}

/** Mise à jour heartbeat (lastSeen) */
export async function heartbeat() {
  if (!roomId) return;
  const user = getCurrentUser();
  await updateDoc(doc(db, 'rooms', roomId), {
    [`connectedUsers.${user.uid}.lastSeen`]: serverTimestamp(),
  });
}

/**
 * Tire un jeton du sac joueurs.
 * Transaction atomique pour éviter les conflits.
 */
export async function drawPlayerToken(drawData) {
  const { actorName, skillName, skillScore, note } = drawData;
  const ref = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room introuvable');

    const data = snap.data();
    const bag  = data.playerBag;

    if (!bag.tokens || bag.tokens.length === 0) {
      throw new Error('Le sac est vide !');
    }

    // Tire le premier jeton (le sac est déjà mélangé)
    const token = bag.tokens[0];
    const isRed = (bag.redPositions || []).includes(0);

    const newTokens      = bag.tokens.slice(1);
    const newRedPos      = (bag.redPositions || [])
      .filter(p => p !== 0)
      .map(p => p - 1);
    const newDrawn       = isRed ? bag.drawn       : [...(bag.drawn    || []), token];
    const newDrawnRed    = isRed ? [...(bag.drawnRed || []), token] : (bag.drawnRed || []);

    const effectiveScore = Math.max(1, Math.min(99, skillScore));
    const result         = calcResult(effectiveScore, token, isRed);

    const histEntry = {
      at:         Timestamp.now(),
      bagType:    'player',
      token,
      isRed,
      actorName,
      skillName,
      skillScore: effectiveScore,
      result,
      note: note || '',
    };

    const currentHistory = data.drawHistory || [];
    const newHistory = [histEntry, ...currentHistory].slice(0, 20);

    tx.update(ref, {
      'playerBag.tokens':      newTokens,
      'playerBag.redPositions': newRedPos,
      'playerBag.drawn':        newDrawn,
      'playerBag.drawnRed':     newDrawnRed,
      drawHistory: newHistory,
    });

    return { token, isRed, result, histEntry };
  });
}

/**
 * Tire un jeton du sac MJ.
 */
export async function drawGmToken(drawData) {
  const { actorName, skillName, skillScore, note } = drawData;
  const ref = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room introuvable');

    const data = snap.data();
    const bag  = data.gmBag;

    if (!bag.tokens || bag.tokens.length === 0) {
      throw new Error('Le sac MJ est vide !');
    }

    const token  = bag.tokens[0];
    const isRed  = (bag.redPositions || []).includes(0);

    const newTokens   = bag.tokens.slice(1);
    const newRedPos   = (bag.redPositions || [])
      .filter(p => p !== 0)
      .map(p => p - 1);
    const newDrawn    = isRed ? bag.drawn    : [...(bag.drawn    || []), token];
    const newDrawnRed = isRed ? [...(bag.drawnRed || []), token] : (bag.drawnRed || []);

    const effectiveScore = Math.max(1, Math.min(99, skillScore));
    const result = calcResult(effectiveScore, token, isRed);

    const histEntry = {
      at:         Timestamp.now(),
      bagType:    'gm',
      token,
      isRed,
      actorName,
      skillName,
      skillScore: effectiveScore,
      result,
      note: note || '',
    };

    const currentHistory = data.drawHistory || [];
    const newHistory = [histEntry, ...currentHistory].slice(0, 20);

    tx.update(ref, {
      'gmBag.tokens':       newTokens,
      'gmBag.redPositions': newRedPos,
      'gmBag.drawn':        newDrawn,
      'gmBag.drawnRed':     newDrawnRed,
      drawHistory: newHistory,
    });

    return { token, isRed, result, histEntry };
  });
}

/** Réinitialise le sac joueurs */
export async function resetPlayerBag(justification) {
  const freshBag = createFreshBag();
  await updateDoc(doc(db, 'rooms', roomId), {
    playerBag: freshBag,
    drawHistory: arrayUnion({
      at:         Timestamp.now(),
      bagType:    'player',
      token:      null,
      isRed:      false,
      actorName:  'MJ',
      skillName:  'Réinitialisation',
      skillScore: 0,
      result:     'reset',
      note:       justification,
    })
  });
}

/** Réinitialise le sac MJ */
export async function resetGmBag() {
  const freshBag = createFreshBag();
  await updateDoc(doc(db, 'rooms', roomId), { gmBag: freshBag });
}

/** Injecte un jeton MJ → sac joueurs */
export async function injectGmToken() {
  const ref = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room introuvable');

    const data = snap.data();
    const gmBag     = data.gmBag;
    const playerBag = data.playerBag;

    if ((playerBag.injectedCount || 0) >= 3) {
      throw new Error('Maximum 3 injections par scène atteint');
    }

    // Prend un jeton ordinaire du sac MJ
    const ordinaryIdx = gmBag.tokens.findIndex(
      (_, i) => !(gmBag.redPositions || []).includes(i)
    );
    if (ordinaryIdx === -1) throw new Error('Aucun jeton ordinaire dans le sac MJ');

    const tokenVal = gmBag.tokens[ordinaryIdx];

    // Retire du sac MJ
    const newGmTokens = [...gmBag.tokens];
    newGmTokens.splice(ordinaryIdx, 1);
    const newGmRed = (gmBag.redPositions || [])
      .filter(p => p !== ordinaryIdx)
      .map(p => p > ordinaryIdx ? p - 1 : p);

    // Insère dans le sac joueurs à position aléatoire
    const insertAt = Math.floor(Math.random() * (playerBag.tokens.length + 1));
    const newPlayerTokens = [...playerBag.tokens];
    newPlayerTokens.splice(insertAt, 0, tokenVal);
    const newPlayerRed = (playerBag.redPositions || []).map(p => p >= insertAt ? p + 1 : p);

    tx.update(ref, {
      'gmBag.tokens':          newGmTokens,
      'gmBag.redPositions':    newGmRed,
      'playerBag.tokens':      newPlayerTokens,
      'playerBag.redPositions': newPlayerRed,
      'playerBag.injectedCount': (playerBag.injectedCount || 0) + 1,
    });

    return tokenVal;
  });
}

/** Met à jour la scène courante (réinitialise injectedCount) */
export async function setScene(text) {
  await updateDoc(doc(db, 'rooms', roomId), {
    currentScene: text,
    'playerBag.injectedCount': 0,
  });
}

/** Met à jour le moral du groupe */
export async function setMorale(value) {
  const clamped = Math.max(1, Math.min(5, value));
  await updateDoc(doc(db, 'rooms', roomId), { groupMorale: clamped });
}

/** Ajoute un personnage */
export async function addCharacter(charData) {
  const charId = generateCharId();
  const char = {
    name:      charData.name,
    playerUid: getCurrentUser().uid,
    playerName: charData.playerName || '',
    pcMax:     charData.pcMax,
    pcCurrent: charData.pcMax,
    reputations: [],
  };
  await updateDoc(doc(db, 'rooms', roomId), {
    [`characters.${charId}`]: char,
  });
  return charId;
}

/** Met à jour les PC d'un personnage */
export async function updateCharacterHP(charId, delta) {
  const ref = doc(db, 'rooms', roomId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const char = data.characters[charId];
    if (!char) throw new Error('Personnage introuvable');
    const newHp = Math.max(0, Math.min(char.pcMax, char.pcCurrent + delta));
    tx.update(ref, { [`characters.${charId}.pcCurrent`]: newHp });
    return newHp;
  });
}

/** Met à jour une réputation */
export async function updateReputation(charId, factionIndex, delta) {
  const ref = doc(db, 'rooms', roomId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const char = data.characters[charId];
    if (!char) throw new Error('Personnage introuvable');
    const reps = [...(char.reputations || [])];
    if (!reps[factionIndex]) throw new Error('Faction introuvable');
    reps[factionIndex] = {
      ...reps[factionIndex],
      score: Math.max(-100, Math.min(100, reps[factionIndex].score + delta))
    };
    tx.update(ref, { [`characters.${charId}.reputations`]: reps });
  });
}

/** Ajoute une faction à un personnage */
export async function addFaction(charId, factionName) {
  await updateDoc(doc(db, 'rooms', roomId), {
    [`characters.${charId}.reputations`]: arrayUnion({ factionName, score: 0 })
  });
}
