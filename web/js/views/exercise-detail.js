import * as store from '../store.js';
import { chrome } from '../app.js';
import { icon, tile, navigate, toast } from '../ui.js';
import { esc, weight, weightValue, fromKg, formatDay, formatFullDate } from '../format.js';
import { groupLabel, equipmentLabel, oneRepMaxHistory, personalRecord, completedSets } from '../domain.js';
import { suggest } from '../coach.js';
import { lineChart } from '../charts.js';

export default function renderExerciseDetail(root, exerciseId) {
  const exercise = store.exerciseById(exerciseId);
  if (!exercise) { navigate('#/exercises'); return; }

  const { unit } = store.state.settings;
  const workouts = store.state.workouts;

  chrome.setTitle(exercise.name);
  chrome.setLead(`<button class="icon-btn" data-back aria-label="Back">${icon('back')}</button>`);
  chrome.setActions(`
    <button class="icon-btn" data-archive aria-label="Archive exercise"
            style="color:var(--ink-3)">${icon('trash')}</button>`);
  chrome.onLead('[data-back]', () => navigate('#/exercises'));
  chrome.onAction('[data-archive]', async () => {
    if (!window.confirm(`Hide “${exercise.name}” from the library? Past sessions keep it.`)) return;
    await store.archiveExercise(exerciseId);
    toast('Archived');
    navigate('#/exercises');
  });

  const record = personalRecord(exerciseId, workouts);
  const history = oneRepMaxHistory(exerciseId, workouts);
  const tip = suggest(exercise, workouts, unit);

  const appearances = workouts
    .filter((w) => w.endedAt)
    .map((w) => ({ workout: w, entry: w.entries.find((e) => e.exerciseId === exerciseId) }))
    .filter((a) => a.entry && completedSets(a.entry).length);

  root.innerHTML = `
    <div class="tiles">
      ${tile({
        label: 'Est. 1RM',
        value: record ? weight(record.bestOneRepMaxKg, unit) : '—',
        caption: record ? `best · ${formatDay(record.achievedAt)}` : 'no data yet',
        iconName: 'stats',
      })}
      ${tile({
        label: 'Top set',
        value: record ? `${weightValue(record.bestSet.weightKg, unit)}×${record.bestSet.reps}` : '—',
        caption: 'heaviest',
        iconName: 'scale',
      })}
    </div>

    ${tip ? `
      <div class="section-title">Next session</div>
      <div class="card">
        <div class="suggestion" style="border-bottom:0">
          <span class="badge badge-${tip.confidence}">${tip.confidence}</span>
          <div class="grow">
            <strong>${weightValue(tip.weightKg, unit)} ${unit} × ${tip.reps}</strong> — ${esc(tip.rationale)}
          </div>
        </div>
      </div>` : ''}

    ${history.length >= 2 ? `
      <div class="section-title">Estimated 1RM (${unit})</div>
      <div class="card"><div class="pad">
        ${lineChart(
          history.map((p) => ({ label: formatDay(p.date), value: fromKg(p.valueKg, unit) })),
          { format: (v) => String(Math.round(v)) },
        )}
      </div></div>` : ''}

    ${exercise.description ? `
      <div class="section-title">How to do it</div>
      <div class="card"><div class="pad" style="line-height:1.55">${esc(exercise.description)}</div></div>` : ''}

    <div class="section-title">Details</div>
    <div class="card">
      <div class="row"><div class="row-main muted">Primary</div><span>${groupLabel(exercise.muscleGroup)}</span></div>
      ${exercise.secondary && exercise.secondary.length ? `
        <div class="row"><div class="row-main muted">Also works</div>
          <span>${exercise.secondary.map(groupLabel).join(', ')}</span></div>` : ''}
      <div class="row"><div class="row-main muted">Equipment</div><span>${equipmentLabel(exercise.equipment)}</span></div>
      ${exercise.notes ? `<div class="pad muted">${esc(exercise.notes)}</div>` : ''}
    </div>

    <div class="section-title">History</div>
    <div class="card">
      ${appearances.length ? appearances.map(({ workout, entry }) => `
        <a class="row" href="#/session/${workout.id}">
          <div class="row-main">
            <div class="row-title">${formatFullDate(workout.startedAt)}</div>
            <div class="row-sub">${completedSets(entry)
              .map((s) => `${weightValue(s.weightKg, unit)}×${s.reps}`).join('  ')}</div>
          </div>
          <span class="chevron">${icon('chevron', 18)}</span>
        </a>`).join('')
        : '<div class="pad muted">No logged sets yet.</div>'}
    </div>`;
}
