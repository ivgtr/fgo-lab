---
title: "TSK-04 canonical selection semantics evidence"
status: Complete
updated_at: "2026-08-31"
---

# TSK-04 canonical selection semantics evidence

## Baseline and invariant

開始baselineは`d280bb3a5cfb409347e0f74df8e4dd1a16e1fba9`、clean worktree。変更前production
3 runは79.44／79.35／79.90秒（中央値79.44秒）。damage correctnessを不変とし、raw vocabularyの
解釈をdata-pipelineへ限定し、calculatorとrankingは同じcanonical operationを実行する。

## Production inventory

published master `20260830.5`、master schema 40、scenario schema 32、engine 28.0.0。13,875 effectを
一回のshared compileで監査した。

| Family | Raw occurrence | Canonical occurrence | Detail |
| --- | ---: | ---: | --- |
| player choice | 88 | 88 | `SelectionSemantics.playerChoice` |
| probabilistic outcome | 49 | 49 | binary 44／success-count 5 |
| unclassified／overlap | 0 | 0 | pipeline／schemaで例外終了 |

data-pipeline digestは`ead6e8483212bbb3daa24d742e40f5077b352b8a051ffa35eb3f9a7c4befd60b`、
application digestは`047d988cb6deb721b08494b04bf1614084aa544a22dc3955c8f131ce83b67231`。
published artifactは33,362,482 bytes、SHA-256
`5ca2a62e10c59af87cc143164e3375b8e204f94ecb1126c659601c5fd3796c0c`。

## Fail-closed and parity

focused fixtureはplayer choice／binary／success countに加え、choiceとprocの重複、missing、guaranteedとの
矛盾、proc kindとの部分適用、success-count definition欠落を検証する。invalid時はoperation decisionを
disabledへ固定し、`invalidStochasticOutcome`を返す。

productionは422／422 calculator calculated、433 ranking rows、inputRequired／unsupported／invalid 0。
candidate 6,508 generated／4,009 deduplicated、damage request 3,744／distinct 1,644、read／parse／compile
1／1／1を維持した。全NP1〜5 policyの代表damage assertion、proc golden、calculator execution parityが成功した。
NP canonical IDとdigestはeffect semanticsの型変更により再発行したが、damage値の変更はない。

## Performance and verification

変更後production 3 runは79.34／79.39／77.62秒（中央値79.34秒）。baseline比-0.10秒／-0.13%で
10%または5秒ratchet内。artifactは順に
`.test-results/2026-08-30T14-29-42-811Z-15-45acd1`、
`.test-results/2026-08-30T14-31-07-033Z-15-2920cd`、
`.test-results/2026-08-30T14-32-32-805Z-15-005143`。

focused 4 files／40 tests（artifact
`.test-results/2026-08-30T14-38-29-118Z-15-518469`）、unit 55 files／295 tests、production
25 files／117 tests、typecheck、published master validation、TSK-00 auditor、`git diff --check`が成功した。
最終`pnpm quality`はunit 55 files／295 tests（artifact
`.test-results/2026-08-30T14-51-03-456Z-320-ac04e9`）、production 25 files／117 tests（78.13秒、artifact
`.test-results/2026-08-30T14-51-08-537Z-795-647647`）、master validation、build、E2E 64 passed／32 skipped
（10.3分）まで成功した。published master version表示だけを更新したversioned PNG 5枚を再検証し、TSK-00 PNG digestは
`cdc06ab6cd42d67eb5e5168cfd514bbb8e9d854c0eae317d67ebfe415efb4561`、stable artifact digestは
`bde40d86ebceab812e468e1aa9ef92f079c91628c791a24f3c8703063acad40f`。
