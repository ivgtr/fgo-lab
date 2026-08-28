# ADR 021: canonical activation witness

## Status

Accepted.

## Context

E4.1.2はrankingから複合conditionへの`assumeSatisfied`を削除し、trait、field、recipient、targetをcanonical stateで評価するようにした。この境界は正しいが、action内で確定する`choice`、function-position trigger、source-owned quantity rangeには対応するexecution stateがなかった。

production masterにはdamage-relevantなchoice 34 occurrence、operation trigger 5 occurrence、source quantity 5 occurrenceがある。choiceを含む標準rankingでは12 occurrenceが`unresolved`のまま脱落し、ブレエリ、シャルロット、紅閻魔、ククルカンなどのdamageが過少になった。

## Decision

scenarioへworld factとは別のtyped activation contextを持たせる。

```ts
type ActivationFact =
  | { kind: 'choice'; group: string; candidate: string }
  | { kind: 'operationTrigger'; source: string; position: number }
  | {
      kind: 'sourceQuantity';
      quantity: 'battlePointRate';
      subjectId: string;
      comparison: 'atMost' | 'atLeast';
      value: number;
    };

interface ActivationDecision {
  decisionKey: string;
  fact: ActivationFact;
}
```

`decisionKey`はfactの所有元を示し、同じchoice candidateやrangeを複数のterminal effectが共有できる。effectを除外したときはそのeffectが所有するfactだけを除き、同一candidateを必要とする別effectのfactは維持する。constraint evaluatorは全factを合わせてchoice排他とrange交差を検証する。

condition evaluatorはworld state、derived state、TargetContext、canonical input、activation contextを一つのBattleStateから読む。activation-local conditionだけを別のboolean shortcutで成立させない。

rankingはUI presentation commandを使用しない。selected terminal effectからactivation factを生成し、choice groupごとのcandidate worldを有限列挙する。同一candidateに属する全damage operationとcard mutationを同じscenarioへ含め、各scenarioをcanonical executorで実行する。採用順は選択中NP levelのdamage降順、activation fact数昇順、stable scenario key昇順とする。

operation triggerとsource quantityはchoiceのような任意部分集合探索を行わず、selected effectが要求するcanonical factをmaterializeする。未知構造やconstraint conflictはfail-closedにする。

## Consequences

- effect inclusionとcondition成立は引き続き分離される。
- choiceの最後の配列要素を暗黙採用しない。
- 同一candidateに属する複数modifierは一緒に成立できる。
- linked hidden mutationとterminal effectが同じactivation witnessを読む。
- schemaとengineを破壊的に更新し、旧scenario fallbackは作らない。
- E4.1.2 reportのchoice由来damage差分は正しいactivation witnessで再計測する。
