---
title: "ADR-029: Next.js App RouterとVercel配信"
status: "accepted"
date: "2026-09-05"
---

# ADR-029: Next.js App RouterとVercel配信

- Status: accepted
- Date: 2026-09-05
- Supersedes: [ADR-001](001-workspace.md), [ADR-007](007-static-routing.md)

主要画面をNext.js App Routerの固定pathへ割り当て、Vercelを第一配信先とする。route、metadata、初期HTMLはServer Componentが所有し、request-time dataを必要としないrouteはNext.jsの事前生成を許可する。認証やserver保存を導入するためではなく、route単位の配信境界と将来のSSR選択肢を確保するための移行である。

IndexedDBのprofile、Web Worker、Canvas、URL fragment共有はbrowser固有なのでClient Component境界に残す。Client application shellはlayoutで一度だけ起動し、画面遷移でmasterの検証やprofile repositoryの読込を繰り返さない。計算・rankingの意味論はapplication／execution familyを唯一の正本とし、Web routeから推論しない。

canonical pathは`/`、`/calculator`、`/ranking`、`/servants`、`/craft-essences`、`/supports`、`/growth`、`/data`とする。計算shareは`/calculator#share=...`、ranking filterは`/ranking`のqueryを使う。旧`?page=` routingとGitHub Pages subpath contractは維持しない。

本番E2EはNext.js production serverを使用し、development HMR／WebSocket eventをapplication failureから除外する契約は廃止する。browser console、page error、resource failureのfail-closed観測は維持する。
