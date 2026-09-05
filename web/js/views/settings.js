import * as store from '../store.js';
import { chrome } from '../app.js';
import { icon, onClick, navigate, toast } from '../ui.js';
import { duration } from '../format.js';
import { isStoragePersisted, requestPersistence } from '../db.js';

const REST_OPTIONS = [0, 60, 90, 120, 150, 180, 240, 300];

export default function renderSettings(root) {
  chrome.setTitle('Settings');
  chrome.setLead(`<button class="icon-btn" data-back aria-label="Back">${icon('back')}</button>`);
  chrome.onLead('[data-back]', () => navigate('#/today'));

  const s = store.state.settings;

  root.innerHTML = `
    <div class="section-title">Units</div>
    <div class="card">
      <div class="field inline-field">
        <label for="unit">Weight</label>
        <select id="unit">
          <option value="lb" ${s.unit === 'lb' ? 'selected' : ''}>Pounds (lb)</option>
          <option value="kg" ${s.unit === 'kg' ? 'selected' : ''}>Kilograms (kg)</option>
        </select>
      </div>
      <div class="pad muted" style="font-size:13px">
        Weights are stored in kilograms and converted for display, so switching
        units never changes what you logged.
      </div>
    </div>

    <div class="section-title">Rest timer</div>
    <div class="card">
      <div class="field inline-field">
        <label for="rest">Default rest</label>
        <select id="rest">
          ${REST_OPTIONS.map((v) => `
            <option value="${v}" ${s.restSeconds === v ? 'selected' : ''}>
              ${v === 0 ? 'Off' : duration(v)}
            </option>`).join('')}
        </select>
      </div>
      <div class="field inline-field">
        <label for="haptics">Vibrate</label>
        <input id="haptics" type="checkbox" ${s.haptics ? 'checked' : ''}
               style="width:auto;min-width:0">
      </div>
      <div class="pad muted" style="font-size:13px">
        Starts automatically when you tick a set off.
      </div>
    </div>

    <div class="section-title">Your data</div>
    <div class="card">
      <div class="pad muted" style="font-size:13px" id="persist-note">Checking storage…</div>
      <button class="row" data-export style="color:var(--accent);font-weight:600">Export backup (JSON)</button>
      <button class="row" data-import style="color:var(--accent);font-weight:600">Import backup</button>
      <input type="file" id="import-file" accept="application/json,.json" class="hidden">
      <button class="row" data-reset style="color:var(--accent);font-weight:600">Reset everything</button>
    </div>

    <div class="section-title">About</div>
    <div class="card">
      <div class="row"><div class="row-main muted">Version</div><span>0.1.0</span></div>
      <div class="row"><div class="row-main muted">Build</div><span id="build-id">—</span></div>
      <div class="row"><div class="row-main muted">Exercises</div><span>${store.state.exercises.length}</span></div>
      <div class="row"><div class="row-main muted">Sessions</div><span>${store.state.workouts.filter((w) => w.endedAt).length}</span></div>
    </div>`;

  root.querySelector('#unit').addEventListener('change', (e) => {
    store.updateSettings({ unit: e.target.value });
  });
  root.querySelector('#rest').addEventListener('change', (e) => {
    store.updateSettings({ restSeconds: Number(e.target.value) });
  });
  root.querySelector('#haptics').addEventListener('change', (e) => {
    store.updateSettings({ haptics: e.target.checked });
  });

  showPersistence(root);
  showBuild(root);

  onClick(root, '[data-export]', () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `overload-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking immediately can cancel the download on some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  const fileInput = root.querySelector('#import-file');
  onClick(root, '[data-import]', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!window.confirm('Importing replaces everything currently in the app. Continue?')) {
      fileInput.value = '';
      return;
    }
    try {
      await store.importData(await file.text());
      toast('Backup restored');
    } catch (error) {
      toast(error.message);
    }
    fileInput.value = '';
  });

  onClick(root, '[data-reset]', async () => {
    if (!window.confirm('Delete every workout, routine and custom exercise? This cannot be undone.')) return;
    await store.resetEverything();
    toast('Reset');
    navigate('#/today');
  });
}

/**
 * The name of the active cache is the running build. Reading it at runtime
 * beats hardcoding a number that can drift from what is actually installed.
 */
async function showBuild(root) {
  const el = root.querySelector('#build-id');
  if (!el) return;
  try {
    const keys = await caches.keys();
    el.textContent = keys[0] ?? 'not cached';
  } catch {
    el.textContent = 'unavailable';
  }
}

/**
 * Safari evicts IndexedDB for sites it considers inactive. Installing to the
 * home screen and granting persistence is what stops months of training data
 * disappearing, so it's worth surfacing rather than hiding.
 */
async function showPersistence(root) {
  const note = root.querySelector('#persist-note');
  if (!note) return;

  const persisted = await isStoragePersisted();
  if (persisted === null) {
    note.textContent = 'This browser doesn’t report whether storage is durable. Export a backup now and then.';
    return;
  }
  if (persisted) {
    note.textContent = 'Storage is marked durable — the browser won’t evict your data automatically.';
    return;
  }

  note.innerHTML = `Storage is <strong>not</strong> marked durable, so the browser may clear it
    if space runs low. Adding Overload to your home screen usually fixes this.
    <button class="btn btn-sm btn-quiet" data-persist style="margin-top:8px">Request durable storage</button>`;

  note.querySelector('[data-persist]').addEventListener('click', async () => {
    const granted = await requestPersistence();
    toast(granted ? 'Storage is now durable' : 'The browser declined — add to home screen and retry');
    showPersistence(root);
  });
}
