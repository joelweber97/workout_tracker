import * as store from '../store.js';
import { chrome } from '../app.js';
import { icon, onClick, emptyState, navigate } from '../ui.js';
import { esc, volume, shortDuration, formatDay, formatMonth } from '../format.js';
import { workoutVolume, workoutSetCount, workoutDuration } from '../domain.js';

export default function renderHistory(root) {
  chrome.setTitle('History');

  const { unit } = store.state.settings;
  const finished = store.state.workouts.filter((w) => w.endedAt);

  if (!finished.length) {
    root.innerHTML = emptyState(
      'No workouts yet',
      'Finished sessions show up here with their volume, sets and duration.',
      'Start one', 'data-start',
    );
    onClick(root, '[data-start]', async () => {
      const workout = await store.startEmptyWorkout();
      navigate(`#/workout/${workout.id}`);
    });
    return;
  }

  // Group by month, preserving the newest-first order the list already has.
  const months = [];
  for (const workout of finished) {
    const title = formatMonth(workout.startedAt);
    const bucket = months.find((m) => m.title === title);
    if (bucket) bucket.items.push(workout);
    else months.push({ title, items: [workout] });
  }

  root.innerHTML = months.map((month) => `
    <div class="section-title">${month.title}</div>
    <div class="card">
      ${month.items.map((w) => `
        <a class="row" href="#/session/${w.id}">
          <div class="row-main">
            <div class="row-title">${esc(w.name)}</div>
            <div class="row-sub">${formatDay(w.startedAt)} · ${w.entries.length} exercises ·
              ${workoutSetCount(w)} sets · ${volume(workoutVolume(w), unit)} ·
              ${shortDuration(workoutDuration(w))}</div>
          </div>
          <span class="chevron">${icon('chevron', 18)}</span>
        </a>`).join('')}
    </div>`).join('');
}
