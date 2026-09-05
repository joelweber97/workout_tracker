// Pure domain logic: the shape of the data and the numbers derived from it.
// No DOM, no storage — everything here is testable in isolation.

export const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'core',
  'fullBody', 'cardio',
];

export const EQUIPMENT = [
  'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'band', 'other',
];

const GROUP_LABELS = { fullBody: 'Full body' };

export function groupLabel(group) {
  return GROUP_LABELS[group] ?? group.charAt(0).toUpperCase() + group.slice(1);
}

export function equipmentLabel(item) {
  return item.charAt(0).toUpperCase() + item.slice(1);
}

/** Coarse grouping behind the "where the volume went" chart. */
export function region(group) {
  if (['chest', 'back', 'shoulders', 'biceps', 'triceps'].includes(group)) return 'Upper';
  if (['quads', 'hamstrings', 'glutes', 'calves'].includes(group)) return 'Lower';
  return 'Other';
}

export const REGION_COLORS = { Upper: 'var(--upper)', Lower: 'var(--lower)', Other: 'var(--other)' };

/**
 * Lean mass: everything that isn't fat. Two people can both gain three pounds
 * and only one of them gained muscle, which is the whole reason to log body fat
 * alongside weight. Null when body fat wasn't recorded that day.
 */
export function leanMassKg(record) {
  if (!record || record.bodyFatPct == null || !record.weightKg) return null;
  return record.weightKg * (1 - record.bodyFatPct / 100);
}

export function fatMassKg(record) {
  if (!record || record.bodyFatPct == null || !record.weightKg) return null;
  return record.weightKg * (record.bodyFatPct / 100);
}

/** The weekly hard-set range most hypertrophy research converges on. */
export const SET_TARGET = { min: 10, max: 20 };

/**
 * Hard sets per muscle since a given date — the number that actually drives
 * growth, more than tonnage does. Secondary muscles count as half a set: a row
 * trains the biceps, but not the way a curl does.
 */
export function setsPerMuscle(workouts, since, exercisesById) {
  const totals = new Map();
  const add = (muscle, amount) => {
    if (!muscle) return;
    totals.set(muscle, (totals.get(muscle) ?? 0) + amount);
  };

  for (const workout of workouts) {
    if (!workout.endedAt || workout.startedAt < since) continue;
    for (const entry of workout.entries) {
      const exercise = exercisesById.get(entry.exerciseId);
      if (!exercise) continue;
      const sets = completedSets(entry).length;
      if (!sets) continue;
      add(exercise.muscleGroup, sets);
      for (const muscle of exercise.secondary ?? []) add(muscle, sets * 0.5);
    }
  }
  return totals;
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// --- Constructors -----------------------------------------------------------

export function newExercise({
  name, muscleGroup, equipment, isCustom = false, notes = '',
  description = '', secondary = [],
}) {
  return {
    id: uid(), name, muscleGroup, equipment, isCustom, notes,
    description,
    // Muscles the movement also trains. Counted at half weight in the volume
    // balance, since a secondary muscle isn't getting the same stimulus.
    secondary,
    archived: false, createdAt: Date.now(),
  };
}

export function newSet({ reps = 0, weightKg = 0, warmup = false } = {}) {
  // `rpe` stays null unless logged — the progression engine treats absent and
  // "felt easy" very differently.
  return { id: uid(), reps, weightKg, done: false, warmup, rpe: null, completedAt: null };
}

export function newEntry(exerciseId, sets = [newSet()]) {
  // `group` is null for a normal exercise, or a shared id for supersets.
  return { id: uid(), exerciseId, notes: '', group: null, sets };
}

export function newWorkout(name = 'Workout') {
  return { id: uid(), name, startedAt: Date.now(), endedAt: null, notes: '', entries: [] };
}

export function newRoutine(name = 'New routine') {
  return { id: uid(), name, notes: '', createdAt: Date.now(), lastUsedAt: null, items: [] };
}

// --- Derived numbers --------------------------------------------------------

/** Warm-up sets are logged but never counted toward volume or records. */
export function workingSets(entry) {
  return entry.sets.filter((s) => !s.warmup);
}

export function completedSets(entry) {
  return entry.sets.filter((s) => s.done && !s.warmup);
}

export function setVolume(set) {
  return set.reps * set.weightKg;
}

export function entryVolume(entry) {
  return completedSets(entry).reduce((sum, s) => sum + setVolume(s), 0);
}

export function workoutVolume(workout) {
  return workout.entries.reduce((sum, e) => sum + entryVolume(e), 0);
}

export function workoutSetCount(workout) {
  return workout.entries.reduce((sum, e) => sum + completedSets(e).length, 0);
}

export function workoutDuration(workout, now = Date.now()) {
  return ((workout.endedAt ?? now) - workout.startedAt) / 1000;
}

/** Epley. Undefined below one rep; a single rep is already a max. */
export function estimatedOneRepMax(set) {
  if (!set.reps || set.weightKg <= 0) return null;
  if (set.reps === 1) return set.weightKg;
  return set.weightKg * (1 + set.reps / 30);
}

export function entryBestOneRepMax(entry) {
  const values = completedSets(entry).map(estimatedOneRepMax).filter((v) => v != null);
  return values.length ? Math.max(...values) : null;
}

// --- Aggregates over history ------------------------------------------------

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Monday-based week start, so a week boundary doesn't land mid-weekend. */
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.getTime();
}

/**
 * Volume per calendar week, oldest first. Empty weeks are kept so a gap in
 * training shows as a gap rather than silently closing up.
 */
export function weeklyVolume(workouts, weeks, now = Date.now()) {
  const thisWeek = startOfWeek(now);
  const buckets = new Map();
  for (let i = weeks - 1; i >= 0; i -= 1) {
    buckets.set(thisWeek - i * WEEK_MS, 0);
  }
  for (const w of workouts) {
    if (!w.endedAt) continue;
    const key = startOfWeek(w.startedAt);
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + workoutVolume(w));
  }
  return [...buckets.entries()].map(([weekStart, volumeKg]) => ({ weekStart, volumeKg }));
}

/** Best estimated 1RM per session for one exercise, oldest first. */
export function oneRepMaxHistory(exerciseId, workouts) {
  return workouts
    .filter((w) => w.endedAt)
    .map((w) => {
      const values = w.entries
        .filter((e) => e.exerciseId === exerciseId)
        .map(entryBestOneRepMax)
        .filter((v) => v != null);
      return values.length ? { date: w.startedAt, valueKg: Math.max(...values) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
}

/**
 * Does this set beat everything logged for the exercise before it? Compares
 * estimated 1RM, so a heavier single and a lighter set of ten are judged on the
 * same scale. `excludeWorkoutId` keeps the session in progress out of its own
 * comparison.
 */
export function beatsRecord(set, exerciseId, workouts, excludeWorkoutId) {
  const value = estimatedOneRepMax(set);
  if (!value) return false;

  let best = 0;
  for (const workout of workouts) {
    if (!workout.endedAt || workout.id === excludeWorkoutId) continue;
    for (const entry of workout.entries) {
      if (entry.exerciseId !== exerciseId) continue;
      for (const previous of completedSets(entry)) {
        best = Math.max(best, estimatedOneRepMax(previous) ?? 0);
      }
    }
  }
  // A first-ever set isn't a record; there's nothing to beat.
  return best > 0 && value > best;
}

export function personalRecord(exerciseId, workouts) {
  let bestOneRM = 0;
  let bestSet = null;
  let achievedAt = null;

  for (const w of workouts) {
    if (!w.endedAt) continue;
    for (const entry of w.entries) {
      if (entry.exerciseId !== exerciseId) continue;
      for (const set of completedSets(entry)) {
        const oneRM = estimatedOneRepMax(set);
        if (oneRM != null && oneRM > bestOneRM) {
          bestOneRM = oneRM;
          achievedAt = w.startedAt;
        }
        // Heaviest single set, tie-broken by reps at equal weight.
        if (set.weightKg > 0 && (!bestSet
          || set.weightKg > bestSet.weightKg
          || (set.weightKg === bestSet.weightKg && set.reps > bestSet.reps))) {
          bestSet = { weightKg: set.weightKg, reps: set.reps };
        }
      }
    }
  }

  if (!bestOneRM || !bestSet) return null;
  return { bestOneRepMaxKg: bestOneRM, bestSet, achievedAt };
}

export function volumeByRegion(workouts, since, exercisesById) {
  const totals = new Map();
  for (const w of workouts) {
    if (!w.endedAt || w.startedAt < since) continue;
    for (const entry of w.entries) {
      const exercise = exercisesById.get(entry.exerciseId);
      if (!exercise) continue;
      const key = region(exercise.muscleGroup);
      totals.set(key, (totals.get(key) ?? 0) + entryVolume(entry));
    }
  }
  return [...totals.entries()]
    .filter(([, v]) => v > 0)
    .map(([name, volumeKg]) => ({ name, volumeKg }))
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

/** Consecutive weeks back from this one containing a finished workout. */
export function weeklyStreak(workouts, now = Date.now()) {
  const trained = new Set(
    workouts.filter((w) => w.endedAt).map((w) => startOfWeek(w.startedAt)),
  );
  let cursor = startOfWeek(now);
  // Not having trained yet this week shouldn't break a streak mid-week.
  if (!trained.has(cursor)) cursor -= WEEK_MS;

  let streak = 0;
  while (trained.has(cursor)) {
    streak += 1;
    cursor -= WEEK_MS;
  }
  return streak;
}

/**
 * The most recent completed working set for an exercise, ignoring the session
 * in progress. Drives the "previous" hint on each set row.
 */
export function lastPerformance(exerciseId, workouts, excludeWorkoutId) {
  const finished = workouts
    .filter((w) => w.endedAt && w.id !== excludeWorkoutId)
    .sort((a, b) => b.startedAt - a.startedAt);

  for (const w of finished) {
    const sets = w.entries
      .filter((e) => e.exerciseId === exerciseId)
      .flatMap(completedSets);
    if (sets.length) {
      return sets.reduce((best, s) => (s.weightKg > best.weightKg ? s : best));
    }
  }
  return null;
}

/**
 * Ends a session: sets that were planned but never ticked off aren't history,
 * and a session with nothing logged is discarded rather than left as an empty
 * row. Returns null when the workout should be deleted.
 */
export function finishWorkout(workout) {
  const logged = workoutSetCount(workout);
  if (logged === 0) return null;

  const entries = workout.entries
    .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) }))
    .filter((e) => e.sets.length > 0);

  return { ...workout, entries, endedAt: Date.now() };
}
