# FGO Lab implementation principles

## 成果と作業範囲

- 依頼された結果まで調査・修正・検証を進める。「調査だけ」「計画まで」「レビューのみ」は守る。通常の技術判断で再承認を求めず、未規定の製品判断や実質的な範囲拡張だけ確認する。
- damage correctnessを最優先にする。意味論を変えるときは利用者の結果、不変条件、意味を決める責務を確認する。同じ原因の例外が続くなら直接の生成・利用経路をまとめて調べる。
- 現行要件を基準に設計を再判断する。計算機を要件外のbattle simulatorへ広げない。無関係な利用者変更を保持し、stage／commitは依頼範囲だけを対象に差分を確認する。

## 計算の不変条件と責務

- servant ID・名前・label・raw keyによるruntime分岐を追加しない。typed identity、状態・遷移、網羅的なunionへ意味を集約し、互換性だけを目的とする旧経路やfallbackを残さない。
- 不足・曖昧・矛盾・部分適用の意味論はfail closedにする。無効状態をもっともらしい数値へ置き換えない。確率的失敗、対象からの除外、修正可能な入力、invalid、unsupportedを区別する。
- data pipelineだけがAtlas/raw語彙を解釈してcanonical IRを生成する。applicationがscenario commandと利用者の意図を所有し、executionがcanonical stateへ順序付きのtransactional operationを適用する。
- calculatorとrankingは同じapplication／execution経路を使う。ranking policyはscenarioを選び、独自のdamage semanticsを持たない。UIはcanonical stateを表示してcommandを送り、IDやlabelからゲーム規則を推測しない。
- 既存責務を拡張するか焦点の定まったmoduleへ抽出する。詳細をorchestratorへ戻さず、責務のないpackageを増やさない。利用可能なaction、使用したinput、適用済みeffectを区別する。
- 挙動には小さいsemantic fixture、全データには共有inventory／digestを使う。caseごとのmaster再読込・再計算を避ける。計算構造変更では影響するproduction suite・hot pathの前後を測り、candidate増加・時間増加・ratchet緩和を説明する。

## 必要な資料と検証

- 文書入口は[docs/README.md](docs/README.md)。要件・ADR・Task・evidenceは今回の判断に必要なものだけ読む。進捗は既存Task、系統の実行経路は既存flow noteへ差分を更新する。
- Serena接続時はコードの定義・参照をシンボル単位で取得する。文書入口は上記と共通とし、ローカルmemoryは任意の参照補助に留める。全体onboardingや正本のmemoryへの複製は行わず、文字列・JSON・Git・検証には既存toolを使う。
- canonical state、outcome分類、複数の実行／書込経路を変える作業と構造的レビューには[体系レビューガイド](docs/guides/systematic-review-guidelines.md)を使う。forward／recovery、alternate path、productionにないschema-legal stateまで反証し、対象内のBlockingを残して完了としない。小さな文言修正に全体監査や記録を要求しない。
- 通常作業は親が担当する。子は独立した読み取り専用調査1つまでとし、起動する場合は下記の実行効率要件を読む。
- 検証commandと完了ゲートは[README](README.md)、長時間command・単独実行・session上限は[実行効率要件](docs/requirements/development-execution-efficiency-requirements.md)を参照する。成功済みの同条件の証拠を再利用する。
- damage変更はcanonical inputとgoverning ruleで説明する。テスト成功だけでなく、変更に応じてproduction inventory、calculator／ranking parity、fail-closed、性能、要求されたUIの実経路を確認する。

CLAUDE.mdはこのファイルへのリンクとし、リポジトリ規約を二重管理しない。
