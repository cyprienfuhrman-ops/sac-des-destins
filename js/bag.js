// ===== bag.js — Logique du Sac =====
// Gestion du sac (tirage, état, réinitialisation, calcul des résultats)

/**
 * Crée un sac vierge de 100 jetons (5 rouges, 95 ordinaires).
 * Les rouges sont représentés par leur VALEUR dans le tableau tokens,
 * et leur INDEX est stocké séparément dans redIndexes pour calcul tension.
 */
export function createFreshBag() {
  // Génère [1..100] et mélange (Fisher-Yates)
  const tokens = Array.from({ length: 100 }, (_, i) => i + 1);
  shuffle(tokens);

  // Les 5 premiers indices après mélange deviennent "rouges"
  // (leur numéro est quelconque — ce qui compte c'est leur position dans le sac)
  const redPositions = [0, 1, 2, 3, 4];

  return {
    tokens,            // Tableau mélangé des 100 jetons restants
    redPositions,      // Index dans tokens[] qui sont des jetons rouges
    drawn: [],         // Jetons ordinaires tirés
    drawnRed: [],      // Jetons rouges tirés (leurs valeurs)
    totalCount: 100,
    injectedCount: 0,
  };
}

/** Mélange en place (Fisher-Yates) */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Simule un tirage atomique côté client (pour affichage optimiste).
 * Le vrai tirage passe par une transaction Firestore dans room.js.
 * Retourne { token, isRed, newBag }
 */
export function drawFromBag(bag) {
  if (bag.tokens.length === 0) return null;

  // Le premier jeton du tableau (aléatoire car le sac est mélangé)
  const tokenIndex = 0;
  const token = bag.tokens[0];
  const isRed = bag.redPositions.includes(tokenIndex);

  const newTokens = bag.tokens.slice(1);
  // Recalcule les positions rouges : celles qui étaient après l'index 0
  const newRedPositions = bag.redPositions
    .filter(p => p !== 0)
    .map(p => p - 1);

  const newBag = {
    tokens: newTokens,
    redPositions: newRedPositions,
    drawn: isRed ? bag.drawn : [...bag.drawn, token],
    drawnRed: isRed ? [...bag.drawnRed, token] : bag.drawnRed,
    totalCount: bag.totalCount,
    injectedCount: bag.injectedCount,
  };

  return { token, isRed, newBag };
}

/**
 * Injecte un jeton ordinaire du sac MJ vers le sac joueurs.
 * Retourne le jeton injecté ou null si impossible.
 */
export function injectToken(gmBag, playerBag) {
  // Prend le dernier jeton ordinaire disponible dans le sac MJ
  const availableOrdinary = gmBag.tokens.filter((_, i) => !gmBag.redPositions.includes(i));
  if (availableOrdinary.length === 0) return null;
  if (playerBag.injectedCount >= 3) return null;

  const tokenVal = availableOrdinary[0];
  // Retire du sac MJ
  const idx = gmBag.tokens.indexOf(tokenVal);

  const newGmTokens = [...gmBag.tokens];
  newGmTokens.splice(idx, 1);
  const newGmRed = gmBag.redPositions
    .filter(p => p !== idx)
    .map(p => p > idx ? p - 1 : p);

  const newGmBag = { ...gmBag, tokens: newGmTokens, redPositions: newGmRed };

  // Ajoute dans le sac joueurs à une position aléatoire
  const insertAt = Math.floor(Math.random() * (playerBag.tokens.length + 1));
  const newPlayerTokens = [...playerBag.tokens];
  newPlayerTokens.splice(insertAt, 0, tokenVal);
  // Décale les positions rouges qui sont après insertAt
  const newPlayerRed = playerBag.redPositions.map(p => p >= insertAt ? p + 1 : p);

  const newPlayerBag = {
    ...playerBag,
    tokens: newPlayerTokens,
    redPositions: newPlayerRed,
    injectedCount: playerBag.injectedCount + 1,
  };

  return { tokenVal, newGmBag, newPlayerBag };
}

/**
 * Calcule le résultat d'un tirage selon les règles.
 * score    : score effectif (après modificateurs)
 * token    : valeur du jeton tiré (1–100)
 * isRed    : vrai si jeton rouge
 * Returns "critical_success" | "success" | "failure" | "critical_failure" | "auto_failure"
 */
export function calcResult(score, token, isRed) {
  // Jeton 100 = échec automatique quelle que soit la comp
  if (token === 100) return 'auto_failure';

  const critThreshold = Math.floor(score / 2);

  if (token <= critThreshold)                         return 'critical_success';
  if (token <= score)                                 return 'success';
  if (token > score && token <= (100 - critThreshold)) return 'failure';
  return 'critical_failure';
}

/** Label affiché pour le résultat */
export const RESULT_LABELS = {
  critical_success: 'Succès Critique',
  success:          'Succès',
  failure:          'Échec',
  critical_failure: 'Échec Critique',
  auto_failure:     'Échec Automatique',
};

/** CSS class pour le résultat */
export const RESULT_CLASSES = {
  critical_success: 'result-label--critical-success',
  success:          'result-label--success',
  failure:          'result-label--failure',
  critical_failure: 'result-label--critical-failure',
  auto_failure:     'result-label--auto-failure',
};

/** History item CSS class */
export const HISTORY_CLASSES = {
  critical_success: 'history-item--critical-success',
  success:          'history-item--success',
  failure:          'history-item--failure',
  critical_failure: 'history-item--critical-failure',
  auto_failure:     'history-item--auto-failure',
};

/**
 * Calcule la "tension" du sac : ratio 0–1 représentant la probabilité
 * que des jetons rouges soient encore présents ET que le sac soit à moitié vide.
 */
export function calcTension(bag) {
  const remaining = bag.tokens.length;
  const totalRed = 5;
  const drawnRed = bag.drawnRed.length;
  const redLeft = totalRed - drawnRed;

  if (remaining === 0 || redLeft === 0) return 0;

  // Probabilité qu'un prochain tirage soit rouge
  const pRed = redLeft / remaining;
  // Facteur d'avancement (monte quand le sac se vide)
  const depletion = 1 - (remaining / bag.totalCount);

  return Math.min(1, pRed * 2 + depletion * 0.4);
}

/** Couleur de la barre de tension selon valeur 0–1 */
export function tensionColor(t) {
  if (t < 0.25) return '#4a7c59'; // vert
  if (t < 0.55) return '#c8922a'; // or
  if (t < 0.75) return '#c85a1a'; // orange
  return '#8b1a1a';               // rouge
}

/** Couleur de la barre HP selon ratio 0–1 */
export function hpColor(ratio) {
  if (ratio > 0.6) return '#4a7c59';
  if (ratio > 0.3) return '#c8922a';
  return '#8b1a1a';
}

/**
 * Calcule l'état de santé selon les règles.
 * pcCurrent / pcMax
 */
export function healthState(current, max) {
  if (current <= 0)                             return { label: 'Mort',           color: '#4a3030', malus: null };
  const r = current / max;
  if (r >= 1)                                   return { label: 'Intact',          color: '#4a7c59', malus: null };
  if (r >= 0.75)                                return { label: 'Blessé léger',    color: '#6aac79', malus: '-5%' };
  if (r >= 0.5)                                 return { label: 'Blessé',          color: '#c8a22a', malus: '-15%' };
  if (r >= 0.25)                                return { label: 'Grave',           color: '#c85a1a', malus: '-30%' };
  if (r > 0)                                    return { label: 'Critique',        color: '#8b1a1a', malus: '-50%' };
  return                                               { label: 'Mourant',         color: '#5a1a1a', malus: 'Incapacité' };
}

/** Labels du moral */
export const MORALE_DATA = [
  { label: 'Mutin',    color: '#8b1a1a', effect: 'Désobéissance possible, tirs amis', risk: 'Risque de mutinerie immédiate' },
  { label: 'Méfiant',  color: '#c85a1a', effect: '-20% à tous les jets de groupe',     risk: 'Risque de désertion sous pression' },
  { label: 'Neutre',   color: '#c8a22a', effect: 'Aucun modificateur',                 risk: null },
  { label: 'Loyal',    color: '#6aac79', effect: '+5% aux jets de groupe',             risk: null },
  { label: 'Fanatique',color: '#c8922a', effect: '+15%, immunité moral négatif',       risk: null },
];

/** Labels des statuts de réputation */
export function reputationStatus(score) {
  if (score <= -50)  return { label: 'Ennemi',    color: '#8b1a1a' };
  if (score <= -20)  return { label: 'Hostile',   color: '#c85a1a' };
  if (score <= 20)   return { label: 'Neutre',    color: '#9a8a72' };
  if (score <= 60)   return { label: 'Favorable', color: '#6aac79' };
  return                    { label: 'Allié',     color: '#c8922a' };
}

/** Génère un ID de room court (format XXX-XXX) */
export function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part(3)}-${part(3)}`;
}

/** Génère un ID de personnage unique */
export function generateCharId() {
  return 'char_' + Math.random().toString(36).slice(2, 10);
}

/** Formate un timestamp Firestore en HH:MM */
export function fmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Formate un résultat pour l'historique */
export function fmtResult(result) {
  return RESULT_LABELS[result] || result;
}
