import * as store from '../store.js';
import { chrome } from '../app.js';
import { onClick, tile, emptyState, icon, promptNumber, toast } from '../ui.js';
import { esc, volume, fromKg, toKg, weightValue, formatDay } from '../format.js';
import {
  weeklyVolume, volumeByRegion, weeklyStreak, workoutVolume, entryVolume,
  completedSets, REGION_COLORS,
} from '../domain.js';
import { barChart, barList, lineChart } from '../charts.js';

const WINDOWS = [
  { weeks: 8, label: '8 wk' },
  { weeks: 12, label: '12 wk' },
  { weeks: 26, label: '6 mo' },
];

let weeks = 12;

export default function renderStats(root) {
  chrome.setTitle('Stats');

  // One delegated listener for the life of this view; the range chips repaint
  // the markup rather than re-running the whole render, which would stack a
  // second listener on the same container every time one was tapped.
  onClick(root, '[data-weeks]', (btn) => {
    weeks = Number(btn.dataset.weeks);
    paint(root);
  });

  onClick(root, '[data-log-weight]', async () => {
    const { unit } = store.state.settings;
    const last = store.latestBodyWeight();
    const value = await promptNumber('Body weight', {
      value: last ? weightValue(last.weightKg, unit) : '',
      unit: `In ${unit}. Logging again today replaces today's reading.`,
    });
    if (value == null) return;
    await store.logBodyWeight(toKg(value, unit));
    toast('Body weight logged');
  });

  paint(root);
}

function paint(root) {

  const { unit } = store.state.settings;
  const finished = store.state.workouts.filter((w) => w.endedAt);

  if (!finished.length) {
    root.innerHTML = emptyState(
      'Nothing to chart yet',
      'Finish a workout or two and your trends show up here.',
    ) + `<div class="section-title">Body weight</div>
      <div class="card">${bodyWeightHtml(unit)}</div>`;
    return;
  }

  const since = Date.now() - weeks * 7 * 24 * 3600 * 1000;
  const inWindow = finished.filter((w) => w.startedAt >= since);
  const total = inWindow.reduce((sum, w) => sum + workoutVolume(w), 0);
  const average = inWindow.length ? total / inWindow.length : 0;

  const weekly = weeklyVolume(store.state.workouts, weeks);
  const regions = volumeByRegion(store.state.workouts, since, store.exercisesById());

  root.innerHTML = `
    <div class="chips">
      ${WINDOWS.map((w) => `
        <button class="chip" data-weeks="${w.weeks}" aria-pressed="${w.weeks === weeks}">${w.label}</button>`).join('')}
    </div>

    <div class="tiles">
      ${tile({ label: 'Sessions', value: String(inWindow.length), caption: `last ${label()}`, iconName: 'today' })}
      ${tile({ label: 'Volume', value: volume(total, unit), caption: `last ${label()}`, iconName: 'scale' })}
      ${tile({ label: 'Per session', value: volume(average, unit), caption: 'average', iconName: 'stats' })}
      ${tile({ label: 'Streak', value: String(weeklyStreak(store.state.workouts)), caption: 'weeks', iconName: 'flame' })}
    </div>

    <div class="section-title">Volume per week (${unit})</div>
    <div class="card"><div class="pad">
      ${barChart(
        weekly.map((w) => ({ label: formatDay(w.weekStart), value: fromKg(w.volumeKg, unit) })),
        { format: compact, labelEvery: Math.max(2, Math.round(weeks / 4)) },
      )}
    </div></div>

    <div class="section-title">Where the volume went</div>
    <div class="card">
      ${regions.length ? barList(
        regions.map((r) => ({ label: r.name, value: fromKg(r.volumeKg, unit) })),
        { format: (v) => `${Math.round(v).toLocaleString()} ${unit}`,
          color: (item) => REGION_COLORS[item.label] ?? 'var(--accent)' },
      ) : '<div class="pad muted">No completed sets in this range.</div>'}
    </div>

    <div class="section-title">Body weight</div>
    <div class="card">${bodyWeightHtml(unit)}</div>

    <div class="section-title">Most trained</div>
    <div class="card">
      ${rank(inWindow).slice(0, 6).map((item) => `
        <div class="row">
          <div class="row-main">
            <div class="row-title">${esc(item.name)}</div>
            <div class="row-sub">${item.sets} sets</div>
          </div>
          <span style="font-variant-numeric:tabular-nums">${volume(item.volumeKg, unit)}</span>
        </div>`).join('') || '<div class="pad muted">No completed sets in this range.</div>'}
    </div>`;

}

const label = () => WINDOWS.find((w) => w.weeks === weeks)?.label ?? `${weeks} wk`;

const compact = (value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value)));

function rank(workouts) {
  const totals = new Map();
  for (const workout of workouts) {
    for (const entry of workout.entries) {
      const name = store.exerciseById(entry.exerciseId)?.name;
      if (!name) continue;
      const current = totals.get(name) ?? { volumeKg: 0, sets: 0 };
      totals.set(name, {
        volumeKg: current.volumeKg + entryVolume(entry),
        sets: current.sets + completedSets(entry).length,
      });
    }
  }
  return [...totals.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

/**
 * Body weight over time. Muscle growth is half a scale question, and the app
 * has no other way to know whether a stalled bench is a recovery problem or
 * simply a calorie one.
 */
function bodyWeightHtml(unit) {
  const points = [...store.state.metrics].sort((a, b) => a.recordedAt - b.recordedAt);
  const log = `<button class="row" data-log-weight style="color:var(--accent);font-weight:600">
      ${icon('plus', 18)} Log body weight
    </button>`;

  if (!points.length) {
    return `<div class="pad muted">Nothing logged yet. Weekly is plenty — daily readings
      mostly measure water.</div>${log}`;
  }

  const latest = points[points.length - 1];
  const first = points[0];
  const change = fromKg(latest.weightKg - first.weightKg, unit);
  const sign = change >= 0 ? '+' : '';
  const span = points.length > 1
    ? `${sign}${change.toFixed(1)} ${unit} since ${formatDay(first.recordedAt)}`
    : 'One reading so far';

  const chart = points.length >= 2
    ? `<div class="pad">${lineChart(
        points.map((p) => ({ label: formatDay(p.recordedAt), value: fromKg(p.weightKg, unit) })),
        { format: (v) => v.toFixed(0) },
      )}</div>`
    : '';

  return `
    <div class="row">
      <div class="row-main">
        <div class="row-title">${weightValue(latest.weightKg, unit)} ${unit}</div>
        <div class="row-sub">${esc(span)}</div>
      </div>
    </div>
    ${chart}${log}`;
}
