# AI-DLC のとなり

AI-DLC v2向けの非公式・読み取り専用ビューアです。進行記録を、幅420pxの画面で見守るローカルWebアプリです。実際の記録と、6つの場面を試せるデモを切り替えられます。

## 起動

ローカル専用の試用版です。Node.js 22.13以上とnpmを使用します。macOSで検証しています。Windows・Linuxの動作は未検証です。

```sh
git clone https://github.com/yamac-music/aidlc-companion.git
cd aidlc-companion
npm ci
npm start
```

[ローカル画面](http://127.0.0.1:4317/)を開きます。右上のボタンは、幅440pxの小窓を開きます。ブラウザによってはポップアップの許可が必要です。ブラウザのウィンドウを画面の約1/3に配置しても使えます。

停止は起動したターミナルで `Ctrl+C`。再開は `npm start` です。

## 接続先

接続するAI-DLCプロジェクトを、ローカル専用の `.local/config.json` に指定します。この設定はGitに含めません。

```json
{
  "projectRoot": "/absolute/path/to/your-project"
}
```

または `AIDLC_PROJECT_ROOT` 環境変数を指定して起動します。設定を変えたらサーバーを再起動してください。Web画面から任意のローカルパスを指定する機能はありません。

対象プロジェクトには `aidlc/spaces/<space>/intents/intents.json` と各Intentの `aidlc-state.md` が必要です。初期選択は `active-space` / `active-intent` を参照し、画面で登録済みの作業を選び直せます。工程定義は `.codex`、`.claude`、`.kiro`、`.aidlc` の順に検索します。実環境との照合はCodex版2.6.124で行っています。

## できること

- 全体の現在地、現在の工程、担当の役割、記録されたUnitを表示。
- 質問への回答待ち、回答内容の確認、レビュー、工程の承認、修正、完了を区別。
- 通常は3秒間隔で更新確認。タブが隠れている場合は次回から10秒間隔。
- 現在の工程の保存文書を一覧し、その内容を画面内で読む。
- 直近30件の主要イベントを表示。会話本文やエージェントのメッセージは配信しない。
- デモで6つの場面を切り替える。デモ操作は実プロジェクトに影響しない。
- 小窓表示、ダークモード、動きの停止、OSの動きを減らす設定に対応。

確認や承認は、作業中のAI-DLCの会話で行います。このアプリからAI-DLCの工程を進める処理はありません。

## 状態の読み方

`aidlc-state.md` は現在位置の根拠です。監査の `audit/*.md` は現在の試行に絞って補助情報として読みます。Stageが付いていない `SUBAGENT_COMPLETED` だけで、工程やUnitを完了扱いにはしません。

Workflowの `Running` はAIが今動いているという意味ではありません。「最近の記録あり」は2分以内のイベントを指すだけで、プロセスの稼働を保証しません。更新がない場合は実行状況を未確認として表示します。接続に失敗したときは最後の記録を残し、古い表示であることを明示します。

同じ時刻に異なる監査シャードの記録が競合した場合は、工程内の順序を断定しません。`runtime-graph.json` は遅れている場合があるため、この初版の現在表示には使いません。

レビュー欄は監査に記録された結果の表示です。公式エンジンの署名・指紋・成果物検査を再実装した承認判定器ではありません。成果物更新や差し戻しの記録があれば古いレビュー結果を取り下げます。次の工程の決定と承認の有効性は、AI-DLC側が担います。

## 読み取り範囲と制限

- サーバーは `127.0.0.1:4317` に接続を限定します。別端末や公開サイトからの利用は対象外です。
- APIはGETのみ。同一オリジンを確認し、別サイトからのリクエストを拒否します。
- 成果物は現在のIntent・Stageから列挙したMarkdown / JSON / textのみ。任意パス、対象外シンボリックリンク、書き込み操作を拒否します。
- 文書はHTMLとして実行せず、テキストで表示します。
- 監査は1ファイル8MB・100ファイルまで、成果物は200件・表示本文512KBまで。上限超過はエラー表示し、黙って一部を成功扱いにしません。
- 詳細なSwarmの稼働状況や各Unitの並列ボード、通知・承認操作はこの初版に含めません。担当の実行方式は表示します。
- ローカル読み取りAPIはViteのNode側で実行します。`npm run build` はフロントエンドのビルド検証用で、Cloudflareへ配備してもMac内のファイルは読めません。利用時は `npm start` で起動してください。

## 検証

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

テストは合成データで、承認・差し戻し・古い試行・Unit帰属・重複監査・更新反映・読み取り境界を検証します。実プロジェクトの内容はテストやGitにコピーしていません。

生成されたUIライブラリ `components/ui` と `hooks` は未改変のため、アプリのlint対象から除外しています。型検査はプロジェクト全体に適用します。

## 参照

- [State Machine](https://awslabs.github.io/aidlc-workflows/reference/12-state-machine/)
- [Stage Protocol](https://awslabs.github.io/aidlc-workflows/reference/04-stage-protocol/)
- [Runtime Graph](https://awslabs.github.io/aidlc-workflows/reference/13-runtime-graph/)
- [Construction](https://awslabs.github.io/aidlc-workflows/reference/04-stages/construction/)
- [Engine and Skill System](https://awslabs.github.io/aidlc-workflows/reference/17-skill-system/)

キャラクターの生成情報は [ASSETS.md](ASSETS.md) に記載しています。

## 公開・共有する範囲

ソースコードのみを共有してください。`.local/`、`.env*`、ログ、キャッシュ、監視対象のAI-DLC記録は含めません。画面やスクリーンショットには、接続先から取得した作業名・文書名・文書本文が表示されます。紹介用には架空データのデモを使用してください。

依存ライブラリと同梱コードの通知は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。

## ライセンス

MIT。独自コードと同梱キャラクターに適用します。第三者コードには各ライセンスが適用されます。[LICENSE](LICENSE) を参照してください。
