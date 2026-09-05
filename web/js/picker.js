// Full-screen exercise chooser, used when adding a movement to a workout or a
// routine. An overlay rather than a route: the caller needs a value back, and a
// hash change would lose the callback.

import * as store from './store.js';
import { MUSCLE_GROUPS, groupLabel, equipmentLabel } from './domain.js';
import { icon, onClick } from './ui.js';
import { esc } from './format.js';

export function openExercisePicker(onSelect) {
  const overlay = document.createElement('div');
  overlay.className = 'picker';
  overlay.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-close aria-label="Cancel">${icon('close')}</button>
      <h1>Add exercise</h1>
      <button class="icon-btn" data-new aria-label="New exercise">${icon('plus')}</button>
    </header>
    <div class="picker-body">
      <div class="pad" style="padding-bottom:0">
        <input type="search" data-search placeholder="Search ${store.visibleExercises().length} exercises"
               aria-label="Search exercises" autocomplete="off">
        <div class="chips" data-chips>
          <button class="chip" aria-pressed="true" data-group="">All</button>
          ${MUSCLE_GROUPS.map((g) => `<button class="chip" aria-pressed="false" data-group="${g}">${groupLabel(g)}</button>`).join('')}
        </div>
      </div>
      <div class="card" data-results style="margin:0 14px 14px"></div>
    </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const searchEl = overlay.querySelector('[data-search]');
  const resultsEl = overlay.querySelector('[data-results]');
  let group = '';

  function close() {
    overlay.remove();
    document.body.style.overflow = '';
  }

  function paint() {
    const term = searchEl.value.trim().toLowerCase();
    const matches = store.visibleExercises().filter((e) => (
      (!group || e.muscleGroup === group)
      && (!term || e.name.toLowerCase().includes(term))
    ));

    if (!matches.length) {
      resultsEl.innerHTML = `<div class="pad center muted">
        No match. <button class="btn btn-sm btn-quiet" data-new style="margin-left:6px">Create it</button>
      </div>`;
      return;
    }

    // Long lists are the norm here — cap the DOM and let search narrow it.
    const shown = matches.slice(0, 120);
    resultsEl.innerHTML = shown.map((e) => `
      <button class="row" data-pick="${e.id}">
        <div class="row-main">
          <div class="row-title">${esc(e.name)}</div>
          <div class="row-sub">${groupLabel(e.muscleGroup)} · ${equipmentLabel(e.equipment)}</div>
        </div>
      </button>`).join('')
      + (matches.length > shown.length
        ? `<div class="pad center muted">${matches.length - shown.length} more — keep typing to narrow it.</div>`
        : '');
  }

  searchEl.addEventListener('input', paint);

  onClick(overlay, '[data-close]', close);

  onClick(overlay, '[data-group]', (btn) => {
    group = btn.dataset.group;
    overlay.querySelectorAll('[data-group]').forEach((el) => {
      el.setAttribute('aria-pressed', String(el === btn));
    });
    paint();
  });

  onClick(overlay, '[data-pick]', async (btn) => {
    const exercise = store.exerciseById(btn.dataset.pick);
    if (!exercise) return;
    close();
    await onSelect(exercise);
  });

  onClick(overlay, '[data-new]', async () => {
    const name = searchEl.value.trim();
    const created = await promptNewExercise(name);
    if (!created) return;
    close();
    await onSelect(created);
  });

  paint();
  return close;
}

/** Minimal creation form, shown when nothing in the library fits. */
function promptNewExercise(initialName) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'picker';
    overlay.innerHTML = `
      <header class="topbar">
        <button class="icon-btn" data-cancel aria-label="Cancel">${icon('close')}</button>
        <h1>New exercise</h1>
        <button class="icon-btn" data-save>Save</button>
      </header>
      <div class="picker-body pad">
        <div class="card">
          <div class="field">
            <label for="ex-name">Name</label>
            <input id="ex-name" value="${esc(initialName)}" autocomplete="off">
          </div>
          <div class="field">
            <label for="ex-group">Muscle group</label>
            <select id="ex-group">
              ${MUSCLE_GROUPS.map((g) => `<option value="${g}">${groupLabel(g)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="ex-equip">Equipment</label>
            <select id="ex-equip">
              ${['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other']
                .map((e) => `<option value="${e}">${equipmentLabel(e)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    const nameEl = overlay.querySelector('#ex-name');
    nameEl.focus();

    const done = (value) => { overlay.remove(); resolve(value); };

    overlay.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    overlay.querySelector('[data-save]').addEventListener('click', async () => {
      const name = nameEl.value.trim();
      if (!name) { nameEl.focus(); return; }
      const created = await store.createExercise({
        name,
        muscleGroup: overlay.querySelector('#ex-group').value,
        equipment: overlay.querySelector('#ex-equip').value,
      });
      done(created);
    });
  });
}
