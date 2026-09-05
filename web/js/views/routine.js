import * as store from '../store.js';
import { chrome } from '../app.js';
import { openExercisePicker } from '../picker.js';
import { icon, onClick, navigate, toast } from '../ui.js';
import { esc } from '../format.js';
import { uid } from '../domain.js';

export default function renderRoutine(root, routineId) {
  const routine = store.routineById(routineId);
  if (!routine) { navigate('#/today'); return; }

  chrome.setTitle('Routine');
  chrome.setLead(`<button class="icon-btn" data-back aria-label="Back">${icon('back')}</button>`);
  chrome.onLead('[data-back]', () => navigate('#/today'));

  root.innerHTML = `
    <div class="card">
      <div class="field">
        <label for="r-name">Name</label>
        <input id="r-name" value="${esc(routine.name)}" autocomplete="off">
      </div>
      <div class="field">
        <label for="r-notes">Notes</label>
        <textarea id="r-notes" placeholder="Anything worth remembering">${esc(routine.notes)}</textarea>
      </div>
    </div>

    <div class="section-title">Exercises</div>
    <div class="card">
      ${routine.items.length ? routine.items.map((item, index) => {
        const exercise = store.exerciseById(item.exerciseId);
        return `
          <div class="row">
            <div class="row-main">
              <div class="row-title">${esc(exercise?.name ?? 'Deleted exercise')}</div>
              <div class="row-sub">
                <label class="sr-only" for="sets-${item.id}">Target sets</label>
                <input id="sets-${item.id}" type="number" min="1" max="12" value="${item.targetSets}"
                       data-item="${item.id}" data-key="targetSets"
                       style="width:52px;display:inline-block;padding:4px"> sets ×
                <label class="sr-only" for="reps-${item.id}">Target reps</label>
                <input id="reps-${item.id}" type="number" min="1" max="50" value="${item.targetReps}"
                       data-item="${item.id}" data-key="targetReps"
                       style="width:52px;display:inline-block;padding:4px"> reps
              </div>
            </div>
            <button class="icon-btn" data-up="${item.id}" aria-label="Move up"
                    style="color:var(--ink-3)" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon-btn" data-drop="${item.id}" aria-label="Remove"
                    style="color:var(--ink-3)">${icon('trash', 18)}</button>
          </div>`;
      }).join('') : '<div class="pad muted">No exercises yet.</div>'}
      <button class="row" data-add style="color:var(--accent);font-weight:600">
        ${icon('plus', 18)} Add exercise
      </button>
    </div>

    <div style="margin-top:14px">
      <button class="btn btn-danger btn-block" data-delete>Delete routine</button>
    </div>`;

  // Text fields save without re-rendering so the caret doesn't jump.
  root.querySelector('#r-name').addEventListener('input', (event) => {
    routine.name = event.target.value;
    save(routine);
  });
  root.querySelector('#r-notes').addEventListener('input', (event) => {
    routine.notes = event.target.value;
    save(routine);
  });

  root.addEventListener('input', (event) => {
    const field = event.target.closest('[data-item]');
    if (!field) return;
    const item = routine.items.find((i) => i.id === field.dataset.item);
    if (!item) return;
    const value = parseInt(field.value, 10);
    if (Number.isFinite(value) && value > 0) {
      item[field.dataset.key] = value;
      save(routine);
    }
  });

  onClick(root, '[data-add]', () => {
    openExercisePicker(async (exercise) => {
      routine.items.push({ id: uid(), exerciseId: exercise.id, targetSets: 3, targetReps: 8 });
      await store.saveRoutine(routine);
    });
  });

  onClick(root, '[data-drop]', async (btn) => {
    routine.items = routine.items.filter((i) => i.id !== btn.dataset.drop);
    await store.saveRoutine(routine);
  });

  onClick(root, '[data-up]', async (btn) => {
    const index = routine.items.findIndex((i) => i.id === btn.dataset.up);
    if (index <= 0) return;
    [routine.items[index - 1], routine.items[index]] = [routine.items[index], routine.items[index - 1]];
    await store.saveRoutine(routine);
  });

  onClick(root, '[data-delete]', async () => {
    if (!window.confirm(`Delete “${routine.name}”? Sessions already logged from it are kept.`)) return;
    await store.deleteRoutine(routineId);
    toast('Routine deleted');
    navigate('#/today');
  });
}

/** Writes without re-rendering, so the field you're typing in keeps focus. */
function save(routine) {
  store.saveRoutineSilently(routine);
}
