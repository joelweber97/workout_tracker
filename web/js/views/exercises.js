import * as store from '../store.js';
import { chrome } from '../app.js';
import { icon, muscleIcon, emptyState, navigate } from '../ui.js';
import { esc } from '../format.js';
import { MUSCLE_GROUPS, EQUIPMENT, groupLabel, equipmentLabel, region } from '../domain.js';

/** Search text survives a re-render so typing doesn't reset the list. */
let search = '';

/**
 * Two levels: `#/exercises` is a grid of muscle groups, `#/exercises/back` is
 * that group's list. 217 exercises in one scroll was more than anyone wants to
 * page through; picking the body part first is how people actually think about
 * it. Typing in the search box cuts across groups from either level.
 */
export default function renderExercises(root, group = null) {
  if (group && !MUSCLE_GROUPS.includes(group)) { navigate('#/exercises'); return; }

  chrome.setTitle(group ? groupLabel(group) : 'Exercises');
  if (group) {
    chrome.setLead(`<button class="icon-btn" data-back aria-label="All muscle groups">${icon('back')}</button>`);
    chrome.onLead('[data-back]', () => navigate('#/exercises'));
  }

  const total = group
    ? store.visibleExercises().filter((e) => e.muscleGroup === group).length
    : store.visibleExercises().length;

  root.innerHTML = `
    <input type="search" id="ex-search"
           placeholder="Search ${total} ${group ? groupLabel(group).toLowerCase() : ''} exercises"
           value="${esc(search)}" aria-label="Search exercises" autocomplete="off">
    <div id="ex-body">${bodyHtml(group)}</div>`;

  root.querySelector('#ex-search').addEventListener('input', (event) => {
    search = event.target.value;
    // Repaint just the body — re-rendering the view would blur the field.
    root.querySelector('#ex-body').innerHTML = bodyHtml(group);
  });
}

function bodyHtml(group) {
  const term = search.trim().toLowerCase();
  if (term) return searchHtml(term, group);
  return group ? listHtml(group) : gridHtml();
}

/** The top level: one card per muscle group, with a count. */
function gridHtml() {
  const all = store.visibleExercises();
  const cards = MUSCLE_GROUPS.map((g) => {
    const count = all.filter((e) => e.muscleGroup === g).length;
    if (!count) return '';
    return `
      <a class="group-card tint-${region(g).toLowerCase()}" href="#/exercises/${g}">
        ${muscleIcon(g, 40)}
        <span class="group-name">${groupLabel(g)}</span>
        <span class="group-count">${count}</span>
      </a>`;
  }).join('');

  return `<div class="group-grid">${cards}</div>`;
}

/** One group's exercises, sub-grouped by equipment so a long list has shape. */
function listHtml(group) {
  const items = store.visibleExercises().filter((e) => e.muscleGroup === group);
  if (!items.length) {
    return emptyState('Nothing here yet', `No ${groupLabel(group).toLowerCase()} exercises in your library.`);
  }

  // Fixed order (barbell first, odds and ends last) rather than first-seen.
  const sections = EQUIPMENT
    .map((equipment) => [equipment, items.filter((e) => e.equipment === equipment)])
    .filter(([, list]) => list.length);

  return sections.map(([equipment, list]) => `
    <div class="section-title">${equipmentLabel(equipment)} · ${list.length}</div>
    <div class="card">${list.map((e) => rowHtml(e)).join('')}</div>`).join('');
}

/** Search cuts across groups; each hit says where it lives. */
function searchHtml(term, group) {
  const hits = store.visibleExercises().filter((e) => (
    (!group || e.muscleGroup === group) && e.name.toLowerCase().includes(term)
  ));
  if (!hits.length) {
    return emptyState('No matches', `Nothing matches “${esc(search)}”${group ? ` in ${groupLabel(group).toLowerCase()}` : ''}.`);
  }
  return `<div class="card">${hits.map((e) => rowHtml(e, !group)).join('')}</div>`;
}

function rowHtml(e, showGroup = false) {
  const sub = [showGroup ? groupLabel(e.muscleGroup) : null, equipmentLabel(e.equipment), e.isCustom ? 'custom' : null]
    .filter(Boolean).join(' · ');
  return `
    <a class="row" href="#/exercise/${e.id}">
      <div class="row-main">
        <div class="row-title">${esc(e.name)}</div>
        <div class="row-sub">${sub}</div>
      </div>
      <span class="chevron">${icon('chevron', 18)}</span>
    </a>`;
}
