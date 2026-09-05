// The logging screen. Everything is written straight through to IndexedDB, so
// closing the tab mid-session loses nothing.
//
// Two kinds of change happen here and they're handled differently: structural
// edits (adding a set, removing an exercise) re-render the view, while typing a
// weight and ticking a set update the DOM in place. A re-render on keystroke
// would blur the field you're typing into.

import * as store from '../store.js';
import { chrome } from '../app.js';
import { openExercisePicker } from '../picker.js';
import { restTimer } from '../rest.js';
import { icon, onClick, tile, navigate, toast, haptic } from '../ui.js';
import { esc, volume, duration, weightValue, toKg } from '../format.js';
import {
  newSet, newEntry, workoutVolume, workoutSetCount, workoutDuration, lastPerformance,
} from '../domain.js';
import { suggest } from '../coach.js';

export default function renderWorkout(root, workoutId) {
  const workout = store.workoutById(workoutId);
  if (!workout) { navigate('#/today'); return; }

  const { unit } = store.state.settings;

  chrome.setTitle(workout.name);
  chrome.setLead(`<button class="icon-btn" data-back aria-label="Back">${icon('back')}</button>`);
  chrome.setActions(`
    <button class="icon-btn" data-finish>Finish</button>`);
  chrome.onLead('[data-back]', () => navigate('#/today'));
  chrome.onAction('[data-finish]', () => finish(workout));

  root.innerHTML = `
    <div class="tiles" id="totals">${totalsHtml(workout, unit)}</div>

    <div class="card" style="margin-top:14px">
      <div class="field">
        <label for="w-name">Session name</label>
        <input id="w-name" value="${esc(workout.name)}" autocomplete="off">
      </div>
    </div>

    <div id="entries">${workout.entries.map((entry) => entryHtml(entry, workout, unit)).join('')}</div>

    <div style="margin-top:14px">
      <button class="btn btn-quiet btn-block" data-add-exercise>${icon('plus')} Add exercise</button>
    </div>

    <div class="section-title">Notes</div>
    <div class="card">
      <div class="field">
        <textarea id="w-notes" placeholder="How did it feel?">${esc(workout.notes)}</textarea>
      </div>
    </div>

    <div id="rest-host"></div>`;

  // --- Live fields (no re-render) -------------------------------------------

  root.querySelector('#w-name').addEventListener('input', (event) => {
    store.mutateWorkoutSilently(workoutId, (w) => { w.name = event.target.value; });
    chrome.setTitle(event.target.value || 'Workout');
  });

  root.querySelector('#w-notes').addEventListener('input', (event) => {
    store.mutateWorkoutSilently(workoutId, (w) => { w.notes = event.target.value; });
  });

  root.addEventListener('input', (event) => {
    const field = event.target.closest('[data-field]');
    if (!field) return;
    const { entryId, setId, field: kind } = field.dataset;
    const raw = parseFloat(field.value);
    const value = Number.isFinite(raw) ? Math.max(0, raw) : 0;

    store.mutateWorkoutSilently(workoutId, (w) => {
      const set = findSet(w, entryId, setId);
      if (!set) return;
      if (kind === 'reps') set.reps = Math.round(value);
      else set.weightKg = toKg(value, unit);
    });
    refreshTotals(root, workoutId, unit);
  });

  onClick(root, '[data-toggle]', (btn) => {
    const { entryId, setId } = btn.dataset;
    let done = false;

    store.mutateWorkoutSilently(workoutId, (w) => {
      const set = findSet(w, entryId, setId);
      if (!set) return;
      set.done = !set.done;
      set.completedAt = set.done ? Date.now() : null;
      done = set.done;
    });

    btn.classList.toggle('on', done);
    btn.innerHTML = icon(done ? 'check' : 'circle', 25);
    btn.closest('.set-row')?.classList.toggle('done', done);
    refreshTotals(root, workoutId, unit);

    if (done) {
      haptic(store.state.settings.haptics);
      startRest(root);
    }
  });

  // --- Structural edits (re-render) -----------------------------------------

  onClick(root, '[data-add-set]', (btn) => {
    store.mutateWorkout(workoutId, (w) => {
      const entry = w.entries.find((e) => e.id === btn.dataset.addSet);
      if (!entry) return;
      // Carry the previous set's numbers forward — usually the right starting point.
      const template = [...entry.sets].reverse().find((s) => !s.warmup) ?? entry.sets.at(-1);
      entry.sets.push(newSet({ reps: template?.reps ?? 0, weightKg: template?.weightKg ?? 0 }));
    });
  });

  onClick(root, '[data-add-warmup]', (btn) => {
    store.mutateWorkout(workoutId, (w) => {
      const entry = w.entries.find((e) => e.id === btn.dataset.addWarmup);
      entry?.sets.push(newSet({ warmup: true }));
    });
  });

  onClick(root, '[data-drop-set]', (btn) => {
    const { entryId, setId } = btn.dataset;
    store.mutateWorkout(workoutId, (w) => {
      const entry = w.entries.find((e) => e.id === entryId);
      if (entry) entry.sets = entry.sets.filter((s) => s.id !== setId);
    });
  });

  onClick(root, '[data-drop-entry]', (btn) => {
    store.mutateWorkout(workoutId, (w) => {
      w.entries = w.entries.filter((e) => e.id !== btn.dataset.dropEntry);
    });
  });

  onClick(root, '[data-apply]', (btn) => {
    const { entryId, weight, reps } = btn.dataset;
    store.mutateWorkout(workoutId, (w) => {
      const entry = w.entries.find((e) => e.id === entryId);
      if (!entry) return;
      // Fill only the sets not already logged, so a suggestion never rewrites history.
      for (const set of entry.sets) {
        if (set.done || set.warmup) continue;
        set.weightKg = parseFloat(weight);
        set.reps = parseInt(reps, 10);
      }
    });
    toast('Applied to remaining sets');
  });

  onClick(root, '[data-add-exercise]', () => {
    openExercisePicker(async (exercise) => {
      await store.mutateWorkout(workoutId, (w) => {
        const previous = lastPerformance(exercise.id, store.state.workouts, workoutId);
        w.entries.push(newEntry(exercise.id, [
          newSet({ reps: previous?.reps ?? 0, weightKg: previous?.weightKg ?? 0 }),
        ]));
      });
    });
  });

  mountRestBar(root);

  // The elapsed tile has to advance on its own. Replacing only the totals row
  // leaves the weight and rep inputs — and their focus — untouched.
  clearInterval(elapsedTicker);
  elapsedTicker = setInterval(() => {
    if (!root.isConnected) { clearInterval(elapsedTicker); return; }
    refreshTotals(root, workoutId, unit);
  }, 1000);
}

let elapsedTicker = null;

// --- Rendering ---------------------------------------------------------------

function totalsHtml(workout, unit) {
  return [
    tile({ label: 'Elapsed', value: duration(workoutDuration(workout)), iconName: 'timer' }),
    tile({ label: 'Volume', value: volume(workoutVolume(workout), unit), iconName: 'scale' }),
    tile({ label: 'Sets', value: String(workoutSetCount(workout)), iconName: 'check' }),
  ].join('');
}

function entryHtml(entry, workout, unit) {
  const exercise = store.exerciseById(entry.exerciseId);
  const name = exercise?.name ?? 'Deleted exercise';
  const previous = exercise ? lastPerformance(exercise.id, store.state.workouts, workout.id) : null;
  const previousLabel = previous ? `${weightValue(previous.weightKg, unit)}×${previous.reps}` : '—';
  const tip = exercise ? suggest(exercise, store.state.workouts, unit, { excludeWorkoutId: workout.id }) : null;

  return `
    <div class="card" style="margin-top:14px">
      <div class="entry-head">
        <h3>${esc(name)}</h3>
        <button class="btn btn-sm btn-quiet" data-add-warmup="${entry.id}">Warm-up</button>
        <button class="icon-btn" data-drop-entry="${entry.id}" aria-label="Remove ${esc(name)}"
                style="color:var(--ink-3)">${icon('trash', 18)}</button>
      </div>

      ${tip ? `
        <div class="suggestion">
          <span class="badge badge-${tip.confidence}">${tip.confidence}</span>
          <div class="grow">
            <strong>${weightValue(tip.weightKg, unit)} ${unit} × ${tip.reps}</strong> — ${esc(tip.rationale)}
          </div>
          <button class="btn btn-sm btn-quiet" data-apply data-entry-id="${entry.id}"
                  data-weight="${tip.weightKg}" data-reps="${tip.reps}">Use</button>
        </div>` : ''}

      <div class="set-head">
        <span>Set</span><span>Prev</span><span>${unit.toUpperCase()}</span><span>Reps</span><span></span>
      </div>

      ${entry.sets.map((set, index) => setRowHtml(set, index, entry, unit, previousLabel)).join('')}

      <button class="row" data-add-set="${entry.id}" style="color:var(--accent);font-weight:600">
        ${icon('plus', 18)} Add set
      </button>
    </div>`;
}

function setRowHtml(set, index, entry, unit, previousLabel) {
  const number = set.warmup ? 'W' : String(entry.sets.filter((s, i) => !s.warmup && i <= index).length);
  return `
    <div class="set-row ${set.done ? 'done' : ''} ${set.warmup ? 'warmup' : ''}">
      <span class="set-index">${number}</span>
      <span class="set-prev">${set.warmup ? '' : previousLabel}</span>
      <input type="number" inputmode="decimal" step="any" min="0" data-field="weight"
             data-entry-id="${entry.id}" data-set-id="${set.id}"
             value="${set.weightKg ? weightValue(set.weightKg, unit) : ''}" placeholder="0"
             aria-label="Weight in ${unit}">
      <input type="number" inputmode="numeric" min="0" data-field="reps"
             data-entry-id="${entry.id}" data-set-id="${set.id}"
             value="${set.reps || ''}" placeholder="0" aria-label="Reps">
      <button class="check ${set.done ? 'on' : ''}" data-toggle
              data-entry-id="${entry.id}" data-set-id="${set.id}"
              aria-label="${set.done ? 'Mark set incomplete' : 'Mark set complete'}">
        ${icon(set.done ? 'check' : 'circle', 25)}
      </button>
    </div>`;
}

// --- Helpers -----------------------------------------------------------------

function findSet(workout, entryId, setId) {
  return workout.entries.find((e) => e.id === entryId)?.sets.find((s) => s.id === setId) ?? null;
}

function refreshTotals(root, workoutId, unit) {
  const workout = store.workoutById(workoutId);
  const el = root.querySelector('#totals');
  if (workout && el) el.innerHTML = totalsHtml(workout, unit);
}

async function finish(workout) {
  const logged = workoutSetCount(workout);
  const message = logged === 0
    ? 'Nothing was logged. Discard this session?'
    : `Finish with ${logged} set${logged === 1 ? '' : 's'}? Sets you haven’t ticked off won’t be saved.`;
  if (!window.confirm(message)) return;

  restTimer.stop();
  await store.flushWorkout(workout.id);
  await store.finishActiveWorkout(workout.id);
  navigate('#/today');
}

// --- Rest bar ----------------------------------------------------------------

function startRest(root) {
  const seconds = store.state.settings.restSeconds;
  if (seconds <= 0) return;
  restTimer.start(seconds, () => {
    haptic(store.state.settings.haptics, [90, 60, 90]);
    toast('Rest over');
  });
  paintRest(root);
}

function mountRestBar(root) {
  const host = root.querySelector('#rest-host');
  if (!host) return;
  host.addEventListener('tick', () => paintRest(root));
  paintRest(root);
}

function paintRest(root) {
  const host = root.querySelector('#rest-host');
  if (!host) return;

  if (!restTimer.running) { host.innerHTML = ''; return; }

  host.innerHTML = `
    <div class="rest" role="status">
      <div>
        <div class="rest-label">Rest</div>
        <div class="rest-time">${duration(restTimer.remaining)}</div>
      </div>
      <div class="rest-bar"><span style="width:${(restTimer.progress * 100).toFixed(1)}%"></span></div>
      <button class="btn btn-sm btn-quiet" data-rest-add>+30s</button>
      <button class="btn btn-sm btn-quiet" data-rest-skip aria-label="Skip rest">${icon('close', 16)}</button>
    </div>`;

  host.querySelector('[data-rest-add]').onclick = () => restTimer.add(30);
  host.querySelector('[data-rest-skip]').onclick = () => restTimer.stop();
}
