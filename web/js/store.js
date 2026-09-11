// In-memory application state, written through to IndexedDB.
// Views read from `state` and call these mutators; nothing else touches `db`.

import * as db from './db.js';
import { EXERCISE_LIBRARY, STARTER_ROUTINES, LIBRARY_VERSION } from './library.js';
import {
  newExercise, newRoutine, newSet, newEntry, newWorkout, uid, finishWorkout,
} from './domain.js';

// Same reasoning as DB_NAME in db.js: these keys predate the app's name and
// are left alone so existing installs keep their settings.
const SETTINGS_KEY = 'ledger.settings';
const SEEDED_KEY = 'ledger.seeded';
// Which library version this install's exercise rows reflect.
const LIBRARY_KEY = 'ledger.libraryVersion';

const DEFAULT_SETTINGS = {
  unit: 'lb',
  restSeconds: 90,
  haptics: true,
  coachEnabled: true,
  apiKey: '',
};

export const state = {
  exercises: [],
  workouts: [],
  routines: [],
  metrics: [],
  settings: { ...DEFAULT_SETTINGS },
};

const listeners = new Set();

/** Views subscribe so a mutation anywhere re-renders the current screen. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

// --- Settings ---------------------------------------------------------------
// These live in localStorage rather than IndexedDB: they're small, synchronous
// reads on every render, and losing them costs nothing.

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch {
    // Private browsing can refuse writes; the in-memory value still applies.
  }
  notify();
}

// --- Load & seed ------------------------------------------------------------

export async function load() {
  state.settings = loadSettings();
  const [exercises, workouts, routines, metrics] = await Promise.all([
    db.getAll('exercises'), db.getAll('workouts'), db.getAll('routines'), db.getAll('metrics'),
  ]);
  state.exercises = exercises;
  state.workouts = workouts;
  state.routines = routines;
  state.metrics = metrics;

  // The flag lives in localStorage but the library lives in IndexedDB, and the
  // two can be cleared independently. Checking both stops a cleared flag from
  // seeding a second copy of all 217 exercises on top of the existing ones.
  if (!localStorage.getItem(SEEDED_KEY)) {
    if (state.exercises.length) localStorage.setItem(SEEDED_KEY, '1');
    else await seed();
  }
  await migrateLibrary();
  sortAll();
  notify();
}

/**
 * Runs once per install. The caller checks both a localStorage flag and whether
 * the library is actually empty: the flag alone lets someone who archived every
 * starter exercise keep it that way, while the emptiness check stops a cleared
 * flag from duplicating a library that is still sitting in IndexedDB.
 */
async function seed() {
  const byName = new Map();
  const exercises = EXERCISE_LIBRARY.map(([id, name, muscleGroup, equipment, secondary, description]) => {
    const exercise = newExercise({
      id,
      name,
      muscleGroup,
      equipment,
      description,
      secondary: secondary ? secondary.split(',') : [],
    });
    byName.set(name, exercise);
    return exercise;
  });

  const routines = STARTER_ROUTINES.map(([name, items]) => ({
    ...newRoutine(name),
    items: items
      .filter(([exerciseName]) => byName.has(exerciseName))
      .map(([exerciseName, targetSets, targetReps]) => ({
        id: uid(), exerciseId: byName.get(exerciseName).id, targetSets, targetReps,
      })),
  }));

  await Promise.all([db.putMany('exercises', exercises), db.putMany('routines', routines)]);
  state.exercises = exercises;
  state.routines = routines;
  localStorage.setItem(SEEDED_KEY, '1');
}

/**
 * Brings an install's exercise rows up to the current library.
 *
 * Earlier builds gave every seeded exercise a random id, so two devices — or
 * one device re-seeded — could never agree on what "Barbell Bench Press" was.
 * This maps those rows onto the library's permanent ids by name, rewrites every
 * reference in workouts and routines to match, collapses any duplicate copies
 * left by the old seeding bug, adds rows the library has gained since, and
 * refreshes library-owned wording. Custom exercises and anything the user
 * wrote — notes, archived flags — are left exactly as they were.
 *
 * Runs once per LIBRARY_VERSION, and again after a backup import.
 */
async function migrateLibrary() {
  const target = String(LIBRARY_VERSION);
  if (localStorage.getItem(LIBRARY_KEY) === target) return;

  const byId = new Map(EXERCISE_LIBRARY.map((row) => [row[0], row]));
  const byName = new Map(EXERCISE_LIBRARY.map((row) => [row[1].toLowerCase(), row]));
  const idMap = new Map();      // old id -> library id
  const placed = new Set();     // library ids already represented
  const kept = [];

  for (const exercise of state.exercises) {
    const row = exercise.isCustom
      ? null
      : (byId.get(exercise.id) ?? byName.get(exercise.name.toLowerCase()));

    if (!row) { kept.push(exercise); continue; }   // custom, or seeded then dropped from the library

    const [id, name, muscleGroup, equipment, secondary, description] = row;
    if (exercise.id !== id) idMap.set(exercise.id, id);
    if (placed.has(id)) continue;                  // a duplicate copy; its references fold into the first
    placed.add(id);
    kept.push({
      ...exercise,
      id, name, muscleGroup, equipment, description,
      secondary: secondary ? secondary.split(',') : [],
    });
  }

  for (const row of EXERCISE_LIBRARY) {
    if (placed.has(row[0])) continue;
    const [id, name, muscleGroup, equipment, secondary, description] = row;
    kept.push(newExercise({
      id, name, muscleGroup, equipment, description,
      secondary: secondary ? secondary.split(',') : [],
    }));
  }

  const changedWorkouts = [];
  for (const workout of state.workouts) {
    let touched = false;
    for (const entry of workout.entries) {
      if (idMap.has(entry.exerciseId)) { entry.exerciseId = idMap.get(entry.exerciseId); touched = true; }
    }
    if (touched) changedWorkouts.push(workout);
  }
  const changedRoutines = [];
  for (const routine of state.routines) {
    let touched = false;
    for (const item of routine.items) {
      if (idMap.has(item.exerciseId)) { item.exerciseId = idMap.get(item.exerciseId); touched = true; }
    }
    if (touched) changedRoutines.push(routine);
  }

  // Old random-id rows have to go, so the store is replaced rather than merged.
  await db.clear('exercises');
  await Promise.all([
    db.putMany('exercises', kept),
    changedWorkouts.length ? db.putMany('workouts', changedWorkouts) : null,
    changedRoutines.length ? db.putMany('routines', changedRoutines) : null,
  ]);
  state.exercises = kept;
  localStorage.setItem(LIBRARY_KEY, target);
}

function sortAll() {
  state.exercises.sort((a, b) => a.name.localeCompare(b.name));
  state.workouts.sort((a, b) => b.startedAt - a.startedAt);
  state.routines.sort((a, b) => a.name.localeCompare(b.name));
  state.metrics.sort((a, b) => b.recordedAt - a.recordedAt);
}

// --- Lookups ----------------------------------------------------------------

export const exercisesById = () => new Map(state.exercises.map((e) => [e.id, e]));
export const exerciseById = (id) => state.exercises.find((e) => e.id === id) ?? null;
export const workoutById = (id) => state.workouts.find((w) => w.id === id) ?? null;
export const routineById = (id) => state.routines.find((r) => r.id === id) ?? null;
export const activeWorkout = () => state.workouts.find((w) => !w.endedAt) ?? null;
export const visibleExercises = () => state.exercises.filter((e) => !e.archived);

// --- Workouts ---------------------------------------------------------------

/**
 * In-memory state is updated first and persisted afterwards.
 *
 * The reverse order — awaiting IndexedDB before swapping the object into
 * `state` — leaves a window where the store still returns the pre-edit
 * workout. Click handlers don't await, so anything that ran in that window
 * read stale data: tapping Use and then Finish reported the session as empty,
 * because Finish looked at a copy where the sets had never been filled in.
 */
function applyWorkout(workout) {
  const index = state.workouts.findIndex((w) => w.id === workout.id);
  if (index >= 0) state.workouts[index] = workout;
  else state.workouts.unshift(workout);
  sortAll();
  notify();

  return db.put('workouts', workout)
    .then(() => workout)
    .catch((error) => {
      // The change is already on screen; losing the write silently would be
      // worse than saying so.
      console.error('Failed to save workout', error);
      return workout;
    });
}

function saveWorkout(workout) {
  return applyWorkout(workout);
}

/**
 * Only one session runs at a time. A double-tap on Start, or two tabs open at
 * once, would otherwise leave two live workouts with `activeWorkout()` silently
 * picking whichever came back first.
 */
export function startEmptyWorkout(name = 'Workout') {
  const existing = activeWorkout();
  if (existing) return Promise.resolve(existing);
  return saveWorkout(newWorkout(name));
}

/** Builds a session pre-filled with the routine's exercises and blank sets. */
export async function startFromRoutine(routine) {
  const existing = activeWorkout();
  if (existing) return existing;

  const workout = newWorkout(routine.name);
  workout.entries = routine.items.map((item) => newEntry(
    item.exerciseId,
    Array.from({ length: Math.max(1, item.targetSets) }, () => newSet({ reps: item.targetReps })),
  ));
  await saveWorkout(workout);
  await saveRoutine({ ...routine, lastUsedAt: Date.now() });
  return workout;
}

/** Mutates a workout through a callback, then persists and notifies once. */
export function mutateWorkout(id, fn) {
  const workout = workoutById(id);
  if (!workout) return Promise.resolve(null);
  const next = structuredClone(workout);
  fn(next);
  return saveWorkout(next);
}

export async function finishActiveWorkout(id) {
  const workout = workoutById(id);
  if (!workout) return null;

  const finished = finishWorkout(workout);
  if (!finished) {
    await deleteWorkout(id);
    return null;
  }
  return saveWorkout(finished);
}

export function deleteWorkout(id) {
  state.workouts = state.workouts.filter((w) => w.id !== id);
  notify();
  return db.remove('workouts', id).catch((error) => {
    console.error('Failed to delete workout', error);
  });
}

// --- Exercises --------------------------------------------------------------

export function saveExercise(exercise) {
  const index = state.exercises.findIndex((e) => e.id === exercise.id);
  if (index >= 0) state.exercises[index] = exercise;
  else state.exercises.push(exercise);
  sortAll();
  notify();

  return db.put('exercises', exercise)
    .then(() => exercise)
    .catch((error) => {
      console.error('Failed to save exercise', error);
      return exercise;
    });
}

export function createExercise(fields) {
  return saveExercise(newExercise({ ...fields, isCustom: true }));
}

/**
 * Archives rather than deletes: past workouts reference the exercise, and a
 * hard delete would turn old sessions into rows reading "deleted exercise".
 */
export function archiveExercise(id) {
  const exercise = exerciseById(id);
  if (!exercise) return Promise.resolve();
  return saveExercise({ ...exercise, archived: true });
}

// --- Routines ---------------------------------------------------------------

export function saveRoutine(routine) {
  const index = state.routines.findIndex((r) => r.id === routine.id);
  if (index >= 0) state.routines[index] = routine;
  else state.routines.push(routine);
  sortAll();
  notify();

  return db.put('routines', routine)
    .then(() => routine)
    .catch((error) => {
      console.error('Failed to save routine', error);
      return routine;
    });
}

export function createRoutine(name = 'New routine') {
  return saveRoutine(newRoutine(name));
}

export function deleteRoutine(id) {
  state.routines = state.routines.filter((r) => r.id !== id);
  notify();
  return db.remove('routines', id).catch((error) => {
    console.error('Failed to delete routine', error);
  });
}

// --- Body weight -------------------------------------------------------------

/**
 * One record per day holding weight and body fat together — you normally read
 * both off the same scale at the same moment. Logging again on the same day
 * merges into that day's entry rather than stacking two points on the chart,
 * and fields you leave blank keep whatever was already recorded.
 */
export async function logBodyMetrics({ weightKg, bodyFatPct } = {}, when = Date.now()) {
  const day = new Date(when);
  // Noon, so a reading can't drift into the neighbouring day across time zones.
  day.setHours(12, 0, 0, 0);
  const id = `bw-${day.toISOString().slice(0, 10)}`;

  const existing = state.metrics.find((m) => m.id === id);
  const record = {
    id,
    recordedAt: day.getTime(),
    weightKg: weightKg ?? existing?.weightKg ?? null,
    bodyFatPct: bodyFatPct ?? existing?.bodyFatPct ?? null,
  };

  const index = state.metrics.findIndex((m) => m.id === id);
  if (index >= 0) state.metrics[index] = record;
  else state.metrics.push(record);
  sortAll();
  notify();

  await db.put('metrics', record).catch((error) => {
    console.error('Failed to save body metrics', error);
  });
  return record;
}

export function deleteBodyWeight(id) {
  state.metrics = state.metrics.filter((m) => m.id !== id);
  notify();
  return db.remove('metrics', id).catch((error) => {
    console.error('Failed to delete body metrics', error);
  });
}

export const latestBodyMetrics = () => state.metrics[0] ?? null;

/** The most recent day that actually recorded the given field. */
export const latestWith = (field) => state.metrics.find((m) => m[field] != null) ?? null;

// --- Repeating a session -----------------------------------------------------

/**
 * Starts a session with the same exercises as a previous one, sets blanked out
 * but pre-filled with what was lifted last time.
 */
export async function repeatWorkout(sourceId) {
  const existing = activeWorkout();
  if (existing) return existing;

  const source = workoutById(sourceId);
  if (!source) return null;

  const workout = newWorkout(source.name);
  workout.entries = source.entries.map((entry) => ({
    ...newEntry(entry.exerciseId, entry.sets
      .filter((set) => !set.warmup)
      .map((set) => newSet({ reps: set.reps, weightKg: set.weightKg }))),
    group: entry.group ?? null,
  }));

  return saveWorkout(workout);
}

// --- Backup -----------------------------------------------------------------

export function exportData() {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...state.settings, apiKey: undefined },
    exercises: state.exercises,
    workouts: state.workouts,
    routines: state.routines,
    metrics: state.metrics,
  }, null, 2);
}

export async function importData(json) {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed.exercises) || !Array.isArray(parsed.workouts)) {
    throw new Error('That file doesn’t look like an Overload backup.');
  }
  await db.clearAll();
  await Promise.all([
    db.putMany('exercises', parsed.exercises),
    db.putMany('workouts', parsed.workouts),
    db.putMany('routines', parsed.routines ?? []),
    db.putMany('metrics', parsed.metrics ?? []),
  ]);
  state.exercises = parsed.exercises;
  state.workouts = parsed.workouts;
  state.routines = parsed.routines ?? [];
  state.metrics = parsed.metrics ?? [];
  localStorage.setItem(SEEDED_KEY, '1');
  localStorage.removeItem(LIBRARY_KEY);
  await migrateLibrary();
  sortAll();
  notify();
}

export async function resetEverything() {
  await db.clearAll();
  localStorage.removeItem(SEEDED_KEY);
  state.exercises = [];
  state.workouts = [];
  state.routines = [];
  state.metrics = [];
  await load();
}

/**
 * Mutates the live workout object in place and persists it on a short debounce,
 * without notifying subscribers.
 *
 * This is what weight and rep fields use while you type: a normal mutation
 * re-renders the view, which would blur the input on every keystroke. Callers
 * take responsibility for any DOM they need to keep in sync.
 */
const pendingWrites = new Map();

export function mutateWorkoutSilently(id, fn) {
  const workout = workoutById(id);
  if (!workout) return;
  fn(workout);

  clearTimeout(pendingWrites.get(id));
  pendingWrites.set(id, setTimeout(() => {
    pendingWrites.delete(id);
    db.put('workouts', workout).catch((error) => {
      console.error('Failed to save workout', error);
    });
  }, 400));
}

/** Forces any debounced write for a workout to land now. */
export async function flushWorkout(id) {
  const workout = workoutById(id);
  if (!workout) return;
  clearTimeout(pendingWrites.get(id));
  pendingWrites.delete(id);
  await db.put('workouts', workout);
}

/**
 * Persists a routine without re-rendering, for the same reason
 * `mutateWorkoutSilently` exists: the editor's text and number fields would
 * otherwise lose focus on every keystroke.
 */
let routineWriteTimer = null;

export function saveRoutineSilently(routine) {
  const index = state.routines.findIndex((r) => r.id === routine.id);
  if (index >= 0) state.routines[index] = routine;

  clearTimeout(routineWriteTimer);
  routineWriteTimer = setTimeout(() => {
    db.put('routines', routine).catch((error) => {
      console.error('Failed to save routine', error);
    });
  }, 400);
}
