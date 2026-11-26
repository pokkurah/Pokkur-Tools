/* ポックル 余裕チェック 通信部（本番：Apps Script／試験：このブラウザ内だけで動くモック） */
(function () {
  var CFG = window.YOYU_CONFIG || {};
  var MOCK = !CFG.API_URL;
  var MK = 'yoyu_mock_db';
  function db() { try { return JSON.parse(localStorage.getItem(MK)) || {}; } catch (e) { return {}; } }
  function mock(p) {
    var d = db(), L = YoyuLogic;
    if (p.action === 'get') return { ok: true, rec: d[p.date] || L.blank(p.date) };
    if (p.action === 'range') return { ok: true, recs: Object.keys(d).filter(function (k) { return k >= p.from && k <= p.to; }).sort().map(function (k) { return d[k]; }) };
    if (!L.validDate(p.date)) return { ok: false, err: '日付が違います' };
    var rec = d[p.date] || L.blank(p.date), err = L.apply(rec, p, Date.now());
    if (err) return { ok: false, err: err };
    d[p.date] = rec; localStorage.setItem(MK, JSON.stringify(d));
    return { ok: true, rec: rec };
  }
  function get(params) { return fetch(CFG.API_URL + '?' + new URLSearchParams(params).toString(), { cache: 'no-store' }).then(function (r) { return r.json(); }); }
  function post(params) { return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(params) }).then(function (r) { return r.json(); }); }
  window.YOYU = {
    isMock: MOCK,
    /* 院内ツール共通の院内キー（登録QR・院内ボード・到着ボードで入れたもの）を使う */
    key: function () { return localStorage.getItem('pbd_key') || localStorage.getItem('rcb_key') || localStorage.getItem('anes_key') || (MOCK ? 'test' : ''); },
    saveKey: function (k) { localStorage.setItem('pbd_key', k); localStorage.setItem('rcb_key', k); localStorage.setItem('anes_key', k); try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {} },
    get: function (k, date) { var p = { action: 'get', date: date, k: k }; return MOCK ? Promise.resolve(mock(p)) : get(p); },
    range: function (k, from, to) { var p = { action: 'range', from: from, to: to, k: k }; return MOCK ? Promise.resolve(mock(p)) : get(p); },
    act: function (k, p) { p.k = k; return MOCK ? Promise.resolve(mock(p)) : post(p); }
  };
})();
