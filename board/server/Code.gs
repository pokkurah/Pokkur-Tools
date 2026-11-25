/* ポックル 院内ボードサーバー（Apps Script・pokkur.ah で設置）
 *
 * 役割：院内ボード（緊急表示・申し送り・赤札/黄札の数・17時以降の進み具合・チェックリスト）を全PCで共有する。
 *       患者データは持たない（札は数だけ、申し送りに飼い主名は書かない運用）。
 *       朝4時に、17時以降の進み具合・チェック・すべての表示を自動で消す（札の数は残す）。17時に「留守電設定中」を自動で点ける。
 *       保存先はスクリプト プロパティ（シート・トリガー不要）。
 *
 * 設置手順：
 *   1. script.google.com で新しいプロジェクト「ポックル院内ボード」を作る
 *   2. このファイルを「Code.gs」に貼る。ファイルを追加 →「logic.gs」に Pokkur-Tools の board/logic.js を丸ごと貼る
 *   3. プロジェクトの設定 → スクリプト プロパティに STAFF_KEY（受付ボードと同じ院内キー）を追加
 *   4. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」、実行＝自分、アクセス＝全員 → URL をコピー
 *   5. Pokkur-Tools の board/config.js の API_URL にその URL を入れる
 *   コードを直したら「デプロイを管理」→ 編集 → 新バージョン（URLは変わらない）
 *   logic.js を直したときは logic.gs にも貼り直すこと（Code.gs と logic.gs は必ず同じ版にそろえる）
 */
var CHUNK = 2500;   /* プロパティ1つの上限（9KB）を超えないよう分割して保存 */

function doGet(e) { return handle_(e && e.parameter || {}); }
function doPost(e) { var p = {}; try { p = JSON.parse(e.postData.contents); } catch (x) {} return handle_(p); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function handle_(p) {
  var props = PropertiesService.getScriptProperties(), key = props.getProperty('STAFF_KEY');
  if (!key) return out_({ ok: false, err: 'nokey' });
  if (p.k !== key) return out_({ ok: false, err: 'auth' });
  var now = Date.now();
  try {
    if (p.action === 'state') {
      var s = load_(props, now);
      if (p.v && String(p.v) === s.sig) return out_({ ok: true, same: true, now: now });
      return out_({ ok: true, s: s, now: now });
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var st = load_(props, now), err = BoardLogic.apply(st, p, now);
      if (err) return out_({ ok: false, err: err });
      BoardLogic.commit(st);
      save_(props, st);
      return out_({ ok: true, s: st, now: now });
    } finally { lock.releaseLock(); }
  } catch (e) {
    return out_({ ok: false, err: String(e && e.message || e) });
  }
}

function load_(props, now) {
  var n = Number(props.getProperty('ST_N') || 0), txt = '';
  for (var i = 0; i < n; i++) txt += props.getProperty('ST_' + i) || '';
  var s = null;
  try { s = txt ? JSON.parse(txt) : null; } catch (e) { s = null; }
  return BoardLogic.normalize(s, now);
}

function save_(props, s) {
  var txt = JSON.stringify(s), parts = {}, n = Math.ceil(txt.length / CHUNK), old = Number(props.getProperty('ST_N') || 0);
  for (var i = 0; i < n; i++) parts['ST_' + i] = txt.slice(i * CHUNK, (i + 1) * CHUNK);
  parts.ST_N = String(n);
  props.setProperties(parts);
  for (var j = n; j < old; j++) props.deleteProperty('ST_' + j);
}

/* 動作確認用（エディタから実行）：今の中身をログに出す */
function showState() { Logger.log(JSON.stringify(load_(PropertiesService.getScriptProperties(), Date.now()), null, 1)); }
