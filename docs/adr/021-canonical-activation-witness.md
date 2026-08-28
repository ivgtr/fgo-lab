# ADR 021: canonical activation facts

## Status

Accepted. The former persisted consumer-list design is superseded.

## Context

Choice、function-position trigger、source-owned quantity rangeはworld factではなく、一つのaction内で成立するactivation stateである。以前の形式はfactと利用effect一覧をscenarioへ重複保存したため、schema、application、evaluator、executor、share/saveの同期処理を必要とした。

さらにconsumer単位のfilterはaction全体のchoice排他やquantity range矛盾を見落とし得る。effectの包含は`EffectDecision`が既に担当しており、fact自体をeffect別に分割する必要はない。

## Decision

scenarioは一次状態だけを保持する。

```ts
interface ActivationSourceRef {
  origin: OperationOrigin;
  sourceInstanceId: string;
  skillId: string | null;
}

type ActivationFact =
  | { kind: 'choice'; source: ActivationSourceRef; family: string; candidate: string }
  | { kind: 'operationTrigger'; source: ActivationSourceRef; position: number }
  | {
      kind: 'sourceQuantity';
      source: ActivationSourceRef;
      quantity: 'battlePointRate';
      subjectId: string;
      comparison: 'atMost' | 'atLeast';
      value: number;
    };

interface CalculationScenario {
  activationFacts: ActivationFact[];
  effectDecisions: EffectDecision[];
}
```

data-pipeline由来のconditionはoperation compile時に同じtyped `ActivationSourceRef`を得る。runtimeでgroup文字列やsource labelを解析しない。同じskill IDでもsource instanceが異なればfactを共有しない。

executor開始時に全compiled operationとscenarioからimmutableな`ActivationContext`を一度だけ構築する。canonical order、重複、source identity、choice排他、quantity range交差、unknown／orphan factを検証する。各実行対象operationのconditionを三値論理で検証し、必要factの欠落はscenario全体を`invalidActivationContext`としてfail-closedにする。invalid時はdecision変更、operation実行、部分damage input返却を行わない。

applicationは利用者またはranking policyの選択factを追加・置換・削除し、compiled requirement indexから参照されなくなったfactだけをpruneする。requirement indexは実行計画から導出する一時情報でありscenarioへ永続化しない。visible effectだけでなくhidden mutation、card mutation、linked prerequisite、NP前context mutationも参照元に含む。

rankingはUI commandを呼ばず、同じpure activation scenario serviceを使用する。choice candidateを有限列挙し、operation triggerなどsource actionから確定するfactをmaterializeしたscenarioをcanonical executorへ渡す。

## Consequences

- ActivationFactとEffectDecisionの責務が一意になる。
- consumer同期、consumer別filter、consumer validation、decision強制OFF処理を削除する。
- condition evaluatorとconstraint evaluatorは同じActivationContextを読む。
- 同じfactを共有するeffectの一方をOFFにしても、他の選択中operationが参照する間はfactを保持する。
- 最後の参照operationをOFFにした場合だけfactを削除する。
- schema 30、engine 24へ破壊的に更新し、旧scenario fallbackは作らない。
- master schema／artifactはsource-independent conditionを保持し、typed source identityをcompile時に付与するためversion据え置きとする。
