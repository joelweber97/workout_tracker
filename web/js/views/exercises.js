import * as store from '../store.js';
import { chrome } from '../app.js';
import { icon, emptyState } from '../ui.js';
import { esc } from '../format.js';
import { MUSCLE_GROUPS, groupLabel, equipmentLabel } from '../domain.js';

/** Search text survives a re-render so typing doesn't reset the list. */
let search = '';

export default function renderExercises(root) {
  chrome.setTitle('Exercises');

  root.innerHTML = `
    <input type="search" id="ex-search" placeholder="Search ${store.visibleExercises().length} exercises"
           value="${esc(search)}" aria-label="Search exercises" autocomplete="off">
    <div id="ex-list">${listHtml()}</div>`;

  root.querySelector('#ex-search').addEventListener('input', (event) => {
    search = event.target.value;
    // Repaint just the list — re-rendering the view would blur the field.
    root.querySelector('#ex-list').innerHTML = listHtml();
  });
}

function listHtml() {
  const term = search.trim().toLowerCase();
  const matching = store.visibleExercises()
    .filter((e) => !term || e.name.toLowerCase().includes(term));

  const groups = MUSCLE_GROUPS
    .map((group) => ({ group, items: matching.filter((e) => e.muscleGroup === group) }))
    .filter((section) => section.items.length);

  if (!groups.length) {
    return emptyState('No matches', `Nothing matches “${esc(search)}”.`);
  }

  return groups.map((section) => `
    <div class="section-title">${groupLabel(section.group)} · ${section.items.length}</div>
    <div class="card">
      ${section.items.map((e) => `
        <a class="row" href="#/exercise/${e.id}">
          <div class="row-main">
            <div class="row-title">${esc(e.name)}</div>
            <div class="row-sub">${equipmentLabel(e.equipment)}${e.isCustom ? ' · custom' : ''}</div>
          </div>
          <span class="chevron">${icon('chevron', 18)}</span>
        </a>`).join('')}
    </div>`).join('');
}
