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

## E3.3 amendment: unified constraint validation

E3.2の実装は型を分離した一方、`WorldFactAssertion`とeffect-local conditionを別々に検証した。このため、既知の`attributeSky`／`fieldHeaven`と、成立を宣言した`attributeEarth`／`fieldHell`が同じscenario内で共存できた。さらにcontext mutationはstate変更後に排他検証され、unsupportedでも変更済みstateが後続operationへ渡った。

E3.3では分離した入力型を維持しつつ、実行時検証を一つのcanonical constraint systemへ統合する。

- fixed literalは、master／damage inputから確定した現在のtrait、検証済みworld fact、順序付きcontext mutationで確定したtrait、既知のquantityである。traitの未登録はunknownであり、negative literalではない。
- satisfiable expressionは、選択されたeffect-local conditionである。conditionはmaster IRから取得し、scenarioへ複製しない。成立宣言は具体traitへ変換せず、world stateにも追加しない。
- fixed literal同士、expression同士、fixed literalとexpressionを同じsolverへ入力する。AND、OR、NOTを保持した候補のうち、一つでも共通の充足割当があれば成立とする。
- canonical exclusive group、trait polarity、integer quantity rangeの空積をtyped conflictとする。`partialTrait`、`traitCount`など制約へ正確に変換できないvariantはtyped unsupportedとする。
- quantity比較は整数区間へ正規化し、否定されたequalは二つの区間へ分岐する。表現不能な範囲を近似しない。
- conjunctionごとに矛盾候補を除去し、同値候補を正規化・重複排除する。候補2,048件または一候補128 literalを超えた場合は、誤った簡約をせずtyped `constraintComplexityExceeded`へ落とす。
- world factsは全入力との制約検証に成功したcandidate stateだけをcommitする。
- context mutationは現在stateをcloneしたcandidateへ適用し、選択済みeffect-local expressionsを含む全制約を再検証する。成功時だけcandidateをcommitし、失敗時は元stateを維持する。
- conflictへ関与したdecisionとmutation operationは`applied`にしない。最終damage inputは最後にcommit済みのstateだけからfoldする。

この変更はUI入力を増やさない。OR効果のオン・オフを維持し、既知のworld factと両立する枝がある場合だけ計算する。具体的な対象選択がないと後続状態を一意に確定できないcondition familyは、引き続きtyped unsupportedとする。

## E3.3 review closure: bounded quantities and temporal trait scopes

統合制約モデルの入力境界を次の規則で閉じる。

- quantity factの定義域はschema packageの単一モジュールが所有する。HP permilleは0〜1,000、対象レアリティは0〜5、現行masterのBattle Point段階は0〜10とし、portable schemaとexecutorが同じ定義を参照する。
- schemaを迂回した呼び出しもexecutorで再検証し、範囲外のfixed quantityはクランプせずtyped `quantityFactOutOfDomain`としてfail-closedにする。
- 制約IRはactorごとに`initial`、`state`、`combined`を区別する。外部のactor world factは初期trait、state world factとcontext mutationはstate trait、actor向けmaster conditionは`combined = initial OR state`として扱う。state専用conditionはstateだけを読む。
- `initial: false`はstateの不在を意味しない。したがってstateがunknownならcombinedもunknown、state付与後はcombined true、明示的なinitial/state双方のfalseまたは付与解除後はcombined falseとなる。この三値論理をcondition evaluatorとsolverで共有する。
- context mutationは初期traitへstate traitを複製せず、candidate stateのstate layerだけを変更する。検証とcommitの各時点でcombined predicateを再導出する。
- 初期の統合制約検証に失敗した場合、その検証へ入力された選択中のcondition operationをすべて`notApplied`とする。最初に発見した競合だけを無効化対象にする部分適用は行わない。

この変更によりschemaは14、engineは11.2.0となる。旧値を維持する互換クランプや別検証経路は設けない。
