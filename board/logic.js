/* ポックル 院内ボード 共通ルール
 * このファイルはブラウザ（試験モード）と Apps Script（本番）の両方で同じものを使う。
 * 直したら Apps Script 側の「logic.gs」にも同じ内容を貼り直すこと。 */
var BoardLogic = (function () {
  var AREAS = ['診察室1', '診察室2', '診察室3', '診察室4', '診察室5', '検査台', '処置室', '受付主', '受付副'];
  var STEPS = [
    { id: 'gairai', label: '外来継続中', doneLabel: '外来終了' },
    { id: 'nyuin', label: '入院処置' },
    { id: 'hotel', label: 'ホテル処置' },
    { id: 'check', label: 'チェックリスト' },
    { id: 'meet', label: 'ミーティング' }
  ];
  var TYPES = {
    emer: 'エマージェンシー対応中',
    delay: '枠押し',
    claim: 'クレーム発生',
    quiet: 'お看取りの飼い主様在院・お静かに',
    note: '申し送り'
  };
  /* 仮の項目（紙のチェックリストに合わせて画面の「項目を編集」で直す） */
  var ROOM = ['診察台を清拭・消毒', '針・ゴミを捨てる', '使った器具を処置室へ', '綿花・アルコール・手袋を補充', 'PC・照明を消す'];
  var DEFAULT_TPL = {
    '診察室1': ROOM, '診察室2': ROOM, '診察室3': ROOM, '診察室4': ROOM, '診察室5': ROOM,
    '検査台': ['検査機器の片付け・電源', '外注検体の出し忘れ確認', '検査台を清拭・消毒', '消耗品を補充'],
    '処置室': ['器具を洗浄・滅菌に回す', '処置台を清拭・消毒', '針・シリンジを廃棄', '酸素ボンベ残量を確認', '使った薬を片付け・冷蔵庫を閉める', '床を掃除'],
    '受付主': ['レジ締め', '会計漏れの確認', '翌日の予約を確認'],
    '受付副': ['待合を掃除', '物販棚を整える', '入口の消灯・施錠']
  };
  var MAX_ALERTS = 20, MAX_TEXT = 120;

  /* 日付は朝4時で切り替わる（日本時間） */
  function today(now) { return new Date(now + 9 * 3600e3 - 4 * 3600e3).toISOString().slice(0, 10); }
  function newDay(now) { return { date: today(now), steps: {}, exam: null, ff: null, checks: {} }; }
  function blank(now) {
    var tpl = {}; AREAS.forEach(function (a) { tpl[a] = DEFAULT_TPL[a].slice(); });
    return { v: 1, alerts: [], red: 0, yellow: 0, tpl: tpl, tplEdited: {}, day: newDay(now) };
  }
  function normalize(s, now) {
    if (!s || typeof s !== 'object') s = blank(now);
    if (!s.tpl) s.tpl = {};
    if (!s.tplEdited) s.tplEdited = {};
    AREAS.forEach(function (a) { if (!s.tpl[a]) s.tpl[a] = DEFAULT_TPL[a].slice(); });
    if (!s.day || s.day.date !== today(now)) s.day = newDay(now);
    return s;
  }
  function str(x, n) { return String(x == null ? '' : x).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n); }
  function rid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5); }
  function ckey(area, text) { return area + '|' + text; }

  /* 進み具合 */
  function progress(s) {
    var per = {}, done = 0, all = 0;
    AREAS.forEach(function (a) {
      var items = s.tpl[a] || [], d = 0;
      items.forEach(function (t) { if (s.day.checks[ckey(a, t)]) d++; });
      per[a] = { done: d, all: items.length };
      done += d; all += items.length;
    });
    return { per: per, done: done, all: all, pct: all ? Math.round(done * 100 / all) : 0 };
  }

  /* 操作。成功なら null、だめなら理由を返す */
  function apply(s, p, now) {
    var i, a;
    switch (p.action) {
      case 'addAlert':
        if (!TYPES[p.type]) return '種類が不明です';
        var text = str(p.text, MAX_TEXT), frame = str(p.frame, 20), min = Math.max(0, Math.min(180, Math.round(Number(p.min) || 0)));
        if (p.type === 'note' && !text) return '申し送りの内容を入れてください';
        if (p.type === 'delay') {
          if (!frame) return '何の枠か入れてください';
          if (!min) return '何分押しか選んでください';
          for (i = 0; i < s.alerts.length; i++) {
            a = s.alerts[i];
            if (a.type === 'delay' && a.frame === frame) { a.min = min; a.text = text || a.text; a.at = now; return null; }
          }
        }
        if (s.alerts.length >= MAX_ALERTS) return '表示が多すぎます。済んだものを消してください';
        s.alerts.push({ id: rid(), type: p.type, text: text, frame: frame, min: min, at: now });
        return null;
      case 'resolve':
        s.alerts = s.alerts.filter(function (x) { return x.id !== p.id; });
        return null;
      case 'tag':
        if (p.color !== 'red' && p.color !== 'yellow') return '札の色が不明です';
        s[p.color] = Math.max(0, Math.min(20, (s[p.color] || 0) + (Number(p.delta) > 0 ? 1 : -1)));
        return null;
      case 'step':
        if (!STEPS.some(function (x) { return x.id === p.id; })) return '項目が不明です';
        if (p.state === 'done' || p.state === 'skip') s.day.steps[p.id] = p.state; else delete s.day.steps[p.id];
        return null;
      case 'flag':
        if (p.name !== 'exam' && p.name !== 'ff') return '項目が不明です';
        s.day[p.name] = p.val === true || p.val === 'true' ? true : p.val === false || p.val === 'false' ? false : null;
        return null;
      case 'check':
        if (AREAS.indexOf(p.area) < 0) return '場所が不明です';
        if ((s.tpl[p.area] || []).indexOf(p.text) < 0) return 'チェック項目が見つかりません（項目が編集された可能性）';
        if (p.on === true || p.on === 'true') s.day.checks[ckey(p.area, p.text)] = 1; else delete s.day.checks[ckey(p.area, p.text)];
        return null;
      case 'setTpl':
        if (AREAS.indexOf(p.area) < 0) return '場所が不明です';
        var items = String(p.items || '').split(/\n/).map(function (x) { return str(x, 40); }).filter(Boolean);
        var seen = {}; items = items.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }).slice(0, 40);
        s.tpl[p.area] = items;
        s.tplEdited = s.tplEdited || {}; s.tplEdited[p.area] = 1;
        return null;
    }
    return '操作が不明です';
  }

  return { AREAS: AREAS, STEPS: STEPS, TYPES: TYPES, today: today, blank: blank, normalize: normalize,
    apply: apply, progress: progress, ckey: ckey };
})();
