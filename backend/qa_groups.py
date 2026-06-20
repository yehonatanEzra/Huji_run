"""Automated QA harness for coach / assistant-coach group features.

Drives the real FastAPI app via TestClient against a throwaway SQLite DB and
asserts the role-based behaviour from the QA plan. Run: python qa_groups.py
"""
import os
import tempfile

# Point the app at an isolated throwaway DB BEFORE importing it.
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)
PREFIX = "/api/v1"

results = []  # (section, name, passed, detail)


def check(section, name, passed, detail=""):
    results.append((section, name, bool(passed), detail))
    mark = "PASS" if passed else "FAIL"
    print(f"[{mark}] {section} — {name}" + (f"  ({detail})" if detail and not passed else ""))


def reg(full_name, username, role="athlete", gender="M"):
    r = client.post(f"{PREFIX}/auth/register", json={
        "full_name": full_name, "username": username, "password": "pw123456",
        "gender": gender, "role": role,
    })
    assert r.status_code in (200, 201), f"register {username}: {r.status_code} {r.text}"
    tok = r.json()["access_token"]
    me = client.get(f"{PREFIX}/auth/me", headers=H(tok)).json()
    return {"token": tok, "id": me["id"], "username": username}


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def pair(ath, coach):
    """Athlete requests a coach; coach accepts."""
    r = client.post(f"{PREFIX}/coach-requests", json={"coach_id": coach["id"]}, headers=H(ath["token"]))
    assert r.status_code in (200, 201), f"request: {r.text}"
    req_id = r.json()["id"]
    r = client.post(f"{PREFIX}/coach-requests/{req_id}/accept", headers=H(coach["token"]))
    assert r.status_code == 200, f"accept: {r.text}"


def pairing_coach_id(ath):
    return client.get(f"{PREFIX}/me/pairing", headers=H(ath["token"])).json()["coach_id"]


# ── Setup ────────────────────────────────────────────────────────────────────
M = reg("Coach M", "coachm", role="coach")
A = reg("Coach A", "coacha", role="coach")
B = reg("Coach B", "coachb", role="coach")
atM1 = reg("Ath M1", "atm1")
atM2 = reg("Ath M2", "atm2")
atA1 = reg("Ath A1", "ata1")
atNone = reg("Ath None", "atnone")
pair(atM1, M); pair(atM2, M); pair(atA1, A)

# Group G owned by M
g = client.post(f"{PREFIX}/coach/groups", json={"name": "Group G"}, headers=H(M["token"]))
GID = g.json()["id"]
check("A", "main coach creates group (role=main)", g.status_code == 201 and g.json()["role"] == "main")


# ── B. Co-coach invitations ──────────────────────────────────────────────────
inv = client.post(f"{PREFIX}/groups/{GID}/coaches", json={"user_id": A["id"], "role": "assistant"}, headers=H(M["token"]))
check("B", "main invites assistant -> pending invite (not yet a coach)",
      inv.status_code == 201 and inv.json().get("status") == "pending")
INV_ID = inv.json()["id"]

# candidate sees it
incoming = client.get(f"{PREFIX}/groups/coach-invites/incoming", headers=H(A["token"]))
check("B", "candidate sees incoming invite", incoming.status_code == 200 and any(i["id"] == INV_ID for i in incoming.json()))

# not yet in coaches list
coaches = client.get(f"{PREFIX}/groups/{GID}/coaches", headers=H(M["token"])).json()
check("B", "invited coach NOT in coaches list while pending", all(c["user_id"] != A["id"] for c in coaches))

# re-invite while pending -> blocked
dup = client.post(f"{PREFIX}/groups/{GID}/coaches", json={"user_id": A["id"]}, headers=H(M["token"]))
check("B", "re-invite while pending blocked (409)", dup.status_code == 409)

# assistant-candidate (not main) cannot invite others
nope = client.post(f"{PREFIX}/groups/{GID}/coaches", json={"user_id": B["id"]}, headers=H(A["token"]))
check("K", "non-main cannot invite (403)", nope.status_code == 403)

# accept
acc = client.post(f"{PREFIX}/groups/coach-invites/{INV_ID}/accept", headers=H(A["token"]))
coaches2 = client.get(f"{PREFIX}/groups/{GID}/coaches", headers=H(M["token"])).json()
check("B", "accept -> becomes assistant coach of group",
      acc.status_code == 200 and any(c["user_id"] == A["id"] and c["role"] == "assistant" for c in coaches2))

# invite an existing coach -> blocked
already = client.post(f"{PREFIX}/groups/{GID}/coaches", json={"user_id": A["id"]}, headers=H(M["token"]))
check("B", "invite existing coach blocked (409)", already.status_code == 409)

# decline path (invite B, B declines)
invb = client.post(f"{PREFIX}/groups/{GID}/coaches", json={"user_id": B["id"]}, headers=H(M["token"]))
dec = client.post(f"{PREFIX}/groups/coach-invites/{invb.json()['id']}/decline", headers=H(B["token"]))
coaches3 = client.get(f"{PREFIX}/groups/{GID}/coaches", headers=H(M["token"])).json()
check("B", "decline -> not added", dec.status_code == 204 and all(c["user_id"] != B["id"] for c in coaches3))

# withdraw path (invite B again, M withdraws)
invb2 = client.post(f"{PREFIX}/groups/{GID}/coaches", json={"user_id": B["id"]}, headers=H(M["token"]))
wd = client.delete(f"{PREFIX}/groups/coach-invites/{invb2.json()['id']}", headers=H(M["token"]))
inc_b = client.get(f"{PREFIX}/groups/coach-invites/incoming", headers=H(B["token"])).json()
check("B", "withdraw -> leaves candidate inbox", wd.status_code == 204 and all(i["id"] != invb2.json()["id"] for i in inc_b))


# ── D. Adding athletes ───────────────────────────────────────────────────────
add1 = client.post(f"{PREFIX}/coach/groups/{GID}/members", json={"athlete_id": atM1["id"]}, headers=H(M["token"]))
check("D", "main adds own athlete -> added immediately", add1.status_code in (200, 201) and add1.json()["status"] == "added")

add2 = client.post(f"{PREFIX}/coach/groups/{GID}/members", json={"athlete_id": atA1["id"]}, headers=H(M["token"]))
check("D", "main cannot add athlete they don't coach (403)", add2.status_code == 403)

add3 = client.post(f"{PREFIX}/coach/groups/{GID}/members", json={"athlete_id": atA1["id"]}, headers=H(A["token"]))
check("D", "assistant adds own athlete -> pending", add3.status_code in (200, 201) and add3.json()["status"] == "pending")

pend = client.get(f"{PREFIX}/coach/groups/{GID}/pending", headers=H(M["token"])).json()
check("D", "main sees pending approval", any(p["athlete_id"] == atA1["id"] for p in pend))
if pend:
    appr = client.post(f"{PREFIX}/coach/groups/{GID}/pending/{pend[0]['id']}/approve", headers=H(M["token"]))
    members = client.get(f"{PREFIX}/coach/groups/{GID}", headers=H(M["token"])).json()["members"]
    check("D", "approve -> athlete joins group", appr.status_code in (200, 201) and any(m["id"] == atA1["id"] for m in members))


# ── E. Removing athletes (permissions) ───────────────────────────────────────
rmA = client.delete(f"{PREFIX}/coach/groups/{GID}/members/{atM1['id']}", headers=H(A["token"]))
check("E", "assistant cannot remove athlete they don't personally coach (403)", rmA.status_code == 403)

rmM = client.delete(f"{PREFIX}/coach/groups/{GID}/members/{atM1['id']}", headers=H(M["token"]))
check("E", "main removes any athlete (204) + stays coached",
      rmM.status_code == 204 and pairing_coach_id(atM1) == M["id"])
# restore atM1 to group for later
client.post(f"{PREFIX}/coach/groups/{GID}/members", json={"athlete_id": atM1["id"]}, headers=H(M["token"]))


# ── H. Group-workout authoring ───────────────────────────────────────────────
day = "2026-07-01"
gwA = client.post(f"{PREFIX}/calendar/group/{GID}/{day}", json={"workout_type": "easy", "title": "AssistWO", "recipient_ids": []}, headers=H(A["token"]))
check("H", "assistant can author group workout (201)", gwA.status_code == 201)

gwB = client.post(f"{PREFIX}/calendar/group/{GID}/{day}", json={"workout_type": "easy", "title": "x", "recipient_ids": []}, headers=H(B["token"]))
check("K", "non-member coach cannot author group workout (403/404)", gwB.status_code in (403, 404))


# ── G. Athlete transfer (dual approval) ──────────────────────────────────────
# negative: transfer to a non-co-coach of the group
tneg = client.post(f"{PREFIX}/coach/athletes/{atM1['id']}/transfer", json={"to_coach_id": B["id"]}, headers=H(M["token"]))
check("G", "cannot transfer to a non-co-coach (400)", tneg.status_code == 400)

# negative: athlete with no group
tnone = client.post(f"{PREFIX}/coach/athletes/{atNone['id']}/transfer", json={"to_coach_id": A["id"]}, headers=H(M["token"]))
check("G", "cannot transfer athlete with no group/coach (400/403)", tnone.status_code in (400, 403))

# valid: M -> A (co-coach). coach approves first, then athlete.
t1 = client.post(f"{PREFIX}/coach/athletes/{atM1['id']}/transfer", json={"to_coach_id": A["id"]}, headers=H(M["token"]))
TID = t1.json()["id"]
ap_coach = client.post(f"{PREFIX}/transfers/{TID}/approve", headers=H(A["token"]))
mid_state = pairing_coach_id(atM1)
check("G", "transfer pending after only coach approves (no flip yet)", mid_state == M["id"])
ap_ath = client.post(f"{PREFIX}/transfers/{TID}/approve", headers=H(atM1["token"]))
check("G", "completes after both approve -> coach_id flips to destination", pairing_coach_id(atM1) == A["id"])

# order independence: atM2, athlete approves first.
# Transfer requires the athlete to be in a group the target co-coaches -> add to G first.
client.post(f"{PREFIX}/coach/groups/{GID}/members", json={"athlete_id": atM2["id"]}, headers=H(M["token"]))
t2 = client.post(f"{PREFIX}/coach/athletes/{atM2['id']}/transfer", json={"to_coach_id": A["id"]}, headers=H(M["token"]))
tid2 = t2.json()["id"]
client.post(f"{PREFIX}/transfers/{tid2}/approve", headers=H(atM2["token"]))   # athlete first
client.post(f"{PREFIX}/transfers/{tid2}/approve", headers=H(A["token"]))      # then coach
check("G", "order independence: athlete-first then coach completes", pairing_coach_id(atM2) == A["id"])


# ── G2. Transfer lifecycle: one-pending / decline / cancel / auto-cancel ──────
atM3 = reg("Ath M3", "atm3"); pair(atM3, M)
client.post(f"{PREFIX}/coach/groups/{GID}/members", json={"athlete_id": atM3["id"]}, headers=H(M["token"]))

tl = client.post(f"{PREFIX}/coach/athletes/{atM3['id']}/transfer", json={"to_coach_id": A["id"]}, headers=H(M["token"]))
TLID = tl.json()["id"]
dup_t = client.post(f"{PREFIX}/coach/athletes/{atM3['id']}/transfer", json={"to_coach_id": A["id"]}, headers=H(M["token"]))
check("G", "only one pending transfer per athlete (409)", dup_t.status_code == 409)

dec_t = client.post(f"{PREFIX}/transfers/{TLID}/decline", headers=H(atM3["token"]))
check("G", "athlete declines -> cancelled, coach unchanged", dec_t.status_code == 204 and pairing_coach_id(atM3) == M["id"])

tl2 = client.post(f"{PREFIX}/coach/athletes/{atM3['id']}/transfer", json={"to_coach_id": A["id"]}, headers=H(M["token"]))
canc = client.delete(f"{PREFIX}/transfers/{tl2.json()['id']}", headers=H(M["token"]))
check("G", "initiator can cancel a pending transfer (204)", canc.status_code == 204)

tl3 = client.post(f"{PREFIX}/coach/athletes/{atM3['id']}/transfer", json={"to_coach_id": A["id"]}, headers=H(M["token"]))
check("G", "can re-create a transfer after cancel", tl3.status_code == 201)
client.delete(f"{PREFIX}/coach/athletes/{atM3['id']}/registration", headers=H(M["token"]))  # remove connection
inc_A = client.get(f"{PREFIX}/transfers/incoming", headers=H(A["token"])).json()
check("G", "remove-connection auto-cancels the pending transfer",
      all(t["athlete_id"] != atM3["id"] for t in inc_A) and pairing_coach_id(atM3) is None)


# ── C. Ownership transfer ────────────────────────────────────────────────────
to = client.patch(f"{PREFIX}/groups/{GID}/transfer", json={"new_main_user_id": A["id"]}, headers=H(M["token"]))
coaches4 = client.get(f"{PREFIX}/groups/{GID}/coaches", headers=H(A["token"])).json()
a_main = any(c["user_id"] == A["id"] and c["role"] == "main" for c in coaches4)
m_asst = any(c["user_id"] == M["id"] and c["role"] == "assistant" for c in coaches4)
check("C", "ownership transfer swaps main/assistant", to.status_code == 200 and a_main and m_asst)

# now M (assistant) cannot invite
m_invite = client.post(f"{PREFIX}/groups/{GID}/coaches", json={"user_id": B["id"]}, headers=H(M["token"]))
check("C", "after transfer, ex-main (now assistant) cannot invite (403)", m_invite.status_code == 403)


# ── F. Remove connection ─────────────────────────────────────────────────────
rc = client.delete(f"{PREFIX}/coach/athletes/{atA1['id']}/registration", headers=H(A["token"]))
check("F", "coach removes connection -> coach_id cleared", rc.status_code == 204 and pairing_coach_id(atA1) is None)


# ── I / H2 / L. Insights visibility, target authoring, group-delete cleanup ──
# Fresh, self-contained accounts so prior state mutations don't interfere.
from app.database import SessionLocal  # noqa: E402
from app.models.user import User as _User  # noqa: E402

X = reg("Coach X", "coachx", role="coach")
Y = reg("Coach Y", "coachy", role="coach")
Z = reg("Coach Z", "coachz", role="coach")
atX1 = reg("Ath X1", "atx1"); pair(atX1, X)

GX = client.post(f"{PREFIX}/coach/groups", json={"name": "Group X"}, headers=H(X["token"])).json()["id"]
ivx = client.post(f"{PREFIX}/groups/{GX}/coaches", json={"user_id": Y["id"]}, headers=H(X["token"]))
client.post(f"{PREFIX}/groups/coach-invites/{ivx.json()['id']}/accept", headers=H(Y["token"]))
client.post(f"{PREFIX}/coach/groups/{GX}/members", json={"athlete_id": atX1["id"]}, headers=H(X["token"]))

# I. insights visibility (visible_group_ids includes assistants)
rep_y = client.get(f"{PREFIX}/reporting/overview", params={"group_id": GX}, headers=H(Y["token"]))
check("I", "assistant can view reporting overview for their group (200)", rep_y.status_code == 200)
vol_y = client.get(f"{PREFIX}/analytics/volume", params={"group_id": GX}, headers=H(Y["token"]))
check("I", "assistant can view analytics volume for their group (200)", vol_y.status_code == 200)
rep_z = client.get(f"{PREFIX}/reporting/overview", params={"group_id": GX}, headers=H(Z["token"]))
check("I", "non-member coach blocked from group insights (403)", rep_z.status_code == 403)

# H2. individual-target authoring (any group coach can author for group athletes)
tgt_y = client.put(f"{PREFIX}/calendar/targets/{atX1['id']}/2026-07-02",
                   json={"workout_type": "easy", "content": "easy 5k"}, headers=H(Y["token"]))
check("H", "assistant can author individual target for group athlete", tgt_y.status_code in (200, 201))
tgt_z = client.put(f"{PREFIX}/calendar/targets/{atX1['id']}/2026-07-02",
                   json={"workout_type": "easy", "content": "x"}, headers=H(Z["token"]))
check("K", "non-member cannot author individual target (403/404)", tgt_z.status_code in (403, 404))

# Remove assistant coach (main only)
rmc = client.delete(f"{PREFIX}/groups/{GX}/coaches/{Y['id']}", headers=H(X["token"]))
cs_x = client.get(f"{PREFIX}/groups/{GX}/coaches", headers=H(X["token"])).json()
check("B", "main removes assistant coach", rmc.status_code == 204 and all(c["user_id"] != Y["id"] for c in cs_x))

# L. group delete cleanup (members detached, no FK error)
GDEL = client.post(f"{PREFIX}/coach/groups", json={"name": "GDel"}, headers=H(X["token"])).json()["id"]
atX2 = reg("Ath X2", "atx2"); pair(atX2, X)
client.post(f"{PREFIX}/coach/groups/{GDEL}/members", json={"athlete_id": atX2["id"]}, headers=H(X["token"]))
deleted = client.delete(f"{PREFIX}/coach/groups/{GDEL}", headers=H(X["token"]))
gone = client.get(f"{PREFIX}/coach/groups/{GDEL}", headers=H(X["token"]))
_db = SessionLocal()
detached = _db.get(_User, atX2["id"]).training_group_id is None
_db.close()
check("L", "delete group -> 204, group gone, member detached",
      deleted.status_code == 204 and gone.status_code == 404 and detached)


# ── Summary ──────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
passed = sum(1 for *_, p, _ in [(s, n, p, d) for s, n, p, d in results] if p)
total = len(results)
print(f"RESULT: {passed}/{total} passed")
fails = [(s, n, d) for s, n, p, d in results if not p]
if fails:
    print("\nFAILURES:")
    for s, n, d in fails:
        print(f"  - [{s}] {n}  {d}")
print("=" * 60)
