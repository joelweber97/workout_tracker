// The progression engine: what weight and reps to use next, and why.
//
// This is deliberately deterministic rather than a model call. It sees the full
// logged history exactly, the arithmetic is reliable, and every suggestion comes
// with a rationale you can check. The optional Claude review in `ai.js` layers
// qualitative coaching on top of these numbers — it does not replace them.

import { completedSets, estimatedOneRepMax, oneRepMaxHistory } from './domain.js';
import { toKg, weightValue } from './format.js';

/**
 * Smallest weight jump that's actually loadable, in kilograms.
 * Barbells move in plate pairs; dumbbells and stacks move in fixed steps.
 */
function increment(equipment, muscleGroup, unit) {
  const lower = ['quads', 'hamstrings', 'glutes', 'calves'].includes(muscleGroup);
  // In pounds these land on 5 / 10 lb; in kilos on 2.5 / 5 kg.
  const smallStep = unit === 'kg' ? 2.5 : toKg(5, 'lb');
  const bigStep = unit === 'kg' ? 5 : toKg(10, 'lb');

  switch (equipment) {
    case 'barbell':
      return lower ? bigStep : smallStep;
    case 'dumbbell':
      return unit === 'kg' ? 2 : toKg(5, 'lb');
    case 'machine':
    case 'cable':
      return unit === 'kg' ? 2.5 : toKg(5, 'lb');
    default:
      return smallStep;
  }
}

/** Snaps a target to something you can actually load on the bar or the stack. */
function roundToLoadable(kg, step) {
  if (step <= 0) return kg;
  return Math.max(0, Math.round(kg / step) * step);
}

/**
 * The rep range to progress within. Derived from how the user actually trains
 * this movement rather than imposed, then clamped to something sane for the
 * equipment — a 3-rep lateral raise isn't a hypertrophy prescription.
 */
function repRange(sets, equipment, muscleGroup) {
  const isolation = ['biceps', 'triceps', 'calves', 'core'].includes(muscleGroup);
  const compound = ['barbell', 'bodyweight'].includes(equipment) && !isolation;

  const defaults = compound ? [5, 8] : isolation ? [10, 15] : [8, 12];
  if (!sets.length) return defaults;

  const reps = sets.map((s) => s.reps).filter((r) => r > 0).sort((a, b) => a - b);
  if (!reps.length) return defaults;

  const median = reps[Math.floor(reps.length / 2)];
  // Anchor a 4-rep window on what they're already doing.
  const low = Math.max(3, median - 1);
  return [low, low + 3];
}

/**
 * Has this lift stopped moving? Compares the best estimated 1RM of the last
 * three sessions against the three before them.
 */
function isStalled(history) {
  if (history.length < 4) return false;
  const recent = history.slice(-3).map((p) => p.valueKg);
  const earlier = history.slice(-6, -3).map((p) => p.valueKg);
  if (!earlier.length) return false;
  const best = (xs) => Math.max(...xs);
  // A stall is no improvement at all, not merely a slow one.
  return best(recent) <= best(earlier) * 1.001;
}

/**
 * Suggests the working weight and reps for the next set of an exercise.
 * Returns null when there's no history to reason from — an invented number is
 * worse than no number.
 */
export function suggest(exercise, workouts, unit, { excludeWorkoutId = null } = {}) {
  const finished = workouts
    .filter((w) => w.endedAt && w.id !== excludeWorkoutId)
    .sort((a, b) => b.startedAt - a.startedAt);

  // The most recent session that actually contained completed sets of this lift.
  let lastSets = null;
  let lastDate = null;
  for (const w of finished) {
    const sets = w.entries
      .filter((e) => e.exerciseId === exercise.id)
      .flatMap(completedSets);
    if (sets.length) { lastSets = sets; lastDate = w.startedAt; break; }
  }
  if (!lastSets) return null;

  const step = increment(exercise.equipment, exercise.muscleGroup, unit);
  const [low, high] = repRange(lastSets, exercise.equipment, exercise.muscleGroup);
  const history = oneRepMaxHistory(exercise.id, finished);

  // The top set carries the decision; back-off sets follow it.
  const top = lastSets.reduce((best, s) => (
    (estimatedOneRepMax(s) ?? 0) > (estimatedOneRepMax(best) ?? 0) ? s : best
  ));
  const hitTopOfRange = lastSets.every((s) => s.reps >= high);
  const rpes = lastSets.map((s) => s.rpe).filter((v) => v != null);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

  const show = (kg) => `${weightValue(kg, unit)} ${unit}`;

  if (isStalled(history)) {
    const weightKg = roundToLoadable(top.weightKg * 0.9, step);
    return {
      weightKg,
      reps: high,
      confidence: 'deload',
      rationale: `Your estimated 1RM hasn't moved in three sessions. Drop to ${show(weightKg)} for ${high} reps this week, then build back — a stall usually means recovery, not effort.`,
    };
  }

  if (avgRpe != null && avgRpe >= 9.5) {
    return {
      weightKg: top.weightKg,
      reps: top.reps,
      confidence: 'hold',
      rationale: `Last session averaged RPE ${avgRpe.toFixed(1)} — that was already near failure. Repeat ${show(top.weightKg)} × ${top.reps} and add reps once it moves faster.`,
    };
  }

  if (hitTopOfRange) {
    // Easy last session earns a double jump.
    const jump = avgRpe != null && avgRpe <= 7 ? step * 2 : step;
    const weightKg = roundToLoadable(top.weightKg + jump, step);
    const easy = jump > step ? ` Last session averaged RPE ${avgRpe.toFixed(1)}, so this takes a double jump.` : '';
    return {
      weightKg,
      reps: low,
      confidence: 'progress',
      rationale: `You hit ${high} reps on every set at ${show(top.weightKg)}. Move to ${show(weightKg)} and restart the range at ${low} reps.${easy}`,
    };
  }

  const target = Math.min(high, top.reps + 1);
  return {
    weightKg: top.weightKg,
    reps: target,
    confidence: 'progress',
    rationale: `Stay at ${show(top.weightKg)} and chase ${target} reps. Once every set reaches ${high}, the weight goes up ${show(step)}.`,
  };
}

/**
 * Whole-programme observations for the coach panel: what's moving, what's
 * stuck, and where the volume is lopsided.
 */
export function review(workouts, exercises, unit, now = Date.now()) {
  const finished = workouts.filter((w) => w.endedAt);
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const notes = [];

  if (finished.length < 2) {
    return [{
      kind: 'info',
      title: 'Not enough history yet',
      detail: 'Log two or three sessions and this fills in with progression, stalls and volume balance.',
    }];
  }

  // Frequency over the last four weeks.
  const fourWeeks = now - 28 * 24 * 3600 * 1000;
  const recent = finished.filter((w) => w.startedAt >= fourWeeks);
  const perWeek = recent.length / 4;
  if (perWeek < 2) {
    notes.push({
      kind: 'warn',
      title: `${perWeek.toFixed(1)} sessions a week`,
      detail: 'Most muscle groups respond best to being trained at least twice a week. Two or three sessions is the usual floor for growth.',
    });
  }

  // Per-exercise trend across everything with enough history to judge.
  const moving = [];
  const stuck = [];
  for (const exercise of exercises) {
    const history = oneRepMaxHistory(exercise.id, finished);
    if (history.length < 3) continue;
    const first = history[Math.max(0, history.length - 4)].valueKg;
    const last = history[history.length - 1].valueKg;
    const change = (last - first) / first;
    if (change > 0.02) moving.push({ exercise, change });
    else if (change <= 0) stuck.push({ exercise, change });
  }

  moving.sort((a, b) => b.change - a.change);
  stuck.sort((a, b) => a.change - b.change);

  if (moving.length) {
    const names = moving.slice(0, 3).map((m) => `${m.exercise.name} (+${(m.change * 100).toFixed(0)}%)`);
    notes.push({
      kind: 'good',
      title: 'Moving up',
      detail: `${names.join(', ')} — estimated 1RM over your last few sessions.`,
    });
  }

  if (stuck.length) {
    const names = stuck.slice(0, 3).map((s) => s.exercise.name);
    notes.push({
      kind: 'warn',
      title: 'Not moving',
      detail: `${names.join(', ')} haven't improved in several sessions. The set page suggests a deload for these.`,
    });
  }

  // Volume balance across pushing, pulling and legs.
  const totals = new Map();
  for (const w of recent) {
    for (const entry of w.entries) {
      const exercise = byId.get(entry.exerciseId);
      if (!exercise) continue;
      const sets = completedSets(entry).length;
      totals.set(exercise.muscleGroup, (totals.get(exercise.muscleGroup) ?? 0) + sets);
    }
  }
  const push = (totals.get('chest') ?? 0) + (totals.get('shoulders') ?? 0) + (totals.get('triceps') ?? 0);
  const pull = (totals.get('back') ?? 0) + (totals.get('biceps') ?? 0);
  const legs = ['quads', 'hamstrings', 'glutes', 'calves'].reduce((sum, g) => sum + (totals.get(g) ?? 0), 0);

  if (push > 0 && pull > 0 && push > pull * 1.5) {
    notes.push({
      kind: 'warn',
      title: 'Pushing outweighs pulling',
      detail: `${push} pushing sets against ${pull} pulling in the last four weeks. Roughly even is kinder to your shoulders.`,
    });
  }
  if ((push + pull) > 0 && legs < (push + pull) * 0.3) {
    notes.push({
      kind: 'warn',
      title: 'Legs are undertrained',
      detail: `${legs} leg sets against ${push + pull} upper-body sets in the last four weeks.`,
    });
  }

  // Weekly set counts per muscle group — the number that actually drives growth.
  const light = [...totals.entries()]
    .filter(([, sets]) => sets > 0 && sets / 4 < 10)
    .map(([group]) => group);
  if (light.length) {
    notes.push({
      kind: 'info',
      title: 'Below 10 sets a week',
      detail: `${light.join(', ')}. Ten to twenty hard sets per muscle per week is the range most hypertrophy research settles on.`,
    });
  }

  return notes.length ? notes : [{
    kind: 'good',
    title: 'Nothing to flag',
    detail: 'Frequency, balance and progression all look reasonable over the last four weeks.',
  }];
}
