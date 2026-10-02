---
title: "ADR-012: battle context inputと参照operationをcanonical化する"
status: "accepted"
date: "2026-08-26"
---

# ADR-012: battle context inputと参照operationをcanonical化する

- Status: accepted
- Date: 2026-08-26

## Context

E3.7のexecutorはtrait、HP、Battle Pointと一部のeffect-local decisionを扱えるが、turn、critical star、stack、field population、actor survival、available master skill、参照skillをraw parameter単位の`unresolved`として残す。これらは実装不能ではなく、利用者が決める戦闘contextまたはbuild時に解決すべき依存である。`unsupported`へ一括分類すると、必要入力と実装不足を区別できず、既定計算も不必要に停止する。

## Decision

### Context input

masterは各effectが消費する`BattleContextInputDefinition`を保持する。definitionはkind、owner、scope、subject、範囲、default policy、説明、effect occurrenceを持つ。scenarioはcanonical keyと利用者入力値だけを保存し、raw parameterやmaster式を複製しない。

applicationはscenario明示値、既存HP/BP入力、canonical default policyから`ResolvedBattleContext`を生成する。executorはresolved contextだけを受け取り、defaultを補わない。definitionがあるのに値を解決できない場合はtyped `inputRequired`を返す。

### Count and value expression

turn、star threshold、trait/buff stack、field population、matching actor population、available master skillは別kindとして保持する。値を変える式と成立条件を区別し、effect-local条件成立を具体的countへ変換しない。countはowner、target population、survival predicate、trait provenance、上限を保持する。

matching actor countは単なる人数ではなく、canonical target population、source/other actor predicate、生存条件、count方式の積として保持する。trait ID `canBeInBattle`のようなactor propertyはtrait文字列のままexecutorへ渡さない。`ParamAddSelf*`と`ParamAddOp*`は別predicateとして正規化し、同じactorが別effectの複数predicateへ一致する場合はeffectごとに数える。

scenarioの明示値は導出済み最低値への追加分ではなく、そのeffectが消費する最終countである。executorはsourceの恒常trait、現在の宝具対象がin-battleであること、canonical populationから保証できる最低値を導出する。scenarioで値を省略した場合はこの最低値を使用し、明示値が最低値未満ならclampせずtyped `inputRequired`でfail-closedにする。一般に保証できない他actorの存在やtraitは0として推測せず、利用者の最終count入力だけで補う。

### Trait provenance and linked identity

initial trait、active state trait、passive state trait、ignore対象trait、unremovable stateを同じ集合へ潰さない。conditionは必要なprovenance policyを持つ。linked familyはstable buff instance/family identityとdependencyを持ち、traitの文字列一致だけで解除・抑制しない。初期traitを一時的に無効化するoperationはstate trait削除ではなくtyped suppressionとして表す。

### Referenced operation

`Value/Value2`または`SkillID/SkillLV`が参照するskillはdata-pipelineがbuild時に取得済みresourceから解決する。参照先Functionを同じcanonical normalizationへ通し、呼出位置、skill level、target policyを確定したordered operationとしてmasterへ保持する。runtime fetch、通常値fallback、raw ID分岐は行わない。欠落、循環、曖昧なtarget、damage-relevant未知operationはartifact生成を失敗させる。

### Transaction

参照展開を含む一effectのoperation列はcandidate state/input/evidenceへ適用し、全operationと依存を検証後にまとめてcommitする。失敗時は`inputRequired`またはtyped errorとなり、部分stateやmodifierを残さない。

## Consequences

- implementation unsupportedと利用者入力不足を分離できる。
- 通常サーヴァントのUIは変えず、必要なeffectだけ汎用context inputを表示できる。
- raw Atlas語彙の解釈はdata-pipelineに限定される。
- scenario/master/engine schemaは破壊的に更新し、旧quantity fallbackやraw unresolved経路を削除する。
- matching actor countのcanonical化により、本人のtrait一致と現在対象1体を無視していた旧既定値は維持しない。
- 単発計算を正本として完成させ、ランキング統合は後続フェーズに残す。
