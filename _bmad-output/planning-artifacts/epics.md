---
stepsCompleted: [1, 2, 3, 4]
status: complete
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Huji_run-2026-06-06/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/project-context.md
  - CLAUDE.md
scope: Sprint 0
---

# Huji_run - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Huji_run, decomposing Sprint 0 requirements from the PRD and Architecture into implementable stories. Sprint 0 is the prerequisite foundation — nothing else can be built until it is complete.

---

## Requirements Inventory

### Functional Requirements

FR-A: Coach can create named multi-week workout plan templates and apply them to a group from a chosen start date (Sprint 2)
FR-B1: Coach sees a dedicated reporting page showing which athletes reported workouts this week vs. which haven't, filterable by group and week, sortable by response rate (Sprint 1)
FR-B2: System flags athletes who haven't logged in N configurable days; alert visible on coach dashboard (Sprint 1)
FR-C: System tracks weekly km volume per athlete and warns coach when load spikes >30% week-over-week (Sprint 2)
FR-E: Each group has one main coach (creator) and any number of assistant coaches; permission matrix enforced per role (Sprint 1)
FR-F: Push notifications delivered via FCM — athlete and coach notification types defined (Sprint 2)
FR-G: Athlete-level and team-level analytics charts: volume, completion rate, workout type breakdown, race performance (Sprint 2–3)
FR-H: Athletes and coaches can set personal goals (race time, volume, PB); progress shown on profile and charts (Sprint 3)
FR-I: Strava/Garmin auto-import fills athlete workout log after GPS activity is recorded (Sprint 2)
FR-K: Public team profile page (no login required): team info, HoF, recent verified results, Join CTA (Sprint 3)
FR-L: Coaches and athletes can leave text comments on a specific day's workout log; threaded replies (Sprint 1)
FR-M: Any user can register as a coach and create a team; becomes main coach automatically; invite athletes via link or email (Sprint 0)
FR-N: Multi-group UX polish — group selector on dashboard, clear group context in workout publisher (Sprint 1–2)
FR-P: Race scopes (my_race / group_race / global_race); admin verification for global HoF eligibility; pre-race heat registration (Sprint 1)
FR-Q: Dedicated upcoming race schedule view; athletes mark intent; connects to FR-P registration (Sprint 3)

### NonFunctional Requirements

NFR1: Scale — support 100,000+ users across many independent teams
NFR2: Mobile-first — all new UI must work comfortably on mobile browser; designed for future native app conversion
NFR3: Performance — calendar, dashboard, and chart pages must load in under 2s for groups of up to 200 athletes
NFR4: Privacy — athlete performance data visible only to the athlete and their authorized coaches; public profiles show verified/aggregate data only
NFR5: Uptime — stateless architecture; no in-memory state or local disk writes; Render free tier acceptable for Sprint 0–1

### Additional Requirements

From Architecture — Sprint 0 critical path (all must land before any Sprint 1 feature work):

- AR1: Adopt Alembic for all schema migrations — replaces every `_migrate_*` function in `main.py`; baseline migration must be generated from current schema before any new columns are added
- AR2: Add `Team` table (`id`, `name`, `description`, `location`, `sport`, `is_public`, `created_by_id`); add `TeamMembership(user_id, team_id, role: main|assistant)` join table; scope all existing domain tables with `team_id`
- AR3: Add `GroupCoach(user_id, group_id, role: main|assistant)` join table; deprecate `TrainingGroup.coach_id` (keep column for migration, stop using it in queries)
- AR4: Redesign JWT payload to `{sub, role, active_team_id}`; add `POST /api/v1/auth/switch-team` endpoint that issues a new token; update `/auth/me` response to include `active_team_id`
- AR5: Add `verify_team_access(user, team_id)` FastAPI dependency; apply to every new team-scoped route; add `get_optional_user` dependency stub (used Sprint 3, define now)
- AR6: Write a one-time data migration script that inserts a `Team` row for the existing Huji team and assigns `team_id` to all existing rows (GroupWorkout, Race, HallOfFame, etc.)
- AR7: Remove `_refresh_all_hall_of_fame()` call from `main.py` startup; replace with event-driven helper `refresh_team_hall_of_fame(db, team_id)` called on result insert/delete (Sprint 1 — but stub must be planned in Sprint 0 HoF model split)
- AR8: `team_id` must be the first column in every new composite index; all new model files imported in `main.py` with `# noqa: F401`
- AR9: Add `structlog` structured logging as minimum viable observability (Sprint 1, but install in Sprint 0 baseline)

### UX Design Requirements

No UX design document exists. UI requirements for Sprint 0 are minimal — only the team creation flow (FR-M) has a new page. UX is mobile-first and consistent with existing Tailwind v4 + React patterns.

UX-DR1: `TeamSetupPage.jsx` — coach self-service team creation form (name, description, sport, location); mobile-first layout; on submit → navigate to the new team's dashboard
UX-DR2: `AuthContext.jsx` — add `active_team_id` to stored user state; expose `switchTeam(team_id)` that requests a new JWT and calls `refreshUser()`
UX-DR3: Team context indicator in `AppShell` header — show active team name; clicking it opens a team switcher for coaches in multiple teams (Sprint 0 stub; full switcher Sprint 1)

### FR Coverage Map

| FR | Sprint | Epic (planned) |
|---|---|---|
| FR-M (team creation) | 0 | Epic 3 |
| FR-E (multi-coach) | 1 | TBD |
| FR-B1, B2 (reporting) | 1 | TBD |
| FR-L (log comments) | 1 | TBD |
| FR-P basic (race scopes) | 1 | TBD |
| FR-A (templates) | 2 | TBD |
| FR-C (load warnings) | 2 | TBD |
| FR-F (push notifications) | 2 | TBD |
| FR-G (charts) | 2–3 | TBD |
| FR-I (Strava) | 2 | TBD |
| FR-H (goals) | 3 | TBD |
| FR-K (public profile) | 3 | TBD |
| FR-Q (race calendar) | 3 | TBD |
| FR-N (UX polish) | 1–2 | TBD |

## Epic List

### Epic 1: Alembic Migration System
Developers can safely evolve the database schema through versioned, reversible migrations — replacing the error-prone manual `ALTER TABLE` / `_migrate_*` pattern in `main.py`. Every future sprint's schema work depends on this being in place first.
**Technical requirements covered:** AR1, AR9
**User outcome:** No user-visible change, but production schema changes can now be deployed safely and rolled back if needed.

### Epic 2: Multi-Team Data Foundation
The platform supports multiple isolated teams. Every domain table is scoped by `team_id`, the `GroupCoach` join table replaces the old `coach_id` column, and the existing Huji team's data is migrated into the new structure without data loss.
**Technical requirements covered:** AR2, AR3, AR5, AR6, AR7 (stub), AR8
**User outcome:** Existing Huji team operates exactly as before, but the database is now ready to host a second team without any data leaking between them.

### Epic 3: Coach Self-Service & Contextual Auth
Any coach can register on the platform, create a team, and receive a JWT scoped to their active team. The frontend shows the active team context and allows switching. Existing Huji users get their sessions upgraded transparently.
**FRs covered:** FR-M
**Technical requirements covered:** AR4, UX-DR1, UX-DR2, UX-DR3
**User outcome:** A second coach can sign up, create their team, and start inviting athletes — without any manual intervention from Yehonatan.

### FR Coverage Map

| Requirement | Epic | Description |
|---|---|---|
| AR1 | Epic 1 | Alembic setup + baseline migration |
| AR9 | Epic 1 | structlog install |
| AR2 | Epic 2 | Team + TeamMembership models |
| AR3 | Epic 2 | GroupCoach join table |
| AR5 | Epic 2 | verify_team_access dependency |
| AR6 | Epic 2 | Existing Huji data migration script |
| AR7 | Epic 2 | HoF event-driven refresh stub |
| AR8 | Epic 2 | team_id indexing convention enforced |
| FR-M | Epic 3 | Coach self-service team creation |
| AR4 | Epic 3 | JWT active_team_id redesign |
| UX-DR1 | Epic 3 | TeamSetupPage |
| UX-DR2 | Epic 3 | AuthContext active_team_id |
| UX-DR3 | Epic 3 | AppShell team indicator |

<!-- Stories to be written in step-03 -->

---

## Epic 1: Alembic Migration System

Developers can safely evolve the database schema through versioned, reversible migrations — replacing the error-prone manual `ALTER TABLE` / `_migrate_*` pattern in `main.py`. Every future sprint's schema work depends on this being in place first.

### Story 1.1: Install and Configure Alembic

As a **developer**,
I want Alembic installed and configured to work with our SQLAlchemy models and both SQLite (dev) and Postgres (prod),
So that I have a single migration tool that works in all environments.

**Acceptance Criteria:**

**Given** the backend virtualenv is active
**When** `alembic upgrade head` is run against a fresh SQLite dev.db
**Then** the command completes without error and all current tables exist

**Given** `alembic.ini` and `backend/alembic/env.py` are in place
**When** `env.py` imports `Base` from `backend/app/models/`
**Then** all registered models are visible to Alembic's autogenerate

**Given** the `DATABASE_URL` environment variable is set to a Postgres URL
**When** `alembic upgrade head` is run
**Then** the command completes without error on Postgres

---

### Story 1.2: Generate Baseline Migration from Current Schema

As a **developer**,
I want a versioned Alembic migration that captures the exact current database schema,
So that all future schema changes are tracked relative to a known starting point.

**Acceptance Criteria:**

**Given** the current `dev.db` schema (all existing tables and columns)
**When** the baseline migration is run on an empty database
**Then** all existing tables are created with all existing columns, constraints, and indexes

**Given** the baseline migration exists
**When** `alembic current` is run
**Then** it shows the baseline revision as the current head

**Given** the baseline migration exists
**When** `alembic history` is run
**Then** it shows exactly one migration (the baseline)

---

### Story 1.3: Remove Legacy Migration Functions from main.py

As a **developer**,
I want all `_migrate_sqlite()`, `_migrate_group_workout_columns()`, `_migrate_individual_target_columns()`, `_migrate_race_is_manual()` functions removed from `main.py`,
So that there is one canonical way to evolve the schema and the app starts faster.

**Acceptance Criteria:**

**Given** all legacy migration functions are removed
**When** the backend starts with an up-to-date database
**Then** the app starts without errors and no ALTER TABLE statements run at startup

**Given** the functions are removed
**When** a developer searches `main.py` for `_migrate`
**Then** no results are found

**And** the Alembic baseline migration covers every column that the old functions were adding

---

### Story 1.4: Install structlog for Structured Logging

As a **developer**,
I want `structlog` installed and configured as the standard logger,
So that all future log output is structured JSON and queryable on Render's log dashboard.

**Acceptance Criteria:**

**Given** structlog is installed and configured in `main.py`
**When** any FastAPI request is handled
**Then** the log output includes at minimum: `timestamp`, `level`, `event`, `method`, `path`

**Given** structlog is configured
**When** an exception occurs in a route handler
**Then** the structured log includes the exception message and traceback

**And** existing `print()` statements in routers are replaced with `log.info()` / `log.error()` calls

---

## Epic 2: Multi-Team Data Foundation

The platform supports multiple isolated teams. Every domain table is scoped by `team_id`, the `GroupCoach` join table replaces the old `coach_id` column, and the existing Huji team's data is migrated into the new structure without data loss.

### Story 2.1: Team and TeamMembership Models

As a **developer**,
I want `Team` and `TeamMembership` SQLAlchemy models created with their Alembic migration,
So that the database can represent multiple independent organizations.

**Acceptance Criteria:**

**Given** the migration is applied
**When** the schema is inspected
**Then** a `teams` table exists with columns: `id`, `name`, `description`, `location`, `sport`, `is_public` (Boolean, default false), `created_by_id` (FK → users), `created_at`

**And** a `team_memberships` table exists with columns: `id`, `user_id` (FK → users), `team_id` (FK → teams), `role` (VARCHAR, values: `main`/`assistant`), with a unique constraint on `(user_id, team_id)`

**Given** both models exist
**When** `main.py` is imported
**Then** both models are imported with `# noqa: F401` and `Base.metadata` includes both tables

---

### Story 2.2: GroupCoach Join Table

As a **developer**,
I want a `GroupCoach` join table created with its Alembic migration,
So that multiple coaches can be assigned to a training group with distinct roles, replacing the single `TrainingGroup.coach_id` column.

**Acceptance Criteria:**

**Given** the migration is applied
**When** the schema is inspected
**Then** a `group_coaches` table exists with columns: `id`, `user_id` (FK → users), `group_id` (FK → training_groups), `role` (VARCHAR: `main`/`assistant`), with a unique constraint on `(user_id, group_id)`

**And** `TrainingGroup.coach_id` column still exists (kept for migration safety — not yet removed)

**Given** the model exists
**When** a query checks a user's role in a group
**Then** it reads from `group_coaches`, not `training_groups.coach_id`

---

### Story 2.3: Add team_id to All Domain Tables

As a **developer**,
I want an Alembic migration that adds a nullable `team_id` column (FK → teams) to every existing domain table,
So that all data can be scoped to a team without breaking existing rows before the data migration runs.

**Acceptance Criteria:**

**Given** the migration is applied
**When** each of these tables is inspected: `training_groups`, `group_workouts`, `individual_targets`, `workout_logs`, `races`, `heats`, `results`, `hall_of_fame`, `announcements`, `race_registrations`
**Then** each has a nullable `team_id` column (FK → teams, ON DELETE SET NULL)

**And** `team_id` is the first column in all new composite indexes on these tables

**And** existing rows have `team_id = NULL` (populated by Story 2.5)

---

### Story 2.4: verify_team_access Dependency

As a **developer**,
I want a `verify_team_access(user, team_id, db)` FastAPI dependency and a `get_optional_user` dependency defined in `dependencies.py`,
So that all team-scoped routes have a consistent, tested access check and public routes have an opt-in no-auth pattern.

**Acceptance Criteria:**

**Given** a user who is a member of team A
**When** `verify_team_access(user, team_id=A)` is called
**Then** it returns without raising

**Given** a user who is NOT a member of team B
**When** `verify_team_access(user, team_id=B)` is called
**Then** it raises `HTTPException(status_code=403)`

**Given** a request with no `Authorization` header
**When** a route uses `Depends(get_optional_user)`
**Then** the handler receives `user=None` (no 401 raised)

**Given** a request with a valid JWT
**When** a route uses `Depends(get_optional_user)`
**Then** the handler receives the authenticated user object

---

### Story 2.5: Existing Huji Team Data Migration

As a **platform operator**,
I want a one-time Alembic data migration that seeds the existing Huji team and assigns `team_id` to all existing rows,
So that the live app continues to work correctly after the schema migration with no manual database edits.

**Acceptance Criteria:**

**Given** the schema migrations (2.1–2.3) have run and `team_id` columns are NULL
**When** the data migration runs
**Then** a single `Team` row exists with name "Huji Run" and `created_by_id` = Yehonatan's user ID

**And** every existing row in `training_groups`, `group_workouts`, `individual_targets`, `workout_logs`, `races`, `heats`, `results`, `hall_of_fame`, `announcements`, `race_registrations` has `team_id` set to the Huji team's ID

**And** every existing `User` with `role = "coach"` has a `TeamMembership` row linking them to the Huji team

**And** running the migration a second time is safe (idempotent — checks if team already exists before inserting)

---

### Story 2.6: Event-Driven Hall of Fame Refresh

As a **developer**,
I want `_refresh_all_hall_of_fame()` removed from `main.py` startup and replaced with a `refresh_team_hall_of_fame(db, team_id)` helper called on result insert/delete,
So that HoF data stays accurate without an expensive full scan on every app cold start.

**Acceptance Criteria:**

**Given** the refactor is complete
**When** `main.py` is imported
**Then** no `_refresh_all_hall_of_fame()` call exists at module level

**Given** a new `Result` row is inserted
**When** the insert endpoint returns 200
**Then** `refresh_team_hall_of_fame(db, team_id)` has been called for that result's team

**Given** a `Result` row is deleted
**When** the delete endpoint returns 200
**Then** `refresh_team_hall_of_fame(db, team_id)` has been called

**And** the existing HoF data for the Huji team is correct after the migration (no startup refresh needed because data migration in Story 2.5 guarantees consistency)

---

## Epic 3: Coach Self-Service & Contextual Auth

Any coach can register on the platform, create a team, and receive a JWT scoped to their active team. The frontend shows the active team context and allows switching. Existing Huji users get their sessions upgraded transparently.

### Story 3.1: JWT Redesign with active_team_id

As a **coach or athlete**,
I want my login token to include my active team context,
So that every API request is automatically scoped to the right team without sending a separate team ID parameter.

**Acceptance Criteria:**

**Given** a user logs in via `POST /auth/login`
**When** the JWT is issued
**Then** the payload contains `{sub, role, active_team_id}` where `active_team_id` is the user's primary team ID (or `null` for users not yet in a team)

**Given** a coach belongs to multiple teams
**When** they call `POST /api/v1/auth/switch-team` with `{"team_id": X}`
**Then** a new JWT is returned with `active_team_id = X`

**Given** a request with an old JWT (no `active_team_id` field)
**When** it reaches any existing endpoint
**Then** it is handled gracefully — old tokens treated as `active_team_id = null` without a 401

**And** `GET /auth/me` response includes `active_team_id`

---

### Story 3.2: Team Creation API

As a **coach**,
I want to create a new team via the API,
So that I can set up my club on the platform without any admin involvement.

**Acceptance Criteria:**

**Given** a user with `role = "coach"`
**When** they call `POST /api/v1/teams/` with `{name, description, sport, location}`
**Then** a `Team` row is created with `created_by_id = user.id`

**And** a `TeamMembership` row is created with `role = "main"` linking the coach to the new team

**And** the response includes the new team's `id`, `name`, and a fresh JWT with `active_team_id` set to the new team

**Given** a user with `role = "athlete"`
**When** they call `POST /api/v1/teams/`
**Then** the response is `403 Forbidden`

**Given** `name` is missing or empty
**When** `POST /api/v1/teams/` is called
**Then** the response is `422 Unprocessable Entity` with a validation error

---

### Story 3.3: AuthContext active_team_id Update

As a **frontend developer**,
I want `AuthContext` to store and expose `active_team_id` and a `switchTeam(team_id)` function,
So that all frontend components can read the active team and coaches can switch between teams without relogging.

**Acceptance Criteria:**

**Given** a user logs in
**When** `AuthContext` processes the `/auth/me` response
**Then** `user.active_team_id` is stored in `localStorage` and available via `useAuth()`

**Given** a coach calls `switchTeam(team_id)`
**When** the switch-team API returns a new JWT
**Then** the new token is stored, `refreshUser()` is called, and `user.active_team_id` reflects the new team

**Given** an athlete (single team)
**When** they log in
**Then** `active_team_id` is set automatically — no team switcher shown to them

---

### Story 3.4: TeamSetupPage — Coach Self-Service Team Creation

As a **coach**,
I want a dedicated page where I can fill in my team's details and create it,
So that I can onboard my club to the platform in under 2 minutes.

**Acceptance Criteria:**

**Given** a coach navigates to `/team/setup`
**When** the page loads
**Then** a mobile-first form is shown with fields: Team Name (required), Sport/Discipline, Location (city), Description, and a "Create Team" button

**Given** the coach submits a valid form
**When** the API returns success
**Then** the coach is redirected to their team's dashboard with the new team active

**Given** the coach submits with an empty Team Name
**When** validation runs
**Then** an inline error is shown and the form is not submitted

**Given** a user with `role = "athlete"` navigates to `/team/setup`
**When** the page loads
**Then** they are redirected away (coach-only route)

---

### Story 3.5: AppShell Active Team Indicator

As a **coach in multiple teams**,
I want to see my active team name in the app header and be able to switch teams,
So that I always know which team's data I'm viewing and can change context without logging out.

**Acceptance Criteria:**

**Given** any authenticated user
**When** the AppShell header renders
**Then** the active team name is displayed alongside the existing header content

**Given** a coach who belongs to more than one team
**When** they tap the team name in the header
**Then** a team switcher dropdown/modal appears listing all their teams

**Given** the coach selects a different team from the switcher
**When** `switchTeam()` completes
**Then** the header updates to show the new team name and the page refreshes to show that team's data

**Given** an athlete (one team only)
**When** the AppShell renders
**Then** the team name is shown as static text with no switcher interaction
