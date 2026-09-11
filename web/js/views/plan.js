import * as store from '../store.js';
import { chrome } from '../app.js';
import { icon, onClick, tile, navigate, toast } from '../ui.js';
import { esc } from '../format.js';
import { EQUIPMENT, equipmentLabel } from '../domain.js';
import { GOALS, LEVELS, DAY_OPTIONS, WEEK_OPTIONS, planProgress } from '../planner.js';

/**
 * Two states: the questionnaire when there's no plan, the overview when there
 * is. Answers persist across re-renders so tapping a chip doesn't reset the
 * others.
 */
const answers = {
  goal: 'muscle',
  level: 'intermediate',
  days: 4,
  weeks: 8,
  equipment: new Set(['barbell', 'dumbbell', 'machine', 'cable']),
};

export default function renderPlan(root) {
  const plan = store.activePlan();
  chrome.setTitle(plan ? 'Your plan' : 'Build a plan');
  chrome.setLead(`<button class="icon-btn" data-back aria-label="Back">${icon('back')}</button>`);
  chrome.onLead('[data-back]', () => navigate('#/today'));

  if (plan) renderOverview(root, plan);
  else renderQuestionnaire(root);
}

// --- Questionnaire -----------------------------------------------------------

function renderQuestionnaire(root) {
  root.innerHTML = `
    <p class="muted" style="margin:4px 0 14px">
      Five answers and you get a full programme — a split, the exercises for
      each day chosen from what you have, sets and reps for your goal, and a
      deload every fourth week. Every choice explains itself.
    </p>

    <div class="section-title">Goal</div>
    <div class="card">${optionRows('goal', GOALS)}</div>

    <div class="section-title">Experience</div>
    <div class="card">${optionRows('level', LEVELS)}</div>

    <div class="section-title">Days a week</div>
    <div class="chips" data-single="days">
      ${DAY_OPTIONS.map((d) => `<button class="chip" data-value="${d}" aria-pressed="${answers.days === d}">${d}</button>`).join('')}
    </div>

    <div class="section-title">Equipment</div>
    <div class="chips" data-multi="equipment">
      ${EQUIPMENT.filter((e) => e !== 'bodyweight' && e !== 'other').map((e) => `
        <button class="chip" data-value="${e}" aria-pressed="${answers.equipment.has(e)}">${equipmentLabel(e)}</button>`).join('')}
    </div>
    <p class="muted" style="font-size:12px;margin:-2px 0 0">Body weight is always included.</p>

    <div class="section-title">Timeline</div>
    <div class="chips" data-single="weeks">
      ${WEEK_OPTIONS.map((w) => `<button class="chip" data-value="${w}" aria-pressed="${answers.weeks === w}">${w} weeks</button>`).join('')}
    </div>

    <div style="margin-top:18px">
      <button class="btn btn-primary btn-block" data-generate>Generate my plan</button>
    </div>`;

  onClick(root, '[data-option]', (btn) => {
    const { option, value } = btn.dataset;
    answers[option] = value;
    root.querySelectorAll(`[data-option="${option}"]`).forEach((el) => {
      el.setAttribute('aria-checked', String(el === btn));
    });
  });

  onClick(root, '[data-single] .chip', (btn) => {
    const key = btn.closest('[data-single]').dataset.single;
    answers[key] = Number(btn.dataset.value);
    btn.parentElement.querySelectorAll('.chip').forEach((el) => {
      el.setAttribute('aria-pressed', String(el === btn));
    });
  });

  onClick(root, '[data-multi] .chip', (btn) => {
    const value = btn.dataset.value;
    if (answers.equipment.has(value)) answers.equipment.delete(value);
    else answers.equipment.add(value);
    btn.setAttribute('aria-pressed', String(answers.equipment.has(value)));
  });

  onClick(root, '[data-generate]', async () => {
    try {
      await store.createPlan({ ...answers, equipment: [...answers.equipment] });
      toast('Plan ready');
      renderPlan(root);
    } catch (error) {
      toast(error.message);
    }
  });
}

/** Radio-style rows with a title and a one-line explanation. */
function optionRows(key, options) {
  return Object.entries(options).map(([value, opt]) => `
    <button class="row" role="radio" data-option="${key}" data-value="${value}"
            aria-checked="${answers[key] === value}">
      <div class="row-main">
        <div class="row-title">${opt.label}</div>
        <div class="row-sub">${opt.blurb}</div>
      </div>
      <span class="radio"></span>
    </button>`).join('');
}

// --- Overview ----------------------------------------------------------------

function renderOverview(root, plan) {
  const progress = planProgress(plan, store.state.workouts);
  const active = store.activeWorkout();
  const routines = plan.routineIds.map((id) => store.routineById(id)).filter(Boolean);
  const next = routines[progress.dayIndex];

  root.innerHTML = `
    <div class="tiles">
      ${tile({ label: 'Week', value: `${progress.week} / ${plan.weeks}`, caption: progress.isDeload ? 'deload week' : plan.inputs.days + ' days', iconName: 'today' })}
      ${tile({ label: 'Sessions', value: `${progress.completed} / ${progress.total}`, caption: `${progress.percent}% done`, iconName: 'check' })}
    </div>

    ${progress.done ? `
      <div class="card" style="margin-top:14px"><div class="pad">
        <strong>Plan complete.</strong> ${plan.weeks} weeks, ${progress.total} sessions.
        Generate a new one — your history carries over, so the coach starts from where you are.
      </div></div>` : `
      <div class="card" style="margin-top:14px">
        <div class="row">
          <div class="row-main">
            <div class="row-sub" style="color:var(--accent);font-weight:700">
              Next up · Day ${progress.dayIndex + 1}${progress.isDeload ? ' · deload' : ''}
            </div>
            <div class="row-title">${esc(next?.name ?? '—')}</div>
          </div>
          <button class="btn btn-sm btn-primary" data-start ${active ? 'disabled' : ''}>Start</button>
        </div>
      </div>`}

    <div class="section-title">${esc(plan.name)}</div>
    ${routines.map((r, i) => `
      <div class="card" style="margin-top:${i ? 10 : 0}px">
        <div class="entry-head">
          <h3>${esc(r.name)}</h3>
          <span class="muted" style="font-size:12px">${i === progress.dayIndex && !progress.done ? 'next' : `day ${i + 1}`}</span>
          <a class="icon-btn" href="#/routine/${r.id}" aria-label="Edit ${esc(r.name)}" style="color:var(--ink-3)">${icon('more', 20)}</a>
        </div>
        ${r.items.map((item) => {
          const ex = store.exerciseById(item.exerciseId);
          return `<div class="row">
            <div class="row-main">${esc(ex?.name ?? 'Deleted exercise')}</div>
            <span class="muted" style="font-variant-numeric:tabular-nums">${item.targetSets} × ${item.targetReps}</span>
          </div>`;
        }).join('')}
      </div>`).join('')}

    <div class="section-title">Why this plan</div>
    <div class="card">
      ${plan.rationale.map((line) => `<div class="pad" style="border-bottom:1px solid var(--line);font-size:14px;color:var(--ink-2)">${esc(line)}</div>`).join('')}
      <div class="pad muted" style="font-size:12px">
        Each day is a normal routine — tap ⋯ to swap an exercise or change the sets.
        The coach's per-lift suggestions take over once you've logged a session.
      </div>
    </div>

    <div class="stack" style="margin-top:14px">
      <button class="btn btn-quiet btn-block" data-regenerate>Start over with new answers</button>
      <button class="btn btn-danger btn-block" data-delete>Delete plan</button>
    </div>`;

  onClick(root, '[data-start]', async () => {
    const workout = await store.startFromPlan(plan);
    if (!workout) { toast('That day’s routine is missing'); return; }
    navigate(`#/workout/${workout.id}`);
  });

  onClick(root, '[data-regenerate]', async () => {
    if (!window.confirm('Replace this plan? Its routines are removed; logged sessions are kept.')) return;
    await store.deletePlan(plan.id);
    renderPlan(root);
  });

  onClick(root, '[data-delete]', async () => {
    if (!window.confirm('Delete this plan and its routines? Logged sessions are kept.')) return;
    await store.deletePlan(plan.id);
    toast('Plan deleted');
    navigate('#/today');
  });
}
