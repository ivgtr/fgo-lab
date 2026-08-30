---
title: "Player choiceとstochastic outcomeのcanonical selection semantics"
status: accepted
date: 2026-08-30
---

# ADR 026: Canonical selection semantics

## Context

master effectは確定的な`ActSet`／`ActSelectIndex`を`choice`として保持する一方、確率結果は
`procSelection`でeffect inclusionまたは成功回数へ接続していた。application／executionはraw
choice familyを読み、単純procでは利用者の包含decisionを確率結果としても分岐していた。

## Decision

data-pipelineはraw vocabularyを次の一つのexhaustive unionへ正規化する。

```ts
type SelectionSemantics =
  | { kind: 'playerChoice'; group: CanonicalChoiceGroup }
  | { kind: 'stochasticOutcome'; group: CanonicalOutcomeGroup };

type CanonicalOutcomeGroup =
  | { kind: 'binary'; key: string; defaultOutcome: 'failure' | 'success' }
  | {
      kind: 'successCount';
      key: string;
      maximumSuccesses: number;
      defaultOutcome: 'minimum' | 'maximum';
    };
```

- `playerChoice`はordered preparation commandの一部で、raw family名をschemaへ保存しない。
- `stochasticOutcome`は確率構造を持つeffectだけが宣言する。single／independent rollはbinary、chained rollはsuccess countとする。
- inclusion、condition satisfaction、player choice、stochastic outcomeは別責務とする。
- executionは各operationの確率結果を`success`／`failure`／`inputRequired`／`invalid`のresolved stateとして保持し、`EffectDecision`へ変換しない。activationがsource、effect inclusion、condition、stochastic outcomeを独立に合成する。`inputRequired`はcanonical input pipelineが修正可能な入力として分類し、semantic errorを表す`invalid`とは混在させない。
- NP variant transactionのpreapplyを含む全state mutationはresolved activationの`enabled`だけを適用判定とし、failure／inputRequired／invalidを迂回しない。
- missing、guaranteedとの重複、proc kindとの不一致、success-count definition欠落は`invalidStochasticOutcome`としてoperationを無効化し、数値fallbackしない。
- application、battle-execution、Webは`ActSet`、`ActSelectIndex`、`procSelection`を解釈しない。

## Consequences

master schemaは40、scenario schemaは32、engineは28.0.0へ更新する。NP canonical identityはeffect semanticsを含むため再発行されるが、calculator／rankingのdamage値、適用operation、候補数、request数は維持する。ADR 015の旧master selection契約は本ADRが置き換える。
