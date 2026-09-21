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
    {
        "position": 5,
        "title": "5 · Coach AI",
        "summary": "Your AI running coach — what it sees, and how it works.",
        "body": (
            "**What it is**\n"
            "Coach AI is a virtual running coach you can chat with. It is grounded in your own "
            "training — your plan, the workouts you logged, your personal bests and your races — so "
            "its answers are about you, not generic advice.\n\n"
            "**What it won't do**\n"
            "It gives advice only. It never changes your workouts, logs or plans, and it is not a "
            "substitute for medical advice — talk to your coach for real changes.\n\n"
            "Open a section below for how it works."
        ),
    },
]

# Subcards under the "5 · Coach AI" card. Seeded (idempotently, by title) once the
# parent exists; numbered 5.1, 5.2, … automatically in the UI.
AI_SUBCARDS = [
    {
        "title": "What it can see",
        "summary": "The training context behind every answer.",
        "body": (
            "**Always included**\n"
            "Every message carries a compact snapshot of your training, so the coach is grounded "
            "without you re-explaining:\n"
            "- Your profile — training group and coach.\n"
            "- The last 7 days of your log — planned vs. what you actually did.\n"
            "- Your personal bests.\n\n"
            "**Why not everything**\n"
            "Sending years of history in every message would be slow and expensive. Instead the "
            "coach gets a lean snapshot and pulls deeper history — weekly load, more of your log, "
            "your races — only when a question needs it. See Tools."
        ),
    },
    {
        "title": "Tools",
        "summary": "How the coach pulls deeper history on demand.",
        "body": (
            "The coach can call read-only tools to look further back when a question needs it. It "
            "decides when — you don't have to ask. Everyone gets the tools; premium reaches back "
            "further and can chain more of them in one answer.\n\n"
            "**get_load**\n"
            "Kilometres and number of runs per week over recent months — for spotting trends and load.\n\n"
            "**get_log**\n"
            "Your training log for a date range — the planned workout and what you actually reported. "
            "Free covers the last 3 weeks; premium reaches the full history (up to 120 days).\n\n"
            "**get_race_history**\n"
            "Your approved race results, most recent first.\n\n"
            "All three are read-only — the coach can look, never change."
        ),
    },
    {
        "title": "How a conversation works",
        "summary": "From your message to the coach's reply.",
        "body": (
            "**Each message**\n"
            "The coach receives its instructions, your training snapshot, and the conversation so "
            "far — then replies.\n\n"
            "**The tool loop**\n"
            "If it needs more history, it asks for a tool, reads the result, and continues — "
            "sometimes a few times — before answering.\n\n"
            "**Memory within a chat**\n"
            "Conversations are saved, so within a chat it remembers what you already discussed."
        ),
    },
    {
        "title": "The AI Notebook",
        "summary": "Memory that carries across conversations. Premium.",
        "body": (
            "The Notebook is a short, persistent memory the coach keeps about you — your goals, "
            "injuries and training patterns — so it remembers across separate conversations, not "
            "just within one chat.\n"
            "- It is short by design (about 1500 characters) — a summary, not a transcript.\n"
            "- You can read and edit it any time from the AI Notebook tab.\n"
            "- Or tap “Update with AI” to have the coach rewrite it from your latest chat.\n\n"
            "The Notebook is a premium feature."
        ),
    },
    {
        "title": "Free vs Premium",
        "summary": "What each tier includes.",
        "body": (
            "**Free**\n"
            "- 6 messages every 72 hours.\n"
            "- The read tools — weekly load, races, and the last 3 weeks of your log.\n\n"
            "**Premium**\n"
            "- Unlimited messages.\n"
            "- A smarter model, for deeper analysis.\n"
            "- Full training-log history, not just recent weeks.\n"
            "- The AI Notebook — memory across conversations.\n\n"
            "Premium is granted by an admin."
        ),
    },
    {
        "title": "Under the hood",
        "summary": "Summarization, and the models that run it.",
        "body": (
            "**Keeping context manageable**\n"
            "Long conversations are condensed automatically once they grow past a size threshold: "
            "older messages are folded into a running summary so the coach keeps the thread without "
            "the cost growing forever.\n\n"
            "**The models**\n"
            "Premium chat runs on a stronger OpenAI model; the free tier and background jobs like "
            "summarizing use a lighter, cheaper one — high quality where it matters, low cost where "
            "it doesn't."
        ),
    },
    {
        "title": "Admin control",
        "summary": "Tuning the coach without a code deploy.",
        "body": (
            "Every prompt the coach uses is editable by an admin in Admin → AI — no code change or "
            "deploy needed:\n"
            "- The system prompt — its persona and rules.\n"
            "- The summarizer and notebook-rewrite prompts.\n"
            "- The description of each tool.\n\n"
            "Edits take effect immediately. Any prompt left untouched uses a built-in default."
        ),
    },
    {
        "title": "Privacy & limits",
        "summary": "What it sees, and what it isn't.",
        "body": (
            "- The coach only ever sees your own training data.\n"
            "- Every tool is read-only — it can look, never change your plan, logs or results.\n"
            "- It gives advice only. For real changes to your training, talk to your coach.\n"
            "- It is not a substitute for medical advice."
        ),
    },
]
