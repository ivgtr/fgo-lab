# ADR-001: 静的Web workspace

- Status: accepted
- Date: 2026-08-24

pnpm workspace、React、TypeScript strict、Viteを採用する。ドメインpackageはReactとブラウザAPIへ依存せず、`apps/web`だけがapplication serviceとadapterを接続する。SSR、サーバーAPI、認証は導入しない。
