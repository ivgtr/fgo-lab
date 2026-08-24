# ADR-004: 計算精度と根拠

- Status: accepted
- Date: 2026-08-24

Atlasの戦闘文書を一次根拠に独立実装する。積・除算の定義済み境界で`Math.fround`を適用し、乱数900〜1099を全件最終floorまで評価する。特殊宝具はFunction type別registryで解決する。不明条件は0にせず`approximate`または`unsupported`とする。内部平均は小数を保持し、UIはlocale formatterで整数へ丸めて表示する。確率効果は100%だけを暗黙適用する。
