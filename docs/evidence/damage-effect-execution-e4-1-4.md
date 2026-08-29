---
title: "E4.1.4 canonical activation witness deduplication"
status: "Complete"
date: "2026-08-28"
---

# E4.1.4 canonical activation witness deduplication

## Outcome

scenarioのactivation stateをeffect単位の`ActivationDecision[]`から、canonical fact単位の
`ActivationWitness[]`へ破壊的に置換した。

```ts
interface ActivationWitness {
  fact: ActivationFact;
  consumerDecisionKeys: string[];
}
```

同一factはscenarioに一件だけ存在し、利用するterminal effectは一意・安定順のconsumerとして保持する。
effectを除外した場合はそのconsumerだけを外し、最後のconsumerがなくなった時だけwitnessを削除する。
排他的choiceを変更した場合は旧candidate witnessをconsumerごと削除する。

schemaは次をfail-closedにする。

- 同じcanonical factを持つ複数witness
- 重複または非安定順のconsumer key
- 同じchoice groupの異なるcandidate
- consumerを一件も持たないwitness

rankingの仮定数、trace、constraint factはすべて一意化済みwitnessを正本として読み、effect数から
activation仮定数を再構築しない。

## Production result

紅閻魔ではchoice candidateと`battlePointRate <= 999`がそれぞれ二つのeffectに重複保存されていた。
変更後は二つのcanonical witnessとなり、それぞれがattack buffとNP damage buffの二consumerを持つ。

標準ranking全420騎のwitness inventoryは次のとおり。

| kind | before effect-owned records | after canonical witnesses |
| --- | ---: | ---: |
| choice | 12 | 11 |
| operationTrigger | 3 | 3 |
| sourceQuantity | 2 | 1 |

採用scenario、damage input、NP1–5、順位、全policy digestの差分は0件である。

## Versions

- scenario schema: 29
- battle engine: 23.0.0
- master schema／artifact: 変更なし

旧`activationDecisions` fieldのfallbackは作成していない。E5には着手していない。

## Quality gates

- format check: success
- ESLint: success
- TypeScript: success
- unit／integration／property／golden: 68 files, 360 tests passed
- master validation: 7 files, 68 tests passed
- evidence validation: 2 files, 10 tests passed
- production build: success
  - ranking worker: 202.93 kB
  - CSS: 44.93 kB (gzip 9.29 kB)
  - JavaScript: 527.98 kB (gzip 149.96 kB)
- Playwright Chromium／mobile Chromium: 62 passed, 30 skipped
- benchmark: 374.83 ops/s, mean 2.6679 ms
- `git diff --check`: success

calculatorのdesktop／390px／320px baselineはengine version表示の`22`から`23`への更新だけを反映した。
ranking baselineとlayoutにはpixel差分がない。
