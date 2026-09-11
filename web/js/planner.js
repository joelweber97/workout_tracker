// The plan generator: goal, experience, days, equipment and timeline in; a
// multi-week programme out.
//
// Deterministic, like the progression engine. Every exercise it picks comes
// from a fixed candidate list for a movement pattern, filtered by the equipment
// you have; every set and rep count follows from goal and role. The result is
// auditable — each plan carries the reasoning behind it — and it works offline.
//
// What it deliberately won't do: periodise around a competition date or work
// around an injury. Those are coaching conversations, not rules.

import { uid, newRoutine } from './domain.js';

export const GOALS = {
  muscle: { label: 'Build muscle', blurb: 'Moderate loads, more sets, rep ranges that grow tissue.' },
  strength: { label: 'Get stronger', blurb: 'Heavier compounds, lower reps, longer rests.' },
  general: { label: 'General fitness', blurb: 'Balanced work, higher reps, a little conditioning.' },
};

export const LEVELS = {
  new: { label: 'New to lifting', blurb: 'Under a year. Fewer sets — technique first.' },
  intermediate: { label: 'A year or two', blurb: 'Comfortable with the main lifts.' },
  advanced: { label: 'Several years', blurb: 'More volume, more variation.' },
};

export const WEEK_OPTIONS = [4, 8, 12];
export const DAY_OPTIONS = [2, 3, 4, 5, 6];

/** Everyone has a floor and their own body weight. */
const ALWAYS = ['bodyweight'];

/**
 * Movements a first-year lifter shouldn't be handed as a default. Each has a
 * gentler option further down its candidate list (inverted row for pull-up,
 * dead bug for hanging leg raise), and the plan falls through to that instead.
 */
const HARD_FOR_NEW = new Set([
  'pull-up', 'chin-up', 'neutral-grip-pull-up', 'nordic-curl', 'glute-ham-raise',
  'hanging-leg-raise', 'ab-wheel-rollout', 'triceps-dip', 'pike-push-up',
]);

/**
 * Movement patterns, each with candidates in order of preference. The first
 * candidate whose equipment you have — and that the plan hasn't already used —
 * is chosen. Bodyweight options sit last as the universal fallback.
 */
const PATTERNS = {
  hPush: ['barbell-bench-press', 'dumbbell-bench-press', 'machine-chest-press', 'smith-machine-bench-press', 'push-up'],
  hPushIncline: ['incline-barbell-bench-press', 'incline-dumbbell-press', 'incline-machine-press', 'decline-push-up', 'push-up'],
  vPush: ['overhead-press', 'seated-dumbbell-press', 'machine-shoulder-press', 'kettlebell-overhead-press', 'pike-push-up'],
  hPull: ['barbell-row', 'chest-supported-dumbbell-row', 'dumbbell-row', 'seated-cable-row', 'chest-supported-machine-row', 'machine-row', 'inverted-row'],
  vPull: ['pull-up', 'lat-pulldown', 'neutral-grip-lat-pulldown', 'chin-up', 'inverted-row'],
  squat: ['back-squat', 'front-squat', 'hack-squat', 'leg-press', 'goblet-squat', 'kettlebell-goblet-squat', 'dumbbell-front-squat', 'bodyweight-squat'],
  hinge: ['deadlift', 'trap-bar-deadlift', 'romanian-deadlift', 'dumbbell-romanian-deadlift', 'kettlebell-romanian-deadlift', 'cable-pull-through', 'banded-glute-bridge', 'single-leg-glute-bridge'],
  hingeLight: ['romanian-deadlift', 'dumbbell-romanian-deadlift', 'kettlebell-romanian-deadlift', 'cable-pull-through', 'good-morning', 'single-leg-glute-bridge'],
  singleLeg: ['dumbbell-bulgarian-split-squat', 'walking-lunge', 'reverse-lunge', 'barbell-lunge', 'dumbbell-step-up', 'single-leg-glute-bridge'],
  hamIso: ['seated-leg-curl', 'lying-leg-curl', 'band-leg-curl', 'nordic-curl', 'glute-ham-raise'],
  quadIso: ['leg-extension', 'sissy-squat', 'wall-sit'],
  glute: ['hip-thrust', 'machine-hip-thrust', 'dumbbell-hip-thrust', 'cable-kickback', 'kettlebell-swing', 'banded-glute-bridge', 'single-leg-glute-bridge'],
  calves: ['standing-calf-raise', 'seated-calf-raise', 'leg-press-calf-raise', 'dumbbell-calf-raise', 'barbell-calf-raise', 'single-leg-calf-raise'],
  lateralDelt: ['dumbbell-lateral-raise', 'cable-lateral-raise', 'machine-lateral-raise', 'band-lateral-raise'],
  rearDelt: ['face-pull', 'reverse-pec-deck', 'cable-reverse-fly', 'bent-over-reverse-fly', 'band-pull-apart'],
  biceps: ['barbell-curl', 'ez-bar-curl', 'dumbbell-curl', 'hammer-curl', 'cable-curl', 'machine-preacher-curl', 'band-curl', 'chin-up'],
  triceps: ['rope-pushdown', 'triceps-pushdown', 'skull-crusher', 'dumbbell-overhead-extension', 'overhead-cable-extension', 'machine-triceps-extension', 'triceps-dip', 'band-pushdown', 'close-grip-push-up'],
  core: ['cable-crunch', 'hanging-leg-raise', 'machine-crunch', 'ab-wheel-rollout', 'dead-bug', 'plank'],
  conditioning: ['incline-treadmill-walk', 'rowing-machine', 'stationary-bike', 'kettlebell-swing', 'jump-rope', 'burpee'],
};

/**
 * Day templates as ordered slots. `main` is the lift the session is built
 * around; `secondary` supports it; `accessory` fills in what the compounds
 * miss. Compounds come first while you're fresh — that ordering is the one
 * programming rule almost nobody disputes.
 */
const DAYS = {
  fullA: { label: 'Full Body A', slots: [['squat', 'main'], ['hPush', 'main'], ['hPull', 'main'], ['hamIso', 'accessory'], ['lateralDelt', 'accessory'], ['core', 'accessory']] },
  fullB: { label: 'Full Body B', slots: [['hinge', 'main'], ['vPush', 'main'], ['vPull', 'main'], ['singleLeg', 'accessory'], ['biceps', 'accessory'], ['triceps', 'accessory']] },
  fullC: { label: 'Full Body C', slots: [['singleLeg', 'main'], ['hPushIncline', 'main'], ['hPull', 'main'], ['glute', 'accessory'], ['calves', 'accessory'], ['core', 'accessory']] },
  upperA: { label: 'Upper A', slots: [['hPush', 'main'], ['hPull', 'main'], ['vPush', 'secondary'], ['vPull', 'secondary'], ['biceps', 'accessory'], ['triceps', 'accessory'], ['lateralDelt', 'accessory']] },
  lowerA: { label: 'Lower A', slots: [['squat', 'main'], ['hingeLight', 'secondary'], ['hamIso', 'accessory'], ['quadIso', 'accessory'], ['calves', 'accessory'], ['core', 'accessory']] },
  upperB: { label: 'Upper B', slots: [['vPull', 'main'], ['hPushIncline', 'main'], ['hPull', 'secondary'], ['vPush', 'secondary'], ['rearDelt', 'accessory'], ['biceps', 'accessory'], ['triceps', 'accessory']] },
  lowerB: { label: 'Lower B', slots: [['hinge', 'main'], ['singleLeg', 'secondary'], ['glute', 'accessory'], ['hamIso', 'accessory'], ['calves', 'accessory'], ['core', 'accessory']] },
  push: { label: 'Push', slots: [['hPush', 'main'], ['vPush', 'secondary'], ['hPushIncline', 'secondary'], ['lateralDelt', 'accessory'], ['triceps', 'accessory'], ['core', 'accessory']] },
  pull: { label: 'Pull', slots: [['hinge', 'main'], ['vPull', 'secondary'], ['hPull', 'secondary'], ['rearDelt', 'accessory'], ['biceps', 'accessory']] },
  legs: { label: 'Legs', slots: [['squat', 'main'], ['hingeLight', 'secondary'], ['singleLeg', 'accessory'], ['hamIso', 'accessory'], ['calves', 'accessory'], ['core', 'accessory']] },
  pushB: { label: 'Push B', slots: [['vPush', 'main'], ['hPushIncline', 'secondary'], ['hPush', 'secondary'], ['lateralDelt', 'accessory'], ['triceps', 'accessory']] },
  pullB: { label: 'Pull B', slots: [['vPull', 'main'], ['hPull', 'secondary'], ['hingeLight', 'secondary'], ['rearDelt', 'accessory'], ['biceps', 'accessory'], ['core', 'accessory']] },
  legsB: { label: 'Legs B', slots: [['hinge', 'main'], ['squat', 'secondary'], ['glute', 'accessory'], ['quadIso', 'accessory'], ['calves', 'accessory']] },
};

/** Which days make a week, by how many you can train. */
const SPLITS = {
  2: { name: 'Full body, twice a week', days: ['fullA', 'fullB'] },
  3: { name: 'Full body, three days', days: ['fullA', 'fullB', 'fullC'] },
  4: { name: 'Upper / lower', days: ['upperA', 'lowerA', 'upperB', 'lowerB'] },
  5: { name: 'Upper / lower + push / pull / legs', days: ['upperA', 'lowerA', 'push', 'pull', 'legs'] },
  6: { name: 'Push / pull / legs, twice', days: ['push', 'pull', 'legs', 'pushB', 'pullB', 'legsB'] },
};

/** Sets and reps by goal and the slot's role. Reps are the top of the range the coach will then work within. */
const SCHEMES = {
  strength: { main: [4, 4], secondary: [3, 6], accessory: [3, 10] },
  muscle: { main: [4, 8], secondary: [3, 10], accessory: [3, 12] },
  general: { main: [3, 10], secondary: [3, 12], accessory: [2, 15] },
};

/** Volume scales with experience; a first-year lifter grows on far less. */
const LEVEL_SETS = { new: 0.75, intermediate: 1, advanced: 1.25 };

/** Every fourth week is a deload: the same sessions at 60% of the sets. */
export const DELOAD_EVERY = 4;
export const DELOAD_FACTOR = 0.6;

/**
 * Builds a plan. `exercisesById` is the user's library so archived and custom
 * rows are respected. Returns routines ready to save, plus the plan record.
 */
export function generatePlan(inputs, exercisesById) {
  const { goal, level, days, weeks } = inputs;
  const equipment = new Set([...(inputs.equipment ?? []), ...ALWAYS]);
  const split = SPLITS[days];
  if (!split || !SCHEMES[goal] || !LEVEL_SETS[level]) throw new Error('Incomplete plan inputs');

  const used = new Set();
  const rationale = [];
  const skipped = [];

  const available = (id) => {
    const e = exercisesById.get(id);
    if (!e || e.archived || !equipment.has(e.equipment)) return false;
    return !(level === 'new' && HARD_FOR_NEW.has(id));
  };

  const pick = (pattern) => {
    const candidates = PATTERNS[pattern].filter(available);
    if (!candidates.length) return null;
    // Prefer something the plan hasn't used yet, so a second push day gets a
    // different press rather than the same one twice.
    return candidates.find((id) => !used.has(id)) ?? candidates[0];
  };

  const routines = split.days.map((dayKey) => {
    const day = DAYS[dayKey];
    const routine = newRoutine(day.label);
    routine.items = [];
    for (const [pattern, role] of day.slots) {
      const exerciseId = pick(pattern);
      if (!exerciseId) { skipped.push(pattern); continue; }
      used.add(exerciseId);
      const [baseSets, reps] = SCHEMES[goal][role];
      const targetSets = Math.max(2, Math.round(baseSets * LEVEL_SETS[level]));
      routine.items.push({ id: uid(), exerciseId, targetSets, targetReps: reps });
    }
    return routine;
  });

  // The general-fitness goal ends each week with light conditioning.
  if (goal === 'general') {
    const cardio = pick('conditioning');
    if (cardio) {
      routines[routines.length - 1].items.push({ id: uid(), exerciseId: cardio, targetSets: 1, targetReps: 15 });
    }
  }

  rationale.push(`${days} days a week → ${split.name}. Each muscle is trained at least twice a week, which is where most of the growth research lands.`);
  rationale.push({
    strength: 'Strength goal → heavy compounds first at 4 sets of 4, accessories in the 6–10 range. Progress by adding weight when every set hits the target.',
    muscle: 'Muscle goal → compounds at 4 sets of 8, isolation at 10–15. The coach adds reps first, then weight, within those ranges.',
    general: 'General fitness → 3 sets of 10–15 across the board, with a short conditioning piece on the last day.',
  }[goal]);
  rationale.push({
    new: 'First year of lifting → sets reduced by a quarter. Technique and consistency matter more than volume right now.',
    intermediate: 'Standard volume for someone comfortable with the main lifts.',
    advanced: 'Volume up by a quarter — more sets and more exercise variety, which is what an adapted lifter needs.',
  }[level]);
  rationale.push(`${weeks} weeks, with every ${DELOAD_EVERY}th week a deload at ${Math.round(DELOAD_FACTOR * 100)}% of the sets. Strength shows up in the week after a deload, not during it.`);
  if (skipped.length) {
    rationale.push(`Skipped ${[...new Set(skipped)].join(', ')} — nothing in your equipment covers it. Add equipment or an exercise to fill the gap.`);
  }

  const plan = {
    id: uid(),
    name: `${GOALS[goal].label} · ${split.name}`,
    createdAt: Date.now(),
    inputs: { goal, level, days, weeks, equipment: [...equipment] },
    weeks,
    daysPerWeek: days,
    deloadEvery: DELOAD_EVERY,
    routineIds: routines.map((r) => r.id),
    rationale,
  };
  for (const r of routines) r.planId = plan.id;

  return { plan, routines };
}

/**
 * Where you are in a plan, from the sessions logged against it. Week and day
 * are one-based for display; `done` is true once every session has been done.
 */
export function planProgress(plan, workouts) {
  const completed = workouts.filter((w) => w.endedAt && w.planId === plan.id).length;
  const total = plan.weeks * plan.daysPerWeek;
  const week = Math.min(plan.weeks, Math.floor(completed / plan.daysPerWeek) + 1);
  const dayIndex = completed % plan.daysPerWeek;
  return {
    completed,
    total,
    week,
    dayIndex,
    isDeload: week % plan.deloadEvery === 0,
    done: completed >= total,
    percent: Math.round((completed / total) * 100),
  };
}
