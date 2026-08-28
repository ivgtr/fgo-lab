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

interface ActivationWitness {
  fact: ActivationFact;
  consumerDecisionKeys: string[];
}
```

scenarioは同一canonical factを一件だけ保持し、そのfactを必要とするterminal effectを
`consumerDecisionKeys`へ一意・安定順で関連付ける。effectを除外したときはconsumerだけを除き、別の
consumerが残るwitnessは維持する。consumerが0件になったwitnessは削除する。同一factを複数witnessへ
保存するscenarioはschemaで拒否し、constraint evaluatorは一意化済みfactを使ってchoice排他とrange交差を
検証する。

condition evaluatorはworld state、derived state、TargetContext、canonical input、activation contextを一つのBattleStateから読む。activation-local conditionだけを別のboolean shortcutで成立させない。

rankingはUI presentation commandを使用しない。selected terminal effectからactivation factを生成し、choice groupごとのcandidate worldを有限列挙する。同一candidateに属する全damage operationとcard mutationを同じscenarioへ含め、各scenarioをcanonical executorで実行する。採用順は選択中NP levelのdamage降順、activation fact数昇順、stable scenario key昇順とする。

operation triggerとsource quantityはchoiceのような任意部分集合探索を行わず、selected effectが要求するcanonical factをmaterializeする。未知構造やconstraint conflictはfail-closedにする。

## Consequences

- effect inclusionとcondition成立は引き続き分離される。
- choiceの最後の配列要素を暗黙採用しない。
- 同一candidateに属する複数modifierは一緒に成立できる。
- linked hidden mutationとterminal effectが同じactivation witnessを読む。
- fact数はeffect数ではなくcanonical witness数を表し、ranking tie-breakとevidence表示で共通利用する。
- schemaとengineを破壊的に更新し、旧scenario fallbackは作らない。
- E4.1.2 reportのchoice由来damage差分は正しいactivation witnessで再計測する。
