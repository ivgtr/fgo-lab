# ADR 025: target-state mutationをdamage executionへ接続する

Status: accepted

E5 is out of scope.

## Context

Atlasの`addState`／`addStateShort`はbuffの表示情報ではなく、後続effectや宝具damageが読む
一時状態identityを対象へ付与する。一方、現行masterは`addIndividuality`だけを
`contextMutation`へ正規化し、通常の状態付与を`nonDamage`へ落としていた。またranking worldは
恒常traitの`target`だけを列挙し、`targetState`を外部factとして表現していなかった。

production artifact `20260829.8`を、artifactに採用済みのsource IDとeffect occurrenceへ限定して
静的監査した結果は次のとおりである。

- `damageNpStateIndividualFix` consumer: 13 NP
- damage-reachable target-state consumer identity: 16
- grant可能identity: 15（外部条件のみ: `traitId:10052`）
- canonical target-state grant: 1,411 operations / 814 effect occurrences / 322 owners
- target側skill grant: 499 operations
- target側NP前grant: 90 operations
- target側NP後grant: 816 operations
- passive grant: 1 operation
- Mystic Code grant: 5 operations
- guaranteed grant: 1,402 operations / proc付きgrant: 9 operations
- damage-reachable removal: 9 operations / 4 identities
- direct self-skill grantから同じlineageのdamage consumerへ到達するservant: 26

`stateTrait` NP以外にも、`damageNpIndividualSum`と`powerMod` conditionが一時状態を読む。
したがって13 NPの個別補正ではなく、状態付与semantic family全体をcanonical operationへ接続する。

## Decision

実行順序を次で固定する。

```text
ordered action
  -> choice / proc outcome
  -> scoped target-state mutation
  -> later condition evaluation
  -> damage operation
```

### Canonical identity and scope

- data-pipelineだけが`addState`、`addStateShort`、`subState`、`buff.vals`、`traitVals`を読む。
- 通常状態のidentityは`buff.vals`から解決し、名称がない数値IDは情報を失わない
  `traitId:<id>` identityへ変換する。数値IDもない状態は拒否する。
- damage consumerが読むidentityだけを`contextMutation`へ正規化する。
- raw actorの恒常traitにも存在するidentityは`combined` layerを維持し、恒常traitと一時状態を
  同じ名前という理由だけでstate-onlyへ狭めない。
- `addIndividuality`はcombined actor identityを付与する既存semanticsを維持する。
- 通常状態だけを読むcondition atomはmaster IRで`state` layerを明示する。
- `target`と`targetState`、`attacker`と`attackerState`を相互代替しない。
- umbrella identityもconsumerが読む場合は保持する。

### Execution authority

- `AppliedPreparationAction`がchoice、proc、effect、順序の唯一のauthorityである。
- state mutationは同じeffect transactionのmodifierやevidenceとall-or-nothingで適用する。
- proc失敗時はmutationを適用しない。
- probabilistic effectのmutationは同じeffect decisionへ結合し、hidden projection自体はUI controlにしない。
- guaranteed effectのmutationはranking contribution projectionで消さず、effect evidenceとして保持する。
- `removeTrait`は後続conditionからidentityを除去する。
- NPの`beforeDamage`だけが現在のNP damageより前に実行され、`afterDamage`は現在のNPへ寄与しない。
- preparation stateはattacker stateとtarget stateを型で分離する。派生状態をScenarioへ保存しない。

### Ranking

- ranking factは`target`と`targetState`をdiscriminated unionで保持する。
- planで生成済みのtarget stateは外部仮定へ数えない。
- 不足する複数の非排他的state factは同時に列挙できる。
- `special=inactive`はconsumer contributionだけを除外し、action、mutation、form、variant、evidenceを変更しない。
- calculatorとrankingは同じprepared executionとcanonical executorを使う。

## Validation

- unknown state identity、unresolved recipient、ambiguous occurrenceはartifact生成時に拒否する。
- invalid mutation、choice conflict、proc/evidence不整合はdamage前にfail-closedする。
- external factの排他制約だけをcandidate builderで拒否し、通常の複数状態は併存させる。
- candidate上限超過時に既定値へ戻さない。

## Consequences

- Master schemaはstate-layer conditionとstate-aware damage trait referenceを保持するため更新する。
- Engineはordered target-state executionを変更するためmajorを更新する。
- Scenario保存形式は変えない。
- 旧`nonDamage`経路、referenced skill専用state mutation、rankingのunscoped target trait factは削除し、fallbackを設けない。
- UIは既存effect操作を維持し、派生state editorやhidden mutation chipを追加しない。
