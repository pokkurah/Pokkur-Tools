/* ポックル 余裕チェック 共通ルール
 * ブラウザ（試験モード）と Apps Script（本番）の両方で同じものを使う。
 * 直したら Apps Script 側の「logic.gs」にも同じ内容を貼り直して、新バージョンでデプロイすること。 */
var YoyuLogic = (function () {
  var PEOPLE = ['伊村（院長）', '伊村晶子', '蒲原', '榮藤', '柿本', '看護', '受付'];
  var BLOCKS = [{ id: 'am', label: '午前' }, { id: 'noon', label: '昼' }, { id: 'pm', label: '午後' }];
  var COLORS = { g: '緑', y: '黄', r: '赤' };
  var CAUSES = ['緊急枠', 'エマージェンシー', 'トラブル', '押し', '人手不足', '電話', '他'];
  var NOTE_CAUSES = ['トラブル', '他'];   /* 中身を一言そえる原因 */
  var TEIJI = 19 * 60;                    /* 定時 19:00（院長決定） */
  var DONE = { yes: 'した', part: '途中', no: 'まだ' }, EFF = { o: '○ 効いた', d: '△ 少し', x: '× 効かず' };
  var META = [
    { k: 'amEnd', label: '午前の終了時刻', type: 'time' }, { k: 'pmEnd', label: '午後の終了時刻', type: 'time' },
    { k: 'mtStart', label: 'MT開始時刻', type: 'time' }, { k: 'urgent', label: '緊急枠の数', type: 'num' },
    { k: 'ope', label: 'オペ数', type: 'num' },
    /* その日の忙しさの量（赤が「多かったから」か「段取り」かを切り分ける） */
    { k: 'visits', label: '診察件数', type: 'cnt' }, { k: 'walkin', label: '予約外（飛び込み）の件数', type: 'cnt' }, { k: 'calls', label: '電話件数', type: 'cnt' },
    { k: 'nurseN', label: '看護の出勤人数', type: 'num' }, { k: 'recN', label: '受付の出勤人数', type: 'num' },
    { k: 'lastOut', label: '最後の人が出た時刻', type: 'time' },
    { k: 'writer', label: '記入者', type: 'text' },
    { k: 'checker', label: '確認した人', type: 'text' }, { k: 'causeMemo', label: '赤の原因メモ', type: 'memo' },
    { k: 'planMemo', label: '対策メモ', type: 'memo' },
    /* 週の振り返り（土曜の朝に記入）。その週の最初の日（土曜）の行に保存する。毎日の入力画面には出さない */
    { k: 'weekMemo', label: '週の振り返り', type: 'memo', week: true }
  ];
  /* 1週間＝土曜〜金曜。その日を含む週の土曜を返す */
  function weekStart(date) { var t = Date.parse(date + 'T00:00:00Z'), w = new Date(t).getUTCDay(); return new Date(t - ((w + 1) % 7) * 864e5).toISOString().slice(0, 10); }
  function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d)) && !isNaN(Date.parse(d + 'T00:00:00Z')); }
  function blank(date) { return { date: date, cells: {}, meta: {}, at: 0 }; }
  function str(x, n) { return String(x == null ? '' : x).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n); }
  function ckey(b, p) { return b + '|' + p; }
  function dow(date) { return '日月火水木金土'.charAt(new Date(date + 'T00:00:00Z').getUTCDay()); }
  /* 色を1つでも入れた人＝その日の出勤者 */
  function attend(rec, person) { return BLOCKS.some(function (b) { return !!rec.cells[ckey(b.id, person)]; }); }

  /* 操作。成功なら null、だめなら理由を返す。1マス・1項目ずつ足すので、複数のPCから同時に入れても消し合わない */
  function apply(rec, p, now) {
    if (p.action === 'set') {
      if (!BLOCKS.some(function (b) { return b.id === p.block; })) return '時間帯が不明です';
      if (PEOPLE.indexOf(p.person) < 0) return '名前が不明です';
      var c = p.color || '';
      if (c && !COLORS[c]) return '色が不明です';
      if (!c) delete rec.cells[ckey(p.block, p.person)];
      else {
        /* 原因は赤（必ず）と黄（できれば）に付けられる。トラブル・他は一言そえる */
        var k = c !== 'g' && CAUSES.indexOf(p.cause) >= 0 ? p.cause : '', cell = { c: c, k: k };
        if (NOTE_CAUSES.indexOf(k) >= 0 && p.note) cell.n = str(p.note, 40);
        rec.cells[ckey(p.block, p.person)] = cell;
      }
    } else if (p.action === 'meta') {
      var m = META.filter(function (x) { return x.k === p.m; })[0];   /* p.k は院内キーなので項目名は p.m */
      if (!m) return '項目が不明です';
      var v = m.week ? String(p.v == null ? '' : p.v).replace(/\r/g, '').trim().slice(0, 1000) : str(p.v, m.type === 'memo' ? 400 : 40);   /* 週の振り返りは改行を残す */
      if (m.type === 'time' && v && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) return '時刻の形が違います';
      if (m.type === 'num' && v && !/^\d{1,2}$/.test(v)) return '数の形が違います';
      if (m.type === 'cnt' && v && !/^\d{1,3}$/.test(v)) return '数の形が違います';
      if (v) rec.meta[p.m] = v; else delete rec.meta[p.m];
    } else if (p.action === 'acts') {
      /* 週の対策（担当・期限・実施・効果）。その週の土曜の行に、一覧ごと保存する */
      if (rec.date !== weekStart(rec.date)) return '週の最初の日（土曜）ではありません';
      var list = [];
      (Array.isArray(p.list) ? p.list : []).slice(0, 12).forEach(function (a) {
        var t = str(a && a.t, 120); if (!t) return;
        list.push({ t: t, who: str(a.who, 20), due: str(a.due, 20), done: DONE[a.done] ? a.done : '', eff: EFF[a.eff] ? a.eff : '' });
      });
      if (list.length) rec.acts = list; else delete rec.acts;
    } else return '操作が不明です';
    rec.at = now;
    return null;
  }

  /* スプレッドシートの1行（人が読める列＋最後に元データ） */
  function header() {
    var h = ['日付', '曜日', '更新'];
    BLOCKS.forEach(function (b) { PEOPLE.forEach(function (p) { h.push(b.label + ' ' + p); h.push(b.label + ' ' + p + ' 原因'); }); });
    META.forEach(function (m) { h.push(m.label); });
    h.push('週の対策'); h.push('データ');
    return h;
  }
  function flatten(rec, stamp) {
    var r = [rec.date, dow(rec.date), stamp];
    BLOCKS.forEach(function (b) { PEOPLE.forEach(function (p) { var c = rec.cells[ckey(b.id, p)]; r.push(c ? COLORS[c.c] : ''); r.push(c ? (c.k || '') + (c.n ? '：' + c.n : '') : ''); }); });
    META.forEach(function (m) { r.push(rec.meta[m.k] || ''); });
    r.push((rec.acts || []).map(function (a) { return a.t + (a.who ? '（' + a.who + (a.due ? '・' + a.due : '') + '）' : '') + (a.done ? ' 実施:' + DONE[a.done] : '') + (a.eff ? ' 効果:' + EFF[a.eff] : ''); }).join('\n'));
    r.push(JSON.stringify(rec));
    return r;
  }
  return { PEOPLE: PEOPLE, BLOCKS: BLOCKS, COLORS: COLORS, CAUSES: CAUSES, NOTE_CAUSES: NOTE_CAUSES, TEIJI: TEIJI, DONE: DONE, EFF: EFF, META: META, validDate: validDate, blank: blank,
    ckey: ckey, dow: dow, weekStart: weekStart, attend: attend, apply: apply, header: header, flatten: flatten };
})();
