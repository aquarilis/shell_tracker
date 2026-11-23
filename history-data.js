'use strict';

function historyNumber(value, row, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  const number = typeof value === 'number' ? value
    : /^[+-]?\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : NaN;
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Valeur invalide : ${field}, ligne ${row}`);
  }
  return number;
}

function historyData(rows, period, grouping, now) {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const entries = rows.map((row) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.date);
    if (!match) throw new Error(`Date invalide, ligne ${row.row}`);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error(`Date invalide, ligne ${row.row}`);
    }
    return {
      row, year, month,
      amount: historyNumber(row.amount, row.row, 'montant'),
      volume: historyNumber(row.volume, row.row, 'volume'),
    };
  });

  const years = entries.map((entry) => entry.year);
  const firstYear = years.length ? Math.min(...years, currentYear) : currentYear;
  const lastYear = years.length ? Math.max(...years, currentYear) : currentYear;
  let startYear;
  let endYear;
  let endMonth;
  if (period === 'all') {
    if (!entries.length) return { entries: [], buckets: [], amount: 0, volume: 0, firstYear, lastYear };
    startYear = Math.min(...years);
    endYear = lastYear;
    endMonth = Math.max(endYear === currentYear ? currentMonth : 0,
      ...entries.filter((entry) => entry.year === endYear).map((entry) => entry.month));
  } else {
    startYear = endYear = period === 'current' ? currentYear
      : period === 'previous' ? currentYear - 1 : Number(period);
    if (!Number.isInteger(startYear) || startYear < 1 || startYear > 9999) {
      throw new Error('Période invalide');
    }
    endMonth = endYear === currentYear ? currentMonth : 12;
  }

  const filtered = entries.filter((entry) =>
    entry.year >= startYear && entry.year <= endYear &&
    (entry.year !== endYear || entry.month <= endMonth)
  );
  const buckets = [];
  for (let year = startYear; year <= endYear; year++) {
    const months = grouping === 'month' ? (year === endYear ? endMonth : 12) : 1;
    for (let month = 1; month <= months; month++) {
      buckets.push({ year, month: grouping === 'month' ? month : null, amount: 0, volume: 0, count: 0 });
    }
  }
  const byKey = new Map(buckets.map((bucket) => [`${bucket.year}-${bucket.month || 0}`, bucket]));
  let amount = 0;
  let volume = 0;
  for (const entry of filtered) {
    const bucket = byKey.get(`${entry.year}-${grouping === 'month' ? entry.month : 0}`);
    bucket.amount += entry.amount;
    bucket.volume += entry.volume;
    bucket.count++;
    amount += entry.amount;
    volume += entry.volume;
  }
  return { entries: filtered.map((entry) => entry.row), buckets, amount, volume, firstYear, lastYear };
}

if (typeof module !== 'undefined') module.exports = { historyData };
