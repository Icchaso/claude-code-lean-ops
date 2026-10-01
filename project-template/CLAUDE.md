# <プロジェクト名>
<何のアプリか1行>

## Commands（出力が静かになるフラグ込みで書く）
- 型チェック: `npx tsc --noEmit --pretty false`
- Lint: `npm run lint -- --quiet`
- テスト（1ファイル）: `npx vitest run <path> --reporter=dot`
- DB型生成: `npx supabase gen types typescript --local > types/db.ts`
  （Windows PowerShell 5.1 の `>` は UTF-16 で書き出すため、Windows では `| Out-File -Encoding utf8 types/db.ts` を使う）

## Gotchas（コードを読んでも分からないことだけ）
- 例: DB変更は必ず `supabase/migrations/` 経由。ダッシュボードで直接変更しない
- 例: Cloudflare Pages の環境変数は wrangler で設定。`.env.local` はローカル専用
