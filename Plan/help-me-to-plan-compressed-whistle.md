# Running Club Management App — Implementation Plan

## Context

A full-stack web application for managing a running club. Two roles: Athlete (daily training log, race archive, personal bests) and Coach (publish workouts, enter races, track team completion). The repo is currently empty — this plan covers building it from scratch.

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Backend | Python + FastAPI | Async, auto-docs, Pydantic validation |
| Frontend | React + Vite + Tailwind CSS | Mobile-first, component reuse |
| Database | SQLite (dev) → PostgreSQL (prod) | Relational, Alembic migrations |
| ORM | SQLAlchemy | Works with both DBs |
| Auth | JWT (python-jose + passlib bcrypt) | Stateless, role in token |

---

## Project Structure

```
huji-run/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, router registration
│   │   ├── config.py          # Settings (DATABASE_URL, JWT_SECRET)
│   │   ├── database.py        # SQLAlchemy engine + SessionLocal
│   │   ├── dependencies.py    # get_current_user(), require_coach()
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── workout.py     # GroupWorkout, IndividualTarget, WorkoutLog
│   │   │   ├── race.py        # Race, Heat, Result
│   │   │   └── hall_of_fame.py
│   │   ├── schemas/           # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── calendar.py
│   │   │   ├── races.py
│   │   │   ├── leaderboard.py
│   │   │   ├── profile.py
│   │   │   └── coach.py
│   │   └── services/
│   │       ├── time_utils.py      # parse_time(), format_pace()
│   │       └── hall_of_fame.py    # refresh_hall_of_fame()
│   ├── alembic/               # DB migrations
│   ├── requirements.txt
│   └── seed.py
└── frontend/
    ├── src/
    │   ├── api/               # axios client + per-feature modules
    │   ├── contexts/AuthContext.jsx
    │   ├── pages/
    │   │   ├── athlete/       # Calendar, RaceArchive, HallOfFame, Profile
    │   │   └── coach/         # WorkoutPublisher, IndividualTargets, Dashboard, RaceWizard
    │   └── components/        # Reusable UI pieces
    ├── tailwind.config.js
    └── vite.config.js
```

---

## Database Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | PK | |
| full_name | VARCHAR(150) | Must match coach-entered names exactly |
| username | VARCHAR(80) UNIQUE | Login handle |
| password_hash | VARCHAR(255) | bcrypt |
| gender | ENUM('M','F') | Used for leaderboard splits |
| role | ENUM('athlete','coach') | Controls access |

### `group_workouts`
| Column | Type | Notes |
|--------|------|-------|
| id | PK | |
| date | DATE UNIQUE | One per day |
| content | TEXT | |
| created_by | FK → users.id | |

### `individual_targets`
| Column | Type | Notes |
|--------|------|-------|
| id | PK | |
| athlete_id | FK → users.id | |
| date | DATE | |
| note | TEXT | |
Unique: `(athlete_id, date)`

### `workout_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | PK | |
| athlete_id | FK → users.id | |
| date | DATE | |
| completed | BOOLEAN | |
| notes | TEXT | |
Unique: `(athlete_id, date)`

### `races`
| Column | Type | Notes |
|--------|------|-------|
| id | PK | |
| name | VARCHAR(200) | |
| race_date | DATE | |
| created_by | FK → users.id | |

### `heats`
| Column | Type | Notes |
|--------|------|-------|
| id | PK | |
| race_id | FK → races.id CASCADE | |
| distance_m | INTEGER | One of: 1500, 3000, 5000, 10000, 21100, 42200 |
| label | VARCHAR(100) | e.g. "Elite Heat", "Open" |

### `results`
| Column | Type | Notes |
|--------|------|-------|
| id | PK | |
| heat_id | FK → heats.id CASCADE | |
| athlete_name | VARCHAR(150) | Free text as entered by coach |
| user_id | FK → users.id NULLABLE | Auto-resolved by name match at insert |
| gender | ENUM('M','F') | From user profile if matched, else required |
| time_seconds | INTEGER | Canonical storage for sorting |

### `hall_of_fame` (materialized cache)
| Column | Type | Notes |
|--------|------|-------|
| id | PK | |
| distance_m | INTEGER | |
| gender | ENUM('M','F') | |
| rank | INTEGER | 1, 2, or 3 |
| user_id | FK → users.id NULLABLE | |
| athlete_name | VARCHAR(150) | |
| time_seconds | INTEGER | |
| race_id | FK → races.id | |
| achieved_date | DATE | |
Unique: `(distance_m, gender, rank)`

---

## API Routes (all under `/api/v1`)

### Auth
- `POST /auth/register` — public; creates athlete account
- `POST /auth/login` — returns JWT token + role
- `GET /auth/me` — current user info

### Calendar
- `GET /calendar/week?date=` — 7-day data for logged-in athlete (group workout, personal target, own log)
- `POST /calendar/log` — athlete submits completion + notes
- `PUT /calendar/group/{date}` — coach upserts group workout
- `PUT /calendar/targets/{athlete_id}/{date}` — coach upserts personal note

### Races
- `GET /races?search=&year=` — paginated list
- `GET /races/{id}/results?distance_m=` — per-heat results with placement + pace computed at query time
- `GET /races/{id}/leaderboard?distance_m=` — merged M/F tables across all heats
- `POST /races` — coach creates race (step 1)
- `POST /races/{id}/heats` — coach adds heat (step 2)
- `POST /races/{id}/heats/{hid}/results` — coach adds result; triggers HoF refresh (step 3)

### Leaderboard
- `GET /hall-of-fame` — all 36 slots (6 distances × 2 genders × 3 ranks)

### Profile
- `GET /profile/me` — PBs (computed from results) + chronological race history

### Coach
- `GET /coach/athletes` — full athlete list
- `GET /coach/athletes/search?q=` — autocomplete (name prefix, limit 10)
- `GET /coach/dashboard/week?date=` — all athletes × 7 days grid

---

## Core Logic

### Time Parsing (`services/time_utils.py`)
```python
# "18:45" → 1125,  "1:23:45" → 5025
def parse_time(s: str) -> int:
    parts = s.strip().split(":")
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    raise ValueError(f"Invalid time format: {s}")

def format_pace(time_seconds: int, distance_m: int) -> str:
    pace = time_seconds / (distance_m / 1000)
    return f"{int(pace // 60)}:{int(pace % 60):02d}"
```

### Placement — computed with window function, never stored
```python
rank_col = func.rank().over(
    partition_by=Result.heat_id,
    order_by=Result.time_seconds.asc()
).label("placement")
```

### Athlete Name Matching — case-insensitive, at result insert time
```python
user = db.query(User).filter(
    func.lower(User.full_name) == func.lower(athlete_name.strip())
).first()
result.user_id = user.id if user else None
result.gender = user.gender if user else provided_gender
```

### Hall of Fame Refresh — called after every result insert
```python
def refresh_hall_of_fame(db, distance_m: int, gender: str):
    top3 = (db.query(Result, Heat, Race)
        .join(Heat).join(Race)
        .filter(Heat.distance_m == distance_m, Result.gender == gender)
        .order_by(Result.time_seconds.asc())
        .limit(3).all())
    db.query(HallOfFame).filter_by(distance_m=distance_m, gender=gender).delete()
    for rank, (result, heat, race) in enumerate(top3, 1):
        db.add(HallOfFame(distance_m=distance_m, gender=gender, rank=rank, ...))
    db.commit()
```

### Personal Bests — computed on-the-fly from results (no separate table)
```python
db.query(Heat.distance_m, func.min(Result.time_seconds))
  .join(Result).filter(Result.user_id == user_id)
  .filter(Heat.distance_m.in_(CANONICAL_DISTANCES))
  .group_by(Heat.distance_m).all()
```

---

## Build Phases

| Phase | Scope | Deliverable |
|-------|-------|-------------|
| 1 | Backend bootstrap: DB + auth | Register/login working with JWT |
| 2 | Race data model + coach entry wizard | Coach can create races end-to-end; HoF auto-populates |
| 3 | All athlete-facing read APIs | /races, /hall-of-fame, /profile/me tested |
| 4 | Calendar APIs (both roles) | Weekly view, log submission, coach notes |
| 5 | Frontend bootstrap + auth | React app, login/register, routing by role |
| 6 | Athlete screens (4) | HoF → Profile → Race Archive → Calendar |
| 7 | Coach screens (4) | Workout Publisher → Targets → Dashboard → Race Wizard |
| 8 | Polish | Mobile-first Tailwind, loading/error states, seed data |
| 9 | Production prep | PostgreSQL switch, .env, Dockerfile (optional) |

---

## Confirmed Decisions

1. **Coach account** — One hardcoded coach account seeded on first run: `username: yonzra12@gmail.com`, password hashed from `huji_run_manager`. All other registrations create athlete accounts.
2. **UI language** — English (LTR layout).
3. **Frontend** — React + Vite + Tailwind CSS.
4. **Name matching** — Case-insensitive exact match (as specced).

---

## Verification Checklist

- [ ] `POST /auth/register` creates athlete with hashed password
- [ ] `POST /auth/login` returns valid JWT, role encoded in payload
- [ ] `POST /races` + `POST /races/{id}/heats` + `POST results` end-to-end: HoF table has 3 rows per distance/gender after 3+ results entered
- [ ] `GET /races/{id}/results` returns results sorted fastest-first with correct placement numbers and pace strings
- [ ] `GET /hall-of-fame` reflects new result within same request after insert
- [ ] `GET /profile/me` returns correct PBs and history for athlete with linked results
- [ ] Calendar weekly view returns correct shape; log submission upserts correctly
- [ ] Coach dashboard shows all athletes with correct completion status for current week
- [ ] React app redirects unauthenticated users to /login; coach routes blocked for athletes
- [ ] All screens render correctly on 375px mobile viewport
