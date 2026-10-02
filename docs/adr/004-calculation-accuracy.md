---
title: "ADR-004: 計算精度と根拠"
status: "accepted"
date: "2026-08-24"
---

# ADR-004: 計算精度と根拠

- Status: accepted
- Date: 2026-08-24

Atlasの戦闘文書を一次根拠に独立実装する。積・除算の定義済み境界で`Math.fround`を適用し、乱数900〜1099を全件最終floorまで評価する。特殊宝具はFunction typeごとに、正規化済みの計算入力へ解決できる形式だけを`exact`とする。入力モデルが不足する形式は、動作しないhandlerで処理したように見せず、明示的な分類で`approximate`または`unsupported`とする。内部平均は小数を保持し、UIはlocale formatterで整数へ丸めて表示する。確率効果は期待値や乱数抽選へ変換せず、canonical proc semanticsに従って利用者が成立状態を選ぶ特定scenarioとして評価する。
