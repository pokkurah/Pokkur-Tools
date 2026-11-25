/* ポックル 院内ボード 通信部（本番：Apps Script／試験：このブラウザ内だけで動くモック） */
(function () {
  var CFG = window.BOARD_CONFIG || {};
  var MOCK = !CFG.API_URL || CFG.API_URL === 'mock';
  var MK = 'pbd_mock_db';

  function remote(method, params) {
    if (method === 'GET') {
      return fetch(CFG.API_URL + '?' + new URLSearchParams(params).toString(), { cache: 'no-store' })
        .then(function (r) { return r.json(); });
    }
    return fetch(CFG.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(params)
    }).then(function (r) { return r.json(); });
  }

  /* モック：サーバーと同じ logic.js を使う。同じPCの別タブ・別窓とは共有される */
  function mock(p) {
    var now = Date.now(), s;
    try { s = JSON.parse(localStorage.getItem(MK)); } catch (e) { s = null; }
    s = BoardLogic.normalize(s, now);
    if (p.action === 'state') {
      if (p.v && Number(p.v) === s.v) return { ok: true, same: true, v: s.v, now: now };
      return { ok: true, s: s, now: now };
    }
    var err = BoardLogic.apply(s, p, now);
    if (err) return { ok: false, err: err };
    s.v = (s.v || 0) + 1;
    localStorage.setItem(MK, JSON.stringify(s));
    return { ok: true, s: s, now: now };
  }

  window.BOARD = {
    isMock: MOCK,
    key: function () {
      var h = new URLSearchParams(location.hash.slice(1));
      if (h.get('k')) { localStorage.setItem('pbd_key', h.get('k')); history.replaceState(null, '', location.pathname + location.search); }
      /* 到着ボードで登録済みのPCはそのキーを使う（同じ院内キー） */
      return localStorage.getItem('pbd_key') || localStorage.getItem('rcb_key') || (MOCK ? 'test' : '');
    },
    /* 一度認証できたキーはこのPCに保存（院内ツール共通の保存場所にも入れる）。ブラウザに消されにくくする */
    saveKey: function (k) {
      localStorage.setItem('pbd_key', k); localStorage.setItem('rcb_key', k); localStorage.setItem('anes_key', k);
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    },
    state: function (k, v) { return MOCK ? Promise.resolve(mock({ action: 'state', v: v })) : remote('GET', { action: 'state', k: k, v: v || '' }); },
    act: function (k, p) { p.k = k; return MOCK ? Promise.resolve(mock(p)) : remote('POST', p); }
  };
})();
