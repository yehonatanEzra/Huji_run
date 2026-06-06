---
project_name: Huji_run
user_name: Yehonatan
date: '2026-06-06'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow', 'critical_rules']
status: complete
optimized_for_llm: true
---

# Project Context for AI Agents

_Critical rules and patterns AI agents must follow when implementing code in this project. Focuses on non-obvious details that agents would otherwise miss._

---

## Technology Stack & Versions

### Frontend
- React 19.2.6, React Router 7.15.1, Vite 8.0.12
- Tailwind CSS 4.3.0 — via `@tailwindcss/vite` plugin. **No PostCSS layer.** Do not add `postcss.config.js` or `@import` Tailwind via CSS. All Tailwind config goes in `vite.config.js`.
- Axios 1.16.1, date-fns 4.2.1, motion 12.40.0 (imported as `motion/react` — standalone Motion library, formerly Framer Motion)
- Plain JavaScript (JSX). **TypeScript deliberately omitted** — do not migrate or add `.ts`/`.tsx` files.
- Vite dev server proxies `/api/*` → `localhost:8000` (see `vite.config.js`). If the API base path or backend port changes, update both `vite.config.js` and Vercel env vars.
- No `.nvmrc` or `engines` field. No Node version lock currently enforced.

### Backend
- FastAPI 0.111.0, Uvicorn 0.29.0
- SQLAlchemy 2.0.30 — **`mapped_column()` with explicit `Mapped[T]` type hints only.** No bare `Column()` usage.
- **Pydantic v2 only** (2.7.1) + pydantic-settings 2.2.1. No v1 patterns (`Config` inner class, `validator`, etc.). Use `model_config`, `field_validator`, `model_validator`.
- python-jose 3.3.0 (JWT), passlib 1.7.4 + bcrypt 4.0.1 (currently working — no shim workaround needed)
- psycopg2-binary 2.9.9 (Postgres prod driver)
- **Python 3.12.7** — pinned in `backend/runtime.txt` and `render.yaml`. Render's default Python 3.14 has no pydantic-core wheel and will fail to deploy. Do not change this pin.

### Database & Hosting
- Dev: SQLite (`backend/dev.db`). Prod: Postgres (Neon).
- SQLite has **WAL mode + FK enforcement** enabled via pragmas at connect time (`database.py`). These pragmas affect constraint behaviour — account for this when writing or refactoring migrations and raw SQL.
- **Cross-dialect SQL rule:** All queries and migrations must work on both SQLite (dev) and Postgres (prod). Use `extract("year", col)` not `func.strftime("%Y", col)`. Use `sqlalchemy.inspect()` for schema checks, not SQLite `PRAGMA` queries.
- Frontend → Vercel. Backend → Render (free tier). DB → Neon.
- `VITE_API_BASE_URL` is baked into the JS bundle at Vercel build time. After changing it, the frontend must be redeployed.
- Render free tier sleeps after ~15 min idle — 30s cold start is expected, not a bug.
- Render has no persistent disk. `DISABLE_PHOTO_UPLOADS=true` is set in prod.

---

## Critical Implementation Rules

### Language-Specific Rules

**JavaScript (Frontend):**
- No TypeScript — do not add type annotations, `.d.ts` files, or TS config.
- Use ES modules throughout (`import`/`export`). The project uses `"type": "module"` in `package.json`.
- Async data fetching: use `async/await` with Axios. Wrap in `try/catch` for error handling at the component level.
- All API calls go through `frontend/src/api/client.js`. Never import `axios` directly in components — always use the shared client.
- When adding an API module, create it under `frontend/src/api/` (one file per concern).
- **API body pass-through rule:** API client methods that accept a request body must pass the full `body` object through unchanged. Do not destructure to named fields — this silently drops newly added fields.

**Python (Backend):**
- Python 3.12.7 only — do not use language features from 3.13+.
- All route handlers use FastAPI `Depends()` for DB sessions and auth. Never instantiate `SessionLocal` directly in a router.
- **Pydantic v2 only:** Use `model_config = ConfigDict(...)` not inner `class Config`. Use `field_validator`, `model_validator` — not `@validator`.
- All SQLAlchemy models use `mapped_column()` with `Mapped[T]` type hints. No bare `Column()`.
- `from __future__ import annotations` is used in `dependencies.py` — follow this pattern in new modules that need forward references.

### Framework-Specific Rules

**React:**
- `Modal` component (`components/ui/Modal.jsx`) requires an `open` prop. `<Modal onClose={fn}>` without `open` renders nothing — always pass `open={boolean}`.
- `useAuth()` provides: `user`, `login`, `logout`, `refreshUser`, `photoVersion`, `bumpPhotoVersion`. Call `refreshUser()` after any mutation that changes user fields (role, group, coach).
- Auth state lives in `localStorage` as `token` + `user`. On every boot, `AuthContext` calls `/auth/me` and overwrites the stored user — do not treat localStorage as authoritative for `training_group_id` or other mutable fields.
- Role-based routing: `ProtectedRoute` accepts `requireCoach` and `requireAdmin` props. Coach routes at `/coach/*`, admin at `/admin/*`.
- `isRace` derivation for calendar cells: if `day.individual_target?.override_group` is true, use `individual_target.workout_type`; otherwise use `group_workout.workout_type`. Never read the group workout type when a personal override is active.
- Page components are intentionally large (500–1400 lines). Do not split into sub-components unless explicitly asked.

**FastAPI (Backend):**
- Three auth dependency tiers: `get_current_user` (any authenticated), `require_coach` (coach or admin), `require_admin` (admin only). Use `Depends()` — never check `user.role` manually in a route that should be gated.
- DB session via `Depends(get_db)` — never instantiate `SessionLocal` directly in a router.
- CORS is driven by the `CORS_ORIGINS` env var (Render) — adding a new frontend URL is a config change, not a code change.
- All new routers must be registered via `app.include_router(...)` in `main.py`.

### Testing Rules

- **No tests currently exist.** `pytest 8.2.0`, `httpx 0.27.0`, `pytest-asyncio 0.23.6` are installed — scaffolding is ready but unused.
- When writing backend tests: use `httpx.AsyncClient` with the FastAPI `app` instance (not a running server). Use a separate `:memory:` SQLite DB per test session — never `dev.db`.
- **Set `DATABASE_URL` via `os.environ` before importing `app`** — `pydantic-settings` reads env at import time. Failing to do this makes tests read dev/prod values silently.
- Test DB fixture pattern: session-scoped `conftest.py` fixture that sets the env var, then runs `Base.metadata.create_all()`. Use `conftest.py` with session-scoped async fixtures — avoid `@pytest.mark.asyncio` on every test.
- **SQLite FK enforcement** — the test DB must also enable WAL + FK pragmas (same as `database.py`) or FK constraints won't fire during tests.
- **Use real JWT tokens in tests** — call `dependencies.create_access_token({"sub": user_id, "role": role})` and attach via `Authorization: Bearer <token>` header. Do not mock `get_current_user` — that hides auth integration bugs.
- **Do not mock the database** — use a real SQLite session. Mock/prod divergence (not mocks) is the primary failure mode for this stack.
- `_refresh_all_hall_of_fame()` runs on every `app` import (expensive). Consider mocking it in conftest for test runs: `mocker.patch("app.main._refresh_all_hall_of_fame")`.
- **No frontend test runner** (no Vitest, Jest, Playwright). Do not add one unless asked.
- Scope tests to the specific function or endpoint requested — do not add test infrastructure beyond the task.
- **Postgres escape hatch:** tests only run against SQLite. Before merging changes that touch schema or complex queries, manually verify against Postgres (Neon free-tier or staging). Agents must not assume SQLite test pass = Postgres safe.

### Code Quality & Style Rules

**Linting:**
- ESLint configured in `eslint.config.js` with `react-hooks` and `react-refresh` plugins. Run `npm run lint` before reporting frontend work done.
- No Prettier configured. Do not add it unless asked.

**Naming conventions:**
- React components/pages: PascalCase filenames and function names (`WorkoutPublisherPage.jsx`, `AppShell.jsx`).
- Frontend API modules: camelCase filenames (`calendar.js`, `client.js`).
- Backend files: snake_case (`coach.py`, `hall_of_fame.py`).
- SQLAlchemy model fields: snake_case (`training_group_id`, `workout_type`).
- React state: camelCase with `set` prefix (`const [isOpen, setIsOpen]`).

**Comments:**
- Write comments only when the WHY is non-obvious. Do not narrate WHAT the code does.
- No multi-paragraph docstrings or multi-line comment blocks — one short line max.

**File structure:**
- One API module per concern under `frontend/src/api/`.
- Role-specific pages: `frontend/src/pages/athlete/` or `frontend/src/pages/coach/`. Shared pages at `frontend/src/pages/`.
- Reusable UI primitives: `frontend/src/components/ui/`. Layout components: `frontend/src/components/layout/`.
- Backend: routers in `backend/app/routers/`, models in `backend/app/models/`, schemas in `backend/app/schemas/`, services in `backend/app/services/`.

### Development Workflow Rules

**Branches:**
- `dev` — all changes land here first. Pushes to `dev` do NOT trigger production deploys.
- `main` — release branch. Merging dev → main and pushing triggers Vercel + Render auto-deploy.
- Never push to `main` without explicit user confirmation. If a commit lands on `main` by accident, merge dev → main with `--no-ff` then push.

**Commit discipline:**
- Do not commit or push unless the user explicitly asks in the same turn.
- Stage specific files by name — never `git add -A` or `git add .` (risks committing `.env`, `dev.db`, or binaries).
- Do not amend published commits. Create new commits for fixes.

**Environment config:**
- Backend reads config from `.env` via `pydantic-settings`. Local dev uses defaults (SQLite, dev JWT secret). Never commit `.env`.
- Prod env vars live in Render (backend) and Vercel (frontend) dashboards — not in the repo.
- `VITE_API_BASE_URL` is baked at Vercel build time — changing it requires a frontend redeploy.

**Local dev:**
- Backend: `cd backend && source venv/bin/activate && uvicorn app.main:app --reload` → port 8000
- Frontend: `cd frontend && npm run dev` → port 5173, proxies `/api/*` to 8000

---

### Critical Don't-Miss Rules

**UI traps:**

- **`Modal` requires `open` prop** — `<Modal onClose={fn}>` without `open={boolean}` renders nothing, silently. Always pass `open={boolean}`. This has caused bugs twice.
- **`photoVersion` / `bumpPhotoVersion()`** — after any successful photo upload, call `bumpPhotoVersion()` from `AuthContext`. Without it, the browser serves stale cached bytes indefinitely. Verify in DevTools Network tab after upload.
- **API body pass-through** — API client methods that accept a request body must pass the full `body` object unchanged. Destructuring to named fields (`const {title, content} = body`) silently drops any new fields added later.

**Model & auth traps:**

- **New SQLAlchemy models must be imported in `main.py` with `# noqa: F401`** — without this import, the table never registers with `Base` and `create_all` won't create it. See `WorkoutLogComment` and `Notification` as examples.
- **Every new endpoint must declare its auth contract** — missing `require_coach` or loose user/group matching is a privilege escalation that ships silently (the 401-redirect in `client.js` masks it locally). Each new route must explicitly use `get_current_user`, `require_coach`, or `require_admin` and document which in a comment if non-obvious.

**Database / migration traps:**

- **Never rely on `create_all` for new columns** — `Base.metadata.create_all()` only creates missing *tables*, not missing columns on existing tables. When adding a column, always write a `_migrate_*` function in `main.py` using the inspect-then-ALTER pattern:
  ```python
  from sqlalchemy import inspect, text
  inspector = inspect(engine)
  existing = {c["name"] for c in inspector.get_columns("my_table")}
  if "new_col" not in existing:
      with engine.connect() as conn:
          conn.execute(text("ALTER TABLE my_table ADD COLUMN new_col TEXT"))
          conn.commit()
  ```
- **Migration failure = app won't start** — migrations run synchronously on app import, before the first request. A failing migration on Render free-tier cold start leaves the app unreachable. Test migration scripts locally before pushing.
- **Boolean server defaults** — use `false()` / `true()` from `sqlalchemy.sql.expression` for `server_default` on Boolean columns. Postgres rejects string values (`"0"`, `"false"`); SQLite accepts them silently. This creates a prod-only failure.
- **Cross-dialect SQL** — use `extract("year", col)` not `func.strftime("%Y", col)`. Use `sqlalchemy.inspect()` not SQLite `PRAGMA` queries. All queries must work on both SQLite (dev) and Postgres (prod).

**Business logic traps:**

- **Workout types — multi-file sync required.** When adding a workout type, update ALL of:
  1. `backend/app/routers/calendar.py` — `ALLOWED_TYPES` set (appears **twice**: group upsert + personal upsert)
  2. `frontend/src/pages/coach/WorkoutPublisherPage.jsx` — `WORKOUT_TYPES` array
  3. `frontend/src/pages/coach/TrackingDashboardPage.jsx` — `WORKOUT_TYPES` array
  4. `frontend/src/pages/coach/IndividualTargetsPage.jsx` — `WORKOUT_TYPES` array
  5. `frontend/src/pages/athlete/CalendarPage.jsx` — **four** inline maps: `TYPE_LABELS`, `TYPE_COLOR`, `TYPE_ABBR`, `TYPE_FULL`
  Missing any one causes the type to silently disappear in that view only.

- **Athlete deletion — FK cleanup order.** `coach.py::delete_athlete` must delete in FK-dependency order (children before parent) or SQLite raises `IntegrityError`: `WorkoutLog` → `IndividualTarget` → `Kudos` (given and received) → `AnnouncementReaction` → `AnnouncementComment` → `Announcement` (authored) → `RaceRegistration` → `HealthReview` → `Result`. Then re-assign `HealthProfessional.created_by_id` to the deleting coach before removing the user.

- **Manual PBs** — `Race.is_manual=True` rows must always be filtered from `/races` list responses. When the last `Result` under a manual race is deleted, cascade-delete the orphan `Race` + `Heat`.

- **`isRace` derivation** — always check individual override first: if `day.individual_target?.override_group` is true, use `individual_target.workout_type`; otherwise use `group_workout.workout_type`. Never read group workout type when a personal override is active.

- **Race-day visual highlight** — race-type workouts get: `border-2 border-indigo-500 bg-indigo-50` on the cell, `🏁` prefix on the title (or `"🏁 Race"` if no title), and `ring-2 ring-indigo-500` on the coach dashboard status circle.

**Known architectural debt (do not silently fix):**

- **Timezone** — `GroupWorkout` and `IndividualTarget` are keyed by date with no timezone column. All date queries assume the frontend's local date. Adding timezone support is a breaking schema migration — do not attempt without explicit instruction.

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code in this project.
- Follow ALL rules exactly — especially the Critical Don't-Miss Rules.
- When in doubt, prefer the more restrictive option.
- Update this file when new patterns emerge or rules become outdated.

**For Humans:**
- Keep this file lean. Remove rules that become obvious over time.
- Update when the technology stack or architecture changes.
- Review after any production incident — the root cause is often a missing rule here.

_Last updated: 2026-06-06_
