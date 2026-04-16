// ===== main-room.js — Orchestration de la page session =====
import { ensureAuth, getCurrentUser } from './firebase.js';
import {
  listenRoom,
  getRoomData,
  getRoomId,
  onRoomChange,
  drawPlayerToken,
  drawGmToken,
  resetPlayerBag,
  resetGmBag,
  injectGmToken,
  setScene,
  setMorale,
  addCharacter,
  updateCharacterHP,
  updateReputation,
  addFaction,
  heartbeat,
} from './room.js';
import {
  renderHeader,
  renderPlayerBag,
  renderGmBag,
  renderDrawResult,
  renderHistory,
  renderCharacters,
  renderMorale,
  renderScene,
  renderReputations,
  showToast,
  showConfirmModal,
  setConnectionStatus,
} from './ui-room.js';

// ── Paramètres URL ──
const params  = new URLSearchParams(window.location.search);
const roomId  = params.get('id');
const role    = params.get('role') || 'player';
const isGm    = role === 'gm';

if (!roomId) {
  document.body.innerHTML = '<div style="padding:2rem;color:#e8dcc8;font-family:sans-serif"><h2>Session introuvable</h2><p>Aucun identifiant de room dans l\'URL.</p><a href="index.html" style="color:#c8922a">← Retour au lobby</a></div>';
  throw new Error('No roomId');
}

// ── Appliquer le rôle au body (pour CSS gm-only) ──
if (isGm) document.body.classList.add('is-gm');

// ── État des formulaires de tirage ──
let playerModifiers = [];
let gmModifiers     = [];
let lastPlayerDraw  = null;
let lastGmDraw      = null;

// ════════════════════════════════════
// INIT
// ════════════════════════════════════
(async () => {
  try {
    await ensureAuth();
    setConnectionStatus(true);

    // Lance l'écoute Firestore
    listenRoom(roomId);

    // Callback sur chaque changement temps réel
    onRoomChange((data) => {
      renderAll(data);
    });

    // Heartbeat toutes les 30s
    setInterval(heartbeat, 30000);
    heartbeat();

    // Init des listeners UI
    initDrawForm('player');
    if (isGm) initDrawForm('gm');
    initCharForm();
    initSceneInput();
    initCollapsibles();
    initRoomCodeCopy();
    initGmControls();

  } catch (err) {
    console.error(err);
    setConnectionStatus(false);
    showToast('Erreur de connexion Firebase : ' + err.message, 'error');
  }
})();

// ════════════════════════════════════
// RENDER ALL
// ════════════════════════════════════
function renderAll(data) {
  const uid = getCurrentUser()?.uid;

  renderHeader(data, roomId, role);
  renderPlayerBag(data.playerBag);
  renderHistory(document.getElementById('player-history'), data.drawHistory, 'player');

  if (isGm) {
    renderGmBag(data.gmBag);
    renderHistory(document.getElementById('gm-history'), data.drawHistory, 'gm');
  }

  renderCharacters(
    document.getElementById('char-list'),
    data.characters,
    uid,
    isGm,
    async (charId, delta) => {
      try {
        await updateCharacterHP(charId, delta);
      } catch (e) { showToast(e.message, 'error'); }
    }
  );

  renderMorale(data.groupMorale, isGm, async (val) => {
    try { await setMorale(val); } catch (e) { showToast(e.message, 'error'); }
  });

  renderScene(data.currentScene, isGm);

  renderReputations(
    document.getElementById('rep-container'),
    data.characters,
    uid,
    isGm,
    async (charId, fi, delta) => {
      try { await updateReputation(charId, fi, delta); }
      catch (e) { showToast(e.message, 'error'); }
    }
  );

  // Mise à jour du select personnages
  updateCharSelect(data.characters);
  if (isGm) updateCharSelect(data.characters, 'gm');
}

// ════════════════════════════════════
// FORMULAIRE DE TIRAGE
// ════════════════════════════════════

function initDrawForm(prefix) {
  const form = document.getElementById(`${prefix}-draw-form`);
  if (!form) return;

  // Calcul du score effectif en temps réel
  const scoreInput = form.querySelector('.skill-score-input');
  const scoreDisplay = document.getElementById(`${prefix}-effective-score`);

  const updateScore = () => {
    const base = parseInt(scoreInput?.value, 10) || 0;
    const mods = prefix === 'player' ? playerModifiers : gmModifiers;
    const total = mods.reduce((acc, m) => acc + (parseInt(m.value, 10) || 0), base);
    const clamped = Math.max(1, Math.min(99, total));
    if (scoreDisplay) scoreDisplay.textContent = clamped;
    // Update thresholds display
    const critEl = document.getElementById(`${prefix}-crit-thresh`);
    const failEl = document.getElementById(`${prefix}-fail-thresh`);
    if (critEl) critEl.textContent = Math.floor(clamped / 2);
    if (failEl) failEl.textContent = 100 - Math.floor(clamped / 2);
  };

  scoreInput?.addEventListener('input', updateScore);

  // Bouton "Ajouter modificateur"
  const addModBtn = form.querySelector('.btn-add-mod');
  const modsContainer = form.querySelector('.modifiers-area');
  addModBtn?.addEventListener('click', () => {
    const mods = prefix === 'player' ? playerModifiers : gmModifiers;
    const idx = mods.length;
    mods.push({ value: 0, label: '' });

    const row = document.createElement('div');
    row.className = 'modifier-row';
    row.innerHTML = `
      <input type="number" class="mod-val" data-idx="${idx}" placeholder="±val" style="width:70px">
      <input type="text"   class="mod-lbl" data-idx="${idx}" placeholder="Libellé (ex: blessé)">
      <button type="button" class="hp-btn mod-remove" data-idx="${idx}" title="Supprimer">✕</button>
    `;
    modsContainer?.appendChild(row);

    row.querySelector('.mod-val')?.addEventListener('input', (e) => {
      mods[idx].value = e.target.value;
      updateScore();
    });
    row.querySelector('.mod-remove')?.addEventListener('click', () => {
      mods.splice(idx, 1);
      row.remove();
      updateScore();
    });
  });

  // Soumission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const actorName  = form.querySelector('.actor-name-input')?.value.trim() || 'Inconnu';
    const skillName  = form.querySelector('.skill-name-input')?.value.trim() || '';
    const baseScore  = parseInt(form.querySelector('.skill-score-input')?.value, 10) || 50;
    const mods       = prefix === 'player' ? playerModifiers : gmModifiers;
    const effectiveScore = Math.max(1, Math.min(99,
      mods.reduce((acc, m) => acc + (parseInt(m.value, 10) || 0), baseScore)
    ));

    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;

    try {
      const fn = prefix === 'player' ? drawPlayerToken : drawGmToken;
      const drawResult = await fn({ actorName, skillName, skillScore: effectiveScore, note: '' });

      if (prefix === 'player') lastPlayerDraw = { ...drawResult, actorName, skillName, skillScore: effectiveScore };
      else                     lastGmDraw     = { ...drawResult, actorName, skillName, skillScore: effectiveScore };

      const resultEl = document.getElementById(`${prefix}-draw-result`);
      renderDrawResult(resultEl, prefix === 'player' ? lastPlayerDraw : lastGmDraw);

      showToast(`Jeton ${drawResult.token} tiré — ${RESULT_LABELS_SHORT[drawResult.result]}`, drawResult.result.includes('success') ? 'success' : 'info');

    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

const RESULT_LABELS_SHORT = {
  critical_success: 'Succès Critique',
  success:          'Succès',
  failure:          'Échec',
  critical_failure: 'Échec Critique',
  auto_failure:     'Échec Auto',
};

// ════════════════════════════════════
// SELECT PERSONNAGES
// ════════════════════════════════════

function updateCharSelect(characters, prefix = 'player') {
  const selects = document.querySelectorAll(`.${prefix}-char-select`);
  selects.forEach(sel => {
    const current = sel.value;
    sel.innerHTML = '<option value="">— Choisir un personnage —</option>'
      + Object.values(characters || {}).map(c =>
          `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`
        ).join('');
    if (current) sel.value = current;
  });
  // Also update faction char select
  const factionSel = document.getElementById('faction-char-select');
  if (factionSel) {
    const current = factionSel.value;
    factionSel.innerHTML = '<option value="">— Personnage —</option>'
      + Object.values(characters || {}).map(c =>
          `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`
        ).join('');
    if (current) factionSel.value = current;
  }
}

// ════════════════════════════════════
// FORMULAIRE PERSONNAGE
// ════════════════════════════════════

function initCharForm() {
  const form = document.getElementById('add-char-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name       = form.querySelector('#char-name').value.trim();
    const pcMax      = parseInt(form.querySelector('#char-pc-max').value, 10) || 10;
    const playerName = form.querySelector('#char-player-name').value.trim();
    if (!name) return;

    try {
      await addCharacter({ name, pcMax, playerName });
      form.reset();
      showToast(`${name} ajouté.e !`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });

  // Faction form
  const factionForm = document.getElementById('add-faction-form');
  factionForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const charSel  = document.getElementById('faction-char-select');
    const fName    = document.getElementById('faction-name').value.trim();
    if (!charSel?.value || !fName) return;

    // Trouve l'id du perso
    const data = getRoomData();
    const charId = Object.entries(data.characters || {}).find(([, c]) => c.name === charSel.value)?.[0];
    if (!charId) { showToast('Personnage introuvable', 'error'); return; }

    try {
      await addFaction(charId, fName);
      factionForm.reset();
      showToast('Faction ajoutée !', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });
}

// ════════════════════════════════════
// SCÈNE
// ════════════════════════════════════

function initSceneInput() {
  const input = document.getElementById('scene-input');
  if (!input || !isGm) return;

  let debounce;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      try { await setScene(input.value.trim()); }
      catch (e) { showToast(e.message, 'error'); }
    }, 800);
  });
}

// ════════════════════════════════════
// CONTRÔLES MJ
// ════════════════════════════════════

function initGmControls() {
  // Reset sac joueurs
  document.getElementById('reset-player-bag-btn')?.addEventListener('click', () => {
    showConfirmModal({
      title: 'Réinitialiser le sac joueurs',
      body: 'Cette action remet 100 jetons dans le sac (5 rouges mélangés). Irréversible.',
      extraField: { label: 'Justification narrative (obligatoire)', placeholder: 'Ex: Fin de l\'arc narratif…', required: true },
      onConfirm: async (justif) => {
        try {
          await resetPlayerBag(justif);
          showToast('Sac joueurs réinitialisé', 'success');
        } catch (e) { showToast(e.message, 'error'); }
      }
    });
  });

  // Reset sac MJ
  document.getElementById('reset-gm-bag-btn')?.addEventListener('click', () => {
    showConfirmModal({
      title: 'Réinitialiser le sac MJ',
      body: 'Remet le sac MJ à 100 jetons.',
      onConfirm: async () => {
        try {
          await resetGmBag();
          showToast('Sac MJ réinitialisé', 'success');
        } catch (e) { showToast(e.message, 'error'); }
      }
    });
  });

  // Injection
  document.getElementById('player-inject-btn')?.addEventListener('click', async () => {
    try {
      const token = await injectGmToken();
      showToast(`Jeton ${token} injecté depuis le sac MJ`, 'success');
    } catch (e) { showToast(e.message, 'error'); }
  });
}

// ════════════════════════════════════
// COLLAPSIBLES
// ════════════════════════════════════

function initCollapsibles() {
  document.querySelectorAll('.collapsible__toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      const body = toggle.nextElementSibling;
      if (body) {
        body.classList.toggle('collapsible__body--open',   !expanded);
        body.classList.toggle('collapsible__body--closed',  expanded);
      }
    });
  });
}

// ════════════════════════════════════
// CODE ROOM — copier
// ════════════════════════════════════

function initRoomCodeCopy() {
  document.getElementById('header-room-code')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(roomId).then(() => showToast('Code copié !'));
  });
}

// ════════════════════════════════════
// Disconnect handler
// ════════════════════════════════════
window.addEventListener('beforeunload', () => {
  // best-effort
  heartbeat();
});

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
