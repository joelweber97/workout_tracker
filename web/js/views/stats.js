import * as store from '../store.js';
import { chrome } from '../app.js';
import { onClick, tile, emptyState, icon, promptNumbers, toast } from '../ui.js';
import { esc, volume, fromKg, toKg, weightValue, formatDay } from '../format.js';
import {
  weeklyVolume, volumeByRegion, weeklyStreak, workoutVolume, entryVolume,
  completedSets, REGION_COLORS,
  leanMassKg,
} from '../domain.js';
import { barChart, barList, lineChart, multiLineChart } from '../charts.js';

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
    // Prefill from the most recent day that recorded each field, not the most
    // recent day overall — body fat is usually measured less often than weight.
    const lastWeight = store.latestWith('weightKg');
    const lastFat = store.latestWith('bodyFatPct');

    const values = await promptNumbers('Body composition', [
      {
        name: 'weight',
        label: `Weight (${unit})`,
        value: lastWeight ? weightValue(lastWeight.weightKg, unit) : '',
        min: 0,
      },
      {
        name: 'bodyFat',
        label: 'Body fat (%)',
        value: lastFat ? lastFat.bodyFatPct : '',
        step: '0.1',
        min: 1,
        max: 70,
        placeholder: 'optional',
      },
    ], {
      note: 'Leave either blank to skip it. Logging again today updates today’s reading.',
    });

    if (!values) return;
    await store.logBodyMetrics({
      weightKg: values.weight != null ? toKg(values.weight, unit) : null,
      bodyFatPct: values.bodyFat,
    });
    toast('Logged');
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
    ) + `<div class="section-title">Body composition</div>
      <div class="card">${bodyCompositionHtml(unit)}</div>`;
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

    <div class="section-title">Body composition</div>
    <div class="card">${bodyCompositionHtml(unit)}</div>

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
 * Body composition. Weight and lean mass share a unit so they share one chart;
 * body fat is a percentage and gets its own, because putting a second y-scale
 * behind it would invite comparisons between two things that aren't comparable.
 */
function bodyCompositionHtml(unit) {
  const points = [...store.state.metrics].sort((a, b) => a.recordedAt - b.recordedAt);
  const log = `<button class="row" data-log-weight style="color:var(--accent);font-weight:600">
      ${icon('plus', 18)} Log weight and body fat
    </button>`;

  if (!points.length) {
    return `<div class="pad muted">Nothing logged yet. Weekly is plenty — daily readings
      mostly measure water. Body fat is optional; log it when you have a number worth trusting.</div>${log}`;
  }

  const weights = points.filter((p) => p.weightKg != null);
  const fats = points.filter((p) => p.bodyFatPct != null);
  const leans = points.filter((p) => leanMassKg(p) != null);
  const latestWeight = weights[weights.length - 1] ?? null;
  const latestFat = fats[fats.length - 1] ?? null;

  const delta = (list, read) => {
    if (list.length < 2) return null;
    const change = read(list[list.length - 1]) - read(list[0]);
    return `${change >= 0 ? '+' : ''}${change.toFixed(1)}`;
  };

  const tiles = `<div class="tiles" style="padding:12px">
    ${tile({
      label: 'Weight',
      value: latestWeight ? `${weightValue(latestWeight.weightKg, unit)} ${unit}` : '—',
      caption: delta(weights, (p) => fromKg(p.weightKg, unit))
        ? `${delta(weights, (p) => fromKg(p.weightKg, unit))} ${unit}` : 'first reading',
      iconName: 'scale',
    })}
    ${tile({
      label: 'Body fat',
      value: latestFat ? `${latestFat.bodyFatPct.toFixed(1)}%` : '—',
      caption: delta(fats, (p) => p.bodyFatPct)
        ? `${delta(fats, (p) => p.bodyFatPct)} pts` : 'not logged',
      iconName: 'body',
    })}
    ${tile({
      label: 'Lean mass',
      value: leans.length
        ? `${weightValue(leanMassKg(leans[leans.length - 1]), unit)} ${unit}` : '—',
      caption: delta(leans, (p) => fromKg(leanMassKg(p), unit))
        ? `${delta(leans, (p) => fromKg(leanMassKg(p), unit))} ${unit}` : 'needs body fat',
      iconName: 'stats',
    })}
  </div>`;

  // Two series in the same unit, so one axis is honest here.
  const massChart = multiLineChart([
    {
      label: `Weight (${unit})`,
      color: 'var(--accent)',
      points: weights.map((p) => ({ label: formatDay(p.recordedAt), value: fromKg(p.weightKg, unit) })),
    },
    {
      label: `Lean mass (${unit})`,
      color: 'var(--upper)',
      points: leans.map((p) => ({ label: formatDay(p.recordedAt), value: fromKg(leanMassKg(p), unit) })),
    },
  ], { format: (v) => v.toFixed(0) });

  const fatChart = fats.length >= 2
    ? `<div class="section-label">Body fat (%)</div>${lineChart(
        fats.map((p) => ({ label: formatDay(p.recordedAt), value: p.bodyFatPct })),
        { height: 120, format: (v) => v.toFixed(0) },
      )}`
    : '';

  const charts = massChart || fatChart
    ? `<div class="pad" style="padding-top:0">${massChart}${fatChart}</div>`
    : '';

  const hint = !fats.length
    ? `<div class="pad muted" style="font-size:12px;padding-top:0">
        Add a body fat reading and this also tracks lean mass — the number that
        separates gaining muscle from just gaining weight.
      </div>`
    : '';

  return `${tiles}${charts}${hint}${log}`;
}
