/* ポックル 歯科記録サーバー（Apps Script・pokkur.ah で設置）
 *
 * 役割：① iPad で入力中の歯科検査記録を一時保管し、検査室PCで続きを開けるようにする（シート「記録」、5日で自動削除）
 *       ② 終了した記録を永久保存（院長決定 2026-11-26：麻酔記録と同じ方式）
 *          フォルダ「ポックル 歯科記録」/年-月/日付_カルテNo_動物名/ に 報告書PDF・院内記録PDF・写真、
 *          集計シート「歯科記録DB」（症例／歯）
 *
 * 設置手順：
 *   1. script.google.com で新しいプロジェクト「ポックル歯科記録」を作り、このコードを貼る
 *   2. プロジェクトの設定 → スクリプト プロパティに STAFF_KEY（受付ボードと同じ院内キー）を追加
 *   3. 関数 setup を1回実行（権限を承認）→ フォルダ・DB・毎日の掃除トリガーができる
 *   4. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」、実行＝自分、アクセス＝全員 → URL をコピー
 *   5. Pokkur-Tools の dental/index.html の DENT_API にその URL を入れる
 *   コードを直したら「デプロイを管理」→ 編集 → 新バージョン（URLは変わらない）
 */
var KEEP_DAYS = 5;
var SHEET = '記録';
var HEAD = ['id', 'created', 'updated', 'rev', 'status', 'date', 'no', 'name', 'sp', 'vet', 'chunks'];
var CHUNK = 45000;   /* セルの上限（5万文字）を超えないよう分割 */

function doGet(e) { return handle_(e && e.parameter || {}); }
function doPost(e) { var p = {}; try { p = JSON.parse(e.postData.contents); } catch (x) {} return handle_(p); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function handle_(p) {
  var key = PropertiesService.getScriptProperties().getProperty('STAFF_KEY');
  if (!key) return out_({ ok: false, err: 'nokey' });
  if (p.k !== key) return out_({ ok: false, err: 'auth' });
  try {
    if (p.action === 'ping') return out_({ ok: true, v: 1 });
    if (p.action === 'list') return out_({ ok: true, rows: list_() });
    if (p.action === 'get') return out_(get_(p.id, p.rev));
    if (p.action === 'put') return out_(put_(p));
    if (p.action === 'del') return out_(del_(p.id));
    if (p.action === 'begin') return out_(begin_(p));
    if (p.action === 'file') return out_(file_(p));
    if (p.action === 'archive') return out_(archive_(p));
    return out_({ ok: false, err: 'action' });
  } catch (err) {
    return out_({ ok: false, err: String(err && err.message || err) });
  }
}

/* ===== 一時保管（5日で削除） ===== */
function sheet_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('SHEET_ID'), ss;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create('ポックル 歯科記録（5日で自動削除）'); props.setProperty('SHEET_ID', ss.getId()); }
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
  var v = sh.getRange(2, 1, n, HEAD.length - 1).getValues();
  return v.filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]), created: Number(r[1]), updated: Number(r[2]), rev: Number(r[3]), status: String(r[4]), date: String(r[5]), no: String(r[6]), name: String(r[7]), sp: String(r[8]), vet: String(r[9]) };
  }).sort(function (a, b) { return b.updated - a.updated; });
}
function get_(id, rev) {
  var sh = sheet_(), row = findRow_(sh, id); if (!row) return { ok: false, err: 'notfound' };
  var meta = sh.getRange(row, 1, 1, HEAD.length).getValues()[0], k = Number(meta[10]) || 1;
  if (rev != null && rev !== '' && String(rev) === String(meta[3])) return { ok: true, same: true };
  var data = sh.getRange(row, HEAD.length + 1, 1, k).getValues()[0].join('');
  return { ok: true, rev: Number(meta[3]), data: data };
}
function put_(p) {
  if (!p.id || !p.data) return { ok: false, err: 'data' };
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = sheet_(), row = findRow_(sh, p.id), now = Date.now(), created = now;
    if (row) {
      var cur = sh.getRange(row, 2, 1, 3).getValues()[0];
      if (Number(p.rev) < Number(cur[2])) return { ok: true, stale: true, rev: Number(cur[2]) };   /* 古い送信は無視 */
      created = cur[0] || now;
    } else { row = sh.getLastRow() + 1; }
    var chunks = []; for (var i = 0; i < p.data.length; i += CHUNK) chunks.push(p.data.slice(i, i + CHUNK));
    var meta = [String(p.id), created, now, Number(p.rev) || 0, p.status || '', "'" + (p.date || ''), "'" + (p.no || ''), p.name || '', p.sp || '', p.vet || '', chunks.length];
    var oldW = sh.getLastColumn();
    sh.getRange(row, 1, 1, meta.length).setValues([meta]);
    if (oldW > HEAD.length) sh.getRange(row, HEAD.length + 1, 1, oldW - HEAD.length).clearContent();
    sh.getRange(row, HEAD.length + 1, 1, chunks.length).setValues([chunks]);
    if (Math.random() < 0.05) cleanup();
    return { ok: true, rev: Number(p.rev) || 0 };
  } finally { lock.releaseLock(); }
}
function del_(id) {
  var sh = sheet_(), row = findRow_(sh, id);
  if (row) sh.deleteRow(row);
  return { ok: true };
}
/* KEEP_DAYS を過ぎた一時記録を削除（毎日のトリガー＋書き込み時にときどき）。永久保存分には触らない */
function cleanup() {
  var sh = sheet_(), n = sh.getLastRow() - 1; if (n < 1) return;
  var v = sh.getRange(2, 3, n, 1).getValues(), lim = Date.now() - KEEP_DAYS * 864e5;
  for (var i = v.length - 1; i >= 0; i--) if (Number(v[i][0]) < lim) sh.deleteRow(i + 2);
}

/* ===== 永久保存（PDF・写真＋歯科記録DB） ===== */
function folder_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('FOLDER_ID'), f = null;
  if (id) { try { f = DriveApp.getFolderById(id); if (f.isTrashed()) f = null; } catch (e) { f = null; } }
  if (!f) { f = DriveApp.createFolder('ポックル 歯科記録'); props.setProperty('FOLDER_ID', f.getId()); }
  return f;
}
function sub_(parent, name) { var it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function clean_(s) { return String(s || '').replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80); }
/* 症例ごとのフォルダ。記録IDで覚えておき、名前が変わっても同じフォルダを使う */
function caseDir_(p) {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('DIR_' + p.id), f = null;
  if (id) { try { f = DriveApp.getFolderById(id); if (f.isTrashed()) f = null; } catch (e) { f = null; } }
  var name = clean_(p.dir) || String(p.id);
  if (!f) { f = sub_(folder_(), String(p.date || '').slice(0, 7) || '日付なし').createFolder(name); props.setProperty('DIR_' + p.id, f.getId()); }
  else if (f.getName() !== name) f.setName(name);
  return f;
}
/* 保存のはじめに呼ぶ：症例フォルダを用意し、前回保存したファイルをゴミ箱へ（保存し直しは上書き） */
function begin_(p) {
  if (!p.id || !/^[A-Za-z0-9_-]+$/.test(p.id)) return { ok: false, err: 'data' };
  var f = caseDir_(p), it = f.getFiles();
  while (it.hasNext()) it.next().setTrashed(true);
  return { ok: true, folderUrl: f.getUrl() };
}
/* PDF・写真を1つ保存 */
function file_(p) {
  if (!p.id || !/^[A-Za-z0-9_-]+$/.test(p.id) || !p.b64 || !p.name) return { ok: false, err: 'data' };
  var mime = p.mime === 'application/pdf' ? 'application/pdf' : 'image/jpeg';
  var f = caseDir_(p), name = clean_(p.name), it = f.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
  var file = f.createFile(Utilities.newBlob(Utilities.base64Decode(p.b64), mime, name));
  return { ok: true, url: file.getUrl() };
}
function db_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('DB_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); if (DriveApp.getFileById(id).isTrashed()) ss = null; } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('歯科記録DB');
    DriveApp.getFileById(ss.getId()).moveTo(folder_());
    props.setProperty('DB_ID', ss.getId());
  }
  return ss;
}
/* DBに保存（症例＝1行、歯＝異常・処置のある歯ごとに1行）。同じ記録IDは上書き */
function archive_(p) {
  if (!p.id || !p.sheets) return { ok: false, err: 'data' };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var data = JSON.parse(p.sheets), ss = db_();
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
    ['症例', '歯'].forEach(function (name, si) {
      var t = data[name]; if (!t) return;
      var sh = ss.getSheetByName(name);
      if (!sh) { sh = si === 0 && ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0 ? ss.getSheets()[0].setName(name) : ss.insertSheet(name); }
      migrate_(sh, t.head);
      sh.getRange(1, 1, 1, t.head.length).setValues([t.head]).setFontWeight('bold');
      sh.setFrozenRows(1);
      var n = sh.getLastRow() - 1;
      if (n > 0) { var ids = sh.getRange(2, 1, n, 1).getValues(); for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(p.id)) sh.deleteRow(i + 2); }
      var rows = t.rows.map(function (r) {
        r = r.map(function (v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; });
        if (name === '症例') r[r.length - 1] = now;
        return r;
      });
      if (rows.length) {
        var start = sh.getLastRow() + 1;
        sh.getRange(start, 2, rows.length, 2).setNumberFormat('@');   /* 日付・カルテNoは文字のまま */
        sh.getRange(start, 1, rows.length, t.head.length).setValues(rows);
      }
    });
    return { ok: true, dbUrl: ss.getUrl() };
  } finally { lock.releaseLock(); }
}
/* 列が増えたとき、既存の行がずれないよう同じ位置に空の列を差し込む */
function migrate_(sh, head) {
  if (sh.getLastRow() < 2) return;
  var old = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  if (!old[0]) return;
  for (var i = 0; i < head.length; i++) {
    if (old[i] === head[i]) continue;
    if (i >= old.length || !old[i]) break;
    if (old.indexOf(head[i]) < 0) { sh.insertColumnBefore(i + 1); old.splice(i, 0, head[i]); }
  }
}

/* 初回に1回だけ実行：保存先フォルダ・DB・一時シートの作成と、毎日の掃除トリガー（権限の承認もここで行う） */
function setup() {
  sheet_(); db_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'cleanup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cleanup').timeBased().everyDays(1).atHour(3).create();
  Logger.log('フォルダ：' + folder_().getUrl());
  Logger.log('歯科記録DB：' + db_().getUrl());
  Logger.log('STAFF_KEY：' + (PropertiesService.getScriptProperties().getProperty('STAFF_KEY') ? '設定済み' : '未設定（プロジェクトの設定 → スクリプト プロパティで追加）'));
}
