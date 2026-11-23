'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { historyData } = require('../history-data.js');

const now = new Date(2026, 2, 15);
const row = (date, amount, volume, id = 2) => ({ date, amount, volume, row: id });

test('aggregates the current year by month, including empty months but not future months', () => {
  const rows = [
    row('2026-03-10', 100, 40),
    row('2026-01-02', 20.5, 10.25),
    row('2026-04-01', 99, 50),
    row('2025-12-31', 10, 5),
  ];
  const data = historyData(rows, 'current', 'month', now);
  assert.deepEqual(data.buckets.map(({ amount, volume, count }) => [amount, volume, count]), [
    [20.5, 10.25, 1], [0, 0, 0], [100, 40, 1],
  ]);
  assert.equal(data.amount, 120.5);
  assert.equal(data.volume, 50.25);
  assert.deepEqual(data.entries, rows.slice(0, 2));
});

test('shows every month of a past year and all entries, not only the latest 20', () => {
  const rows = Array.from({ length: 25 }, (_, i) => row('2025-02-01', 2, 1, i + 2));
  const data = historyData(rows, 'previous', 'month', now);
  assert.equal(data.buckets.length, 12);
  assert.equal(data.buckets[1].count, 25);
  assert.equal(data.entries.length, 25);
  assert.equal(data.amount, 50);
  assert.equal(data.volume, 25);
});

test('all years includes gaps, the current period and later dated entries', () => {
  const rows = [row('2023-12-31', 10, 5), row('2026-05-01', 20, 10)];
  const years = historyData(rows, 'all', 'year', now);
  assert.deepEqual(years.buckets.map(({ year, amount }) => [year, amount]), [
    [2023, 10], [2024, 0], [2025, 0], [2026, 20],
  ]);
  const months = historyData(rows, 'all', 'month', now);
  assert.equal(months.buckets.length, 41);
  assert.equal(months.buckets.at(-1).month, 5);
  assert.equal(months.entries.length, 2);
});

test('filters a specific empty year and supports an empty history', () => {
  const data = historyData([row('2023-01-01', 10, 5)], '2024', 'year', now);
  assert.deepEqual(data.buckets.map(({ year, count }) => [year, count]), [[2024, 0]]);
  assert.equal(data.entries.length, 0);
  assert.equal(historyData([], 'all', 'month', now).buckets.length, 0);
});

test('rejects invalid dates and missing or invalid values instead of reporting misleading totals', () => {
  assert.throws(() => historyData([row('2025-02-29', 10, 5)], 'all', 'year', now), /Date invalide/);
  assert.throws(() => historyData([row('2026-01-01', '', 5)], 'all', 'year', now), /montant/);
  assert.throws(() => historyData([row('2026-01-01', 10, -5)], 'all', 'year', now), /volume/);
  assert.equal(historyData([row('2024-02-29', '12,5', '4.5')], '2024', 'year', now).amount, 12.5);
});
