#!/usr/bin/env bash
# 麻酔薬計算 ⇄ 麻酔記録 の連携部分が消えていないかを確認する（2026-11-17 院長指示）
# 麻酔薬計算（anesthesia/index.html）は別セッションがテンプレートから丸ごと作り直すため、
# 麻酔記録へ渡す部分が消えることがある。消えていたら失敗にして、GitHub からメールで知らせる。
set -u
fail=0
need () { # ファイル 目印 説明
  if ! grep -q -- "$2" "$1"; then
    echo "::error file=$1::【連携が消えています】$3（目印：$2）"
    fail=1
  else
    echo "OK  $1 : $3"
  fi
}
A=anesthesia/index.html
R=anes-record/index.html
need $A "function buildHandoff"        "麻酔記録へ渡すデータを作る処理"
need $A "function recHandoff"          "この端末で麻酔記録を始める処理"
need $A "function ordConfirm"          "当日の内容で確定する処理"
need $A "anrec_handoff"                "麻酔記録への受け渡し（同じ端末）"
need $A "function prepImage"           "麻酔準備用紙の画像を作る処理"
need $A "function uploadPrep"          "麻酔準備用紙の画像をサーバーへ預ける処理"
need $A "anrec_prep_handoff"           "麻酔準備用紙の画像の受け渡し（同じ端末）"
need $A "AKfycbwjFCXqUR0"              "麻酔記録サーバーのURL（REC_API）"
need $A "麻酔記録"                      "「麻酔記録を始める」ボタン"
need $R "anrec_handoff"                "麻酔記録側の受け取り"
need $R "adoptHandoffPrep"             "麻酔記録側の準備用紙の受け取り"
need $R "prepget"                      "麻酔記録側の準備用紙の読み出し"
if [ $fail -ne 0 ]; then
  echo ""
  echo "麻酔薬計算を更新したときに、麻酔記録とつなぐ部分が消えた可能性があります。"
  echo "対応：麻酔薬計算のセッションに『麻酔記録アプリ_引き継ぎ』の「麻酔薬計算側に入っている変更」を取り込み直してもらう。"
  exit 1
fi
echo "連携チェック：すべてOK"
