---
title: "FGO Lab 体系的レビューガイド"
document_version: "1.0.0"
status: "Guideline"
created_at: "2026-09-01"
updated_at: "2026-09-01"
related_documents:
  - "AGENTS.md"
  - "docs/guides/prompt-engineering-guidelines.md"
  - "docs/guides/data-flow.md"
  - "docs/requirements/damage-calculation-review.md"
  - "docs/requirements/ranking-self-and-conditional-effects-requirements.md"
---

# FGO Lab 体系的レビューガイド

## 1. 目的と適用範囲

本書は、レビュー指摘を一件ずつ局所修正するのではなく、同じ発生機構を持つsemantic
familyを一度に監査し、必要な設計修正と反例集合を最初のレビューで提示するための正本で
ある。product semanticsや個別Taskの進捗は所有せず、レビューの調査単位、抽象度、停止条件、
証拠の組み立て方を定める。

次のレビューでは、差分を読む前に本書を参照する。

- damage、condition、state transition、ranking candidateの意味を変える変更
- canonical stateまたはoutcome classificationを変える変更
- calculator、ranking、execution、UIの複数経路に影響する変更
- 同じTaskで構造的findingまたは再レビューが発生した変更
- productionに存在しないschema-legal stateの扱いが完了条件に含まれる変更

命名、文言、局所的な表示、機械的な置換など、意味論と複数経路を変えないレビューでは、
`Systematic review: N/A: <理由>`としてよい。

## 2. 今回の実装ターンから得た反省

### 2.1 確認された経過

TSK-06の有限ranking candidate plannerでは、最初の実装後に次の指摘が順番に見つかった。

1. `present:false`、`traitCount`、nested expression、combined `target + targetState`のwitness漏れ
2. canonical default provenanceをproduction監査から除外していた母集団漏れ
3. provenance値の比較は共有したが、`trait`／`traitCount`への適用範囲がconsumer間で不一致
4. leaf-level ownershipは共有したが、mixed ownershipの`any`／`all`／`not`を未確認

個々の指摘は妥当だったが、いずれも次の一つの構造問題から派生していた。

> `ConditionExpression`の評価所有者、物理read scope、boolean composition、witness軸、監査母集団を、
> 各consumerが部分的に再解釈していた。

本来は最初の構造的findingで実装を止め、このfamily全体を一つのstate-by-path matrixへ展開すべき
だった。具体的なdamage反例だけを修正単位にしたため、隣接する反例が修正後に一つずつ現れ、
実装とレビューが堂々巡りになった。

### 2.2 レビュー指摘がミクロ化した機構

- productionの強い一例を発見したことで、その入力の修正がレビューの中心になった。
- 「共有関数が追加されたこと」を「意味の所有権が一本化されたこと」と誤認しかけた。
- leaf variantのmatrixを確認した時点で、`all`／`any`／`not`のcompositionへ展開しなかった。
- production inventoryとschema-legal completenessを別の証拠として扱うのが遅れた。
- 前回の要求を満たした実装へ、隣接反例を後続レビューで追加した。

レビューの責任は、見つけた一例を正しく説明することだけではない。同じ機構が成立する再発範囲と、
承認に必要な最小反例集合を、実装者が修正を始める前にまとめて提示することにある。

### 2.3 実装側で生じた局所収束

最初のprovenance修正では、default値かどうかを判定する低レベル関数だけが共有された。しかし、
本当に共有すべきだったのは「どのcondition leafをworld factsで評価し、どれをeffect-local decisionへ
残すか」というdiscriminated ownershipだった。この差により、executor、planner、監査が同じhelperを
使いながら異なるvariant集合へ適用できる状態が残った。

最終的には次へ収束した。

- leaf全体を受けるcanonical ownership API
- 現要件で意味を持たない`traitCount.provenance`の型からの削除
- executorとwitness producerによる同じownership分類の利用
- world-fact-only production監査とmixed ownership focused fixtureの分離
- production occurrence 0を将来の変化として検出するratchet

この最終形は妥当だが、最初の構造監査で到達できる内容だった。

### 2.4 レビュー側の明示的な反省

- 最初のfindingをcondition semantic family全体へ一般化しなかった。
- code shapeの共有とsemantic ownershipの共有を区別できなかった。
- leaf、composition、transitionを一つのmatrixで確認しなかった。
- 指摘を小出しにし、同じflow closureを繰り返し開かせた。
- 後続レビューで範囲を広げる際、前回レビューの不足として先に明示しなかった。

レビュー反復自体は失敗ではない。しかし、同じ発生機構の隣接反例を連続して発見した場合は、
レビューの調査単位が小さすぎた証拠として扱う。

## 3. 汎用的な体系レビュー知識

### 3.1 症状から設計へ四段階で引き上げる

レビューでは、最低でも次の四段階を明示的に通る。

1. **Symptom** — どの入力で何が誤るか。利用者から観測できるactual／expectedを示す。
2. **Mechanism** — どの型、分岐、順序、read scope、fallbackが症状を成立させるか。
3. **Contract** — 破られたinvariantと、同じ機構が成立する状態空間を示す。
4. **Architecture** — semantic owner、producer／consumer、canonical API、削除すべき重複modelを示す。

具体例を提示した後、Mechanism以降へ進まずに修正案を書き始めてはならない。構造的findingでは、
Architectureまで到達してから修正範囲を確定する。

### 3.2 最初の構造的findingでfamily inventoryを作る

次のいずれかがあれば、その一件だけをpatch対象にせず、同じfamilyを検索する。

- union variantの一部だけが異なる扱いを受ける
- 同じ意味を複数moduleが判定する
- evaluatorとplanner／auditで条件判定が重複する
- production一例を直すと別経路の期待値が変わる
- absent、negative、unknown、invalidなどの周辺状態が未検証
- 同じTaskで二回目の構造的findingが出る

inventoryは無制限に広げない。現在のsemantic owner、直接producer／consumer、結果を変換する経路、
同じschema unionを読む箇所に限定する。別のproduct requirementや別ownerへ移る場合は新Taskへ分ける。

### 3.3 semantic closure matrix

型のvariantだけでなく、意味を変える直交軸を先に列挙する。一般形は次である。

| Dimension | 代表的な状態 |
| --- | --- |
| Variant | unionの各leaf、composite、unsupported |
| Polarity | positive、negative、absent、unknown |
| Ownership | canonical state、world facts、effect-local、user input、unsupported |
| Composition | leaf、`all`、`any`、`not`、nested mixed ownership |
| Path | normal、preparation、preapply、projection、aggregation、recovery |
| Time | before mutation、after mutation、rollback／retry |
| Population | production positive、production zero、schema-legal absent |
| Result | numeric、normal non-application、repairable、invalid、unsupported |

全組合せへ個別testを作る必要はない。pairwiseに重要な交差と、異なる結果classへ分岐する境界を選び、
空欄を意識的に`Verified`、`N/A`、`Deferred`、`Blocking`へ分類する。

### 3.4 producer、owner、consumerを分ける

レビューでは、共有helperの有無ではなく次を確認する。

- **Producer**: raw情報をcanonical stateへ変換する場所
- **Semantic owner**: variant、状態、遷移、評価規則を唯一決定する場所
- **Consumer**: canonical結果を選択、集約、表示する場所
- **Audit**: ownerの結果を観測するか、同じ意味を再実装していないか

良い共有APIは、生の値だけでなく意味を区別できるtyped inputを受け取り、discriminated resultを返す。
consumerがhelperを呼ぶ前後に同じvariant判定を持つなら、ownershipはまだ分裂している可能性がある。

### 3.5 production evidenceとschema-legal evidenceを分離する

production件数は現行影響と回帰規模を示すが、型契約の完全性は証明しない。次を分けて記録する。

- production occurrenceがある: shared inventory／digestで全件監査する。
- production occurrenceが0: 0件ratchetで将来の出現を検出する。
- schema-legalだがproductionにない: 小さいfocused fixtureで期待結果を固定する。
- 現要件で意味を持たない型状態: 実装を一般化せず、可能なら型から削除する。

production 0件を「問題なし」の根拠にしてはならず、productionにない状態のためにbattle simulatorを
一般化してもならない。型の縮小、fail-closed、focused fixtureの順で検討する。

### 3.6 三値・多値評価ではcompositionを別に監査する

leafが一致してもcompositionが一致するとは限らない。`true`／`false`／`unknown`、または
calculated／unavailable／invalid／unsupportedを扱う場合、少なくとも次を確認する。

- `all(true, unknown)`がtrueへ丸められない
- `any(true, unknown)`がunknownへ落ちない
- `not(unknown)`が推測値にならない
- mixed ownershipで一方の経路が他方のtruthを捏造しない
- aggregationがinvalidやunsupportedをnumeric fallbackへ変換しない

leaf matrixとcomposition matrixは別のguardrailである。leaf testの成功をnested closureと呼ばない。

### 3.7 指摘の小出しを防ぐレビュー停止規則

構造的findingを発見したら、その場で次を行うまで修正依頼を確定しない。

1. 同じunionとsemantic ownerのvariantを検索する。
2. 同じ判定を持つproducer、executor、planner、audit、UIを検索する。
3. polarity、composition、alternate path、production-zeroをmatrixへ追加する。
4. 現在確認できる全findingを共通原因ごとにまとめる。
5. 承認に必要な最小guardrailを一度で提示する。

後続レビューで同じ原因の隣接反例を見つけた場合は、単に新しい実装漏れとせず、前回レビューの
recurrence scope不足を明示する。実装者へ同じflow noteを何度も開かせる前に、レビュー自身の
inventoryを再監査する。

### 3.8 findingの重要度と事実の分離

findingには次を分けて書く。

- 現在のproductionで再現する不具合
- schema-legal fixtureで再現する契約違反
- 現在は発生しないがratchetがない将来リスク
- 観測済み事実と、ownershipや意図に関する推論

production 0件の契約漏れをproduction bugと表現しない。逆に、実害がないことを理由にschema-legalな
fail-closed違反を無視しない。変更由来か既存かはbaseline差分またはblameで確認してから述べる。

### 3.9 修正案が場当たり的かを判定する質問

- servant ID、名称、label、raw keyを分岐へ追加していないか。
- 一つのconsumerだけでcanonical semanticsを再実装していないか。
- 同じ意味のlist、default、predicateが複数残っていないか。
- 型が不可能状態を表現したまま、runtime guardだけを増やしていないか。
- 新旧path、adapter、fallbackが増えていないか。
- testが一つのexampleだけを固定し、再発機構を固定していないか。
- production件数の変化を説明できるか。
- candidate数や実行時間の増加をsemantic dimensionsから説明できるか。

複数項目に該当する場合、局所patchではなくowner、型、flow inventoryを見直す。

### 3.10 承認条件

構造的変更は、次が揃うまで承認しない。

- user-visible outcomeとgoverning invariantが一致する
- semantic ownerが一つで、consumerの再解釈がない
- state-by-path matrixのBlockingが0件
- production inventoryとschema-legal fixtureが役割分担されている
- calculator／rankingなどのalternate pathがcanonical executionへ収束する
- invalid／unsupportedがnumeric fallbackへ変換されない
- performanceとcandidate boundの変化が説明されている
- flow note、Task正本、実装、testの主張が一致する

テスト成功数、worktree clean、commit済みだけでは承認根拠にならない。

## 4. FGO Lab固有のドメインレビュー知識

### 4.1 damage correctnessを最上位に置く

FGO Labでは、表示や性能よりdamage correctnessを優先する。damage差分をレビューするときは、最終値
だけでなく次を要求する。

- servant／AttackProfileとNP level
- ordered preparation program
- gaugeとovercharge
- attacker／target／fieldのcanonical facts
- `TargetContext`
- calculatorへ渡るcomplete damage input
- 差分を支配するcanonical semantic rule

snapshotの数値だけが変わった修正は不十分である。どの入力または適用規則が変わったかを説明する。

### 4.2 canonical layer ownership

| Layer | 所有するもの | 所有してはならないもの |
| --- | --- | --- |
| data pipeline | Atlas／raw vocabularyの解釈、canonical IR | ranking policy、UI都合のfallback |
| application | scenario command、user intent、ranking policy | Atlas key解釈、damage式 |
| battle execution | condition評価、ordered operation、transaction、damage input | servant ID例外、UI state |
| ranking | finite scenario selection、比較、stable tie-break | 独自condition真偽、独自damage semantics |
| web／UI | canonical stateの表示、command dispatch | game rule推論、label／ID分岐 |

calculatorとrankingが同じ結果を出すことだけでなく、同じapplication／execution pathを通ることを確認
する。結果一致だけでは、二重実装が同じ誤りを持つ可能性を除外できない。

### 4.3 condition semantic family

conditionを変更するレビューでは、次を一つのfamilyとして扱う。

- `ConditionExpression`のvariantとprovenance
- initial／state／combined trait read scope
- positive／negative／unknown
- `traitCount`の`atLeast`／`atMost`／`equal`
- target predicateとexclusive identity
- `all`／`any`／`not`の三値composition
- world facts、effect-local decision、user input、unsupportedのownership
- constraint validation、witness生成、production audit

`target` traitは単一の物理factとは限らず、canonical evaluatorが`target + targetState`を読む場合がある。
witness producerはconditionのtruthを再実装せず、executor-owned read dimensionsを列挙し、canonical
evaluatorで結果を確認する。

### 4.4 ranking candidate completeness

rankingは「選ばれたcandidateを再実行して同じ値になる」だけでは完全性を証明できない。レビューでは
次を区別する。

- **Soundness**: materializeしたcandidateが矛盾したfactsを持たない。
- **Per-condition completeness**: 各条件に必要なtrue／false witnessが存在する。
- **Maximum completeness**: plannerの選択値が有限全状態oracleの最大値と一致する。
- **Execution parity**: 選択candidateをcanonical calculator pathで再実行して同じ値になる。

baseline candidateを必ず残し、stable tie-breakを固定する。候補上限は一部productではなく、materialize
前の完全なsemantic productに対して検査する。`2^N` effect subset探索やNP level間の部分実行を再導入
してはならない。

### 4.5 ordered preparationとNP level

preparation commandは集合ではなく順序付きprogramである。同じused-slot setでも順序によりstate、gauge、
form、NP variant、effect availabilityが変わり得る。deduplication keyが順序を失っていないか確認する。

NP1〜5は、同じblueprintを安全に共有できる証明がない限り各levelを完全実行する。cross-level cacheは
complete observable inputが等しい場合だけ許され、未証明の部分再利用をperformance最適化として入れない。

### 4.6 target、field、exclusive trait

- target class、attribute、familyは`TargetContext`のcanonical identityを使う。
- initial target traitとtarget state traitを混同しない。
- field不存在も明示的な候補であり、positive traitsだけの列挙で済ませない。
- exclusive groupは複数trueを生成せず、positive／negative混在でも矛盾を作らない。
- self-generated stateはpreparation前後を分け、外部world factで先回りして捏造しない。

### 4.7 outcome classification

数値がない結果を一つへ畳み込まない。

- `calculated`: complete canonical inputから数値を得た
- `unavailableUnderPolicy`: 有効なpolicyだが実行可能candidateがない
- `invalid`: contradiction、上限超過、semantic invalidなど入力またはmodelが不正
- `unsupported`: canonical semanticsが未対応で、推測実行できない

stochastic failure、disabled inclusion、repairable inputも必要に応じて別classとして保持する。baseline数値で
代用してはならない。

### 4.8 FGO Labの検証構成

意味論変更は次の順で証拠を組み立てる。

1. 小さいschema-legal semantic fixture
2. condition／state／ordered operationのfocused diagnostic
3. production全件inventoryまたはdigest
4. calculator／ranking parityとmaximum oracle
5. candidate数、damage request、cache、hot-path時間
6. `pnpm quality`によるphase gate

production masterはcaseごとに再読込せず、一つのshared inventoryで監査する。production occurrence 0は
ratchetし、focused fixtureで意味を固定する。性能悪化、candidate explosion、上限緩和をテスト追加の
副作用として片付けない。

## 5. レビュー実行手順

### 5.1 開始時

1. HEAD、親commit、worktree、変更fileを確認する。
2. user-visible outcome、domain invariant、semantic ownerを一文ずつ書く。
3. flow closureの適用可否を決め、正本noteを特定する。
4. 差分fileだけでなく、同じ型と判定を読む直接consumerを検索する。

### 5.2 finding発見時

1. reproductionと現在影響を確認する。
2. production occurrenceを測る。
3. 同じmechanismのvariant、composition、alternate pathをmatrixへ展開する。
4. current bug、schema-legal gap、future ratchetを分ける。
5. 一つのownerへ収束する修正境界を決める。
6. 全findingと承認guardrailをまとめて提示する。

### 5.3 再レビュー時

前回findingだけを再実行せず、前回提示したrecurrence scopeの全行を確認する。新しい隣接反例を見つけた
場合は、実装漏れか前回レビュー漏れかをbaseline差分と前回契約から判定する。レビュー漏れなら、その
事実を明示してから追加要求する。

### 5.4 最終回答

findingを重要度順に先に示す。findingがない場合も、少なくとも次を簡潔に報告する。

- スコープ逸脱の有無
- canonical ownershipが閉じた根拠
- productionとschema-legal verificationの役割
- 実行した検証と未実行のgate
- flow closureとBlockingの判定

## 6. レビューチェックリスト

- [ ] 症状だけでなくmechanism、contract、architectureまで確認したか。
- [ ] 最初の構造的findingで同じsemantic familyをinventoryしたか。
- [ ] variant、polarity、ownership、composition、path、timeを交差させたか。
- [ ] shared helperではなくsemantic ownerが一つか確認したか。
- [ ] production positive、production zero、schema-legal absentを分けたか。
- [ ] leaf testをnested closureとして扱っていないか。
- [ ] calculatorとrankingが結果だけでなくexecution pathを共有するか。
- [ ] candidate soundness、per-condition completeness、maximum、parityを区別したか。
- [ ] invalid／unsupportedをbaseline数値へfallbackしていないか。
- [ ] 現在影響と将来リスクを同じseverityで表現していないか。
- [ ] 同じ原因の指摘を一度にまとめたか。
- [ ] 後続レビューで範囲を広げる場合、前回レビュー不足を明示したか。
- [ ] flow note、Task、code、test、handoffの主張が一致するか。

## 7. 文書の使い分け

- repository-wide invariant: `AGENTS.md`
- 体系的なレビュー観点とFGO Labの反例軸: 本書
- prompt、session分割、flow closure記録形式: `docs/guides/prompt-engineering-guidelines.md`
- 現行のlayer依存方向: `docs/guides/data-flow.md`
- product／damage／ranking semantics: 各requirementsとADR
- Task固有のproducer、consumer、counterexample、inventory: 一つのcanonical flow note

本書のmatrixやチェックリストをTaskごとのflow noteへ全文複製しない。flow noteには適用した軸、今回の
delta、証拠、未解決statusだけを記録する。
