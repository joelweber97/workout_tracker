// The logging screen. Everything is written straight through to IndexedDB, so
// closing the tab mid-session loses nothing.
//
// Two kinds of change happen here and they're handled differently: structural
// edits (adding a set, reordering exercises) re-render the view, while typing a
// weight and ticking a set update the DOM in place. A re-render on keystroke
// would blur the field you're typing into.

import * as store from '../store.js';
import { chrome } from '../app.js';
import { openExercisePicker } from '../picker.js';
import { restTimer } from '../rest.js';
import {
  icon, onClick, tile, navigate, toast, haptic, actionSheet,
} from '../ui.js';
import { esc, volume, duration, weightValue, toKg } from '../format.js';
import {
  newSet, newEntry, uid, workoutVolume, workoutSetCount, workoutDuration,
  lastPerformance, beatsRecord, pendingSets,
} from '../domain.js';
import { suggest } from '../coach.js';
import { platesPerSide, describePlates, warmupRamp, DEFAULT_BAR } from '../gym.js';

const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

let elapsedTicker = null;

export default function renderWorkout(root, workoutId) {
  const workout = store.workoutById(workoutId);
  if (!workout) { navigate('#/today'); return; }

  const { unit } = store.state.settings;

  chrome.setTitle(workout.name);
  chrome.setLead(`<button class="icon-btn" data-back aria-label="Back">${icon('back')}</button>`);
  chrome.setActions('<button class="icon-btn" data-finish>Finish</button>');
  chrome.onLead('[data-back]', () => navigate('#/today'));
  chrome.onAction('[data-finish]', () => finish(workoutId));

  root.innerHTML = `
    <div class="tiles" id="totals">${totalsHtml(workout, unit)}</div>

    <div class="card" style="margin-top:14px">
      <div class="field">
        <label for="w-name">Session name</label>
        <input id="w-name" value="${esc(workout.name)}" autocomplete="off">
      </div>
    </div>

    <div id="entries">${workout.entries.map((entry, index) =>
      entryHtml(entry, index, workout, unit)).join('')}</div>

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
      // Distinguishes a set you filled in from one a routine planned for you.
      set.touched = true;
    });
    refreshTotals(root, workoutId, unit);
    refreshPlates(root, workoutId, entryId, unit);
  });

  onClick(root, '[data-toggle]', (btn) => {
    const { entryId, setId } = btn.dataset;
    const entry = workout.entries.find((e) => e.id === entryId);
    let done = false;
    let record = false;

    store.mutateWorkoutSilently(workoutId, (w) => {
      const set = findSet(w, entryId, setId);
      if (!set) return;
      set.done = !set.done;
      set.completedAt = set.done ? Date.now() : null;
      done = set.done;
      if (done && !set.warmup && entry) {
        record = beatsRecord(set, entry.exerciseId, store.state.workouts, workoutId);
      }
    });

    const row = btn.closest('.set-row');
    btn.classList.toggle('on', done);
    btn.innerHTML = icon(done ? 'check' : 'circle', 25);
    row?.classList.toggle('done', done);
    row?.classList.toggle('pr', done && record);
    refreshTotals(root, workoutId, unit);

    if (done) {
      root.querySelector('#tick-hint')?.remove();
      haptic(store.state.settings.haptics);
      if (record) {
        const name = store.exerciseById(entry.exerciseId)?.name ?? 'that lift';
        toast(`Personal record — ${name}`);
        haptic(store.state.settings.haptics, [40, 60, 40, 60, 90]);
      }
      startRest(root);
    }
  });

  // --- Set options ----------------------------------------------------------

  onClick(root, '[data-set-options]', (btn) => {
    const { entryId, setId } = btn.dataset;
    const panel = root.querySelector(`[data-options-for="${setId}"]`);
    if (!panel) return;

    // Only one panel open at a time — two sets of RPE buttons on screen is
    // ambiguous about which set you're rating.
    root.querySelectorAll('[data-options-for]').forEach((el) => {
      if (el !== panel) el.hidden = true;
    });
    panel.hidden = !panel.hidden;
    if (!panel.hidden) panel.innerHTML = setOptionsHtml(workoutId, entryId, setId);
  });

  onClick(root, '[data-rpe]', (btn) => {
    const { entryId, setId, rpe } = btn.dataset;
    const value = rpe === '' ? null : Number(rpe);

    store.mutateWorkoutSilently(workoutId, (w) => {
      const set = findSet(w, entryId, setId);
      if (set) set.rpe = value;
    });

    btn.parentElement.querySelectorAll('[data-rpe]').forEach((el) => {
      el.setAttribute('aria-pressed', String(el === btn && value !== null));
    });
    const label = root.querySelector(`[data-set-options][data-set-id="${setId}"] .set-rpe`);
    if (label) label.textContent = value === null ? '' : `@${value}`;
  });

  onClick(root, '[data-warmup-toggle]', (btn) => {
    store.mutateWorkout(workoutId, (w) => {
      const set = findSet(w, btn.dataset.entryId, btn.dataset.setId);
      if (set) set.warmup = !set.warmup;
    });
  });

  // --- Structural edits (re-render) -----------------------------------------

  onClick(root, '[data-add-set]', (btn) => {
    store.mutateWorkout(workoutId, (w) => {
      const entry = w.entries.find((e) => e.id === btn.dataset.addSet);
      if (!entry) return;
      // Carry the previous set's numbers forward — usually the right start.
      const template = [...entry.sets].reverse().find((s) => !s.warmup) ?? entry.sets.at(-1);
      entry.sets.push(newSet({ reps: template?.reps ?? 0, weightKg: template?.weightKg ?? 0 }));
    });
  });

  onClick(root, '[data-drop-set]', (btn) => {
    const { entryId, setId } = btn.dataset;
    store.mutateWorkout(workoutId, (w) => {
      const entry = w.entries.find((e) => e.id === entryId);
      if (entry) entry.sets = entry.sets.filter((s) => s.id !== setId);
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
        // Accepting a suggestion is as deliberate as typing the numbers in.
        // Without this, using Use and then finishing without ticking reports
        // the session as empty.
        set.touched = true;
      }
    });
    toast('Applied to remaining sets');
  });

  onClick(root, '[data-entry-menu]', (btn) => {
    openEntryMenu(workoutId, btn.dataset.entryMenu, unit);
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

  // The elapsed tile advances on its own. Replacing only the totals row leaves
  // the weight and rep inputs — and their focus — untouched.
  clearInterval(elapsedTicker);
  elapsedTicker = setInterval(() => {
    if (!root.isConnected) { clearInterval(elapsedTicker); return; }
    refreshTotals(root, workoutId, unit);
  }, 1000);
}

// --- Entry menu --------------------------------------------------------------

async function openEntryMenu(workoutId, entryId, unit) {
  const workout = store.workoutById(workoutId);
  const index = workout.entries.findIndex((e) => e.id === entryId);
  const entry = workout.entries[index];
  if (!entry) return;

  const name = store.exerciseById(entry.exerciseId)?.name ?? 'Exercise';
  const next = workout.entries[index + 1];
  const grouped = Boolean(entry.group);

  const choice = await actionSheet(name, [
    { key: 'warmup', label: 'Add warm-up ramp', detail: '40 / 60 / 80%' },
    { key: 'up', label: 'Move up', disabled: index === 0 },
    { key: 'down', label: 'Move down', disabled: index === workout.entries.length - 1 },
    grouped
      ? { key: 'ungroup', label: 'Remove from superset' }
      : { key: 'group', label: 'Superset with next', disabled: !next },
    { key: 'info', label: 'How to do it' },
    { key: 'remove', label: 'Remove exercise', destructive: true },
  ]);

  if (!choice) return;

  if (choice === 'info') { navigate(`#/exercise/${entry.exerciseId}`); return; }

  store.mutateWorkout(workoutId, (w) => {
    const target = w.entries.find((e) => e.id === entryId);
    const at = w.entries.findIndex((e) => e.id === entryId);
    if (!target) return;

    switch (choice) {
      case 'warmup': {
        // Ramp from the heaviest working set that has a weight on it.
        const working = target.sets.filter((s) => !s.warmup && s.weightKg > 0);
        const top = working.reduce((best, s) => (s.weightKg > (best?.weightKg ?? 0) ? s : best), null);
        if (!top) { toast('Enter a working weight first'); return; }
        const ramp = warmupRamp(top.weightKg, unit);
        if (!ramp.length) { toast('That weight is light enough to skip warm-ups'); return; }
        target.sets = [
          ...ramp.map((step) => newSet({ ...step, warmup: true })),
          ...target.sets,
        ];
        break;
      }
      case 'up':
        if (at > 0) [w.entries[at - 1], w.entries[at]] = [w.entries[at], w.entries[at - 1]];
        break;
      case 'down':
        if (at < w.entries.length - 1) [w.entries[at + 1], w.entries[at]] = [w.entries[at], w.entries[at + 1]];
        break;
      case 'group': {
        const partner = w.entries[at + 1];
        if (!partner) break;
        // Join the pair, reusing whichever group id already exists.
        const group = target.group ?? partner.group ?? uid();
        target.group = group;
        partner.group = group;
        break;
      }
      case 'ungroup':
        target.group = null;
        break;
      case 'remove':
        w.entries = w.entries.filter((e) => e.id !== entryId);
        break;
      default:
        break;
    }
  });
}

// --- Rendering ---------------------------------------------------------------

function totalsHtml(workout, unit) {
  return [
    tile({ label: 'Elapsed', value: duration(workoutDuration(workout)), iconName: 'timer' }),
    tile({ label: 'Volume', value: volume(workoutVolume(workout), unit), iconName: 'scale' }),
    tile({ label: 'Sets', value: String(workoutSetCount(workout)), iconName: 'check' }),
  ].join('');
}

/** Superset labels are per-workout letters: A, B, C… in the order they appear. */
function groupLabels(workout) {
  const labels = new Map();
  let next = 0;
  for (const entry of workout.entries) {
    if (entry.group && !labels.has(entry.group)) {
      labels.set(entry.group, String.fromCharCode(65 + next));
      next += 1;
    }
  }
  return labels;
}

function entryHtml(entry, index, workout, unit) {
  // Shown on the first exercise until something has been ticked. The circle is
  // the least discoverable control on the screen and the most consequential.
  const showHint = index === 0 && workoutSetCount(workout) === 0;
  const exercise = store.exerciseById(entry.exerciseId);
  const name = exercise?.name ?? 'Deleted exercise';
  const previous = exercise ? lastPerformance(exercise.id, store.state.workouts, workout.id) : null;
  const previousLabel = previous ? `${weightValue(previous.weightKg, unit)}×${previous.reps}` : '—';
  const tip = exercise ? suggest(exercise, store.state.workouts, unit, { excludeWorkoutId: workout.id }) : null;
  const label = groupLabels(workout).get(entry.group);

  return `
    <div class="card" style="margin-top:14px">
      <div class="entry-head">
        ${label ? `<span class="group-tag">SS ${label}</span>` : ''}
        <h3>${esc(name)}</h3>
        <button class="icon-btn" data-entry-menu="${entry.id}"
                aria-label="Options for ${esc(name)}" style="color:var(--ink-3)">${icon('more', 20)}</button>
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

      ${entry.sets.map((set, i) => setRowHtml(set, i, entry, unit, previousLabel)).join('')}

      ${showHint ? `<div class="hint" id="tick-hint">
        Tap the circle when you finish a set — that logs it and starts your rest timer.
      </div>` : ''}

      <div data-plates-for="${entry.id}">${platesHtml(entry, exercise, unit)}</div>

      <button class="row" data-add-set="${entry.id}" style="color:var(--accent);font-weight:600">
        ${icon('plus', 18)} Add set
      </button>
    </div>`;
}

function setRowHtml(set, index, entry, unit, previousLabel) {
  const number = set.warmup
    ? 'W'
    : String(entry.sets.filter((s, i) => !s.warmup && i <= index).length);

  return `
    <div class="set-row ${set.done ? 'done' : ''} ${set.warmup ? 'warmup' : ''}">
      <button class="set-index" data-set-options data-entry-id="${entry.id}" data-set-id="${set.id}"
              aria-label="Options for set ${number}">
        ${number}<span class="set-rpe">${set.rpe ? `@${set.rpe}` : ''}</span>
      </button>
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
    </div>
    <div data-options-for="${set.id}" hidden></div>`;
}

function setOptionsHtml(workoutId, entryId, setId) {
  const set = findSet(store.workoutById(workoutId), entryId, setId);
  if (!set) return '';

  return `
    <div class="rpe-grid">
      ${RPE_VALUES.map((value) => `
        <button data-rpe="${value}" data-entry-id="${entryId}" data-set-id="${setId}"
                aria-pressed="${set.rpe === value}">${value}</button>`).join('')}
      <button data-rpe="" data-entry-id="${entryId}" data-set-id="${setId}"
              aria-pressed="false">—</button>
    </div>
    <div class="pad muted" style="font-size:12px;padding-top:4px">
      RPE: how hard the set felt. 10 is failure, 8 is two reps left. The coach uses it
      to decide between adding weight and holding.
    </div>
    <div class="spread pad" style="padding-top:0">
      <button class="btn btn-sm btn-quiet" data-warmup-toggle
              data-entry-id="${entryId}" data-set-id="${setId}">
        ${set.warmup ? 'Make working set' : 'Mark as warm-up'}
      </button>
      <button class="btn btn-sm btn-danger" data-drop-set
              data-entry-id="${entryId}" data-set-id="${setId}">Delete set</button>
    </div>`;
}

/** Plate maths, shown only where a loaded bar is actually involved. */
function platesHtml(entry, exercise, unit) {
  if (!exercise || exercise.equipment !== 'barbell') return '';

  const working = entry.sets.filter((s) => !s.warmup && s.weightKg > 0);
  const top = working.reduce((best, s) => (s.weightKg > (best?.weightKg ?? 0) ? s : best), null);
  if (!top) return '';

  const result = platesPerSide(top.weightKg, unit);
  if (!result) {
    return `<div class="plates">${icon('scale', 15)} Below an empty ${DEFAULT_BAR[unit]} ${unit} bar</div>`;
  }

  const remainder = result.remainder > 0.01
    ? ` <span style="color:var(--warn)">+${result.remainder} ${unit} short</span>`
    : '';

  return `<div class="plates">${icon('scale', 15)} Per side:
    <strong>${describePlates(result)}</strong>${remainder}</div>`;
}

// --- Helpers -----------------------------------------------------------------

function findSet(workout, entryId, setId) {
  return workout?.entries.find((e) => e.id === entryId)?.sets.find((s) => s.id === setId) ?? null;
}

function refreshTotals(root, workoutId, unit) {
  const workout = store.workoutById(workoutId);
  const el = root.querySelector('#totals');
  if (workout && el) el.innerHTML = totalsHtml(workout, unit);
}

function refreshPlates(root, workoutId, entryId, unit) {
  const host = root.querySelector(`[data-plates-for="${entryId}"]`);
  if (!host) return;
  const entry = store.workoutById(workoutId)?.entries.find((e) => e.id === entryId);
  if (entry) host.innerHTML = platesHtml(entry, store.exerciseById(entry.exerciseId), unit);
}

/**
 * Finishing has to account for sets that were filled in but never ticked.
 * Typing a weight and reps is a log in every sense except the tick, and
 * silently discarding it — which is what this used to do — is the worst
 * possible outcome for someone who has just trained.
 */
async function finish(workoutId) {
  // Read it now rather than trusting whatever was captured at render time:
  // every structural edit replaces this object in the store.
  const workout = store.workoutById(workoutId);
  if (!workout) { navigate('#/today'); return; }

  const ticked = workoutSetCount(workout);
  const pending = pendingSets(workout);

  if (ticked === 0 && pending.length === 0) {
    if (!window.confirm('Nothing was logged. Discard this session?')) return;
    await close(workoutId);
    return;
  }

  const plural = (n) => (n === 1 ? '' : 's');
  const options = [];

  if (pending.length) {
    options.push({
      key: 'all',
      label: `Log ${ticked + pending.length} set${plural(ticked + pending.length)} and finish`,
      detail: `includes ${pending.length} unticked`,
    });
  }
  if (ticked) {
    options.push({
      key: 'ticked',
      label: `Finish with ${ticked} ticked set${plural(ticked)}`,
      detail: pending.length ? `discards ${pending.length}` : undefined,
    });
  }
  options.push({ key: 'discard', label: 'Discard session', destructive: true });

  const choice = await actionSheet('Finish workout', options);
  if (!choice) return;

  if (choice === 'discard') {
    if (!window.confirm('Discard this session? It cannot be recovered.')) return;
    restTimer.stop();
    await store.deleteWorkout(workoutId);
    navigate('#/today');
    return;
  }

  if (choice === 'all') {
    await store.mutateWorkout(workoutId, (w) => {
      for (const entry of w.entries) {
        for (const set of entry.sets) {
          if (!set.done && !set.warmup && set.touched && set.reps > 0) {
            set.done = true;
            set.completedAt = Date.now();
          }
        }
      }
    });
  }

  await close(workoutId);
}

async function close(workoutId) {
  restTimer.stop();
  await store.flushWorkout(workoutId);
  await store.finishActiveWorkout(workoutId);
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
