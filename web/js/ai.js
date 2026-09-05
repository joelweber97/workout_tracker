// The Claude layer.
//
// Deliberately *not* a direct browser call to api.anthropic.com. This app is
// served as static files from a public host, so any API key it held would sit
// in localStorage on a page anyone can read the source of — one XSS or one
// shared device and someone else is spending your money. A key belongs behind
// a server you control, which this app doesn't have.
//
// What it does instead: assemble the same structured briefing an API call would
// have sent, and hand it to you to paste into Claude. Same coaching, no key, no
// cost beyond what you already pay, nothing to leak. `buildBriefing` is also
// exactly the payload a future server-side proxy would POST, so wiring one up
// later is a transport change, not a rewrite.

import {
  completedSets, oneRepMaxHistory, entryVolume, region,
} from './domain.js';
import { review } from './coach.js';
import { weightValue, formatFullDate } from './format.js';

const WINDOW_DAYS = 42;

/**
 * A compact, factual summary of recent training. Kept small on purpose — a
 * model reasons better about 30 legible lines than about a raw JSON dump of
 * every set ever logged.
 */
export function buildBriefing(workouts, exercises, unit, now = Date.now()) {
  const since = now - WINDOW_DAYS * 24 * 3600 * 1000;
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const finished = workouts
    .filter((w) => w.endedAt && w.startedAt >= since)
    .sort((a, b) => a.startedAt - b.startedAt);

  if (!finished.length) return null;

  const lines = [];
  lines.push('I am tracking my lifting and want coaching on how to keep growing muscle.');
  lines.push(`All weights are in ${unit}. Here is the last ${WINDOW_DAYS / 7} weeks.`);
  lines.push('');

  // Sessions, one line each.
  lines.push('## Sessions');
  for (const workout of finished) {
    const parts = workout.entries.map((entry) => {
      const exercise = byId.get(entry.exerciseId);
      const sets = completedSets(entry);
      if (!exercise || !sets.length) return null;
      const detail = sets.map((s) => `${weightValue(s.weightKg, unit)}x${s.reps}`).join(' ');
      return `${exercise.name} ${detail}`;
    }).filter(Boolean);
    if (!parts.length) continue;
    lines.push(`- ${formatFullDate(workout.startedAt)}: ${parts.join('; ')}`);
  }

  // Weekly sets per muscle group — the variable that most drives growth.
  const weeks = WINDOW_DAYS / 7;
  const setsByGroup = new Map();
  const volumeByGroup = new Map();
  for (const workout of finished) {
    for (const entry of workout.entries) {
      const exercise = byId.get(entry.exerciseId);
      if (!exercise) continue;
      const done = completedSets(entry).length;
      setsByGroup.set(exercise.muscleGroup, (setsByGroup.get(exercise.muscleGroup) ?? 0) + done);
      volumeByGroup.set(exercise.muscleGroup, (volumeByGroup.get(exercise.muscleGroup) ?? 0) + entryVolume(entry));
    }
  }

  lines.push('');
  lines.push('## Weekly sets per muscle group');
  for (const [group, sets] of [...setsByGroup.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${group} (${region(group).toLowerCase()}): ${(sets / weeks).toFixed(1)} sets/week`);
  }

  // Estimated 1RM trend for anything with enough sessions to have a trend.
  const trends = [];
  for (const exercise of exercises) {
    const history = oneRepMaxHistory(exercise.id, finished);
    if (history.length < 2) continue;
    const first = history[0];
    const last = history[history.length - 1];
    const change = ((last.valueKg - first.valueKg) / first.valueKg) * 100;
    trends.push({ name: exercise.name, first, last, change, sessions: history.length });
  }
  trends.sort((a, b) => b.change - a.change);

  if (trends.length) {
    lines.push('');
    lines.push('## Estimated 1RM trend');
    for (const t of trends) {
      const sign = t.change >= 0 ? '+' : '';
      lines.push(
        `- ${t.name}: ${weightValue(t.first.valueKg, unit)} → ${weightValue(t.last.valueKg, unit)} `
        + `(${sign}${t.change.toFixed(1)}% over ${t.sessions} sessions)`,
      );
    }
  }

  // What the local engine already concluded, so the model can argue with it.
  const notes = review(workouts, exercises, unit, now);
  lines.push('');
  lines.push('## What my tracker already flagged');
  for (const note of notes) {
    lines.push(`- ${note.title}: ${note.detail}`);
  }

  lines.push('');
  lines.push('## What I want');
  lines.push('1. Which lifts should I push, hold, or deload next week, and at what weight and reps?');
  lines.push('2. Where is my weekly volume wrong for hypertrophy — too little, too much, or badly distributed?');
  lines.push('3. What is the single highest-value change to my programme?');
  lines.push('');
  lines.push('Be specific and give numbers. Say if the data is too thin to judge.');

  return lines.join('\n');
}

/** Copies text, falling back to a selection when the clipboard API is blocked. */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(area);
    return ok;
  }
}
