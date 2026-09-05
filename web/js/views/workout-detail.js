import * as store from '../store.js';
import { chrome } from '../app.js';
import { icon, tile, navigate, toast } from '../ui.js';
import { esc, volume, shortDuration, weight, formatFullDate } from '../format.js';
import {
  workoutVolume, workoutSetCount, workoutDuration, entryBestOneRepMax,
} from '../domain.js';

export default function renderWorkoutDetail(root, workoutId) {
  const workout = store.workoutById(workoutId);
  if (!workout) { navigate('#/history'); return; }

  const { unit } = store.state.settings;

  chrome.setTitle(workout.name);
  chrome.setLead(`<button class="icon-btn" data-back aria-label="Back">${icon('back')}</button>`);
  chrome.setActions(`
    <button class="icon-btn" data-delete aria-label="Delete session"
            style="color:var(--ink-3)">${icon('trash')}</button>`);
  chrome.onLead('[data-back]', () => navigate('#/history'));
  chrome.onAction('[data-delete]', async () => {
    if (!window.confirm('Delete this session permanently?')) return;
    await store.deleteWorkout(workoutId);
    toast('Session deleted');
    navigate('#/history');
  });

  root.innerHTML = `
    <p class="muted">${formatFullDate(workout.startedAt)}</p>
    <div class="tiles">
      ${tile({ label: 'Duration', value: shortDuration(workoutDuration(workout)), iconName: 'timer' })}
      ${tile({ label: 'Volume', value: volume(workoutVolume(workout), unit), iconName: 'scale' })}
      ${tile({ label: 'Sets', value: String(workoutSetCount(workout)), iconName: 'check' })}
    </div>

    ${workout.entries.map((entry) => {
      const exercise = store.exerciseById(entry.exerciseId);
      const best = entryBestOneRepMax(entry);
      return `
        <div class="section-title">${esc(exercise?.name ?? 'Deleted exercise')}</div>
        <div class="card">
          ${entry.sets.map((set, i) => `
            <div class="row">
              <div class="row-main">${set.warmup ? 'Warm-up' : `Set ${i + 1}`}</div>
              <strong style="font-variant-numeric:tabular-nums">
                ${weight(set.weightKg, unit)} × ${set.reps}
              </strong>
            </div>`).join('')}
          ${best ? `<div class="row"><div class="row-main muted">Estimated 1RM</div>
            <span class="muted">${weight(best, unit)}</span></div>` : ''}
        </div>`;
    }).join('')}

    ${workout.notes ? `<div class="section-title">Notes</div>
      <div class="card"><div class="pad">${esc(workout.notes)}</div></div>` : ''}`;

}
