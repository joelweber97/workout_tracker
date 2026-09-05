// Hand-rolled SVG charts. Each one carries a single series, so none needs a
// colour key to decode — the heading names the measure and the axis gives the
// scale. No chart library, which keeps the app dependency-free and offline.

import { esc } from './format.js';

const WIDTH = 320;

/**
 * Vertical bars over time. Empty buckets are drawn as gaps rather than skipped,
 * so a week off reads as a week off.
 */
export function barChart(points, { height = 150, format = String, labelEvery = 4 } = {}) {
  if (!points.length) return '';

  const max = Math.max(...points.map((p) => p.value), 1);
  const padLeft = 34;
  const padBottom = 18;
  const padTop = 6;
  const plotWidth = WIDTH - padLeft - 6;
  const plotHeight = height - padBottom - padTop;
  const slot = plotWidth / points.length;
  const barWidth = Math.max(3, Math.min(22, slot * 0.62));

  const gridValues = [0, max / 2, max];
  const grid = gridValues.map((value) => {
    const y = padTop + plotHeight - (value / max) * plotHeight;
    return `<line class="grid" x1="${padLeft}" y1="${y.toFixed(1)}" x2="${WIDTH - 6}" y2="${y.toFixed(1)}"/>
      <text class="axis" x="${padLeft - 5}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${esc(format(value))}</text>`;
  }).join('');

  const bars = points.map((point, index) => {
    const barHeight = (point.value / max) * plotHeight;
    const x = padLeft + index * slot + (slot - barWidth) / 2;
    const y = padTop + plotHeight - barHeight;
    const label = index % labelEvery === 0 || index === points.length - 1
      ? `<text class="axis" x="${(x + barWidth / 2).toFixed(1)}" y="${height - 4}" text-anchor="middle">${esc(point.label)}</text>`
      : '';
    const rect = point.value > 0
      ? `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}"
           height="${Math.max(2, barHeight).toFixed(1)}" rx="3"><title>${esc(point.label)}: ${esc(format(point.value))}</title></rect>`
      : '';
    return rect + label;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${WIDTH} ${height}" role="img"
    aria-label="Bar chart, ${points.length} periods, peak ${esc(format(max))}">${grid}${bars}</svg>`;
}

/** A single trend line — used for estimated 1RM over time. */
export function lineChart(points, { height = 150, format = String } = {}) {
  if (points.length < 2) return '';

  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat series would divide by zero; give it a nominal band instead.
  const span = max - min || max * 0.1 || 1;
  const top = max + span * 0.15;
  const bottom = Math.max(0, min - span * 0.15);

  const padLeft = 34;
  const padBottom = 18;
  const padTop = 6;
  const plotWidth = WIDTH - padLeft - 6;
  const plotHeight = height - padBottom - padTop;

  const x = (i) => padLeft + (i / (points.length - 1)) * plotWidth;
  const y = (v) => padTop + plotHeight - ((v - bottom) / (top - bottom)) * plotHeight;

  const grid = [bottom, (bottom + top) / 2, top].map((value) => `
    <line class="grid" x1="${padLeft}" y1="${y(value).toFixed(1)}" x2="${WIDTH - 6}" y2="${y(value).toFixed(1)}"/>
    <text class="axis" x="${padLeft - 5}" y="${(y(value) + 3.5).toFixed(1)}" text-anchor="end">${esc(format(value))}</text>`).join('');

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle class="point" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3">
    <title>${esc(p.label)}: ${esc(format(p.value))}</title></circle>`).join('');

  const ends = [0, points.length - 1].map((i) => `
    <text class="axis" x="${x(i).toFixed(1)}" y="${height - 4}"
      text-anchor="${i === 0 ? 'start' : 'end'}">${esc(points[i].label)}</text>`).join('');

  return `<svg class="chart" viewBox="0 0 ${WIDTH} ${height}" role="img"
    aria-label="Line chart from ${esc(format(values[0]))} to ${esc(format(values.at(-1)))}">
    ${grid}<path class="line" d="${path}"/>${dots}${ends}</svg>`;
}

/**
 * Horizontal bars with the name and value written beside each one, so identity
 * never rests on colour alone.
 */
export function barList(items, { format = String, color = () => 'var(--accent)' } = {}) {
  if (!items.length) return '';
  const max = Math.max(...items.map((i) => i.value), 1);

  return items.map((item) => `
    <div class="hbar">
      <span class="hbar-name">${esc(item.label)}</span>
      <span class="hbar-track">
        <span class="hbar-fill" style="width:${((item.value / max) * 100).toFixed(1)}%;background:${color(item)}"></span>
      </span>
      <span class="hbar-value">${esc(format(item.value))}</span>
    </div>`).join('');
}
