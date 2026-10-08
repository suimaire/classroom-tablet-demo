# HAFS ENGLISH CLASS · Participation Tracker

Administrator and teacher web client. Access requires an authenticated account and course-level authorization. Student data is stored privately in the backend and must never be committed to this public repository.

Authentication and account provisioning must be completed before classroom use.

## Classroom modes

- Daily mode shows uncancelled presentations on the chosen date in Korea time. Historical dates are read-only; use “오늘로 돌아가기” to record today.
- Cumulative mode retains the course's complete running total. A third or later presentation on the same day requires confirmation in either mode.
- The personal history dialog closes on its backdrop or Escape and returns keyboard focus to the student's history button.
- Phone auto-fit hides photos in portrait and uses photos as history buttons in landscape. Large mode retains scrolling for teachers who prefer larger cards.
- Reloading restores the existing authenticated session from this browser tab's sessionStorage, then rechecks server access. Passwords, photos, and presentation records are never persisted there. Log out on shared devices.

## Verification

Run `node --test tests/*.test.mjs` for frontend logic and geometry checks.
Install pinned SQL-test dependencies with `npm ci --prefix supabase`, then run `node --test` for the complete suite including synthetic PostgreSQL behavior tests via PGlite.
Run `node scripts/build-vercel.mjs` to validate and build the runtime allowlist.
`python tests/classroom-browser.py` is an optional synthetic-only browser regression requiring Python Playwright and Chromium; it blocks external requests. Its initial execution was blocked by the cloud sandbox's browser/socket launcher, so unit geometry checks are not a substitute for physical iPhone/iPad Safari verification.
