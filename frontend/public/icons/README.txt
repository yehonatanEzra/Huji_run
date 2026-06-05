Bottom-nav icons
================

Drop JPG (or PNG) files in this folder to replace the emoji icons in the
bottom navigation dock. If a file is missing, the emoji shows instead — so
you can add them one at a time without breaking anything.

Expected filenames (match the route's purpose):

  home.jpg          → Home tab
  training.jpg      → Training (calendar) tab
  feed.jpg          → Feed tab
  races.jpg         → Races tab
  hall-of-fame.jpg  → Hall of Fame tab
  health.jpg        → Health tab
  profile.jpg       → Profile tab
  find-coach.jpg    → Find coach tab (unpaired athletes)
  tracking.jpg      → Tracking (coach) tab
  coach.jpg         → Coach (workout publisher) tab
  requests.jpg      → Requests (coach) tab
  review.jpg        → Review (admin) tab

Recommended:
  - Square images, 64×64 to 256×256 px
  - Light-themed icon on transparent or dark background works best
  - JPG is fine; PNG with alpha looks cleaner on the dock

If you want a different filename, change the `image:` field on the matching
item in `frontend/src/components/layout/BottomNav.jsx`.
