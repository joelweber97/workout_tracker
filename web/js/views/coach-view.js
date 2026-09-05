import * as store from '../store.js';
import { chrome } from '../app.js';
import { icon, onClick, navigate, toast } from '../ui.js';
import { esc, weightValue } from '../format.js';
import { review, suggest } from '../coach.js';
import { buildBriefing, copyToClipboard } from '../ai.js';

export default function renderCoach(root) {
  chrome.setTitle('Coach');
  chrome.setLead(`<button class="icon-btn" data-back aria-label="Back">${icon('back')}</button>`);
  chrome.onLead('[data-back]', () => navigate('#/today'));

  const { unit } = store.state.settings;
  const notes = review(store.state.workouts, store.state.exercises, unit);

  // Only movements you've actually logged get a suggestion — the engine refuses
  // to invent a starting weight.
  const suggestions = store.visibleExercises()
    .map((exercise) => ({ exercise, tip: suggest(exercise, store.state.workouts, unit) }))
    .filter((s) => s.tip);

  const priority = { deload: 0, hold: 1, progress: 2 };
  suggestions.sort((a, b) => priority[a.tip.confidence] - priority[b.tip.confidence]
    || a.exercise.name.localeCompare(b.exercise.name));

  root.innerHTML = `
    <div class="section-title">What the numbers say</div>
    <div class="card">
      ${notes.map((note) => `
        <div class="note">
          <div class="note-title"><span class="dot dot-${note.kind === 'warn' ? 'warn' : note.kind === 'good' ? 'good' : 'info'}"></span>${esc(note.title)}</div>
          <div class="note-detail">${esc(note.detail)}</div>
        </div>`).join('')}
    </div>

    <div class="section-title">Next weights</div>
    <div class="card">
      ${suggestions.length ? suggestions.slice(0, 20).map(({ exercise, tip }) => `
        <a class="row" href="#/exercise/${exercise.id}">
          <span class="badge badge-${tip.confidence}">${tip.confidence}</span>
          <div class="row-main">
            <div class="row-title">${esc(exercise.name)}</div>
            <div class="row-sub">${weightValue(tip.weightKg, unit)} ${unit} × ${tip.reps}</div>
          </div>
          <span class="chevron">${icon('chevron', 18)}</span>
        </a>`).join('')
        : '<div class="pad muted">Log a few sessions and suggestions appear here. The engine won’t guess a starting weight it has no evidence for.</div>'}
    </div>

    <div class="section-title">Ask Claude</div>
    <div class="card">
      <div class="pad muted">
        Copies a summary of your last six weeks — sessions, weekly sets per muscle,
        1RM trends — and the questions worth asking. Paste it into Claude for
        coaching the local engine can’t give you.
        <div style="margin-top:6px;font-size:13px;color:var(--ink-3)">
          Nothing is sent anywhere from this app. It has no API key and no server,
          which is exactly why it can’t leak one.
        </div>
      </div>
      <button class="row" data-copy style="color:var(--accent);font-weight:600">
        ${icon('copy', 18)} Copy training briefing
      </button>
    </div>`;

  onClick(root, '[data-copy]', async () => {
    const briefing = buildBriefing(store.state.workouts, store.state.exercises, unit);
    if (!briefing) { toast('Log a session first'); return; }
    toast(await copyToClipboard(briefing) ? 'Briefing copied' : 'Couldn’t access the clipboard');
  });
}
