# ADR-017: class・attribute・familyを一つのTargetContextで検証する

- Status: accepted
- Date: 2026-08-27

## Context

resolved scenarioは対象class／attribute identityと相性倍率を別々に保存していた。計算機の相性選択は
`affinity:2`等の疑似class IDも生成するため、具体的な対象predicateと相性倍率を同時に選ぶと、実在しない
対象でも`calculated`になり得た。

production 420攻撃宝具の監査では、特攻は223騎・333 occurrence
（`powerMod` 191、特攻宝具142）である。class predicateは8騎・36 atom、attribute predicateは
52騎・61 occurrence存在する。カズラドロップの13 class predicateは相互排他groupを持たず、ダンテでは
Starの攻撃役に対してSky条件と属性1.1倍を同時指定しても計算できた。

Atlas inventory上、`classDemonGodPillar`はDemon God Pillar identityだけでなくSaber／Riderにも付与される。
`classBeast`も複数のBeast系identityを横断する。したがって、これらはclass identityではなくfamily
membershipであり、名称やclass IDから一律導出できない。

## Decision

resolved scenarioの`target`と数値`assumptions`を廃止し、次の排他的なcontextへ置換する。

```ts
interface TargetContext {
  class: TargetClassContext;
  attribute: TargetAttributeContext;
  families: readonly TargetFamilyMembership[];
}

type TargetClassContext =
  | { kind: 'relative'; relation: 'advantage2' | 'advantage15' | 'neutral' | 'disadvantage' }
  | { kind: 'concrete'; classId: CanonicalTargetClassId };

type TargetAttributeContext =
  | { kind: 'relative'; relation: 'advantage' | 'neutral' | 'disadvantage' }
  | { kind: 'concrete'; attribute: CanonicalTargetAttribute };
```

class／attribute identity、class family、通常traitはdata-pipelineで別のtyped predicate variantへ正規化する。
executorはAtlasのtrait名をmaster lookupで読み替えない。identityは一つだけ、familyはidentityと直交する
membershipとする。

family artifactは実行意味論と監査証拠を分離する。

- `targetSemantics.execution` はidentity domainとfamilyのmembership constraintだけを持つ。
- `targetSemantics.evidence` は観測したAtlas target、取得元digestを持つ。
- 観測例を成立可能範囲として使用しない。新targetの未観測は`impossible`の根拠にならない。
- raw trait文字列のworld factはtyped identity／family predicateへ変換されないため、identityを自由にassertする経路にはならない。

relative contextと具体predicateを併用する場合、resolverは実行domainから有限target candidateを生成し、既存の
単一constraint evaluatorへtyped factとして渡す。候補0件は`impossible`、探索上限は`targetSearchLimit`の
typed `unsupported`であり、両者を混同しない。

各候補はcanonical executorの最後まで実行する。同値性は二段階で比較する。

- `damageFingerprint`: final damage inputの同値性
- `presentationFingerprint`: effect outcome、decision、warning、evidenceの同値性

relative contextの単なるwitness identity差は表示差としない。一方、適用effectや根拠が異なる候補を先頭候補へ
暗黙集約しない。damageまたはpresentationが異なる場合、計算機はtyped `inputRequired`とする。ランキングの
最大候補選択はexecutorの外にあるapplication policyが担当する。

具体的なattribute predicateを採用した場合は、そのattributeと攻撃役attributeから属性相性を再導出する。
特攻成立のためにidentityだけ具体化し、relative倍率を維持してはならない。

manual scenarioの最終倍率入力は独立した正当な契約として維持する。resolved scenarioへのfallbackには使わない。

## UI contract

計算機のvisible UI、文言、配置、VRTは変更しない。class 2.0／1.5／1.0／0.5はclass relative context、
attribute 1.1／1.0／0.9はattribute relative contextへ変換する。疑似identityは生成しない。

E4.1 ranking Webは5項目だけを所有し、class ID、family、trait、倍率を解釈しない。

## Consequences

- `target.classId`、`target.attribute`、`assumptions`、`affinity:*`、identityの自由なworld fact assertionを削除する。
- DamageResolutionInputの導出済み倍率と対象identityはkernel入力・trace用途として維持する。
- schema、master artifact、engineを破壊的に更新し、旧scenario readerやfallbackを残さない。
- TargetContext基盤のcalculator parityとVRT差分0を確認してからE4.1 UIへ進む。

## Ownership and dependency direction

```text
Atlas
  → TargetTaxonomyNormalizer
  → CanonicalTargetDomain + separate evidence
  → TargetContextCommand reducer
  → compileExecutionPlan
  → resolveTargetCandidates
  → executeCandidate
  → compareCandidateResults
  → assembleExecutionResult
```

- Web、effect操作、ranking policyは`TargetContextCommand`を発行し、context内部を個別に書き換えない。
- affinity multiplierとrelative relationの変換はcalc-coreの全域関数だけが所有し、不正値はfail-closedにする。
- `engine.ts`は上記stageを接続するだけで、operation、constraint、target predicateを解釈しない。
