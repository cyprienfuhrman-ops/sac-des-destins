// ===== ui-room.js — Rendu DOM de la vue session =====
import {
  RESULT_LABELS,
  RESULT_CLASSES,
  HISTORY_CLASSES,
  calcTension,
  tensionColor,
  hpColor,
  healthState,
  MORALE_DATA,
  reputationStatus,
  fmtTime,
  fmtResult,
} from './bag.js';

// ══════════════════════════════════════════════
// ZONE A — Header
// ══════════════════════════════════════════════

export function renderHeader(roomData, roomId, userRole) {
  document.getElementById('header-session-name').textContent = roomData.name || 'Session sans nom';
  document.getElementById('header-room-code').textContent    = roomId;

  const badge = document.getElementById('role-badge');
  if (badge) {
    badge.textContent = userRole === 'gm' ? 'MJ' : 'Joueur';
    badge.className   = 'badge ' + (userRole === 'gm' ? 'badge--gold' : 'badge--green');
  }

  renderPresence(roomData.connectedUsers || {});
}

function renderPresence(users) {
  const container = document.getElementById('presence-list');
  if (!container) return;

  const COLORS = ['#4a7c59','#c8922a','#8b6ec8','#2a7a8b','#c85a5a','#5a8bc8'];
  container.innerHTML = '';

  Object.entries(users).forEach(([uid, u], i) => {
    const el = document.createElement('div');
    el.className = 'presence-avatar' + (u.role === 'gm' ? ' presence-avatar--gm' : '');
    el.title = u.name + (u.role === 'gm' ? ' (MJ)' : '');
    el.style.background = COLORS[i % COLORS.length];
    el.textContent = (u.name || '?').charAt(0).toUpperCase();
    container.appendChild(el);
  });
}

export function setConnectionStatus(online) {
  const dot  = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');
  if (!dot) return;
  dot.className = 'conn-dot conn-dot--' + (online ? 'online' : 'offline');
  if (text) text.textContent = online ? 'En ligne' : 'Hors ligne';
}

// ══════════════════════════════════════════════
// ZONE B — Sac Joueurs
// ══════════════════════════════════════════════

export function renderPlayerBag(bag) {
  if (!bag) return;
  renderBagStatus(bag, 'player');
}

export function renderGmBag(bag) {
  if (!bag) return;
  renderBagStatus(bag, 'gm');
}

function renderBagStatus(bag, prefix) {
  const remaining = (bag.tokens || []).length;
  const total     = bag.totalCount || 100;
  const redDrawn  = (bag.drawnRed || []).length;
  const pct       = (remaining / total) * 100;
  const tension   = calcTension(bag);

  // Compteurs
  setText(`${prefix}-bag-count`,       remaining);
  setText(`${prefix}-bag-total`,       total);
  setText(`${prefix}-red-drawn-count`, redDrawn);
  setText(`${prefix}-inject-count`,    bag.injectedCount || 0);

  // Barre de jetons restants
  setStyle(`${prefix}-bag-fill`, 'width', pct + '%');
  const fillColor = remaining > 50 ? '#4a7c59' : remaining > 25 ? '#c8922a' : '#8b1a1a';
  setStyle(`${prefix}-bag-fill`, 'backgroundColor', fillColor);

  // Barre de tension
  const tPct = tension * 100;
  setStyle(`${prefix}-tension-fill`, 'width', tPct + '%');
  setStyle(`${prefix}-tension-fill`, 'backgroundColor', tensionColor(tension));

  // Points rouges
  const dotsContainer = document.getElementById(`${prefix}-red-dots`);
  if (dotsContainer) {
    [...dotsContainer.children].forEach((dot, i) => {
      dot.className = 'red-dot' + (i < redDrawn ? ' red-dot--drawn' : '');
    });
  }

  // Injection count
  const injectBtn = document.getElementById(`${prefix}-inject-btn`);
  if (injectBtn) {
    const count = bag.injectedCount || 0;
    injectBtn.disabled = count >= 3;
    const counter = document.getElementById(`${prefix}-inject-count-label`);
    if (counter) {
      counter.textContent = `${count}/3`;
      counter.className = 'inject-count' + (count >= 3 ? ' inject-count--max' : '');
    }
  }
}

// ══════════════════════════════════════════════
// Résultat de tirage
// ══════════════════════════════════════════════

export function renderDrawResult(el, drawResult) {
  if (!el) return;
  if (!drawResult) {
    el.innerHTML = '<p class="draw-result--empty">Aucun tirage pour l\'instant&hellip;</p>';
    el.className = 'draw-result draw-result--empty';
    return;
  }

  const { token, isRed, result, actorName, skillName, skillScore } = drawResult;
  const label = RESULT_LABELS[result] || result;
  const labelClass = RESULT_CLASSES[result] || '';

  const critThresh = Math.floor(skillScore / 2);
  let detail = '';
  if (result === 'critical_success') detail = `≤ ${critThresh} → Succès Critique`;
  else if (result === 'success')     detail = `≤ ${skillScore} → Succès`;
  else if (result === 'failure')     detail = `> ${skillScore} → Échec`;
  else if (result === 'critical_failure') detail = `> ${100 - critThresh} → Échec Critique`;
  else if (result === 'auto_failure')     detail = `100 — Échec Automatique`;

  el.className = 'draw-result' + (isRed ? ' draw-result--red' : '');
  if (isRed) el.classList.add('red-token-flash');

  el.innerHTML = `
    <div class="token-circle token-falling ${isRed ? 'token-circle--red' : ''}">
      ${token}
    </div>
    <div class="result-label ${labelClass}">${label}</div>
    <div class="result-detail mono">${detail}</div>
    ${actorName ? `<div class="result-actor text-muted">${escHtml(actorName)} — ${escHtml(skillName || '')} (${skillScore})</div>` : ''}
    ${isRed ? '<div class="badge badge--red" style="margin-top:.4rem">Jeton Rouge !</div>' : ''}
  `;

  if (isRed) {
    el.classList.add('shaking');
    setTimeout(() => el.classList.remove('shaking', 'red-token-flash'), 700);
  }
}

// ══════════════════════════════════════════════
// Historique
// ══════════════════════════════════════════════

export function renderHistory(container, history, filterBagType) {
  if (!container) return;

  const items = (history || [])
    .filter(h => h.token !== null && h.result !== 'reset')
    .filter(h => !filterBagType || h.bagType === filterBagType)
    .slice(0, 10);

  if (items.length === 0) {
    container.innerHTML = '<li class="text-muted" style="font-size:.8rem;padding:.5rem">Aucun tirage&hellip;</li>';
    return;
  }

  container.innerHTML = items.map(h => {
    const isRed  = h.isRed;
    const hClass = HISTORY_CLASSES[h.result] || '';
    const color  = RESULT_LABELS[h.result]   ? '' : '';
    return `
      <li class="history-item ${isRed ? 'history-item--red' : ''} ${hClass}">
        <span class="history-token mono ${isRed ? 'history-token--red' : ''}">${h.token}</span>
        <div class="history-info">
          <div class="history-actor">${escHtml(h.actorName || '—')}</div>
          <div class="history-skill">${escHtml(h.skillName || '')} ${h.skillScore ? '(' + h.skillScore + ')' : ''}</div>
        </div>
        <div class="history-meta">
          <div class="history-result" style="color:${resultColor(h.result)}">${fmtResult(h.result)}</div>
          <div class="history-time">${fmtTime(h.at)}</div>
        </div>
      </li>
    `;
  }).join('');
}

function resultColor(r) {
  const map = {
    critical_success: '#c8922a',
    success:          '#6aac79',
    failure:          '#9a8a72',
    critical_failure: '#c02a2a',
    auto_failure:     '#c02a2a',
  };
  return map[r] || '#9a8a72';
}

// ══════════════════════════════════════════════
// Personnages
// ══════════════════════════════════════════════

export function renderCharacters(container, characters, currentUid, isGm, onHpChange) {
  if (!container) return;

  const entries = Object.entries(characters || {});
  if (entries.length === 0) {
    container.innerHTML = '<p class="text-muted" style="font-size:.85rem">Aucun personnage enregistré.</p>';
    return;
  }

  container.innerHTML = entries.map(([charId, char]) => {
    const hs    = healthState(char.pcCurrent, char.pcMax);
    const ratio = char.pcMax > 0 ? char.pcCurrent / char.pcMax : 0;
    const hpCol = hpColor(ratio);
    const canEdit = isGm || char.playerUid === currentUid;

    return `
      <div class="char-card" data-char-id="${charId}">
        <div class="char-card__header">
          <div>
            <div class="char-name">${escHtml(char.name)}</div>
            <div class="char-player text-muted">${escHtml(char.playerName || '')}</div>
          </div>
          <div class="health-state" style="color:${hs.color}">
            ${hs.label}
            ${hs.malus ? `<span class="text-muted" style="font-size:.7rem">${hs.malus}</span>` : ''}
          </div>
        </div>
        <div class="hp-bar-wrapper">
          <div class="hp-bar">
            <div class="hp-bar__fill" style="width:${Math.max(0,ratio*100)}%;background:${hpCol}"></div>
          </div>
          <div class="hp-value mono">${char.pcCurrent} / ${char.pcMax}</div>
        </div>
        ${canEdit ? `
          <div class="hp-controls" style="margin-top:.4rem">
            <button class="hp-btn" data-char="${charId}" data-delta="-5" title="-5 PC">−5</button>
            <button class="hp-btn" data-char="${charId}" data-delta="-1" title="-1 PC">−</button>
            <button class="hp-btn" data-char="${charId}" data-delta="1"  title="+1 PC">+</button>
            <button class="hp-btn" data-char="${charId}" data-delta="5"  title="+5 PC">+5</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Bind HP buttons
  container.querySelectorAll('.hp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const charId = btn.dataset.char;
      const delta  = parseInt(btn.dataset.delta, 10);
      if (onHpChange) onHpChange(charId, delta);
    });
  });
}

// ══════════════════════════════════════════════
// Moral
// ══════════════════════════════════════════════

export function renderMorale(morale, isGm, onMoraleChange) {
  const val = Math.max(1, Math.min(5, morale || 3));
  // Index inversé : 5 = Fanatique (idx 4), 1 = Mutin (idx 0)
  const idx = val - 1;
  const md  = MORALE_DATA[idx];

  setText('morale-name',   md.label);
  setText('morale-effect', md.effect);

  const risk = document.getElementById('morale-risk');
  if (risk) {
    if (md.risk) {
      risk.textContent = md.risk;
      risk.classList.remove('hidden');
    } else {
      risk.classList.add('hidden');
    }
  }

  // Pips
  const pips = document.querySelectorAll('.morale-pip');
  pips.forEach((pip, i) => {
    const active = i < val;
    pip.className = 'morale-pip' + (active ? (i < 2 ? ' morale-pip--danger' : ' morale-pip--active') : '');
  });

  // Boutons +/-
  const btnMinus = document.getElementById('morale-minus');
  const btnPlus  = document.getElementById('morale-plus');
  if (btnMinus) {
    btnMinus.disabled = !isGm || val <= 1;
    btnMinus.onclick  = () => { if (onMoraleChange) onMoraleChange(val - 1); };
  }
  if (btnPlus) {
    btnPlus.disabled = !isGm || val >= 5;
    btnPlus.onclick  = () => { if (onMoraleChange) onMoraleChange(val + 1); };
  }
}

// ══════════════════════════════════════════════
// Scène
// ══════════════════════════════════════════════

export function renderScene(scene, isGm) {
  const text  = document.getElementById('scene-text');
  const input = document.getElementById('scene-input');

  if (text)  text.textContent = scene || '(Aucune scène définie)';
  if (input && !document.activeElement?.closest('#scene-input')) {
    input.value = scene || '';
  }
  if (text)  text.classList.toggle('hidden', isGm);
  if (input) input.closest('.scene-input-wrap')?.classList.toggle('hidden', !isGm);
}

// ══════════════════════════════════════════════
// Réputations
// ══════════════════════════════════════════════

export function renderReputations(container, characters, currentUid, isGm, onRepChange) {
  if (!container) return;

  const entries = Object.entries(characters || {});
  if (entries.length === 0) {
    container.innerHTML = '<p class="text-muted" style="font-size:.85rem">Aucun personnage.</p>';
    return;
  }

  container.innerHTML = entries.map(([charId, char]) => {
    const canEdit = isGm || char.playerUid === currentUid;
    const reps = char.reputations || [];

    if (reps.length === 0 && !canEdit) return '';

    return `
      <div style="margin-bottom:1rem">
        <div style="font-family:var(--font-serif);font-size:1rem;margin-bottom:.4rem;color:var(--text-cream)">${escHtml(char.name)}</div>
        ${reps.length === 0 ? '<p style="font-size:.78rem;color:var(--text-dim)">Aucune faction.</p>' : `
          <table class="reputation-table">
            <thead>
              <tr><th>Faction</th><th>Score</th><th>Statut</th>${canEdit ? '<th></th>' : ''}</tr>
            </thead>
            <tbody>
              ${reps.map((r, fi) => {
                const rs = reputationStatus(r.score);
                return `
                  <tr>
                    <td>${escHtml(r.factionName)}</td>
                    <td class="rep-score" style="color:${rs.color}">${r.score > 0 ? '+' : ''}${r.score}</td>
                    <td><span style="color:${rs.color};font-size:.75rem">${rs.label}</span></td>
                    ${canEdit ? `
                      <td>
                        <div class="rep-controls">
                          <button class="hp-btn" data-char="${charId}" data-fi="${fi}" data-delta="-5">−</button>
                          <button class="hp-btn" data-char="${charId}" data-fi="${fi}" data-delta="5">+</button>
                        </div>
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;
  }).join('');

  // Bind rep buttons
  container.querySelectorAll('[data-fi]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (onRepChange) onRepChange(btn.dataset.char, parseInt(btn.dataset.fi), parseInt(btn.dataset.delta));
    });
  });
}

// ══════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setStyle(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════════
// Toast / Notifications
// ══════════════════════════════════════════════

export function showToast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast' + (type === 'error' ? ' toast--error' : type === 'success' ? ' toast--success' : '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ══════════════════════════════════════════════
// Modal confirm
// ══════════════════════════════════════════════

export function showConfirmModal({ title, body, extraField, onConfirm }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal__title">${escHtml(title)}</div>
      <div class="confirm-body">${body}</div>
      ${extraField ? `
        <div class="field">
          <label>${escHtml(extraField.label)}</label>
          <input type="text" id="modal-extra" placeholder="${escHtml(extraField.placeholder || '')}" autocomplete="off">
        </div>
      ` : ''}
      <div class="btn-group" style="justify-content:flex-end">
        <button class="btn btn--ghost" id="modal-cancel">Annuler</button>
        <button class="btn btn--danger" id="modal-confirm">Confirmer</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const cancelBtn  = overlay.querySelector('#modal-cancel');
  const confirmBtn = overlay.querySelector('#modal-confirm');

  const close = () => overlay.remove();
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  confirmBtn.addEventListener('click', () => {
    const extra = overlay.querySelector('#modal-extra');
    if (extraField?.required && extra && !extra.value.trim()) {
      extra.focus();
      extra.style.borderColor = 'var(--red-light)';
      return;
    }
    onConfirm(extra ? extra.value.trim() : null);
    close();
  });

  overlay.querySelector('#modal-extra')?.focus();
}
