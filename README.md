# Supabase Sync Files

## New files (create these):
- src/lib/supabase.ts — Supabase client singleton
- src/store/auth-store.ts — Auth state management
- src/sync/push.ts — Push local data to cloud
- src/sync/pull.ts — Pull cloud data to local
- src/sync/media.ts — Upload/download media via Supabase Storage
- src/sync/index.ts — Sync orchestrator
- src/components/auth/LoginPage.tsx — Login/signup page
- src/components/auth/SyncBanner.tsx — Sync status banner

## Updated files (replace these):
- src/import/index.ts — Added fullPush() after import
- src/store/review-store.ts — Added syncCardReview after each rating
- src/App.tsx — Added auth gate, sync banner, login flow

## Setup:
1. pnpm add @supabase/supabase-js
2. Create .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
3. Add same env vars to Vercel (Settings → Environment Variables)
4. Supabase dashboard → Auth → Providers → Email → disable email confirmations
5. pnpm run build
6. npx vercel --prod
