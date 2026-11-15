/* ポックル 麻酔記録サーバー（Apps Script・pokkur.ah で設置）
 *
 * 役割：① iPhone で入力中の麻酔記録を一時保管し、麻酔室の大画面に配信する（シート「記録」、5日で自動削除）
 *       ② 終了した記録を永久保存（院長決定 2026-11-15：飼い主名も保存、院内スタッフで共有）
 *          フォルダ「ポックル 麻酔記録」に PDF と集計シート「麻酔記録DB」（症例／バイタル／投与・イベント）
 *          → 院長がこのフォルダをスタッフのGoogleアカウントと共有する（閲覧者）
 *
 * 設置手順：
 *   1. script.google.com で新しいプロジェクト「ポックル麻酔記録」を作り、このコードを貼る
 *   2. プロジェクトの設定 → スクリプト プロパティに STAFF_KEY（受付ボードと同じ院内キー）を追加
 *   3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」、実行＝自分、アクセス＝全員 → URL をコピー
 *   4. Pokkur-Tools の anes-record/index.html の REC_API にその URL を入れる
 *   5. 関数 setup を1回実行（権限を承認）→ フォルダ・DB・毎日の掃除トリガーができる
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
    if (p.action === 'archive') return out_(archive_(p));
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

/* ===== 永久保存（PDF＋麻酔記録DB） ===== */
function folder_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('FOLDER_ID'), f = null;
  if (id) { try { f = DriveApp.getFolderById(id); if (f.isTrashed()) f = null; } catch (e) { f = null; } }
  if (!f) { f = DriveApp.createFolder('ポックル 麻酔記録'); props.setProperty('FOLDER_ID', f.getId()); }
  return f;
}
function sub_(parent, name) { var it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function db_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('DB_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); if (DriveApp.getFileById(id).isTrashed()) ss = null; } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('麻酔記録DB');
    DriveApp.getFileById(ss.getId()).moveTo(folder_());
    props.setProperty('DB_ID', ss.getId());
  }
  return ss;
}
function archive_(p) {
  if (!p.id || !p.sheets) return { ok: false, err: 'data' };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var data = JSON.parse(p.sheets), ss = db_(), pdfUrl = '';
    /* PDF：月ごとのフォルダ。同じ記録IDの古いPDFはゴミ箱へ */
    if (p.pdf) {
      var mf = sub_(sub_(folder_(), 'PDF'), String(p.date || '').slice(0, 7) || '日付なし');
      var props = PropertiesService.getScriptProperties(), oldId = props.getProperty('PDF_' + p.id);
      if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) {} }
      var file = mf.createFile(Utilities.newBlob(Utilities.base64Decode(p.pdf), 'application/pdf', p.pdfName || (p.id + '.pdf')));
      props.setProperty('PDF_' + p.id, file.getId());
      pdfUrl = file.getUrl();
    }
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
    var order = ['症例', 'バイタル', '投与・イベント'];
    order.forEach(function (name, si) {
      var t = data[name]; if (!t) return;
      var sh = ss.getSheetByName(name);
      if (!sh) { sh = si === 0 && ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0 ? ss.getSheets()[0].setName(name) : ss.insertSheet(name); }
      sh.getRange(1, 1, 1, t.head.length).setValues([t.head]).setFontWeight('bold');
      sh.setFrozenRows(1);
      /* 同じ記録IDの行を消してから追加（保存し直しは上書き） */
      var n = sh.getLastRow() - 1;
      if (n > 0) { var ids = sh.getRange(2, 1, n, 1).getValues(); for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(p.id)) sh.deleteRow(i + 2); }
      var rows = t.rows.map(function (r) {
        r = r.map(function (v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; });
        if (name === '症例') { r[r.length - 2] = pdfUrl; r[r.length - 1] = now; }
        return r;
      });
      if (rows.length) {
        var start = sh.getLastRow() + 1;
        sh.getRange(start, 2, rows.length, 2).setNumberFormat('@');   /* 日付・カルテNoは文字のまま */
        sh.getRange(start, 1, rows.length, t.head.length).setValues(rows);
      }
    });
    return { ok: true, pdfUrl: pdfUrl, dbUrl: ss.getUrl() };
  } finally { lock.releaseLock(); }
}

/* 初回に1回だけ実行：保存先フォルダ・DB・一時シートの作成と、毎日の掃除トリガー（権限の承認もここで行う） */
function setup() {
  sheet_(); db_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'cleanup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cleanup').timeBased().everyDays(1).atHour(3).create();
  Logger.log('フォルダ：' + folder_().getUrl());
  Logger.log('麻酔記録DB：' + db_().getUrl());
  Logger.log('STAFF_KEY：' + (PropertiesService.getScriptProperties().getProperty('STAFF_KEY') ? '設定済み' : '未設定（プロジェクトの設定 → スクリプト プロパティで追加）'));
}
