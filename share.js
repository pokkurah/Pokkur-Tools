/* ポックル院内ツール 登録QR（院内ツール共用）
   この端末に保存済みの院内パスコード・院内キーから、他の端末の登録用QRと壁に貼る用紙（A5縦）を作る。
   キーの値はこの端末の中だけで扱い、どこにも送らない。読み取り側の処理は gate.js（#g=…&k=…）。 */
(function () {
  var ROOT = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/share\.js.*$/, '') : location.origin + '/Pokkur-Tools/'; })();
  function key() { try { return (localStorage.getItem('anes_key') || localStorage.getItem('rcb_key') || '').trim(); } catch (e) { return ''; } }
  function pass() { try { return localStorage.getItem('pokkur_staff_pass') || ''; } catch (e) { return ''; } }
  function link(path, extra) { return ROOT + (path || '') + '#' + (extra ? extra + '&' : '') + 'g=' + pass() + '&k=' + encodeURIComponent(key()); }
  function qrSvg(text, cb) {
    function draw() { try { var q = qrcode(0, 'M'); q.addData(text); q.make(); cb(q.createSvgTag({ cellSize: 4, margin: 4, scalable: true })); } catch (e) { cb(''); } }
    if (window.qrcode) draw(); else { var sc = document.createElement('script'); sc.src = ROOT + 'qrcode.js'; sc.onload = draw; sc.onerror = function () { cb(''); }; document.head.appendChild(sc); }
  }
  function el(tag, st, html) { var e = document.createElement(tag); if (st) e.setAttribute('style', st); if (html != null) e.innerHTML = html; return e; }
  function btn(label, primary, fn) {
    var b = el('button', 'font-size:14px;padding:8px 12px;border-radius:10px;cursor:pointer;' + (primary ? 'background:#1f8670;color:#fff;border:0' : 'background:#fff;color:#1f8670;border:1px solid #1f8670'), null);
    b.textContent = label; b.addEventListener('click', fn); return b;
  }
  function copy(t) {
    function ok() { alert('コピーしました'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fb); else fb();
    function fb() { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) {} ta.remove(); }
  }
  function printSheet() {
    qrSvg(link(''), function (svg) {
      if (!svg) { alert('QRを作れませんでした（通信を確認）'); return; }
      var old = document.getElementById('pokkur-pf'); if (old) old.remove();
      var f = el('iframe', 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'); f.id = 'pokkur-pf'; document.body.appendChild(f);
      var d = f.contentWindow.document, t = new Date(), ds = t.getFullYear() + '/' + (t.getMonth() + 1) + '/' + t.getDate();
      d.open(); d.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>ポックル院内ツール 登録QR</title><style>' +
        '@page{size:A5 portrait;margin:8mm}html,body{margin:0;font-family:-apple-system,"Hiragino Sans","Meiryo UI","Noto Sans JP",sans-serif;color:#1d2a2e}' +
        '.w{height:190mm;display:flex;flex-direction:column;align-items:center;text-align:center}' +
        '.hd{width:100%;background:#1f8670;color:#fff;border-radius:3mm;padding:3mm 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
        '.hd b{display:block;font-size:20pt}.hd span{font-size:11pt}' +
        '.qr{width:88mm;height:88mm;margin:5mm 0 3mm}.qr svg{width:100%;height:100%}' +
        'ol{text-align:left;font-size:13pt;line-height:1.55;margin:0 0 3mm;padding-left:8mm}ol b{color:#1f8670}' +
        '.n{font-size:9.5pt;color:#55666b;text-align:left;width:100%;border-top:1px solid #c9d2d6;padding-top:2mm;margin-top:auto}' +
        '</style></head><body><div class="w">' +
        '<div class="hd"><b>📷 ポックル院内ツール 登録QR</b><span>写すだけで、この端末で院内ツールがすぐ使えます</span></div>' +
        '<div class="qr">' + svg + '</div>' +
        '<ol><li>iPhoneの<b>カメラ</b>でQRを写す</li><li>出てきた<b>リンクをタップ</b>（Safariで開く）</li><li>院内ツール一覧が開けば完了。<b>パスコード・院内キーの入力は不要</b></li><li>麻酔記録・麻酔薬計算・眼科・薬剤計算すべてで使えます</li></ol>' +
        '<div class="n">・パスコードやキーを聞かれたら、もう一度このQRを写してください（ブラウザが保存を消すことがあります）<br>・院外の人が見える場所・写真に写る場所には貼らないでください<br>・パスコードや院内キーを変えたら、この用紙を作り直して貼り替えてください（院内ツール一覧 →「他の端末を登録」）<br>作成 ' + ds + '</div>' +
        '</div></body></html>'); d.close();
      setTimeout(function () { f.contentWindow.focus(); f.contentWindow.print(); }, 300);
    });
  }
  window.pokkurShare = function () {
    var ov = el('div', 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,"Hiragino Sans","Meiryo UI","Noto Sans JP",sans-serif');
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var box = el('div', 'background:#fff;border-radius:14px;padding:18px;max-width:360px;width:100%;text-align:center;color:#1f2a2e');
    box.appendChild(el('div', 'font-size:18px;font-weight:700;margin-bottom:4px', '他の端末を登録'));
    if (!key()) {
      box.appendChild(el('div', 'font-size:13px;color:#c62828;margin:8px 0', 'この端末には院内キーが入っていません。キーが入っている端末で開いてください。'));
      box.appendChild(btn('閉じる', true, close)); ov.appendChild(box); document.body.appendChild(ov); return;
    }
    box.appendChild(el('div', 'font-size:13px;color:#6b7a80', '登録したいiPhoneのカメラで読み取り → 出てきたリンクを開く（Safari）'));
    var qr = el('div', 'width:240px;height:240px;margin:6px auto;font-size:13px;color:#6b7a80', 'QRを作成中…'); box.appendChild(qr);
    box.appendChild(el('div', 'font-size:12px;color:#6b7a80;text-align:left;margin:6px 0', '手術室PC：「大画面PC用リンクをコピー」でブックマークを作ると、開くたびに登録し直されます。'));
    var row = el('div', 'display:flex;gap:6px;justify-content:center;flex-wrap:wrap');
    row.appendChild(btn('🖨 壁に貼る用紙（A5）', false, printSheet));
    row.appendChild(btn('大画面PC用リンクをコピー', false, function () { copy(link('anes-record/', 'display')); }));
    row.appendChild(btn('閉じる', true, close));
    box.appendChild(row);
    box.appendChild(el('div', 'font-size:12px;color:#c62828;margin-top:8px', '院外の人に見せない・送らないでください'));
    ov.appendChild(box); document.body.appendChild(ov);
    qrSvg(link(''), function (svg) { if (!svg) { qr.textContent = 'QRを作れませんでした（通信を確認）'; return; } qr.innerHTML = svg; var sv = qr.querySelector('svg'); if (sv) { sv.style.width = '100%'; sv.style.height = '100%'; } });
  };
})();
