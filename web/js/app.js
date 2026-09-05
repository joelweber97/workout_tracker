// Shell and router. Routes are hash-based so the whole app is a single static
// file tree — no server rewrites, which is what makes GitHub Pages viable.

import * as store from './store.js';
import { icon } from './ui.js';
import { restTimer } from './rest.js';

import renderToday from './views/today.js';
import renderWorkout from './views/workout.js';
import renderHistory from './views/history.js';
import renderWorkoutDetail from './views/workout-detail.js';
import renderExercises from './views/exercises.js';
import renderExerciseDetail from './views/exercise-detail.js';
import renderStats from './views/stats.js';
import renderCoach from './views/coach-view.js';
import renderSettings from './views/settings.js';
import renderRoutine from './views/routine.js';

const TABS = [
  { hash: '#/today', label: 'Today', iconName: 'today' },
  { hash: '#/history', label: 'History', iconName: 'history' },
  { hash: '#/exercises', label: 'Exercises', iconName: 'list' },
  { hash: '#/stats', label: 'Stats', iconName: 'stats' },
];

const ROUTES = [
  [/^#\/today$/, renderToday],
  [/^#\/workout\/([\w-]+)$/, renderWorkout],
  [/^#\/history$/, renderHistory],
  [/^#\/session\/([\w-]+)$/, renderWorkoutDetail],
  [/^#\/exercises$/, renderExercises],
  [/^#\/exercise\/([\w-]+)$/, renderExerciseDetail],
  [/^#\/stats$/, renderStats],
  [/^#\/coach$/, renderCoach],
  [/^#\/settings$/, renderSettings],
  [/^#\/routine\/([\w-]+)$/, renderRoutine],
];

// Views attach delegated listeners to the container they're handed. That
// container is replaced on every render, so those listeners die with it —
// attaching them to a persistent #view element instead would stack a fresh
// copy on each visit, and one tap would fire the handler once per visit.
const viewHost = document.getElementById('view');
const titleEl = document.getElementById('title');
const actionsEl = document.getElementById('topbar-actions');
const leadEl = document.getElementById('topbar-lead');
const tabbar = document.getElementById('tabbar');

/** Set by a view to control the header; reset before every render. */
export const chrome = {
  setTitle(text) { titleEl.textContent = text; },
  setActions(html) { actionsEl.innerHTML = html; },
  onAction(selector, handler) {
    actionsEl.querySelector(selector)?.addEventListener('click', handler);
  },
  /** The slot left of the title — a back button, and nothing else. */
  setLead(html) { leadEl.innerHTML = html; },
  onLead(selector, handler) {
    leadEl.querySelector(selector)?.addEventListener('click', handler);
  },
};

function renderTabs() {
  const current = window.location.hash || '#/today';
  tabbar.innerHTML = TABS.map((tab) => `
    <a href="${tab.hash}" ${current.startsWith(tab.hash) ? 'aria-current="page"' : ''}>
      ${icon(tab.iconName, 22)}<span>${tab.label}</span>
    </a>`).join('');
}

let renderScheduled = false;

/** Coalesces the burst of notifications a single user action can produce. */
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

function render() {
  const hash = window.location.hash || '#/today';
  const match = ROUTES.map(([pattern, fn]) => [hash.match(pattern), fn]).find(([m]) => m);

  if (!match) {
    window.location.replace('#/today');
    return;
  }

  const [result, fn] = match;
  chrome.setActions('');
  chrome.setLead('');
  renderTabs();

  const container = document.createElement('div');
  viewHost.replaceChildren(container);
  window.scrollTo(0, 0);

  try {
    fn(container, ...result.slice(1));
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="empty"><h2>Something broke</h2>
      <p>${error.message}</p></div>`;
  }
}

async function boot() {
  try {
    await store.load();
  } catch (error) {
    viewHost.innerHTML = `<div class="empty"><h2>Couldn’t open your data</h2>
      <p>${error.message}</p></div>`;
    return;
  }

  store.subscribe(scheduleRender);
  restTimer.subscribe(() => {
    // The rest bar lives outside the view, so it repaints on its own rather
    // than forcing a full re-render every tick.
    document.getElementById('rest-host')?.dispatchEvent(new CustomEvent('tick'));
  });

  window.addEventListener('hashchange', render);
  if (!window.location.hash) window.location.replace('#/today');
  render();

  if ('serviceWorker' in navigator) {
    // Registered after first paint so it never delays the app appearing.
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
