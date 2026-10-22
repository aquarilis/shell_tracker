// Web API for the Shell Tracker PWA. Names are prefixed (ST_ / st*_) to avoid clashing with globals of the existing macro.
const ST_SHEET_NAME = 'Données';
const ST_DEFAULT_CONSUMPTION = 9.861;
const ST_COLS = 6; // A=Date B=Prix C=Volume D=Montant E=Kilométrage F=Delta km

function doGet() {
  return stJson_({ ok: true, data: 'Shell Tracker API' });
}

function doPost(e) {
  let params;
  try {
    params = JSON.parse(e.postData.contents);
  } catch (err) {
    return stJson_({ ok: false, error: 'JSON invalide' });
  }
  try {
    stCheckToken_(params.token);
    switch (params.action) {
      case 'meta': return stJson_({ ok: true, data: stMeta_() });
      case 'list': return stJson_({ ok: true, data: stList_(params.n) });
      case 'add': return stJson_({ ok: true, data: stWithLock_(() => stAdd_(params)) });
      case 'delete': return stJson_({ ok: true, data: stWithLock_(() => stDelete_(params)) });
      default: throw new Error('Action inconnue');
    }
  } catch (err) {
    return stJson_({ ok: false, error: err.message });
  }
}

function stCheckToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) throw new Error('API_TOKEN non configuré');
  if (typeof token !== 'string' || token !== expected) throw new Error('Token invalide');
}

function stWithLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function stSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ST_SHEET_NAME);
  if (!sheet) throw new Error('Onglet "' + ST_SHEET_NAME + '" introuvable');
  return sheet;
}

function stTz_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}

function stFormatDate_(v) {
  return v instanceof Date ? Utilities.formatDate(v, stTz_(), 'yyyy-MM-dd') : String(v);
}

function stNum_(v, label) {
  const x = typeof v === 'number' ? v : parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.'));
  if (!isFinite(x)) throw new Error('Valeur invalide : ' + label);
  return x;
}

function stRowToObj_(r, row) {
  return {
    row: row,
    date: stFormatDate_(r[0]),
    price: r[1],
    volume: r[2],
    amount: r[3],
    mileage: r[4],
    delta: r[5],
  };
}

function stMeta_() {
  const sheet = stSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Aucune donnée');
  const last = stRowToObj_(sheet.getRange(lastRow, 1, 1, ST_COLS).getValues()[0], lastRow);
  return {
    lastDate: last.date,
    lastMileage: last.mileage,
    defaultConsumption: ST_DEFAULT_CONSUMPTION,
  };
}

function stList_(n) {
  const sheet = stSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const total = lastRow - 1;
  const count = n === 'all' ? total : Math.min(Math.max(parseInt(n, 10) || 20, 1), total);
  const start = lastRow - count + 1;
  return sheet.getRange(start, 1, count, ST_COLS).getValues()
    .map((r, i) => stRowToObj_(r, start + i))
    .reverse();
}

function stAdd_(p) {
  const price = stNum_(p.price, 'prix');
  const volume = stNum_(p.volume, 'volume');
  const consumption = stNum_(p.consumption, 'consommation');
  const adjustment = p.adjustment === undefined || p.adjustment === '' ? 0 : stNum_(p.adjustment, 'ajustement km');
  if (price <= 0 || volume <= 0 || consumption <= 0) throw new Error('Prix, volume et consommation doivent être > 0');

  const tz = stTz_();
  const dateStr = p.date || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Date invalide');
  const date = Utilities.parseDate(dateStr, tz, 'yyyy-MM-dd');

  const sheet = stSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Aucune ligne précédente pour le kilométrage');
  const lastMileage = stNum_(sheet.getRange(lastRow, 5).getValue(), 'dernier kilométrage');

  const mileage = Math.round(lastMileage + volume / consumption * 100 + adjustment);
  const delta = mileage - lastMileage;
  const amount = Math.round(price * volume * 100) / 100;

  const newRow = lastRow + 1;
  const target = sheet.getRange(newRow, 1, 1, ST_COLS);
  sheet.getRange(lastRow, 1, 1, ST_COLS).copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  target.setValues([[date, price, volume, amount, mileage, delta]]);

  return stRowToObj_([date, price, volume, amount, mileage, delta], newRow);
}

function stDelete_(p) {
  const sheet = stSheet_();
  const row = parseInt(p.row, 10);
  if (!(row >= 2 && row <= sheet.getLastRow())) throw new Error('Ligne invalide');
  const current = stRowToObj_(sheet.getRange(row, 1, 1, ST_COLS).getValues()[0], row);
  if (current.date !== p.date || Number(current.mileage) !== Number(p.mileage)) {
    throw new Error('La ligne a changé, rafraîchis l\'historique');
  }
  sheet.deleteRow(row);
  return { deleted: row };
}

function stJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
