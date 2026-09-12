# 26CAI 모의 투자 레크리에이션

## 준비물
- Node.js 18+
- Supabase 프로젝트 (URL, anon key, DB 연결 정보 — Session pooler 권장, direct 연결은 IPv6 전용이라 막힐 수 있음)

## 로컬 개발
1. `npm install` (마이그레이션/테스트 실행용 `pg` 패키지 포함)
2. `.env.example`을 `.env`로 복사하고 Supabase URL/anon key 입력
3. DB 접속 정보를 환경변수로 export (마이그레이션/테스트 실행용, psql 불필요):
   ```bash
   export PGHOST="aws-<n>-<region>.pooler.supabase.com"
   export PGPORT="5432"
   export PGUSER="postgres.<project-ref>"
   export PGPASSWORD="<your-db-password>"
   export PGDATABASE="postgres"
   ```
4. `supabase/migrations/*.sql`을 번호 순서대로 적용:
   `node scripts/run-sql.mjs supabase/migrations/0001_init_schema.sql` (이후 파일도 동일하게 순서대로)
5. `npm run dev`

## UI 검증

`npm run dev`를 실행한 상태에서 `npx playwright install chromium`으로 테스트 브라우저를 준비한 뒤 `npm run test:ui`를 실행합니다. 설치된 Edge를 사용하려면 PowerShell에서 `$env:PLAYWRIGHT_CHANNEL='msedge'`를 설정할 수 있습니다.

입장, 매수 수량과 잔액, 중복 요청 방지, 거래 정지와 상장폐지, 차트, 순위, 진행자 제어와 모바일 레이아웃을 검사합니다. 외부 Supabase 요청은 테스트 응답으로 대체하며 실제 DB에는 쓰지 않습니다. 캡처와 결과는 `.ui-test/`에 저장됩니다. 다른 개발 서버를 검사할 때는 `UI_BASE_URL`, 결과 저장 위치는 `UI_ARTIFACTS_DIR`로 지정합니다.

## 배포 (Cloudflare Workers, 정적 자산)
Cloudflare 대시보드 → Workers & Pages에서 이 저장소를 GitHub으로 연결. Build command `npm run build`, Deploy command `npx wrangler deploy` (저장소의 `wrangler.toml`이 `dist/`를 정적 자산으로 배포하도록 설정되어 있음). 환경변수에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등록.

확인된 배포 URL: https://investmentgame.26cai.workers.dev/
