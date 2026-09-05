// Small DOM helpers shared by the views. Not a framework — just the three or
// four things that would otherwise be repeated in every screen.

/** Inline SVG subpaths. Keeping them here avoids an icon-font request. */
const ICON_PATHS = {
  today: ['M5 7h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z', 'M6 3v4', 'M12 3v4', 'M18 3v4', 'M4 11h16'],
  history: ['M12 8v4l3 2', 'M3.6 9a9 9 0 1 1-.4 4.5', 'M3 4v5h5'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3.5 6h.01', 'M3.5 12h.01', 'M3.5 18h.01'],
  stats: ['M3 3v18h18', 'M7 15l3-4 3 3 4-6'],
  plus: ['M12 5v14', 'M5 12h14'],
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.2 14.4a1.7 1.7 0 0 0 .4 1.9l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.7 1.7 0 0 0-1.2-2.9h-.2a1.9 1.9 0 1 1 0-3.8h.1a1.7 1.7 0 0 0 1.3-2.9l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.7 1.7 0 0 0 2.9-1.2v-.2a1.9 1.9 0 1 1 3.8 0v.1a1.7 1.7 0 0 0 2.9 1.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.7 1.7 0 0 0-1.6 1.1z'],
  back: ['M15 18l-6-6 6-6'],
  chevron: ['M9 18l6-6-6-6'],
  check: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M8 12l2.6 2.6L16 9.4'],
  circle: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  more: ['M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'],
  flame: ['M12 22a7 7 0 0 0 7-7c0-5-4-6-4-10 0 0-3 1-3 5 0-2-1-3-1-3s-1 2-3 4a7 7 0 0 0-3 4 7 7 0 0 0 7 7z'],
  trash: ['M3 6h18', 'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2', 'M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6'],
  copy: ['M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  scale: ['M12 3v18', 'M5 7h14', 'M5 7l-2 6a3 3 0 0 0 6 0z', 'M19 7l-2 6a3 3 0 0 0 6 0z'],
  timer: ['M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 8v5l3 2', 'M9 2h6'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-5', 'M12 8h.01'],
  body: ['M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M9 21v-5l-1.5-3L7 9a5 5 0 0 1 10 0l-.5 4L15 16v5'],
  repeat: ['M17 2l4 4-4 4', 'M3 11V9a4 4 0 0 1 4-4h14', 'M7 22l-4-4 4-4', 'M21 13v2a4 4 0 0 1-4 4H3'],
};

export function icon(name, size = 20) {
  const paths = ICON_PATHS[name] ?? [];
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${paths.map((d) => `<path d="${d}"/>`).join('')}</svg>`;
}

let toastTimer = null;

export function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2200);
}

export function haptic(enabled, pattern = 12) {
  if (enabled && navigator.vibrate) navigator.vibrate(pattern);
}

/** Delegated click handling: one listener per view instead of one per row. */
export function onClick(root, selector, handler) {
  root.addEventListener('click', (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(target, event);
  });
}

export function navigate(hash) {
  window.location.hash = hash;
}

export const emptyState = (title, message, actionLabel, actionAttr = '') => `
  <div class="empty">
    <h2>${title}</h2>
    <p>${message}</p>
    ${actionLabel ? `<button class="btn btn-primary" ${actionAttr}>${actionLabel}</button>` : ''}
  </div>`;

export const tile = ({ label, value, caption, iconName }) => `
  <div class="tile">
    <div class="tile-label">${iconName ? icon(iconName, 13) : ''}${label}</div>
    <div class="tile-value">${value}</div>
    ${caption ? `<div class="tile-caption">${caption}</div>` : ''}
  </div>`;

/**
 * Bottom action sheet. Resolves with the chosen key, or null if dismissed.
 * Used wherever a row needs more than one action and a row of buttons would
 * crowd the layout.
 */
export function actionSheet(title, items) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sheet-backdrop';
    overlay.innerHTML = `
      <div class="sheet" role="dialog" aria-label="${title}">
        <div class="sheet-title">${title}</div>
        ${items.map((item) => `
          <button class="sheet-item ${item.destructive ? 'destructive' : ''}"
                  data-key="${item.key}" ${item.disabled ? 'disabled' : ''}>
            ${item.label}${item.detail ? `<span class="sheet-detail">${item.detail}</span>` : ''}
          </button>`).join('')}
        <button class="sheet-item cancel" data-key="">Cancel</button>
      </div>`;

    const close = (key) => { overlay.remove(); resolve(key || null); };

    overlay.addEventListener('click', (event) => {
      // A tap on the backdrop itself dismisses; a tap on the sheet does not.
      if (event.target === overlay) { close(null); return; }
      const button = event.target.closest('[data-key]');
      if (button) close(button.dataset.key);
    });

    document.body.appendChild(overlay);
  });
}

/**
 * Bottom sheet with one or more numeric fields. Resolves with an object keyed
 * by field name, or null if dismissed. Blank fields come back as null rather
 * than 0, so "I didn't measure that today" stays distinct from "it was zero".
 */
export function promptNumbers(title, fields, { note = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sheet-backdrop';
    overlay.innerHTML = `
      <div class="sheet" role="dialog" aria-label="${title}">
        <div class="sheet-title">${title}</div>
        ${fields.map((field) => `
          <div class="field">
            <label for="f-${field.name}">${field.label}</label>
            <input id="f-${field.name}" data-name="${field.name}" type="number"
                   inputmode="decimal" step="${field.step ?? 'any'}"
                   value="${field.value ?? ''}" placeholder="${field.placeholder ?? ''}"
                   ${field.min != null ? `min="${field.min}"` : ''}
                   ${field.max != null ? `max="${field.max}"` : ''}>
          </div>`).join('')}
        ${note ? `<div class="pad muted" style="font-size:12px">${note}</div>` : ''}
        <button class="sheet-item" data-save>Save</button>
        <button class="sheet-item cancel" data-cancel>Cancel</button>
      </div>`;

    const close = (result) => { overlay.remove(); resolve(result); };

    const save = () => {
      const values = {};
      let any = false;
      for (const input of overlay.querySelectorAll('[data-name]')) {
        const parsed = parseFloat(input.value);
        if (Number.isFinite(parsed) && parsed > 0) {
          values[input.dataset.name] = parsed;
          any = true;
        } else {
          values[input.dataset.name] = null;
        }
      }
      close(any ? values : null);
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-cancel]')) { close(null); return; }
      if (event.target.closest('[data-save]')) save();
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') save();
    });

    document.body.appendChild(overlay);
    const first = overlay.querySelector('input');
    first.focus();
    first.select();
  });
}
