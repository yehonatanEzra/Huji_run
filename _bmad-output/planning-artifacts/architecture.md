---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7]
status: complete
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Huji_run-2026-06-06/prd.md
  - _bmad-output/project-context.md
  - CLAUDE.md
  - readme.md
workflowType: 'architecture'
project_name: 'Huji_run'
user_name: 'Yehonatan'
date: '2026-06-06'
---

# Architecture Decision Document — Huji Run

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements (14 new + existing core):**

| Category | FRs | Architectural weight |
|---|---|---|
| Permission model | FR-E (multi-coach groups) | Critical — new join tables, JWT rethink |
| Data model restructure | Team entity, race scopes, HoF namespacing | Critical — breaks current schema |
| Async/integration | FR-F (push notifications), FR-I (Strava/Garmin) | High — needs background workers |
| Analytics | FR-G (charts), FR-C (load warnings), FR-B (alerts) | Medium — heavy read queries |
| Workflows | FR-A (templates), FR-H (goals), FR-M (self-service) | Medium — new tables, flows |
| Public surface | FR-K (public profiles) | Medium — unauthenticated routes |
| Race lifecycle | FR-P (scopes + verification), FR-Q (calendar) | Medium — state machine |

**Non-Functional Requirements:**
- Scale: 100K+ users across many independent teams (multi-tenant)
- Performance: calendar/dashboard/charts < 2s for groups up to 200 athletes
- Mobile-first UX: all new UI responsive; future native app conversion
- Privacy: athlete data scoped to authorized coaches only; public profiles show verified data only
- Uptime: stateless architecture required (no local disk); Render free tier acceptable for now

### Scale & Complexity

- **Complexity level: HIGH**
- **Primary domain:** full-stack web (future mobile)
- **Multi-tenancy:** yes — fundamental restructure required
- **Real-time:** partial (push notifications, Strava webhooks)
- **Integrations:** Strava OAuth + webhook; future Garmin
- **Background workers:** required (notifications, Strava sync, load warnings)
- **Auth complexity:** contextual roles — user can be coach in one team, athlete in another

### Technical Constraints

- Postgres in prod / SQLite in dev — all migrations must be dialect-safe
- No persistent disk on Render (`DISABLE_PHOTO_UPLOADS=true`)
- No Alembic currently — manual inspect-then-ALTER in `main.py` (must change before schema migration)
- JWT tokens embed a single `role` — insufficient for multi-team contextual roles
- HallOfFame refreshes on every startup — not sustainable at scale
- Render free tier: single dyno, sleeps after 15 min, no persistent worker for background jobs

### Cross-Cutting Concerns

1. **Multi-tenancy** — every query, permission check, and public endpoint must be team-scoped
2. **Contextual authorization** — per-team roles replace platform-wide roles; affects all 8+ routers
3. **Background jobs** — push notifications + Strava webhooks + load warnings need async processing
4. **Migration safety** — large schema changes must not break the live Huji team's existing data
5. **Public/private boundary** — unauthenticated public routes need a new pattern; all others fully gated
6. **GDPR / data deletion** — "delete athlete" must purge data across all team contexts (scan-and-purge, not just cascade)
7. **Data residency** — design for future per-team sharding: `team_id` on every table, first column in every composite index
8. **Idempotency** — background jobs (HoF refresh, Strava sync, notifications) must be safe to retry without corrupting data

### Delivery Plan (Sprints)

**Sprint 0 — Foundation (prerequisite for everything)**
- Adopt Alembic (replaces manual inspect-then-ALTER in `main.py`)
- Add `Team` entity + scope all existing data to a team
- Build `GroupCoach` join table (replaces `TrainingGroup.coach_id`)
- Redesign JWT for contextual roles
- Coach self-service team creation (FR-M)
- Migrate existing Huji team data into new model

**Sprint 1 — Team #2 goes live**
- Multi-coach permissions (FR-E)
- Reporting overview + auto-alerts (FR-B1 + B2)
- Workout log comments (FR-L)
- Race scopes basic version (FR-P)

**Sprint 2 — Engagement & retention**
- Push notifications (FR-F)
- Workout plan templates (FR-A)
- Load warnings (FR-C) + basic charts (FR-G)
- Strava auto-import (FR-I)

**Sprint 3 — Growth**
- Advanced charts full suite (FR-G)
- Goal setting (FR-H)
- Public team profiles (FR-K)
- Race calendar (FR-Q)

**Future phase**
- Mobile app (native iOS + Android)
- AI coaching assistant
- Freemium / subscriptions

---

## Technology Stack & Tool Decisions

### Existing Stack (unchanged)

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + React Router 7 + Tailwind v4 |
| Backend | FastAPI + SQLAlchemy 2 + Pydantic v2 |
| Database | SQLite (dev) / Postgres (prod, Neon) |
| Auth | JWT bearer tokens (python-jose) |
| Hosting | Vercel (frontend) + Render (backend) |

### New Infrastructure Additions

**Migration system — Alembic (Sprint 0)**
- Replaces the manual inspect-then-ALTER pattern in `main.py`
- Versioned, reversible, multi-instance safe
- First task of Sprint 0: generate baseline migration from current schema, all future schema changes through Alembic

**Background jobs — phased adoption**
- **Sprint 1:** FastAPI `BackgroundTasks` — zero infrastructure, suitable for simple non-critical tasks (B2 alerts, log comment notifications)
- **Sprint 2:** Upgrade to **ARQ** (async Redis queue) when Strava webhooks require guaranteed delivery and retry logic. Requires Redis add-on on Render.

**Push notifications — Firebase Cloud Messaging (FCM)**
- Chosen over Web Push API because mobile app will need FCM anyway
- Free tier sufficient for current scale
- Delivers to web browsers now; native mobile push when app ships

---

## Core Architectural Decisions

### Data Architecture

**Team entity — Option A: Team wraps Groups**
```
Team (one per club/organization)
  └── TrainingGroup (e.g. "Speed", "Beginners")
        └── User (athletes)
```
- New `Team` table: `id`, `name`, `description`, `location`, `sport`, `is_public`, `created_by_id`
- Every domain table gets a `team_id` column (scoped data isolation)
- `team_id` is the first column in every composite index (designed for future per-team sharding)

**Multi-team coach membership**
- A coach holds a platform-wide `role = "coach"` — they cannot be an athlete
- A coach can be main coach or assistant in multiple teams simultaneously
- `TeamMembership(user_id, team_id, role: "main"|"assistant")` — new join table
- `GroupCoach(user_id, group_id, role: "main"|"assistant")` — new join table replacing `TrainingGroup.coach_id`

**Multi-tenancy enforcement — app-code checks**
- All team-scoped routes use a `verify_team_access(user, team_id)` FastAPI dependency
- No Postgres RLS (incompatible with SQLite dev environment)
- Code review must verify every scoped endpoint has this dependency

**Hall of Fame namespacing**
- Two HoF contexts: **per-team** (top 3 per distance/gender within one team) + **global** (top 3 across all teams, admin-verified results only)
- HoF refresh is **event-driven** — triggered when a result is added or deleted, not on app startup
- Startup `_refresh_all_hall_of_fame()` call removed from `main.py`

**Race scope**
- `Race` gets: `scope` (my_race/group_race/global_race), `group_id` (nullable FK), `verified` (boolean, default false)
- Existing races backfilled to `scope="global"`, `group_id=NULL` — queries must handle NULL defensively

**Migration strategy — Alembic**
- Alembic adopted in Sprint 0 before any schema changes
- Baseline migration generated from current schema
- All future schema changes go through Alembic versioned migrations only
- No new `_migrate_*` functions in `main.py`

### Authentication & Security

**JWT payload — active team context**
```json
{"sub": 123, "role": "coach", "active_team_id": 45}
```
- Platform roles remain global: `athlete` / `coach` / `admin`
- `active_team_id` added — coaches select active team at login or switch in UI (new token issued)
- Athletes: `active_team_id` = their one team (set at registration)
- 7-day JWT lifetime unchanged

**Public/private auth boundary — optional auth dependency**
- New `get_optional_user` dependency returns `None` if no token (instead of 401)
- Public endpoints explicitly opt in via `Depends(get_optional_user)`
- All existing endpoints keep `Depends(get_current_user)` — no accidental exposure

### API & Communication

- REST API maintained (no GraphQL)
- All endpoints remain under `/api/v1/` — no versioning change needed for Sprint 0-1
- `verify_team_access(user, team_id)` becomes the standard auth pattern for scoped routes

### Infrastructure & Deployment

**Hosting** — Render (backend) + Vercel (frontend) + Neon (Postgres) maintained
- Render free tier acceptable for Sprint 0-1; upgrade to paid when background workers (ARQ) are introduced in Sprint 2
- All app state remains stateless (no local disk writes)

**Background jobs — phased**
- Sprint 1: FastAPI `BackgroundTasks` (zero infra, non-critical notifications)
- Sprint 2: ARQ + Redis for Strava webhooks + guaranteed delivery

**Monitoring** — deferred; add structured logging (Python `structlog`) in Sprint 1 as minimum viable observability

### Decision Priority Summary

| Decision | Sprint | Blocks |
|---|---|---|
| Alembic adoption | 0 | All schema changes |
| Team entity + TeamMembership | 0 | All multi-tenancy |
| GroupCoach join table | 0 | FR-E permissions |
| JWT active_team_id | 0 | All auth |
| verify_team_access dependency | 0 | Data isolation |
| Race scope columns | 1 | FR-P |
| HoF per-team + event-driven | 1 | FR-P global results |
| get_optional_user | 3 | FR-K public profiles |
| ARQ + Redis | 2 | FR-I Strava webhooks |
| FCM push notifications | 2 | FR-F |

---

## Implementation Patterns & Consistency Rules

_Rules that ensure AI agents write consistent code across all sprints._

### Pattern 1 — Team-scoped queries

Every query on a team-owned table must filter by `team_id` explicitly. Never return cross-team data without an explicit admin check first.

```python
# Correct
db.query(GroupWorkout).filter(
    GroupWorkout.team_id == active_team_id,
    GroupWorkout.date == date
).all()

# Wrong — missing team scope
db.query(GroupWorkout).filter(GroupWorkout.date == date).all()
```

### Pattern 2 — Route auth dependency matrix

| Route type | Dependency |
|---|---|
| Private, any authenticated user | `Depends(get_current_user)` |
| Private, coach or admin only | `Depends(require_coach)` |
| Private, admin only | `Depends(require_admin)` |
| Team-scoped (any role) | `Depends(get_current_user)` + `verify_team_access(user, team_id)` |
| Public (no login required) | `Depends(get_optional_user)` — returns `None` if no token |

Never check `user.role` manually in a route that should be gated — always use the dependency.

### Pattern 3 — New SQLAlchemy models

1. Add `team_id` as a non-nullable FK to `Team` on every new domain table.
2. Put `team_id` **first** in every composite index (designed for future per-team sharding).
3. Import in `main.py` with `# noqa: F401` — without this the table never registers with `Base` and `create_all` won't create it.

### Pattern 4 — Alembic migrations (Sprint 0+)

All schema changes go through versioned Alembic migrations. No new `_migrate_*` functions in `main.py`. Migration files live in `backend/alembic/versions/`.

### Pattern 5 — HoF refresh trigger

```python
# After any Result insert / update / delete
refresh_team_hall_of_fame(db, team_id=result.team_id)

# After admin verifies a global race result
refresh_global_hall_of_fame(db)
```

Never call on startup. Startup `_refresh_all_hall_of_fame()` is removed in Sprint 0.

### Pattern 6 — GroupCoach permission resolution

Query the `GroupCoach` join table to check per-group coach permissions. Never compare `user.id == group.coach_id` — that column is deprecated after Sprint 0.

```python
coach_entry = db.query(GroupCoach).filter(
    GroupCoach.group_id == group_id,
    GroupCoach.user_id == current_user.id
).first()
if not coach_entry:
    raise HTTPException(status_code=403)
is_main_coach = coach_entry.role == "main"
```

### Pattern 7 — Race scope filtering

Apply scope filter explicitly on every Race query:

| Scope | Filter |
|---|---|
| `my_race` | `Race.created_by_id == user.id` |
| `group_race` | `Race.group_id.in_(user_group_ids)` |
| `global_race` | `Race.scope == "global"` AND `Race.verified == True` |

Existing races (pre-scope migration) have `group_id=NULL` — queries must handle NULL defensively with `OR Race.group_id IS NULL` where appropriate.

### Pattern 8 — Frontend API body pass-through

API client methods that accept a request body must pass the full `body` object unchanged. Never destructure to named fields — this silently drops any new fields added later.

```js
// Correct
const upsertGroupWorkout = (body) => client.post('/calendar/group', body);

// Wrong — silently drops new fields
const upsertGroupWorkout = ({ date, workout_type, content }) =>
  client.post('/calendar/group', { date, workout_type, content });
```

### Pattern 9 — Active team context in frontend

- `AuthContext` stores `active_team_id` alongside `user`.
- All API calls to team-scoped endpoints include the active team ID (in the URL path or request body, per endpoint design).
- After a team switch: issue a new JWT with the updated `active_team_id`, then call `refreshUser()`.
- Athletes have exactly one team — `active_team_id` is set at registration and never changes unless they switch teams.

---

## Project Structure

_Target folder layout. New files land here — do not create files outside this structure without a reason._

```
backend/app/
  alembic/                      ← Sprint 0: versioned migrations (replaces _migrate_* in main.py)
    versions/
    env.py
  models/
    team.py                     ← NEW Sprint 0: Team, TeamMembership
    group_coach.py              ← NEW Sprint 0: GroupCoach join table
    notification.py             ← NEW Sprint 2: FCM tokens + notification log
    goal.py                     ← NEW Sprint 3: athlete/coach goals
    template.py                 ← NEW Sprint 2: workout plan templates
    [existing models unchanged]
  routers/
    teams.py                    ← NEW Sprint 0: team CRUD, self-service creation (FR-M)
    group_coach.py              ← NEW Sprint 1: assistant coach management (FR-E)
    notifications.py            ← NEW Sprint 2: FCM registration + push send (FR-F)
    charts.py                   ← NEW Sprint 2: analytics query endpoints (FR-G)
    goals.py                    ← NEW Sprint 3: goal CRUD (FR-H)
    templates.py                ← NEW Sprint 2: plan templates (FR-A)
    [existing routers unchanged]
  dependencies.py               ← UPDATED Sprint 0: add get_optional_user, verify_team_access
  services/
    hall_of_fame.py             ← UPDATED Sprint 1: split into refresh_team_hof + refresh_global_hof
    strava.py                   ← NEW Sprint 2: OAuth flow + webhook handler (FR-I)
    fcm.py                      ← NEW Sprint 2: Firebase push notification wrapper (FR-F)
    [existing services unchanged]

frontend/src/
  api/
    teams.js                    ← NEW Sprint 0: team CRUD
    charts.js                   ← NEW Sprint 2: analytics queries
    goals.js                    ← NEW Sprint 3
    templates.js                ← NEW Sprint 2
    notifications.js            ← NEW Sprint 2: FCM token registration
    [existing api modules unchanged]
  contexts/
    AuthContext.jsx             ← UPDATED Sprint 0: add active_team_id, team switch flow
  pages/
    coach/
      GroupCoachPage.jsx        ← NEW Sprint 1: assistant coach management (FR-E)
      ReportingOverviewPage.jsx ← NEW Sprint 1: athlete reporting overview (FR-B1)
      TemplatePage.jsx          ← NEW Sprint 2: plan templates (FR-A)
      ChartsPage.jsx            ← NEW Sprint 2: team-level charts (FR-G)
    athlete/
      GoalsPage.jsx             ← NEW Sprint 3: goal setting + progress (FR-H)
      ChartsPage.jsx            ← NEW Sprint 2: personal analytics (FR-G)
    TeamSetupPage.jsx           ← NEW Sprint 0: coach self-service team creation (FR-M)
    PublicTeamPage.jsx          ← NEW Sprint 3: public profile, no auth required (FR-K)
```

**Naming conventions for new files:**
- Backend router files: `snake_case.py`, one concern per file, registered in `main.py`
- Backend model files: `snake_case.py`, imported in `main.py` with `# noqa: F401`
- Frontend API modules: `camelCase.js` under `frontend/src/api/`
- Frontend pages: `PascalCasePage.jsx` under `pages/coach/` or `pages/athlete/` based on primary audience; shared pages directly under `pages/`

---

## Key API Contracts

_New endpoints introduced across sprints. Existing endpoints are unchanged unless noted._

### Sprint 0 — Foundation

```
POST   /api/v1/teams/                          Create team (require_coach)
GET    /api/v1/teams/{team_id}                 Team detail (members + coaches of that team)
PATCH  /api/v1/teams/{team_id}                 Update team info (main coach only)
POST   /api/v1/auth/switch-team                Issue new JWT with updated active_team_id
GET    /api/v1/auth/me                         UPDATED: response now includes active_team_id
```

### Sprint 1 — Multi-coach + reporting

```
GET    /api/v1/groups/{group_id}/coaches                   List coaches in a group
POST   /api/v1/groups/{group_id}/coaches                   Add assistant coach (main coach only)
DELETE /api/v1/groups/{group_id}/coaches/{user_id}         Remove assistant coach (main coach only)
PATCH  /api/v1/groups/{group_id}/transfer                  Transfer main coach ownership

GET    /api/v1/teams/{team_id}/reporting                   FR-B1 reporting overview
       Query params: ?group_id=&week=YYYY-WNN
```

### Sprint 2 — Integrations + background jobs

```
GET    /api/v1/strava/connect                  OAuth redirect (FR-I)
GET    /api/v1/strava/callback                 OAuth callback + token storage
POST   /api/v1/strava/webhook                  Strava activity push receiver (no auth — Strava-signed)

POST   /api/v1/notifications/register          Register FCM device token (FR-F)
GET    /api/v1/athletes/{user_id}/charts       Athlete analytics (FR-G) — athlete + coaches
GET    /api/v1/teams/{team_id}/charts          Team-level analytics (FR-G) — coaches only

GET    /api/v1/templates/                      List coach's own templates (FR-A)
POST   /api/v1/templates/                      Create template
POST   /api/v1/templates/{id}/apply            Apply template to group from a start date
```

### Sprint 3 — Growth

```
GET    /api/v1/teams/{team_id}/public          Public team profile — get_optional_user (FR-K)
GET    /api/v1/athletes/{user_id}/goals        Athlete goals — athlete + their coaches (FR-H)
POST   /api/v1/athletes/{user_id}/goals        Set a goal
PATCH  /api/v1/athletes/{user_id}/goals/{id}   Update goal or mark complete
```

**Auth contract:** All private endpoints use `Authorization: Bearer <jwt>`. Public endpoints (`/teams/{id}/public`, `/auth/*`, `/strava/webhook`) use `get_optional_user` or no auth dependency.
