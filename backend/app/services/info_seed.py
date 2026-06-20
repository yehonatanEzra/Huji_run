"""Default Info-page cards. Seeded once (if the table is empty) at startup so a
fresh deploy has a useful rulebook; afterwards the content is fully admin-editable
in the DB and this is never touched again."""

DEFAULT_SECTIONS = [
    {
        "position": 0,
        "title": "Overview",
        "summary": "What Huji Run is and who uses it.",
        "body": (
            "**What it is**\n"
            "Huji Run is a platform for managing running teams — planning workouts, "
            "reporting training, running races, and tracking progress. A coach creates a "
            "team and manages their athletes; athletes follow their plan and log what they "
            "actually did.\n\n"
            "**The three roles**\n"
            "- Athlete — follows a training plan, reports workouts, registers for races, reacts to posts.\n"
            "- Coach — plans workouts, manages athletes and groups, writes announcements, runs races, sees analytics.\n"
            "- Admin — everything a coach can do, plus platform-wide moderation and user management."
        ),
    },
    {
        "position": 1,
        "title": "1 · Coaches & athletes",
        "summary": "Joining a coach, leaving, being removed, and transfers.",
        "body": (
            "**Joining a coach**\n"
            "An athlete finds a coach on the Find Coach page and sends a request. The coach "
            "accepts or declines it. An athlete can have one personal coach at a time.\n\n"
            "**Athlete leaves a coach**\n"
            "An athlete can leave their coach from their Profile. Their past training log and "
            "history stay; future workouts from that coach are cleared, and they leave the "
            "coach's group. They can then join another coach.\n\n"
            "**Coach removes an athlete**\n"
            "A coach can stop coaching an athlete (Group → Athletes → ⋯ → Remove connection, or "
            "the Athletes tab in the nav). The athlete's past data stays, their future personal "
            "workouts are cleared, and they leave the group. Your roster only shows athletes "
            "whose personal coach is you.\n\n"
            "**Transfer to another coach**\n"
            "- A coach can hand an athlete to another coach of the same group.\n"
            "- It completes only after BOTH the destination coach AND the athlete approve.\n"
            "- On completion: the personal coach changes; the old coach's future personal workouts are cleared; the group and its group workouts stay unchanged.\n"
            "- Either party can decline, and the initiating coach can cancel while it is pending."
        ),
    },
    {
        "position": 2,
        "title": "2 · Groups & co-coaches",
        "summary": "Training groups, main vs assistant coaches, and membership.",
        "body": (
            "**What a group is**\n"
            "A training group is a set of athletes who share group workouts. An athlete belongs "
            "to one group at a time and can also have a personal coach.\n\n"
            "**Main vs assistant coach**\n"
            "Each group has one main coach (full control) and any number of assistant coaches "
            "(help program and track athletes). The main coach can transfer ownership to an assistant.\n\n"
            "**Inviting an assistant coach**\n"
            "The main coach invites a coach to co-coach the group. The invited coach must accept "
            "the invitation before they are added — invitations can be withdrawn while pending.\n\n"
            "**Adding athletes to a group**\n"
            "Only an athlete's personal coach can add them to a group. If the main coach adds, it "
            "is immediate; if an assistant adds, it waits for the main coach's approval.\n\n"
            "**Removing athletes from a group**\n"
            "The main coach can remove any athlete from the group. An assistant can remove only "
            "athletes they personally coach. Removing from a group keeps the coaching relationship "
            "— the athlete just has no group."
        ),
    },
    {
        "position": 3,
        "title": "3 · Workouts & training log",
        "summary": "Group vs personal workouts, types, and reporting.",
        "body": (
            "**Group vs personal workouts**\n"
            "Group workouts are written for a whole group on a date. A personal workout "
            "(individual target) is for one athlete on one day. A personal workout can override "
            "the group workout, or sit alongside it when there is none.\n\n"
            "**Notes**\n"
            "A coach can leave a standalone note on a day. The note is general — it is not tied to "
            "the group or personal workout — and the athlete always sees it when they open the day.\n\n"
            "**Workout types**\n"
            "Easy run, Tempo, Intervals, Long run, Fartlek, Race, Rest day, and Other (free text). "
            "Structured types (tempo / long / intervals / fartlek / race) have warm-up, main set, "
            "and cool-down.\n\n"
            "**Reporting a workout**\n"
            "Athletes log each day as Completed, Partial, or Missed, with the distance they ran. "
            "The coach sees these on the tracking grid.\n\n"
            "**Weekly volume**\n"
            "The training log shows the week's total distance (Sunday–Saturday) and the expected "
            "distance the coach planned."
        ),
    },
    {
        "position": 4,
        "title": "4 · Races, results & Hall of Fame",
        "summary": "Race visibility, registration, results, and records.",
        "body": (
            "**Race scopes**\n"
            "- Personal — visible to the creator and coaches/admins.\n"
            "- Group — visible to the group plus its coaches/admins.\n"
            "- Global — visible to everyone.\n\n"
            "**Registration & heats**\n"
            "Athletes register for upcoming races and can be placed into heats. A coach manages "
            "the race and its heats.\n\n"
            "**Results & moderation**\n"
            "Results can be pending or approved. Admins moderate races and results before they count.\n\n"
            "**Personal bests**\n"
            "A PB can come from a real race result or be entered manually by a coach. Manual PBs "
            "create a hidden race record behind the scenes so the result has something to attach to.\n\n"
            "**Hall of Fame**\n"
            "The Hall of Fame lists the top three times per distance and gender. Only results from "
            "global races count toward it."
        ),
    },
]
