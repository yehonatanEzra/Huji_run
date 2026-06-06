# Huji Run 

A web app for managing a running club - built specifically for the Hebrew University track and field team (huji_run).

## Why I built it

I'm an athlete and one of the coaches of huji_run, the Hebrew University track and field team. Day-to-day, we kept running into the same problems: weekly training programs scattered across WhatsApp messages, race results lost in old screenshots, personal bests no one could remember, and no easy way for a coach to see who actually did the work that week. I wanted a single place where everything - workouts, races, records, motivation - lives together, so the team can focus on training instead of chasing information.

This app is the result. It's used both by athletes to follow their training and by coaches to plan, monitor, and motivate the group.

---

## Athlete features

### Training calendar

Every athlete sees a calendar with the workout for each day. Two layers appear on the same day:

- **Group workout:**  written by the coach for the whole training group.
- **Personal note:**  a per-athlete instruction the coach can pin to a specific day (e.g. "easy run only, you raced yesterday").

After each session, the athlete reports the workout with one of three statuses (**completed**, **half-completed**, or **missed) ** along with the distance in km and free-text notes ("legs felt heavy", "perfect tempo", etc.).

- All Races: every race the club has ever participated in, searchable.
- My Races:  only the races the athlete personally ran in.
- Each race page has tabs for **Heats** (sorted by time, with auto-calculated pace per km) and **Overall** (combined men's and women's leaderboards across all heats of the same distance).
- **Race scopes:** a race can be **global** (visible to everyone and eligible for the Hall of Fame), **group** (visible to the training group), or **personal** (visible to the athlete and coaches). Coaches pick the scope when creating a race.

### Races

### Hall of Fame

The club's all-time top runners, separated by gender, across standard distances: 1500m, 3000m, 5000m, 10K, half marathon, full marathon. Records update automatically whenever a new result beats a previous PB. There's also a **weekly and monthly km leaderboard** showing who's putting in the most volume right now.

### Profile

Personal page with:

- Personal Bests across all distances
- Race history (every race the athlete ran, chronological)
- Profile photo
- Membership info

### Team Feed

A shared feed where coaches post announcements (training cancellations, race info, motivation). Anyone can react with emojis (👍 🔥 💪 👎 😢) and add comments. Coaches can post; everyone can engage.

### Health & Wellness directory

A community-maintained directory of sports-medicine professionals (physiotherapists, masseuses, chiropractors, orthopedists). Any user can add a practitioner. Anyone can leave a 1–5 star rating and a written review. Filterable by city and specialty. The directory is global - every club, every athlete, can benefit from the shared list.

### Back navigation

A persistent back arrow in the header on every sub-page so navigation feels natural on mobile.

---

## Coach features

The coach has all the athlete features above, plus:

### Tracking Dashboard

A weekly grid view of **every athlete's training**. Each cell is a colored circle:

- Green = completed, yellow = half-completed, red = missed, gray = no report
- Inside the circle: the **km** the athlete logged.
- Indicators for personal targets and reactions
- Weekly total km per athlete in the rightmost column

Click any cell to open a detailed editor for that day (group workout + athlete's report + personal note).

### Athlete profiles

Clicking an athlete's name opens a deep profile view with:

- Stats (completed / missed / completion rate)
- **Toggle between week and month view** - month view is a calendar grid (4-5 rows × 7 days) showing the full month at a glance with status colors, km, and personal target indicators
- Weekly/monthly km volume
- Every day is clickable to edit the workout / log / personal note
- Personal Bests (with a built-in PB editor - manual entry or linked to a race)
- Race history

### Reactions on workouts

On every athlete report, the coach can react with 👏 (clap), ❤️ (heart), or 👎 (dislike) to give quick feedback or kudos. Reactions are visible to the athlete.

### Workout publisher

Write group workouts for any training group, any day. The workout instantly appears on every athlete in that group's calendar.

### Individual targets

Pick an athlete, pick a week, and write personal notes for specific days — visible only to that athlete (or shown instead of the group workout if marked as override).

### Race wizard

A multi-step form to add a new race:

1. Name + date
2. Add heats (pick official distance + custom heat name)
3. Add results per heat (athlete name autocompletes from the registered users, time entered as `HH:MM:SS` or `MM:SS`, pace and PBs calculated automatically)

Existing races can also be edited.

### Group management

Create training groups, rename them, add and remove members, delete groups. Filter dashboards and the Hall of Fame by group.

### Athlete management

Edit athlete names, delete inactive members, view per-athlete profiles.

### Feed posting

Post announcements to the team feed, optionally targeted to a single training group. Coach posts are highlighted.

### Moderation in Health & Wellness

Only coaches can edit or delete entries in the Health & Wellness directory, keeping the shared database clean.

### Workout plan templates

Write a multi-week training block once and reuse it across seasons. A template is a **week × weekday grid** — pick a workout type and fill in the details for each day. Apply a template to any group from a start date and every workout populates the calendar automatically (the start date snaps to its Monday). Re-applying over dates that already have workouts asks for confirmation before replacing them. Templates are private to the coach who created them.

### Reporting overview

A dedicated page showing, for each athlete, **how consistently they're logging** — days reported out of the week, response-rate %, filterable by group and week, with the least-active athletes surfaced first. One click sends a push reminder to everyone who's been silent for a chosen number of days.

### Load management warnings

A **Load** tab that tracks each athlete's weekly km and flags anyone whose volume **spikes week-over-week** beyond a configurable threshold (default 30%). Each athlete shows their current km, the % change versus last week, and a four-week sparkline; spiking athletes are highlighted.

### Team analytics

A coach analytics page with three charts, filterable by group:

- **Weekly volume** — total, average per athlete, or a per-athlete multi-line view, with the latest week-over-week % change shown inline
- **Logging completion rate** over time
- **Planned workout-type breakdown** (how much easy / tempo / intervals / long the group is doing)

### Multi-coach groups

A group has one **main coach** plus any number of **assistant coaches**. The main coach can add or remove assistants and transfer ownership of the group. This lets several coaches share a group without stepping on each other.

### Teams

The platform is organized into **teams**. A coach can create a team and manage its groups and athletes; data is scoped per team so multiple clubs can run independently on the same platform. Coaches who belong to more than one team can switch the active team from the header.
