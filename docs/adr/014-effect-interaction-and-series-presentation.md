# ADR 014: effect interactionと条件付きseriesの表示契約

- Status: Accepted
- Date: 2026-08-27

## Context

canonical inputをeffectの近くへ置くだけでは、入力、operation activation、表示効果の因果関係を
表現できない。productionでは次の二種類が実在する。

- 一つの入力を共有する複数の閾値operation。水着ハベトロットのcritical star条件は10段階、
  雨の魔女トネリコのHP条件は基本効果と4段階を一つのスキル使用判断で実行する。
- 一つしか選べない候補。`ActSet`、`ActSelectIndex`、対象属性、field realmはexecutorでは
  constraint conflictとして検出できるが、通常UIで競合状態を作らせる必要はない。

従来は各operationを一つのtoggleへ投影していたため、共有入力からdamageへ到達できない効果、
同じ効果名の大量表示、通常操作での排他constraint conflictが発生した。また、UIの選択色が
DOM属性の暗黙契約に依存していた。

## Decision

### canonical master IR

入力閾値で累積する同一Function familyは`inputThresholdSeries`、既存battle quantityで累積するfamilyは
`quantityThresholdSeries` interactionを持つ。series keyはdata-pipelineがcanonical input/quantityと
operation familyから生成する。サーヴァントID、名称、labelは使用しない。各effect occurrence、値、
condition、Atlas evidenceは独立したまま保持する。

`HP_LOWER`は`attackerHpPermille <= threshold`へ正規化する。thresholdは0〜1000の任意の整数を許容し、
範囲外、非整数、複数値、重複、condition方向・target policy・operation semanticsの不一致はartifact生成を
失敗させる。無条件operationはseries先頭の最大1件に限る。HP条件を満たさないmemberは`notApplied`であり、
skill全体を`unsupported`にしない。

raw target teamはtarget typeと同時にcanonical target policyへ正規化する。敵側actorへ適用される
同型effectを攻撃役自身のmodifierへroutingしない。

### battle execution

series memberは一つのdecision keyを共有するが、operation IDはoccurrenceごとに一意である。decision OFFなら全memberが不適用、ONなら各memberの
conditionを順序どおり評価する。成立しない閾値だけを`notApplied`とし、他memberやeffect全体を
unsupportedにしない。operation resultとevidenceは集約せず、trace上でoccurrenceごとに保持する。

projectionはcanonical choice条件とcanonical exclusive trait semanticsからselection groupを返す。
executorのconstraint validationはcrafted scenarioを拒否する最終防御として維持する。

### calculation application

applicationは同一decision keyのprojectionを一つの`EffectControlViewModel`へ集約する。表示値は現在
`applied`のmember合計であり、operation traceを置換しない。同じselection groupに異なるcandidateが
二つ以上ある場合だけ`singleChoice`とする。新candidateの選択commandは兄弟decisionとsupport保存参照を
同時に解除する。

### Web

Webは`EffectControlViewModel`を汎用rendererで表示する。

```text
自身の適用内容
  [攻撃力アップ  合計 +50%]
    クリティカルスター数  [-] 99 [+]

  対象属性
    ( ) 対 天の力   (●) 対 地の力
```

通常toggleは`aria-pressed`、single choiceは`role=radio`と`aria-checked`を使用する。選択色の正本は
外側list itemの`data-active`で、component統合testにより固定する。

## Validation rules

- threshold seriesのmemberは同じskill、quantity/input key、condition semantics、modifier routing、target policyを持つ。
- 閾値はcanonical domain内の整数で、重複してはならない。
- threshold conditionの方向とquantity ownerがseries内で一致する。
- UI controlを切り替えたとき、decision、operation outcome、final input、damageのいずれかが変化する。
- 同一skill・同一labelのuser controlが3件以上残る場合はproduction inventoryを失敗させる。

## Consequences

master schemaは29、artifactはv53、engineは17.0.0となる。scenario、共有、保存形式は変更しない。
E4は`EffectControlViewModel`ではなく、同じcanonical input resolver、decision command、executor、damage
resolutionを再利用する。
