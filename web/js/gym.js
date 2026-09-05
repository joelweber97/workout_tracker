// Gym-floor arithmetic: what to actually put on the bar, and how to work up to it.

import { fromKg, toKg } from './format.js';

/** Plates you can reasonably expect to find, heaviest first, per unit. */
const PLATES = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export const DEFAULT_BAR = { lb: 45, kg: 20 };

/**
 * Which plates go on each side to reach a target weight.
 *
 * Returns `null` when the target is below the bar, and reports any remainder it
 * couldn't make rather than silently rounding — being told "you're 1.5 lb short"
 * is more useful than a number that doesn't match what's on the bar.
 */
export function platesPerSide(targetKg, unit, barWeight = DEFAULT_BAR[unit]) {
  const target = fromKg(targetKg, unit);
  if (target < barWeight - 0.01) return null;

  let perSide = (target - barWeight) / 2;
  const plates = [];

  for (const plate of PLATES[unit]) {
    while (perSide >= plate - 0.01) {
      plates.push(plate);
      perSide -= plate;
    }
  }

  return {
    barWeight,
    plates,
    // Anything under the smallest plate is unreachable without micro-plates.
    remainder: Math.round(perSide * 100) / 100,
    total: target,
  };
}

/** "45 + 25 + 2.5" — the per-side list, or a note when the bar is empty. */
export function describePlates(result) {
  if (!result) return null;
  if (!result.plates.length) return 'Empty bar';
  return result.plates.join(' + ');
}

/**
 * A warm-up ramp for a working weight: roughly 40%, 60% and 80%, with rep
 * counts falling as the load rises. Each is snapped to something loadable, and
 * any step that lands on the bare bar is dropped as pointless.
 */
export function warmupRamp(workingKg, unit, { step, barKg = toKg(DEFAULT_BAR[unit], unit) } = {}) {
  if (workingKg <= 0) return [];

  const increment = step ?? toKg(unit === 'kg' ? 2.5 : 5, unit);
  const plan = [[0.4, 8], [0.6, 5], [0.8, 3]];

  const ramp = [];
  for (const [fraction, reps] of plan) {
    const snapped = Math.round((workingKg * fraction) / increment) * increment;
    // Skip anything at or below the bar, and any duplicate of the step before.
    if (snapped <= barKg) continue;
    if (ramp.length && Math.abs(ramp[ramp.length - 1].weightKg - snapped) < 0.01) continue;
    if (snapped >= workingKg) continue;
    ramp.push({ weightKg: snapped, reps });
  }
  return ramp;
}
