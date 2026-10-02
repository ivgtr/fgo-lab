---
title: "ADR-007: GitHub Pages配信"
status: "superseded"
date: "2026-08-24"
superseded_by: "ADR-029"
---

# ADR-007: GitHub Pages配信

- Status: superseded
- Superseded by: [ADR-029](029-next-vercel-routing.md)
- Date: 2026-08-24

Viteのbaseを環境変数`VITE_BASE_PATH`（既定`/fgo-lab/`）から設定し、アプリ内routeはhashで表す。共有データは同じfragment内の`share=` parameterへ置く。これにより404 fallbackやサーバー処理なしで直接URLと共有復元を成立させる。
