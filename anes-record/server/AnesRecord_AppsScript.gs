/* ポックル 麻酔記録サーバー（Apps Script・pokkur.ah で設置）
 *
 * 役割：iPhone で入力中の麻酔記録を一時保管し、麻酔室の大画面に配信する。
 *       記録の正本は PDF（Googleドライブ → アーミックス）。ここは5日で自動削除。
 *       飼い主名は保存しない（動物名・カルテNo・動物種・術式・担当医・記録データのみ）。
 *
 * 設置手順：
 *   1. script.google.com で新しいプロジェクト「ポックル麻酔記録」を作り、このコードを貼る
 *   2. プロジェクトの設定 → スクリプト プロパティに STAFF_KEY（受付ボードと同じ院内キー）を追加
 *   3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」、実行＝自分、アクセス＝全員 → URL をコピー
 *   4. Pokkur-Tools の anes-record/index.html の REC_API にその URL を入れる
 *   5. トリガー：関数 cleanup を「時間主導・日付ベース（毎日 深夜）」で追加（なくても書き込み時に掃除する）
 *   コードを直したら「デプロイを管理」→ 編集 → 新バージョン（URLは変わらない）
 */
var KEEP_DAYS = 5;
var SHEET = '記録';
var HEAD = ['id', 'created', 'updated', 'rev', 'status', 'date', 'no', 'name', 'sp', 'proc', 'vet', 'chunks'];
var CHUNK = 45000;   /* セルの上限（5万文字）を超えないよう分割 */

function doGet(e) { return handle_(e && e.parameter || {}); }
function doPost(e) { var p = {}; try { p = JSON.parse(e.postData.contents); } catch (x) {} return handle_(p); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function handle_(p) {
  var key = PropertiesService.getScriptProperties().getProperty('STAFF_KEY');
  if (!key || p.k !== key) return out_({ ok: false, err: 'auth' });
  try {
    if (p.action === 'list') return out_({ ok: true, rows: list_() });
    if (p.action === 'get') return out_(get_(p.id, p.rev));
    if (p.action === 'put') return out_(put_(p));
    if (p.action === 'del') return out_(del_(p.id));
    return out_({ ok: false, err: 'action' });
  } catch (err) {
    return out_({ ok: false, err: String(err && err.message || err) });
  }
}

function sheet_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('SHEET_ID'), ss;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create('ポックル 麻酔記録（5日で自動削除）'); props.setProperty('SHEET_ID', ss.getId()); }
  var sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.getSheets()[0]; sh.setName(SHEET); sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]); sh.setFrozenRows(1); }
  return sh;
}
function findRow_(sh, id) {
  if (!id) return 0;
  var f = sh.getRange('A:A').createTextFinder(String(id)).matchEntireCell(true).findNext();
  return f ? f.getRow() : 0;
}

function list_() {
  var sh = sheet_(), n = sh.getLastRow() - 1; if (n < 1) return [];
  var v = sh.getRange(2, 1, n, HEAD.length - 1).getValues(), lim = Date.now() - 24 * 3600e3;
  return v.filter(function (r) { return r[0] && Number(r[2]) >= lim; }).map(function (r) {
    return { id: String(r[0]), created: Number(r[1]), updated: Number(r[2]), rev: Number(r[3]), status: r[4], date: String(r[5]), no: String(r[6]), name: String(r[7]), sp: r[8], proc: r[9], vet: r[10] };
  });
}

function get_(id, rev) {
  var cache = CacheService.getScriptCache(), cr = cache.get('rev_' + id);
  if (cr != null && rev != null && rev !== '' && String(rev) === cr) return { ok: true, same: true };
  var cd = cache.get('dat_' + id);
  if (cd != null && cr != null) return { ok: true, rev: Number(cr), data: cd };
  var sh = sheet_(), row = findRow_(sh, id); if (!row) return { ok: false, err: 'notfound' };
  var meta = sh.getRange(row, 1, 1, HEAD.length).getValues()[0], k = Number(meta[11]) || 1;
  var data = sh.getRange(row, HEAD.length + 1, 1, k).getValues()[0].join('');
  if (String(rev) === String(meta[3])) return { ok: true, same: true };
  putCache_(id, meta[3], data);
  return { ok: true, rev: Number(meta[3]), data: data };
}
function putCache_(id, rev, data) {
  var cache = CacheService.getScriptCache();
  cache.put('rev_' + id, String(rev), 21600);
  if (data.length < 90000) cache.put('dat_' + id, data, 21600); else cache.remove('dat_' + id);
}

function put_(p) {
  if (!p.id || !p.data) return { ok: false, err: 'data' };
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = sheet_(), row = findRow_(sh, p.id), now = Date.now();
    if (row) {
      var cur = Number(sh.getRange(row, 4).getValue());
      if (Number(p.rev) < cur) return { ok: true, stale: true, rev: cur };   /* 古い送信は無視 */
    } else { row = sh.getLastRow() + 1; }
    var chunks = []; for (var i = 0; i < p.data.length; i += CHUNK) chunks.push(p.data.slice(i, i + CHUNK));
    var created = row <= sh.getLastRow() && sh.getRange(row, 2).getValue() ? sh.getRange(row, 2).getValue() : now;
    var meta = [String(p.id), created, now, Number(p.rev) || 0, p.status || '', "'" + (p.date || ''), "'" + (p.no || ''), p.name || '', p.sp || '', p.proc || '', p.vet || '', chunks.length];
    var oldW = sh.getLastColumn();
    sh.getRange(row, 1, 1, meta.length).setValues([meta]);
    if (oldW > HEAD.length) sh.getRange(row, HEAD.length + 1, 1, oldW - HEAD.length).clearContent();
    sh.getRange(row, HEAD.length + 1, 1, chunks.length).setValues([chunks]);
    putCache_(p.id, Number(p.rev) || 0, p.data);
    if (Math.random() < 0.05) cleanup();
    return { ok: true, rev: Number(p.rev) || 0 };
  } finally { lock.releaseLock(); }
}

function del_(id) {
  var sh = sheet_(), row = findRow_(sh, id);
  if (row) sh.deleteRow(row);
  var c = CacheService.getScriptCache(); c.remove('rev_' + id); c.remove('dat_' + id);
  return { ok: true };
}

/* KEEP_DAYS を過ぎた記録を削除（毎日のトリガー＋書き込み時にときどき） */
function cleanup() {
  var sh = sheet_(), n = sh.getLastRow() - 1; if (n < 1) return;
  var v = sh.getRange(2, 3, n, 1).getValues(), lim = Date.now() - KEEP_DAYS * 864e5;
  for (var i = v.length - 1; i >= 0; i--) if (Number(v[i][0]) < lim) sh.deleteRow(i + 2);
}
