/* ポックル院内ツール スタッフ確認
   各ページの <head> で読み込む。院内パスコードを1回入れた端末だけが開ける。
   パスコードを変えるときは HASH を差し替える（設置手順を参照）。 */
(function () {
  var HASH = '5bd03614976a1b2916e23c651a97e609d3faf264e93dbfc1f33614a0ddedf555';
  var KEY = 'pokkur_staff_pass';
  var de = document.documentElement;
  if (localStorage.getItem(KEY) === HASH) return;
  de.style.visibility = 'hidden';
  function sha(t) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode('pokkur:' + t)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function show() {
    var w = document.createElement('div');
    w.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#f5f7f8;display:flex;align-items:center;justify-content:center;visibility:visible;font-family:-apple-system,"Hiragino Sans","Meiryo UI","Noto Sans JP",sans-serif');
    w.innerHTML = '<form style="background:#fff;border:1px solid #e3e8ea;border-radius:14px;padding:24px;width:300px;text-align:center">' +
      '<div style="font-size:18px;font-weight:700;color:#1f8670;margin-bottom:4px">ポックル院内ツール</div>' +
      '<div style="font-size:13px;color:#6b7a80;margin-bottom:16px">スタッフ専用です。院内パスコードを入力してください。</div>' +
      '<input type="password" inputmode="numeric" autocomplete="off" style="width:100%;font-size:20px;padding:10px;border:1px solid #c9d2d6;border-radius:10px;text-align:center;letter-spacing:4px">' +
      '<div class="e" style="color:#c62828;font-size:13px;min-height:18px;margin-top:6px"></div>' +
      '<button style="width:100%;margin-top:6px;background:#1f8670;color:#fff;border:0;border-radius:10px;font-size:16px;padding:10px">開く</button></form>';
    document.body.appendChild(w);
    var f = w.querySelector('form'), i = w.querySelector('input'), e = w.querySelector('.e');
    i.focus();
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      sha(i.value.trim()).then(function (h) {
        if (h === HASH) { localStorage.setItem(KEY, h); w.remove(); de.style.visibility = ''; }
        else { e.textContent = 'パスコードが違います'; i.value = ''; i.focus(); }
      });
    });
  }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
