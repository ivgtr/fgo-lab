# ADR-001: 静的Web workspace

- Status: superseded
- Superseded by: [ADR-029](029-next-vercel-routing.md)
- Date: 2026-08-24

pnpm workspace、React、TypeScript strict、Viteを採用する。ドメインpackageはReactとブラウザAPIへ依存せず、`apps/web`だけがapplication serviceとadapterを接続する。SSR、サーバーAPI、認証は導入しない。
