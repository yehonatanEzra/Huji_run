---
title: Huji Run — Product Requirements Document
status: draft
created: 2026-06-06
updated: 2026-06-06
project: Huji_run
---

# Huji Run — PRD

## 1. Product Overview

Huji Run is a web platform (with a future mobile app) for managing organized running teams. It serves coaches and athletes within structured club environments — tracking workouts, races, personal bests, and team performance.

The current version is live and in use by a single team (~100 users). The next phase transforms it into a **multi-team platform** where any coach can self-register, create a team, and manage athletes — targeting 100,000+ users across many clubs and universities.

**Vision:** The most comfortable tool for coaches to manage their athletes and for athletes to follow their training — better than TrainingPeaks and Final Surge on UX, built for the club/university running world.

---

## 2. Users & Roles

### 2.1 Platform Roles

| Role | Description |
|---|---|
| **Athlete** | Follows their training calendar, logs workouts, registers for races, tracks progress |
| **Coach member** | Holds a coach account; can create or join groups as main coach or assistant |
| **Main group coach** | Creates and owns a training group; full access to all group athletes |
| **Assistant coach** | Added to a group by the main coach; limited access (view logs, add notes to personal athletes) |
| **Admin** | Platform-level superuser; verifies race results globally, removes/renames users, deletes groups |

### 2.2 Key Constraints

- Each athlete has **one personal coach** (the coach who confirmed their registration)
- Each group has **one main coach** (the creator) and any number of assistant coaches
- An athlete's personal coach must be a main or assistant coach of the athlete's group to write individual override workouts
- A personal coach who is NOT in the athlete's group can still **view** that athlete's logs and group workouts
- Coach members without a group can exist (pending assignment)

---

## 3. Registration & Onboarding

### 3.1 Athlete Registration Flow

1. Athlete signs up → selects a personal coach from the platform
2. Personal coach confirms (or coach proactively adds athlete)
3. If personal coach is NOT the main group coach → main group coach must also confirm
4. If personal coach IS the main group coach → one confirmation is enough
5. Athlete is now in the group and can see workouts

### 3.2 Coach Self-Service Onboarding

- Any user can register as a coach member (no admin needed)
- Coach creates a team/group → becomes main coach automatically
- Coach invites athletes via shareable link or email
- Athletes receive invitation and complete registration

### 3.3 Admin-Only Actions

- Remove a user's account globally
- Rename a member
- Delete a group
- Confirm race results for global visibility and Hall of Fame

---

## 4. Core Features (Existing — Maintained)

The following features exist today and are retained:

- **Training calendar** — group workouts + individual overrides + workout logging (completed/partial/missed + km + notes)
- **Workout publisher** — coach writes group workouts per training group per day
- **Individual targets** — personal workout notes per athlete per day; can override group workout
- **Tracking dashboard** — weekly grid of all athletes' status circles
- **Race archive** — past races with heats, results, pace calculation
- **Hall of Fame** — all-time top 3 per distance per gender; auto-updates on new PB
- **Team Feed** — announcements, emoji reactions, comments
- **Health & Wellness directory** — community-maintained sports medicine professional directory
- **Athlete & group management** — create/rename/delete groups, manage members
- **Challenges** — team challenges (left as-is, no changes in this phase)
- **Strava basic connection** — account linking exists; to be extended in FR-I

---

## 5. New Feature Requirements

### FR-A: Multi-Week Workout Plan Templates

**As a coach**, I want to write a training block once and reuse it across seasons without rewriting every day manually.

- Coach can create a named plan template (e.g. "Base Building — 6 weeks")
- Template contains workout entries per day (type, title, content)
- Coach applies a template to a group starting from a chosen date — workouts populate the calendar automatically
- Individual days can be edited after applying
- Templates are private to the coach who created them
- [ASSUMPTION] Templates are not shared between coaches in v1

---

### FR-B: Athlete Reporting Overview + Auto-Alerts

**B1 — Reporting overview page**

- Coach sees a dedicated page: which athletes reported this week vs. which haven't
- Shows per-athlete: days reported / total days, response rate %
- Filterable by group, by week
- Sortable by response rate (lowest first to surface laggards)

**B2 — Auto-alerts for non-logging athletes**

- System automatically flags athletes who haven't logged in N days (coach configures threshold)
- Alert visible on the coach dashboard
- Future: delivered as push notification (see FR-F)

---

### FR-C: Load Management Warnings

- System tracks each athlete's weekly km volume
- Warns coach when an athlete's load spikes significantly week-over-week (e.g. >30% increase) [ASSUMPTION: 30% threshold configurable]
- Warning shown to the coach on the reporting page's **Load** tab (per-athlete km, % vs prior week, spike flag, 4-week sparkline) — _[IMPLEMENTED 2026-06-06: surfaced on the dedicated Reporting → Load tab rather than the tracking dashboard / athlete profile; revisit if dashboard/profile placement is wanted later]_
- Integrates with FR-G charts (volume % change displayed inline on the team weekly-volume chart)

---

### FR-E: Multi-Coach Groups with Permission Levels

**Group structure:**
- Each group has one **main coach** (creator; full access)
- Main coach can add **assistant coaches** (view logs, add personal notes to their personal athletes only)
- Main coach can transfer ownership to an assistant if they leave
- If no assistants exist, main coach must delete the group before leaving

**Permission matrix:**

| Action | Main coach | Assistant coach | Personal coach (not in group) |
|---|---|---|---|
| Publish group workouts | ✅ | ❌ | ❌ |
| Write individual override workout | ✅ | ✅ (own athletes only) | ❌ |
| View athlete logs | ✅ (all athletes) | ✅ (all athletes in group, read-only) | ✅ (own athletes only) |
| Add personal notes | ✅ | ✅ (own athletes only) | ❌ |
| Remove athlete from group | ✅ | ✅ (own athletes only) | ❌ |
| React to workout logs (kudos) | ✅ | ✅ | ✅ |

- A coach can be assistant in **multiple groups simultaneously**.

---

### FR-F: Push Notifications

**Athlete notifications:**
- New group workout published for tomorrow
- Coach reacted to your workout log
- New feed announcement
- Coach confirmed your race registration

**Coach notifications:**
- Athlete logged their workout
- New athlete requested to join group
- B2 alert: N athletes haven't logged today

**Delivery:**
- Web: browser push notifications
- Mobile (future): native push when mobile app ships

[ASSUMPTION] Notification preferences are configurable per user (opt-out per type)

---

### FR-G: Advanced Charts & Analytics

**Athlete-level charts (visible to athlete + their coaches):**
- Weekly km volume bar chart (last 12 weeks)
- Week-over-week volume % change with highest month week highlighted
- Race performance over time per distance (trend line)
- Workout completion rate per week (% of days logged)
- Workout type breakdown per month (bar chart: tempo / easy / intervals / long / etc.)

**Team-level charts (coach dashboard page):**
- Volume chart per athlete in the group (small multiples or combined view)
- Team workout completion rate over time

---

### FR-H: Goal Setting

- Athletes can set personal goals: race goal (target time + distance + date), volume goal (target km/week), PB goal (target time for a distance)
- Coaches can set goals for their athletes
- Progress shown on athlete profile and in charts
- Goals linked to race registrations where applicable

---

### FR-I: Strava / Garmin Auto-Import

- Athlete connects Strava or Garmin account (Strava connection already partially built)
- After a GPS activity is recorded, it auto-fills the athlete's workout log for that day: distance (km), duration, average pace
- Import is silent — no athlete confirmation needed
- Only active when athlete has connected their account
- [ASSUMPTION] If multiple activities on the same day, import the longest one
- [ASSUMPTION] Garmin integration via Garmin Connect API (separate OAuth from Strava)

---

### FR-K: Public Team Profile Page

- Each team has a public page visible to non-users (no login required)
- Shows: team name, description, location, sport/discipline
- Shows: team Hall of Fame (top athletes per distance)
- Shows: recent race results (admin-verified global results only)
- "Join this team" CTA button → leads to athlete registration flow
- [ASSUMPTION] Coaches control whether their team profile is public or private

---

### FR-L: Workout Log Comments

- Coaches and athletes can leave text comments on a specific day's workout log
- Threaded: athlete can reply to coach comment
- Visible to the athlete + all coaches with access to that athlete
- Different from feed comments (those are on announcements) and kudos reactions (those are emoji-only)
- `WorkoutLogComment` model already exists in backend — extend to full feature

---

### FR-M: Coach Self-Service Team Creation

- Any registered user can upgrade to a coach account and create a team
- Team creation: name, description, sport/discipline, location (city)
- Creator becomes main coach automatically
- Invite athletes via: shareable join link, email invitation
- No admin approval needed for team creation
- Admin retains global moderation rights (delete groups, remove users)

---

### FR-N: Multi-Group Management (UX Polish)

- Coach can manage multiple training groups with different programs simultaneously
- Dashboard shows group selector at top level
- Workout publisher has clear group context (which group am I writing for?)
- Tracking dashboard filterable per group
- [ASSUMPTION] Existing multi-group data model is correct; this is UX/navigation work

---

### FR-P: Pre-Race Registration + Race Scopes + Admin Verification

**Race scopes:**
| Scope | Visible to | Hall of Fame eligibility |
|---|---|---|
| My race | Athlete + their coaches | No |
| Group race | Group members + coaches | No |
| Global race | All platform users | Yes (after admin verification) |

**Pre-race registration:**
- Coach creates upcoming race with heats in advance (extends existing Race Wizard)
- Athletes register for a specific heat from the race detail page
- Coach sees registered athletes before race day

**Result verification:**
- Coach enters results after race (existing flow)
- For global races: admin must verify results before they appear in global listing + Hall of Fame
- For PBs from global races: admin confirmation required for global PB to count
- Unverified results visible within group scope immediately

---

### FR-Q: Race Calendar / Schedule View

- Dedicated view showing upcoming races for the season (not results — future races)
- Coach adds upcoming races with: date, distance, location, scope (group/global)
- Athletes see their group's upcoming race schedule
- Athletes can mark "I'm planning to run this" (intent, not binding registration)
- Connects to FR-P: intent converts to registration when coach opens heat registration

---

## 6. Future Phase (Out of Scope for v2)

- **Mobile app** — native iOS + Android (React Native or equivalent); target: App Store / Play Store
- **AI coaching assistant** — reads training logs and gives personalized advice to coaches and athletes; deferred due to API cost
- **Freemium / subscriptions** — basic free tier for all; premium coach subscription for advanced features (to be defined when user base is established)
- **Garmin deep integration** — v2 covers Strava; Garmin added when Strava integration is stable
- **PB progression chart** — timeline of personal bests per distance per athlete

---

## 7. Non-Functional Requirements

- **Scale:** Support 100,000+ users across many teams. Current SQLite dev / Postgres prod setup; must remain Postgres-only in production.
- **Mobile-first UX:** All new UI must work comfortably on mobile browser (responsive). Designed with future native app conversion in mind.
- **Performance:** Calendar, dashboard, and chart pages must load in under 2s for groups of up to 200 athletes.
- **Privacy:** Athlete performance data is only visible to the athlete and their authorized coaches. Public team profiles show aggregate/verified data only.
- **Uptime:** Render free tier is acceptable for now; architecture must not depend on in-memory state or local disk (already enforced via DISABLE_PHOTO_UPLOADS).

---

## 8. Open Questions

1. **OQ-1:** Should assistant coaches be able to see ALL athletes in the group (read-only) or only their personal athletes? [ASSUMPTION: only their personal athletes for now]
2. **OQ-2:** Can a coach be assistant in multiple groups simultaneously?
3. **OQ-3:** What happens to an athlete's data if their personal coach leaves the platform?
4. **OQ-4:** For FR-A templates — should templates support variable duration (e.g. skip rest days automatically)?
5. **OQ-5:** For FR-I auto-import — what if the athlete already manually logged the workout before Strava syncs? Overwrite or merge?
6. **OQ-6:** For FR-K public profiles — should race results on the public page show athlete names, or anonymized?
