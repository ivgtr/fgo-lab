---
title: "ADR-030: ランキング育成基準と確定寄与"
status: accepted
date: "2026-10-03"
approved_at: "2026-10-03"
supersedes:
  - "ADR-018"
  - "ADR-020"
---

# ADR-030: ランキング育成基準と確定寄与

## Context

[ADR-018](018-ranking-comparison-policy.md)は旧6条件と固定育成値を、[ADR-020](020-ranking-condition-provenance-and-field-policy.md)は独立した外部field条件を前提にした。後続の[ランキング要件§20](../requirements/ranking-self-and-conditional-effects-requirements.md#20-2026-10-03の最終製品判断)で、共通条件と保存育成状態の両比較、通常の自前確定寄与、成立込みの単体理想火力、合法な使用順とNP資源が承認された。本ADRは比較基準と条件の出自について両旧ADRを置き換える。

[ADR-028](028-canonical-source-program-and-finite-ranking-domain.md)のsource program、ordered execution、finite certificate、portable identityは維持する。[ADR-024](024-pre-noble-phantasm-plans-and-attack-profiles.md)のAttackProfile単位も維持する。実装・全件受入の状態は本ADRで宣言せず、[TSK-14](../tasks/development-redesign-tasks.md#tsk-14-ranking最終方針の実装と正本収束)と[flow](../evidence/ranking-policy-candidate-flow-tsk-06.md)で追跡する。

## Decision

### 比較基準と入力

ランキング条件は母集団、育成基準、レベル基準、宝具Lv基準、初期OC、クラス相性、自己バフ、条件効果を別のtyped選択として保持する。初期表示は全サーヴァント・共通条件・自然上限・NP1・OC1・等倍・自己バフあり・通常のみとする。保有母集団への切替は育成基準を自動変更しない。

共通条件は自然上限／Lv.90統一／保有レベル、指定NP1〜5／保有宝具Lvを選べる。Fou ATK1000・active skill Lv10を使う。保存育成状態は保有母集団で明示選択し、保存Lv・NP Lv・Fou ATK・active skill Lvを使う。保存値の欠落・不正を共通値へ補わない。初期OCと礼装・支援なし等の比較初期条件は両育成基準で明示したまま、開始NPを成立込みで暗黙に増やさない。個別target、礼装、supportをランキングの編集条件へ増やさない。

### 通常のみと成立込み

自己バフあり・通常のみでは、選択初期stateから自前の合法なskill組合せと使用順を実行し、後続の寄与が確実に成立する最大火力を採用する。自己生成field、attacker／target state、marker、HP変化は、実際の順序付きmutationとreadが成立根拠になる。元々の敵特性、外部field、他者の支援、確率的成功を通常へ仮定しない。

成立込みではtyped target条件・field・確率結果・宣言済み最大stack等を有限な候補とし、同時に成立する一つのscenarioを同じexecutorで比較する。条件をeffectごとに独立に最大化しない。自己バフなしでは任意の自前skillを復活させず、AttackProfile到達に構造上必要なactionとNP／passiveの実行結果を扱う。policyによる寄与除外と、実行したmutationのrollbackは別の判断である。

applicationは候補とranking policyを選び、executionはNP消費・回復・容量、choice、HP／state／field、発動時conditionを順序付きtransactionとして適用する。NPが途中で減っても、後続の自前skillで攻撃宝具へ合法に到達する候補は保持する。途中の前提失敗、死亡、排他、unsupported、rollbackは無視しない。対象class／attribute／family等の物理的に共存できない条件を一つのtargetとして合成しない。未知・不足・曖昧なreadはtyped outcomeとしてfail closedにする。

同じAttackProfileの合法候補から平均damageの最大を選び、一行の順位と詳細に同じcanonical scenario、使用順、寄与根拠を使う。calculatorへの引継ぎはそのscenarioとportable intentを再実行する。UIとworkerは表示、command、fingerprint、stale結果の排除を所有し、IDやlabelから条件を推測しない。

## Consequences

- 旧「特攻なし／成立」と「外部fieldなし／成立」の独立controlは一つの「条件効果: 通常のみ／成立込み」へ収束する。旧URL・保存形式を黙って解釈しない。
- 共通条件と保存育成状態は母集団から独立した意味を持つ。保存育成状態は保有母集団でだけ選べ、保存値不足は数値fallbackにしない。
- 自前の確定した対象状態等を通常候補へ含めるため、旧順位やdamage expectedとの差が生じる。旧資料を上書きして一致させず、canonical input、採用plan、governing ruleと現行production結果で説明する。
- 対象内の小fixture、production inventory・calculator/ranking parity、保存・worker・UI経路、性能の証拠と受入境界はTSK-14が所有する。2026-10-08に利用者が選択したTSK-14の最終受入は代表ケースに限定し、既存全件原証拠のsource identityと最終差分の保証を分ける。`pnpm quality`や全件監査を最終HEADで実行したとは主張しない。

## Verification evidence

- 承認: [ランキング要件v0.11.0 §20](../requirements/ranking-self-and-conditional-effects-requirements.md#20-2026-10-03の最終製品判断)の2026-10-03判断。
- 実装と原artifact: [TSK-14](../tasks/development-redesign-tasks.md#tsk-14-ranking最終方針の実装と正本収束)と[flow](../evidence/ranking-policy-candidate-flow-tsk-06.md)。本ADRの採用はそれらのDone判定を代替しない。
