# ADR 024: 宝具前有限 plan と AttackProfile ranking

## Status

Accepted for E4.1. E5 is out of scope.

## Context

宝具切替を card mutation として扱う旧モデルは、NP variant、actor form、skill
variant、既に適用された effect を混成した。また、ranking entry を
`Servant × TargetScope` とすると、同じ範囲でも異なる form／skill set／NP variant
を一つへ潰してしまう。

ranking が評価するのは任意の battle simulation ではなく、次の有限 plan とする。

```text
legal initial actor form
  → 0..3 useSkillSlot actions（各 slot は最大1回）
  → 0..1 non-attack transform NP action
  → exactly 1 attack NP action
```

turn advance、cooldown recovery、skill reuse、support action、face card、attack NP 後の
action は含めない。

## Decision

### Canonical state and action

`ActorFormGraph` は form node、legal initial form、default initial form、directed
transition を保持する。`SkillSlotRef` は form を跨ぐ安定した使用単位であり、form
transition は同じ slot を未使用へ戻さない。

`PreNoblePhantasmState` は initial/current form、used skill slots、active effects、
activation facts、selected NP variant、transform NP 使用状態を保持する。唯一の public
reducer が typed command を transaction として適用し、`AppliedPreparationAction[]` を
choice、transition、effect evidence の authority とする。

form transition は current form、以後の skill variant、NP variant、form trait、passive
projection を切り替える。既に適用された effect、used slot、過去の evidence は明示的な
remove operation がない限り維持する。部分適用と既定 form への fallback は禁止する。

### Planning and deduplication

planner は全 legal initial form から zero-step state を保持して有限 action を列挙する。
semantic fingerprint は initial/current form、selected NP variant、used slots、active
damage-relevant effects、traits、choice facts、transform NP 使用状態を canonicalizeする。
同一 fingerprint の state だけを deduplicateし、探索上限超過は fail-closedする。

### ActorFormProfile

ranking presentationで同値 formを重複させないため、terminal formは
`ActorFormProfile`へ射影する。同値性は少なくとも次のcanonical identityで決める。

- form-qualified skill slot と skill variant
- passive variant
- intrinsic trait
- base NP variant
- terminal stateから到達可能なattack NP variant

名称、再臨表示、servant IDによるgroup化は行わない。同じNP ID、card、scopeでもskill
setまたはtraitが異なれば別profileである。

### AttackProfile

ranking entry identityは次とする。

```text
RankingEntry = ServantLineage × ActorFormProfile × AttackNoblePhantasmVariant
```

`targetScope` と `cardType` は AttackProfile のcanonical属性でありfilter条件だが、単独の
identityではない。同じAttackProfileへ到達する複数planだけを比較し、damage、外部仮定、
activation fact、transition数、stable keyの順で採用する。異なるprofileを同一scopeという
理由で統合しない。

### Contribution projection and execution cache

ranking contribution policy は prepared execution の modifier寄与だけを射影する。
choice fact、transition、current form、selected NP、skill slot、evidence、effect provenanceは
変更しない。calculatorとrankingは同じprepared executionとcanonical damage executorを
使用する。

damage計算は次の順で共有する。

```text
plans
  → exact semantic deduplicate
  → prepared executions
  → AttackProfiles
  → canonical damage-input fingerprint
  → distinct NP1–5 matrices
  → plan/profile association
  → profile-local selection
```

cacheはNP variant identityとdamageへ到達する全inputをkeyにし、matrixだけを共有する。
plan evidence、action order、form presentation、採用理由はcacheしない。

## Layer ownership

- data-pipeline: raw Atlas transform／tdType semantics、form/NP/skill normalization、graph validation
- schema/master-data: typed form identity、variant union、graph、command、version validation
- battle-execution: action compilation、single reducer、evidence assembly、attack NP preparation
- calculation-application: finite planner、exact deduplication、profile grouping、cache、ranking selector
- web: canonical command dispatchとprofile属性の表示。semanticsの再解釈はしない

## Removed structures

- `cardTypeMutation` / `changeCardType`
- terminal-only candidate builder
- initial/transition候補の手動merge
- rankingでのchoice、transition、activation evidence再構築
- ranking entryの`Servant × TargetScope` identity
- raw Atlas suffixからcardを決めるruntime mappingとbase variant fallback

## Consequences

一騎が同一scopeに複数行を持てる。filter変更は計算済みAttackProfileを絞るだけで再計算しない。
Scenarioはinitial formとordered commandsだけを保存し、current form、resolved NP、compiled
operation、ranking entry identityを保存しない。
