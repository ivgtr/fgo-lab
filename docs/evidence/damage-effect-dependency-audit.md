---
title: "ダメージ効果依存関係 監査結果"
status: "Superseded"
status_scope: "469／420 production unsupported baselineの歴史記録。E0以降の後継はevidence indexが案内する"
---

# ダメージ効果依存関係 監査結果

## 結論

アーキタイプ：アースの問題は個別データ欠損ではなく、従来のresolverが「直接火力補正」
「成立条件」「戦闘コンテキストの変更」を同じ効果として直列処理していたことが原因だった。
master schema 8ではこれらを分離し、コンテキストを先に収束させてから火力補正を評価する。
サーヴァントIDによる例外分岐は追加していない。

## 全件監査

2026-08-25 Atlas JP masterを対象に、469騎中、攻撃宝具を既定条件で評価できる420件を監査した。

| 時点 | 数値なし `unsupported` | 変化 |
| --- | ---: | --- |
| 変更前 | 37 | disabled効果の値消失、フィールド変更の誤分類、条件欠落を含む |
| context resolver導入後 | 24 | 千年城などのproducer/consumer依存を解決 |
| evidence台帳是正後 | 18 | 実装・テスト済みの防御無視6件を正式に計算対象化 |
| ダメージカット貫通追加後 | 17 | 軽減貫通を防御無視と分けたkernel flagとして実装 |

件数だけでは相殺を検出できないため、production-master auditは残存17 IDとreason familyの完全一致を
要求する。これは監査ベースラインであり、計算処理の分岐には使用しない。

## アーキタイプ：アース

- NP前の千年城フィールド付与をcontext producerとして適用する。
- 千年城フィールド付与自体は自動的な内部条件なので「自身の適用内容」には表示しない。
- 「原初の一 D」の千年城条件をAtlas `INDIVIDUALITIE`から正規化する。
- producerを解決した後にBuster 30%を適用する。
- 未選択の防御力ダウン20%、攻撃力アップ30%、宝具威力アップ20%も既知値として表示する。
- 非火力効果やフィールド変更そのものを未知の火力補正として扱わない。

## 残存18件の分類と優先度

同一計算が複数理由を持つため、分類件数の合計は18を超える。

| 優先度 | reason family | 件数 | 方針 |
| --- | --- | ---: | --- |
| P0（UI接続済み） | `missing_attacker_hp_ratio` | 4 | HP依存宝具にだけ残りHP入力を表示し、入力後に計算する |
| P1 | `np_effect_parameter_semantics_not_resolved` | 7 | Trigger/ParamAdd/phase-rangeをraw key単位で型付けし、共有handlerへ集約する |
| P1 | `np_effect_not_resolved` | 2 | 参照関数・前置効果の実体をmasterへ取り込み、参照グラフとして解決する |
| P1 | `passive_effect_not_resolved` | 4 | クラス相性上書き等を専用context operationとして正規化する |
| P1 | `passive_effect_condition_not_resolved` | 1 | 条件式を名称推測せずAtlas scriptから正規化する |
| P2（UI接続済み） | `missing_battle_point_phase` | 1 | 必要な宝具にだけ段階入力を表示する。別の未解釈条件が残る間はfail-closed |

P0/P1の区別は利用者影響ではなく、正しい数値を出すまでの確実性で付ける。HPは既存golden済みの
量的入力なので接続できる。一方、複合parameterを値だけ読んで推測適用すると誤計算になるため、
raw fixture、正規化schema、handler、golden、全件監査を一つの変更単位として追加する。

## 持続的な設計判断

1. 効果名やサーヴァントIDではなく、Atlasのfunction/buff scriptを型付き意味へ変換する。
2. context producerを固定点まで解決し、その結果をconsumer条件と直接modifierが共有する。
3. on/offは適用判断だけを担い、既知の倍率や意味解釈の可否とは分離する。
4. 未解釈の有効な直接火力効果は数値を推測せずfail-closedを維持する。
5. evidence台帳は実装・source・goldenを結び、テストだけ存在する未登録機能を防ぐ。
6. production-master auditは新規非対応と理由の移動をmaster更新時に必ず顕在化させる。

## 検証

- master schema/manifest整合性
- unit/integration 24 files・145 tests（context基盤コミット時点）
- production master 469騎・計算候補420件の完全監査
- typecheck / lint
- Chromium focused E2E: アーキタイプ：アース、HP依存宝具の未入力/入力後フロー
