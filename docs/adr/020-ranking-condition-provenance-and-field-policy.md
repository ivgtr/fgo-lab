---
title: "ADR 020: ranking condition provenance and field policy"
status: "superseded"
recorded_commit: "0487e90e21766431cf8d790555c0841db2ef9eca"
superseded_by: "ADR-030"
---

# ADR 020: ranking condition provenance and field policy

## Status

superseded

[ADR-030](030-ranking-basis-and-certain-contributions.md)が現在の条件出自・通常寄与を所有する。

## Context

E4.1のランキングはeffect inclusionを構築するときに、計算機UI向けの
`conditionAllowsEffectLocalDecision()`を再利用し、traitを含む複合条件全体を
`assumeSatisfied`へ変更していた。この処理は「自己効果を使う」と「その効果の条件が成立する」を
同一視する。

production既定条件では73 occurrenceがこの経路を通る。canonical fact種別は重複を許して
intrinsic 42、derivedまたはexternal field 26、external scenario fact 12、target 5、
proc／quantity 2である。field条件は24騎26 occurrenceである。

このため、ジャンヌ・ダルク〔オルタ〕本人が持たない〔竜〕recipient条件や、ネモが自身では
生成していない水辺／虚数空間fieldまで成立したものとして計算されていた。

## Decision

ランキングではeffect inclusionとcondition satisfactionを分離する。

- inclusionはsource／terminal effectを計算候補へ含めるかだけを決める。
- intrinsic factはattacker master、NP card、TargetContextからexecutorが評価する。
- derived factは選択済みsourceのordered operationが生成し、同じexecutor stateで評価する。
- external field factは`field: inactive | active`というranking policyだけがmaterializeする。
- target conditionはTargetContextとspecial-attack world candidateだけがmaterializeする。
- procとquantityは既存canonical input policyだけが解決する。
- ranking policyは`conditionSatisfaction: assumeSatisfied`を生成しない。

`contributionScope`は表示・寄与分類でありrecipient eligibilityではない。`partyWide`は主火力候補へ
含めるが、recipient条件を含むoperation conditionが実際のattacker stateで成立した場合だけ適用する。
area contributionは、成立した`partyWide`を含む主火力と、それだけを除いた反実仮想との差分とする。

### Field policy

- `inactive`: external field assertionを一件も追加しない。自身のoperationが生成するfieldは通常どおり有効。
- `active`: そのサーヴァントのdamage-relevant conditionが参照するfield traitだけを有限候補化する。
  canonical排他groupに反する候補は生成しない。各候補をexecutorへ通し、最大damageを選び、同値時は
  stable keyで決定する。
- 全production fieldを一律付与しない。探索上限超過はunsupportedであり、通常値へ読み替えない。

UIには一つの「フィールド なし／成立」だけを追加し、個別field editorは作らない。採用fieldと
condition witnessはdetail evidenceへ保持する。

## Consequences

- ジャンヌ・ダルク〔オルタ〕の〔竜〕限定party-wide buffは本人へ適用されない。
- ネモの外部field条件は既定`inactive`で適用されず、`active`で有限候補から成立する。
- 自身が先行operationで生成したfieldは`inactive`でも成立できる。
- ranking URL、worker cache key、production digestはfield policyを含む新契約へ破壊的に更新する。
- UI用effect toggle commandとランキングcondition policyは再び共有しない。
