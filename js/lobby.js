// ===== lobby.js — Logique page d'accueil =====
import { ensureAuth } from './firebase.js';
import { generateRoomId } from './bag.js';
import { createRoom, roomExists, joinRoom } from './room.js';

// ── Formulaire Créer ──
const createForm = document.getElementById('create-form');
const joinForm   = document.getElementById('join-form');

// Initialisation
(async () => {
  try {
    await ensureAuth();
  } catch (e) {
    showLobbyError('Connexion Firebase échouée. Vérifiez votre fichier firebase-config.js');
  }
})();

// ── Créer une session ──
createForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const sessionName = document.getElementById('create-session-name').value.trim();
  const gmName      = document.getElementById('create-gm-name').value.trim();

  if (!sessionName || !gmName) return;

  const btn = createForm.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Création…';

  try {
    let roomId;
    // Génère un code unique (retry si collision)
    for (let i = 0; i < 5; i++) {
      const candidate = generateRoomId();
      const exists = await roomExists(candidate);
      if (!exists) { roomId = candidate; break; }
    }
    if (!roomId) throw new Error('Impossible de générer un code unique');

    await createRoom(roomId, gmName, sessionName);

    // Affiche le code avant redirection
    showCreatedCode(roomId);

  } catch (err) {
    showLobbyError(err.message || 'Erreur lors de la création');
    btn.disabled = false;
    btn.textContent = 'Créer la session';
  }
});

function showCreatedCode(roomId) {
  const card = document.getElementById('create-card');
  card.innerHTML = `
    <div class="lobby-card__header">
      <span class="lobby-card__icon">✓</span>
      <div>
        <div class="lobby-card__title" style="color:var(--green-light)">Session créée !</div>
        <div class="lobby-card__subtitle">Partagez ce code avec vos joueurs</div>
      </div>
    </div>
    <div class="room-code-display" id="code-to-copy" title="Cliquer pour copier">
      ${roomId}
      <small>Cliquer pour copier</small>
    </div>
    <button class="btn btn--primary btn--full btn--lg" id="enter-as-gm">Entrer en tant que MJ</button>
  `;

  document.getElementById('code-to-copy')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(roomId).then(() => {
      const el = document.getElementById('code-to-copy');
      if (el) { el.querySelector('small').textContent = 'Copié !'; setTimeout(() => { if (el.querySelector('small')) el.querySelector('small').textContent = 'Cliquer pour copier'; }, 2000); }
    });
  });

  document.getElementById('enter-as-gm')?.addEventListener('click', () => {
    window.location.href = `room.html?id=${roomId}&role=gm`;
  });
}

// ── Rejoindre une session ──
joinForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code       = document.getElementById('join-code').value.trim().toUpperCase();
  const playerName = document.getElementById('join-name').value.trim();

  if (!code || !playerName) return;

  const btn = joinForm.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Vérification…';

  try {
    const exists = await roomExists(code);
    if (!exists) throw new Error(`Session "${code}" introuvable. Vérifiez le code.`);

    await joinRoom(code, playerName);
    window.location.href = `room.html?id=${code}&role=player`;

  } catch (err) {
    showJoinError(err.message || 'Erreur lors de la connexion');
    btn.disabled = false;
    btn.textContent = 'Rejoindre';
  }
});

// ── Format automatique du code ──
document.getElementById('join-code')?.addEventListener('input', (e) => {
  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (val.length > 3) {
    e.target.value = val.slice(0, 3) + '-' + val.slice(3, 6);
  } else {
    e.target.value = val;
  }
});

// ── Errors ──
function showLobbyError(msg) {
  let el = document.getElementById('lobby-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lobby-error';
    el.style.cssText = 'color:var(--red-light);font-size:.85rem;margin-top:.75rem;padding:.5rem .75rem;background:rgba(139,26,26,.1);border:1px solid rgba(139,26,26,.3);border-radius:4px';
    document.querySelector('.lobby-forms')?.before(el);
  }
  el.textContent = msg;
}

function showJoinError(msg) {
  let el = document.getElementById('join-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'join-error';
    el.style.cssText = 'color:var(--red-light);font-size:.85rem;margin-top:.5rem';
    joinForm.appendChild(el);
  }
  el.textContent = msg;
}
