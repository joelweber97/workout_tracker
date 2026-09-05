import * as store from '../store.js';
import { chrome } from '../app.js';
import { icon, onClick, tile, navigate, toast } from '../ui.js';
import { esc, volume, relative, formatDay } from '../format.js';
import { startOfWeek, workoutVolume, workoutSetCount, weeklyStreak } from '../domain.js';
import { review } from '../coach.js';

export default function renderToday(root) {
  chrome.setTitle('Today');
  chrome.setActions(`<button class="icon-btn" data-settings aria-label="Settings">${icon('gear')}</button>`);
  chrome.onAction('[data-settings]', () => navigate('#/settings'));

  const { unit } = store.state.settings;
  const active = store.activeWorkout();
  const finished = store.state.workouts.filter((w) => w.endedAt);
  const weekStart = startOfWeek(Date.now());
  const thisWeek = finished.filter((w) => w.startedAt >= weekStart);
  const weekVolume = thisWeek.reduce((sum, w) => sum + workoutVolume(w), 0);

  const notes = review(store.state.workouts, store.state.exercises, unit);
  const headline = notes.find((n) => n.kind === 'warn') ?? notes[0];

  root.innerHTML = `
    <div class="tiles">
      ${tile({ label: 'Sessions', value: String(thisWeek.length), caption: 'this week', iconName: 'today' })}
      ${tile({ label: 'Volume', value: volume(weekVolume, unit), caption: 'this week', iconName: 'scale' })}
      ${tile({ label: 'Streak', value: String(weeklyStreak(store.state.workouts)), caption: 'weeks', iconName: 'flame' })}
    </div>

    ${active ? `
      <div class="section-title">In progress</div>
      <div class="card">
        <a class="row" href="#/workout/${active.id}">
          <div class="row-main">
            <div class="row-title">${esc(active.name)}</div>
            <div class="row-sub">${workoutSetCount(active)} sets logged · started ${relative(active.startedAt)}</div>
          </div>
          <span class="chevron">${icon('chevron', 18)}</span>
        </a>
      </div>
    ` : `
      <div style="margin-top:14px" class="stack">
        <button class="btn btn-primary btn-block" data-start>${icon('plus')} Start empty workout</button>
        ${finished.length ? `
          <button class="btn btn-quiet btn-block" data-repeat="${finished[0].id}">
            ${icon('repeat')} Repeat “${esc(finished[0].name)}”
          </button>` : ''}
      </div>
    `}

    <div class="section-title">Coach</div>
    <div class="card">
      <a class="row" href="#/coach">
        <span class="dot dot-${headline.kind === 'warn' ? 'warn' : headline.kind === 'good' ? 'good' : 'info'}"></span>
        <div class="row-main">
          <div class="row-title">${esc(headline.title)}</div>
          <div class="row-sub">${esc(headline.detail)}</div>
        </div>
        <span class="chevron">${icon('chevron', 18)}</span>
      </a>
    </div>

    <div class="section-title spread">
      <span>Routines</span>
      <button class="icon-btn" data-new-routine aria-label="New routine">${icon('plus', 18)}</button>
    </div>
    <div class="card">
      ${store.state.routines.length ? store.state.routines.map((r) => `
        <div class="row">
          <a class="row-main" href="#/routine/${r.id}" style="text-decoration:none;color:inherit">
            <div class="row-title">${esc(r.name)}</div>
            <div class="row-sub">${esc(summarize(r))}</div>
          </a>
          <button class="btn btn-sm btn-quiet" data-run="${r.id}" ${active ? 'disabled' : ''}>Start</button>
        </div>`).join('')
        : '<div class="pad muted">No routines yet. Create one to start a session with your exercises already laid out.</div>'}
    </div>

    ${finished.length ? `
      <div class="section-title">Recent</div>
      <div class="card">
        ${finished.slice(0, 3).map((w) => `
          <a class="row" href="#/session/${w.id}">
            <div class="row-main">
              <div class="row-title">${esc(w.name)}</div>
              <div class="row-sub">${formatDay(w.startedAt)} · ${workoutSetCount(w)} sets · ${volume(workoutVolume(w), unit)}</div>
            </div>
            <span class="chevron">${icon('chevron', 18)}</span>
          </a>`).join('')}
      </div>` : ''}
  `;

  onClick(root, '[data-start]', async () => {
    const workout = await store.startEmptyWorkout();
    navigate(`#/workout/${workout.id}`);
  });

  onClick(root, '[data-run]', async (btn) => {
    if (store.activeWorkout()) { toast('Finish the session in progress first.'); return; }
    const routine = store.routineById(btn.dataset.run);
    if (!routine) return;
    const workout = await store.startFromRoutine(routine);
    navigate(`#/workout/${workout.id}`);
  });

  onClick(root, '[data-repeat]', async (btn) => {
    const workout = await store.repeatWorkout(btn.dataset.repeat);
    if (!workout) { toast('Couldn’t find that session'); return; }
    navigate(`#/workout/${workout.id}`);
  });

  onClick(root, '[data-new-routine]', async () => {
    const routine = await store.createRoutine();
    navigate(`#/routine/${routine.id}`);
  });
}

function summarize(routine) {
  const names = routine.items
    .map((i) => store.exerciseById(i.exerciseId)?.name)
    .filter(Boolean);
  if (!names.length) return 'No exercises yet';
  const head = names.slice(0, 3).join(', ');
  return names.length > 3 ? `${head} +${names.length - 3}` : head;
}
