# ADR-009: 条件、ユーザーdecision、world factを分離する

- Status: accepted
- Date: 2026-08-25

## Context

従来の`ScenarioAssumption`は、効果のon/off、条件成立、具体的なtrait assertion、排他groupを一つの構造へ混在させていた。単一traitでは動作するが、OR条件では恣意的な候補選択を避けるとassertionを作れず、条件付き火力が`automatic`へ誤分類された。排他groupも外部入力から改変可能だった。

## Compared alternatives

| 案 | 長所 | 不採用理由 |
|---|---|---|
| A. 具体的world stateをassert | 同じfactに依存する効果へ自然に伝播する | ORで恣意的な候補選択を要求し、現在のUIでは利用者の意図を得られない |
| B. effect成立だけを宣言 | ORを正確に局所適用でき、別効果へ誤伝播しない | 複数decisionの整合性とcontext mutationへの波及を単独では保証できない |
| C. scenarioへ論理制約を保存 | 条件式の充足可能性を厳密に検証できる | master条件をscenarioへ複製し、master更新・共有・保存で意味が分岐する |
| D. world assertionとeffect decisionを別型にする | factと意思を分離し、必要な場合だけ双方を扱える | 単独ではOR decision同士の矛盾検証規則が不足する |

## Decision

Dを基礎に、Bのeffect-local成立宣言とCの論理制約検証をexecutor内部で組み合わせる。scenarioはmaster条件式を複製せず、安定したdecision key、operation使用意思、effect-local condition satisfactionだけを保存する。executorは現在のmaster IRを参照して選択済み条件群の充足可能性を検査する。

world factは外部入力・恒常master trait・順序付きcontext mutationの結果だけとする。排他性はcanonical trait semanticsから導出し、scenarioから排他メタデータを受け取らない。effect-local成立はworld factへ昇格せず、当該operationだけを成立させる。context mutationや他operationへの伝播が必要なのに具体的factを確定できない場合はtyped unsupportedとする。

UIはconditionを解釈しない。`calculation-application`がprojectionから型付きcommandを生成・適用し、単体計算、支援保存・復元、共有、ランキングは同じcommand semanticsを使用する。

## Consequences

- OR条件を通常の火力ボタンとして操作でき、先頭traitを暗黙採用しない。
- ダンテの天/地のような排他的条件は、scenarioのメタデータ改変に依存せずfail-closedになる。
- effect-local成立は他効果を暗黙成立させない。
- schemaとengineは破壊的に更新し、旧`ScenarioAssumption`、`OperationDecisionMode`、`assumptionsForProjection`を残さない。
