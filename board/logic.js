/* ポックル 院内ボード 共通ルール
 * このファイルはブラウザ（試験モード）と Apps Script（本番）の両方で同じものを使う。
 * 直したら Apps Script 側の「logic.gs」にも同じ内容を貼り直すこと。 */
var BoardLogic = (function () {
  var AREAS = ['看護師', '助手', '受付', '検査台・入院舎', 'オペ室', '診察室1', '診察室2', '診察室3', '診察室4', '診察室5'];
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
    phone: '留守電設定中',
    note: '申し送り'
  };
  /* 夕方（PM）の項目。紙のチェックリスト（2026-11-25時点）から。「■」で始まる行は見出し（チェックしない）
     画面の「項目を編集」で変えた内容はサーバーに保存され、こちらより優先される */
  function room(n, pc, extra) {
    return [n + '診察室の' + pc, n + '診察室の台拭き替え、ラックのクリアファイル回収', n + '診察室のゴミ捨て', n + '診察室の電気オフ'].concat(extra || []);
  }
  var DEFAULT_TPL = {
    '看護師': ['明日以降作る薬チェック', '本日・明日以降のタスクツリー確認', 'イラスト待ちツリーの確認（ココナラ）', 'ボトルの水捨てる',
      'モノリス集荷依頼', 'アイデックスの集荷依頼', '処置待ちツリー確認', 'スピッツ管立てのチェック', '顕微鏡電源オフ・画面オフ', 'LINEのチェック',
      '明日のオペ器具組と確認', '翌日のオペ 麻酔基本情報記載（獣医師に依頼）', '2週間後のオペ振り分け', 'ダーマキット確認',
      '薬用シリンジ廃棄（水曜）', 'アイデックスの札を冷蔵庫内に戻す', '分包器の清掃・電源オフ', '電子計りの電源オフ', '入院・ホテルの明細入力',
      '待合の座布団コロコロかけ、整頓（犬・猫）', '健診コメント待ちツリー 期限5日前の物を検査報告リストに記載'],
    '助手': ['■PMチェック', '消毒ゾンデの片付け（30分おいたら）', 'スペキュラーを乾かす', '翌日のゴミを玄関に用意（午後診察開始）',
      '手拭きタオルの交換（べちゃべちゃなら都度）（16時半〜）', '犬舎・猫舎・エキゾ室のタオル補充（犬舎はバスタオルも）（16時半〜）', 'ICUの水受けチェック（16時半〜）',
      '注射準備台備品補充（シリンジ・BTチューブ引き出し、輸液ライン等）（17時〜）', 'オペ室備品引き出し補充（17時〜）', '投薬用シリンジの補充（17時〜）',
      '注射準備台各ゴミ箱のゴミ捨て（17時〜）', '薬局各ゴミ箱のゴミ捨て（17時〜）', 'コンバート更新（最後の初診登録後）',
      'コロとつららの夜ご飯と水換え（木村さんがいる日は不要）（18時前後）', '郵送BOX確認',
      '■1日のチェック', '健診などの郵送準備', '健診LINE送信ツリー確認', 'プレミアムのLINE送信用データ取込', '入院同意書・ホテル同意書・麻酔同意書の取り込み',
      '麻酔指示用紙取り込み', '簡易染色液の交換（月1）',
      '■オペ室・滅菌', 'ホルマリン滅菌機の液交換（月1）', 'ホルマリン滅菌機 拭き掃除', 'オペ室の掃除機の中のごみ捨て', 'オペ室の医療ごみを捨てる',
      'ドレープ・ガウン、コロコロ＋畳み', '滅菌準備・シーリングパック（ガウン・4枚ドレープ・器具・ガーゼなど）', '器具の洗浄チェック',
      '常備SPAY器具、簡易器具（×2）無かったら作る'],
    '受付': ['音楽用アンプ 電源オフ', 'すぐデリメール確認', 'イプシロン オンライン決済状況確認', 'ネット予約確認（必要であれば電話）', 'カーテンを閉める',
      '同意書などのバインダーセット', '翌日の同意書準備', '呼び出し用ベル 電源オフ', '留守電1・2を確認・変更', 'クーラー 電源オフ', '空気清浄機のオフ',
      '玄関周り閉める（鍵・スリッパ）', 'ステラの控え 日計と照らし合わせ', '月末のステラ控え郵送準備（15日/月末）', '未収金・繰越チェック',
      'フード付箋置き場の確認', 'ディスプレイ電源オフ', '窓開閉確認', '電話件数・診察件数記録',
      '初診・問診票の取込が完了しているか確認', '初診・問診票のGoogleフォーム回答削除確認'],
    '検査台・入院舎': ['■検査台', '血液サンプル類の廃棄', 'CBC（ポチ）電源のオフ', 'ドライケム電源オフ、参照液・希釈液カップ廃棄', 'スポットケム電源オフ',
      'アイデックス画面オフ', 'ベトスキャンオフ', '血ガスと印刷機オフ', 'アントセンス電源オフ・カバー', 'エアコンオフ', 'AP水の洗浄・電源オフ', 'シンク内のチェック',
      '■ICU周り', '保育器・ICUの電源オフ', 'ICU 入院点滴残量チェック', '酸素発生器（大小）の電源オフ', 'ICU 入院ホテルの子 水確認',
      '■猫舎', '猫舎 エアコン不要時オフ', '猫舎 窓閉める', '猫舎 フェリウェイ抜く（不要時）', '猫舎 入院点滴残量チェック', '猫舎 入院ホテルの子 水確認',
      '■犬舎', '犬舎 エアコン不要時オフ', '犬舎 アダプティル不要時抜く', '犬舎 入院点滴残量チェック', '犬舎 入院ホテルの子 水確認', 'ドックラン施錠確認',
      '■エキゾ舎', 'エキゾ舎 エアコン不要時オフ', 'エキゾ舎 入院点滴残量チェック', 'エキゾ舎 入院ホテルの子 水確認', '温室の確認'],
    'オペ室': ['除細動チェック', 'サクション設置', 'エコー電源OFF', '酸素元栓', 'レーザー・ドリル・バキュームOFF', 'クーラーOFF（オペ室・オペ準備室）',
      'CT/PC電源オフ', 'レントゲン電源オフ', '台拭き替える', '照射器・カセッテ充電＆OFF'],
    '診察室1': room('1', 'PC電源、換気扇オフ、アダプティル外す（犬残り1）'),
    '診察室2': room('2', 'PC/Mac電源、換気扇オフ、アダプティル外す（犬診察終了）'),
    '診察室3': room('3', 'PC/Mac電源、換気扇オフ、フェリウェイ抜く'),
    '診察室4': room('4', 'PC/Mac電源、換気扇オフ（獣医に聞く）', ['サクションの動作確認']),
    '診察室5': room('5', 'PC電源、換気扇オフ（18時VTに聞く）')
  };
  function isHead(t) { return String(t).charAt(0) === '■'; }
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
    /* 場所の一覧が変わったら古い場所は消し、新しい場所は既定の項目で始める */
    Object.keys(s.tpl).forEach(function (a) { if (AREAS.indexOf(a) < 0) { delete s.tpl[a]; delete s.tplEdited[a]; } });
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
      items = items.filter(function (t) { return !isHead(t); });
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
        if (isHead(p.text) || (s.tpl[p.area] || []).indexOf(p.text) < 0) return 'チェック項目が見つかりません（項目が編集された可能性）';
        if (p.on === true || p.on === 'true') s.day.checks[ckey(p.area, p.text)] = 1; else delete s.day.checks[ckey(p.area, p.text)];
        return null;
      case 'setTpl':
        if (AREAS.indexOf(p.area) < 0) return '場所が不明です';
        var items = String(p.items || '').split(/\n/).map(function (x) { return str(x, 60); }).filter(Boolean);
        var seen = {}; items = items.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }).slice(0, 60);
        s.tpl[p.area] = items;
        s.tplEdited = s.tplEdited || {}; s.tplEdited[p.area] = 1;
        return null;
    }
    return '操作が不明です';
  }

  return { AREAS: AREAS, STEPS: STEPS, TYPES: TYPES, today: today, blank: blank, normalize: normalize,
    apply: apply, progress: progress, ckey: ckey, isHead: isHead };
})();
