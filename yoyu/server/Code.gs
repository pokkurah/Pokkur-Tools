/* ポックル 余裕チェック サーバー（Apps Script・pokkur.ah で設置）
 *
 * 役割：毎日の「余裕チェック表」（午前・昼・午後 × 獣医師/看護/受付 の 緑・黄・赤、終了時刻、メモ）を
 *       ドライブのスプレッドシート「ポックル 余裕チェック（記録）」に1日1行で保存し、集計ページに渡す。
 *       患者データは持たない。スタッフ名は入る（院長決定）。
 *
 * 設置手順：
 *   1. script.google.com で新しいプロジェクト「ポックル余裕チェック」を作る
 *   2. このファイルを「Code.gs」に貼る。ファイルを追加 →「logic.gs」に Pokkur-Tools の yoyu/logic.js を丸ごと貼る
 *   3. プロジェクトの設定 → スクリプト プロパティに STAFF_KEY（受付ボードと同じ院内キー）を追加
 *   4. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」、実行＝自分、アクセス＝全員 →（初回は Google の許可）→ URL をコピー
 *   5. Pokkur-Tools の yoyu/config.js の API_URL にその URL を入れる
 *   スプレッドシートは最初の保存のときに自動で作られる（ID はスクリプト プロパティ SHEET_ID）
 *   コードを直したら「デプロイを管理」→ 編集 → 新バージョン（URLは変わらない）。Code.gs と logic.gs は同じ版にそろえる
 */
function doGet(e) { return handle_(e && e.parameter || {}); }
function doPost(e) { var p = {}; try { p = JSON.parse(e.postData.contents); } catch (x) {} return handle_(p); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function handle_(p) {
  var props = PropertiesService.getScriptProperties(), key = props.getProperty('STAFF_KEY'), L = YoyuLogic;
  if (!key) return out_({ ok: false, err: 'nokey' });
  if (p.k !== key) return out_({ ok: false, err: 'auth' });
  try {
    if (p.action === 'get') {
      if (!L.validDate(p.date)) return out_({ ok: false, err: '日付が違います' });
      var f = find_(sheet_(props), p.date);
      return out_({ ok: true, rec: f.rec || L.blank(p.date) });
    }
    if (p.action === 'range') {
      if (!L.validDate(p.from) || !L.validDate(p.to)) return out_({ ok: false, err: '日付が違います' });
      return out_({ ok: true, recs: all_(sheet_(props)).filter(function (r) { return r.date >= p.from && r.date <= p.to; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }) });
    }
    if (!L.validDate(p.date)) return out_({ ok: false, err: '日付が違います' });
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var sh = sheet_(props), g = find_(sh, p.date), rec = g.rec || L.blank(p.date), now = Date.now();
      var err = L.apply(rec, p, now);
      if (err) return out_({ ok: false, err: err });
      var row = L.flatten(rec, Utilities.formatDate(new Date(now), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')), n = g.row || sh.getLastRow() + 1;
      if (n > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200);
      sh.getRange(n, 1, 1, row.length).setNumberFormat('@').setValues([row]);
      return out_({ ok: true, rec: rec });
    } finally { lock.releaseLock(); }
  } catch (e) {
    return out_({ ok: false, err: String(e && e.message || e) });
  }
}

/* 記録シート。なければ作る（すべて文字として保存し、日付や時刻が勝手に変換されないようにする） */
function sheet_(props) {
  var id = props.getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id).getSheets()[0]; } catch (e) {} }
  var ss = SpreadsheetApp.create('ポックル 余裕チェック（記録）'), sh = ss.getSheets()[0], h = YoyuLogic.header();
  sh.setName('記録');
  if (sh.getMaxColumns() < h.length) sh.insertColumnsAfter(sh.getMaxColumns(), h.length - sh.getMaxColumns());
  sh.getRange(1, 1, sh.getMaxRows(), h.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
  sh.setFrozenRows(1); sh.setFrozenColumns(2);
  props.setProperty('SHEET_ID', ss.getId());
  return sh;
}
function all_(sh) {
  var last = sh.getLastRow(), w = YoyuLogic.header().length, out = [];
  if (last < 2) return out;
  sh.getRange(2, w, last - 1, 1).getDisplayValues().forEach(function (r, i) {
    try { var rec = JSON.parse(r[0]); if (rec && rec.date) { rec._row = i + 2; out.push(rec); } } catch (e) {}
  });
  return out;
}
function find_(sh, date) {
  var hit = all_(sh).filter(function (r) { return r.date === date; })[0];
  if (!hit) return { rec: null, row: 0 };
  var row = hit._row; delete hit._row;
  return { rec: hit, row: row };
}
/* 動作確認用（エディタから実行）：シートの場所をログに出す */
function showSheet() { var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID'); Logger.log(id ? 'https://docs.google.com/spreadsheets/d/' + id : 'まだ作られていません'); }
