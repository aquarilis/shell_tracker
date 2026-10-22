'use strict';

const LS = { url: 'st.apiUrl', token: 'st.token', consumption: 'st.consumption' };
const DEFAULT_CONSUMPTION = 9.861;

const $ = (id) => document.getElementById(id);
const chf = new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF' });
const num = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 });
const conso = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 3, useGrouping: false });

let meta = null;

function parseNum(s) {
  const x = parseFloat(String(s).trim().replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

let toastTimer;
function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 5000 : 2500);
}

async function api(action, payload = {}) {
  const url = localStorage.getItem(LS.url);
  const token = localStorage.getItem(LS.token);
  if (!url || !token) throw new Error("Configure l'URL et le token dans Réglages");
  // text/plain avoids a CORS preflight, which Apps Script does not support
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token, ...payload }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Erreur inconnue');
  return json.data;
}

// --- Navigation ---

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'history') loadHistory();
}

document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

// --- Meta / header ---

async function loadMeta() {
  try {
    meta = await api('meta');
    $('lastInfo').textContent = `Dernier plein : ${formatDate(meta.lastDate)} · ${int.format(meta.lastMileage)} km`;
  } catch (err) {
    meta = null;
    $('lastInfo').textContent = err.message;
  }
  updatePreview();
}

// --- Entry form ---

function readForm() {
  const adj = $('adjustment').value.trim();
  return {
    date: $('date').value,
    price: parseNum($('price').value),
    volume: parseNum($('volume').value),
    consumption: parseNum($('consumption').value),
    adjustment: adj === '' ? 0 : parseNum(adj),
  };
}

function updatePreview() {
  const f = readForm();
  const amountOk = f.price > 0 && f.volume > 0;
  $('pvAmount').textContent = amountOk ? chf.format(Math.round(f.price * f.volume * 100) / 100) : '–';
  if (meta && f.volume > 0 && f.consumption > 0 && Number.isFinite(f.adjustment)) {
    const mileage = Math.round(meta.lastMileage + (f.volume / f.consumption) * 100 + f.adjustment);
    $('pvDelta').textContent = int.format(mileage - meta.lastMileage);
    $('pvMileage').textContent = int.format(mileage);
  } else {
    $('pvDelta').textContent = '–';
    $('pvMileage').textContent = '–';
  }
}

['price', 'volume', 'consumption', 'adjustment'].forEach((id) => $(id).addEventListener('input', updatePreview));

function resetForm() {
  $('date').value = today();
  $('price').value = '';
  $('volume').value = '';
  $('adjustment').value = '';
  const saved = localStorage.getItem(LS.consumption);
  $('consumption').value = conso.format(saved ? parseFloat(saved) : meta?.defaultConsumption ?? DEFAULT_CONSUMPTION);
  updatePreview();
}

$('entryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = readForm();
  const checks = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(f.date),
    price: f.price > 0,
    volume: f.volume > 0,
    consumption: f.consumption > 0,
    adjustment: Number.isFinite(f.adjustment),
  };
  Object.entries(checks).forEach(([id, ok]) => $(id).classList.toggle('invalid', !ok));
  if (Object.values(checks).includes(false)) {
    toast('Champs invalides', true);
    return;
  }

  const btn = $('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';
  try {
    const row = await api('add', f);
    localStorage.setItem(LS.consumption, String(f.consumption));
    toast(`Enregistré : ${chf.format(row.amount)} · ${int.format(row.mileage)} km`);
    await loadMeta();
    resetForm();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
  }
});

// --- History ---

function renderHistory(rows) {
  const list = $('historyList');
  list.replaceChildren();
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Aucune donnée';
    list.append(li);
    return;
  }
  rows.forEach((r) => {
    const li = document.createElement('li');

    const main = document.createElement('div');
    main.className = 'main';
    const line1 = document.createElement('div');
    line1.className = 'line1';
    const d = document.createElement('span');
    d.textContent = formatDate(r.date);
    const a = document.createElement('span');
    a.textContent = typeof r.amount === 'number' ? chf.format(r.amount) : String(r.amount);
    line1.append(d, a);

    const line2 = document.createElement('div');
    line2.className = 'line2';
    const parts = [
      `${num.format(r.volume)} L à ${num.format(r.price)}`,
      `${int.format(r.mileage)} km`,
    ];
    if (r.delta !== '' && r.delta !== null) parts.push(`+${int.format(r.delta)} km`);
    line2.textContent = parts.join(' · ');
    main.append(line1, line2);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.textContent = 'Suppr.';
    del.setAttribute('aria-label', `Supprimer le plein du ${formatDate(r.date)}`);
    del.addEventListener('click', () => deleteRow(r, del));

    li.append(main, del);
    list.append(li);
  });
}

async function loadHistory() {
  try {
    renderHistory(await api('list', { n: 20 }));
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteRow(r, btn) {
  if (!confirm(`Supprimer le plein du ${formatDate(r.date)} (${int.format(r.mileage)} km) ?`)) return;
  btn.disabled = true;
  try {
    await api('delete', { row: r.row, date: r.date, mileage: r.mileage });
    toast('Ligne supprimée');
    await Promise.all([loadHistory(), loadMeta()]);
  } catch (err) {
    btn.disabled = false;
    toast(err.message, true);
  }
}

$('refreshHistory').addEventListener('click', loadHistory);

// --- Settings ---

$('apiUrl').value = localStorage.getItem(LS.url) || '';
$('apiToken').value = localStorage.getItem(LS.token) || '';

$('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('apiUrl').value.trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
    toast('URL Apps Script invalide', true);
    return;
  }
  localStorage.setItem(LS.url, url);
  localStorage.setItem(LS.token, $('apiToken').value.trim());
  await loadMeta();
  if (meta) {
    toast('Connexion OK');
    showView('entry');
  } else {
    toast($('lastInfo').textContent, true);
  }
});

// --- Init ---

resetForm();
if (localStorage.getItem(LS.url) && localStorage.getItem(LS.token)) {
  loadMeta();
} else {
  $('lastInfo').textContent = 'Configuration requise';
  showView('settings');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
