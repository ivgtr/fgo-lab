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

class／attribute identity、class family、通常traitは別のpredicate variantに正規化する。identityは一つだけ、
familyはidentityと直交するmembershipとする。family membershipはAtlas target recordを根拠としてartifactへ
保存し、文字列や表示名から推測しない。

relative contextと具体predicateを併用する場合、executorはartifactの有限target witnessを列挙する。候補0件は
`impossible`、全候補の最終damage inputが同一なら`calculated`、候補により入力が異なる場合は計算機でtyped
`inputRequired`とする。ランキングは同じ候補集合を計算し、最大damage、次いでcanonical keyで一件へ固定する。

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

