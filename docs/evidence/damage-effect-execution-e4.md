---
title: "Damage effect execution E4 completion evidence"
status: "Complete"
date: "2026-08-27"
---

# E4 ranking integration completion evidence

## Outcome

ランキングは単発計算と同じcanonical scenario、application facade、battle executor、damage kernelを使う。
旧ランキング専用のflatten済みinput経路は削除した。標準比較420攻撃宝具は全件計算でき、同一scenarioを
calculatorで再実行したfinal input、最小・平均・最大、effect projectionは完全一致した。

## Architecture

```text
Ranking URL conditions
  -> calculation-application RankingConditions
  -> candidate CalculationScenario
  -> calculateScenario / battle execution / damage kernel
  -> compact row summary
  -> lazy canonical detail and calculator handoff
```

- `calculation-application`が標準／所持build、共通support／CE／mystic code、world fact、quantity policy、
  self-effect/proc defaultから候補scenarioを作る。
- workerはmaster/profile/versionを初期化時に一度保持する。条件requestはcanonical fingerprintをkeyにsummaryを
  cacheし、開いた一行だけdetailを計算・cacheする。request IDとfingerprintが古い応答を遮断する。
- WebはURL共有可能な計算条件・filter・sort、localな展開行、worker stateを別々に所有する。filter変更では
  workerを再実行しない。
- effect stack groupingは計算機とランキングで`apps/web/src/presentation`の同じ変換を利用する。

削除した旧経路:

- `rankingCalculation.ts`のranking専用kernel実行と平均値sort
- `App.tsx`で420候補をmain thread上の`DamageResolutionInput`へflattenする処理
- ranking workerへmodifier済みinputとunsupported booleanを渡すmessage
- table行から計算意味論を再構築する経路

packageは追加していない。schema、artifact、engineの意味論も変更していない。

## Comparison contracts

標準比較の初期条件は、自然上限Lv、Fou +1000、NP1、skill Lv10、OC1、CEなし、支援なし、クラス有利、
属性等倍、自己効果あり、proc成功、chained proc最大成功、平均順である。trait、field、排他choice、数量条件を
サーヴァントごとに有利化せず、共通scenarioの明示値またはcanonical defaultだけを使う。

所持戦力は保存されたLv、NP Lv、Fou、skill Lvを使う。`npLevel=0`またはbuild欠落のサーヴァントは順位外で、
標準値をfallbackしない。共通礼装と保存支援セットは明示選択時だけ全候補へ適用する。

## Production parity and inventory

- 攻撃宝具: 420
- ranking calculated: 420
- `inputRequired`: 0
- `unsupported`: 0
- ranking専用unknown semantic / raw Atlas interpretation: 0
- calculator再実行とのscenario/input/result/effect差分: 0
- 標準比較digest: `6bf7e1358ce7f120d3e29b6490d0946f38d39b8d0a0f682360a88299d178988f`
- 旧ランキング相当条件digest: `aaa11d899f7e522c6d0c4993e10978846e8ce2e940e8b480eb8b5a80ffe55d96`

旧ランキング相当条件はself skillを含めなかったため、旧上位はクー・フーリン〔オルタ〕、宮本武蔵、
エルキドゥの順だった。新標準条件では全員へ同じ「自己効果あり」規則を適用するため、上位は
ジャンヌ・ダルク〔オルタ〕155,602.905、メルトリリス149,177.53、クー・フーリン〔オルタ〕148,276.155
となる。これは同一scenarioの計算差分ではなく、明示した標準条件の差である。

ジョン・ラックランドの〔王〕／〔悪〕一致数のようなeffect-local actor countは、共通の味方人数で上書きしない。
共通人数policyはcanonical predicateが単なるin-battle populationであるinputにだけ適用する。

## Presentation and handoff

閉じた行は順位、顔、名称、選択metric、card、範囲、rarity/class、effect/support件数だけを表示する。開く行は
常に一件で、detail DOMは展開後だけ生成する。詳細には最小・平均・最大、最終ATK、相性、HP、effect stack、
world fact、canonical input、proc結果、warningを表示する。

「同じ条件で計算機を開く」はmodifier合計ではなく使用した`CalculationScenario`を保存してcalculatorで再実行する。
PlaywrightではNP5カエサルのranking平均とcalculator平均、chained proc、適用effectの一致を確認した。

VRT:

- [desktop closed ranking](../../e2e/ranking-baseline.spec.ts-snapshots/ranking-desktop-chromium-linux.png)
- [desktop expanded detail](../../e2e/ranking-baseline.spec.ts-snapshots/ranking-detail-desktop-chromium-linux.png)
- [390px ranking — 原Git画像の復元](tsk-09-1-documentation-closure.md#e4歴史画像の復元)
- [320px ranking — 原Git画像の復元](tsk-09-1-documentation-closure.md#e4歴史画像の復元)
- [320px closed row — 原Git画像の復元](tsk-09-1-documentation-closure.md#e4歴史画像の復元)

上の3件はE4当時のchromium画像で、元path・commit・blob・bytes・SHA-256と復元操作をリンク先の台帳に保持する。現mobile画像は別baselineであり、このVRTの代替ではない。

| viewport | closed row | filter region | horizontal overflow |
|---:|---:|---:|---:|
| 1440px | 68px | 126.89px | 0 |
| 390px | 75.59px | 126.89px | 0 |
| 320px | 73.59px | 126.89px | 0 |

## Versions, size, and performance

- master: `20260827`
- schema: `26`（変更なし）
- engine: `19.0.0`（変更なし）
- app: `0.1.0`（変更なし）
- production main JS: 514.10 kB / gzip 145.93 kB
- ranking worker: 175.02 kB
- CSS: 44.59 kB / gzip 9.23 kB
- kernel benchmark: 409.85 ops/s、mean 2.4399 ms（NP1〜5 / 200 random values）

E3.12.1時点のmain 487.73 kB、worker 101.14 kBからの増加は、worker内へcanonical scenario builder、executor、
master validationを移し、mainへranking condition/detail UIを追加したためである。main threadで420件を事前flattenする
処理は削除され、表示filterは再計算を起こさない。

## Validation

- format check: success
- ESLint: success
- TypeScript: success
- unit/integration/property/golden: 54 files, 290 tests passed
- master validation: 6 files, 56 tests passed
- evidence validation: 2 files, 10 tests passed
- production build: success
- Playwright Chromium/mobile Chromium/VRT/accessibility: 59 passed, 27 project-specific skipped
- benchmark: success
- `git diff --check`: success

計算機の既存VRTとdamage goldenは更新していない。schema／artifact／engine version更新もない。E4より後の機能には
着手していない。
