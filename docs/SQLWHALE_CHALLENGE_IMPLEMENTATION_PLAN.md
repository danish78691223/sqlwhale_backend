# SQLWhale SQL Challenge — Backend Implementation Plan

## Launch configuration

- Challenge slug: `sqlwhale-sql-challenge-2026`
- Organizer: WEBXWHALE
- Platform: SQLWhale
- Format: individual, online
- Duration: 7 consecutive days
- Registration goal: 100 participants
- Awards: Top 3 only; no participation certificate in this edition
- Tasks: 30 approved SQL tasks (10 Easy, 10 Medium, 10 Hard)
- Contest points: Easy 5, Medium 10, Hard 15 (maximum 300)

The actual registration-open, start and end timestamps must be configured before the Unstop listing is published. Do not infer event dates from this document.

## Why contest scoring must be separate

The existing task flow is designed for normal SQLWhale practice:
- `POST /api/tasks/:id/check` records normal task completions.
- `TaskCompletion` has a unique index on `localUserId + taskId`.
- Normal leaderboard points are 10 / 15 / 20 for Easy / Medium / Hard.
- The task check endpoint enforces the normal learning sequence.

Do not reuse the global `TaskCompletion` aggregation as the competition leaderboard. Doing so can mix historical practice activity into a contest, inherit the normal 10/15/20 scale, and make a participant ineligible for a task they completed before registering.

## Backend data model

Create independent MongoDB models:

### Competition
- `slug` (unique)
- `title`, `description`, `organizer`
- `status`: draft | registration_open | scheduled | live | completed
- `registrationOpensAt`, `registrationClosesAt`
- `startsAt`, `endsAt`
- `taskIds` (ordered list of the 30 approved task IDs)
- `scoring`: Easy 5, Medium 10, Hard 15
- `publishedAt`, timestamps

### CompetitionRegistration
- `competitionId`, `localUserId`, `verifiedEmail`, `displayName`
- `unstopRegistrationId` (optional reconciliation reference; never trust it as authentication)
- `registeredAt`, `status`
- Unique index on `competitionId + localUserId`
- Prevent multiple SQLWhale accounts from registering with the same verified email for the same competition.

### CompetitionSubmission
- `competitionId`, `localUserId`, `taskId`
- `attemptCount`, `firstCorrectAt`, `lastAttemptAt`, `pointsAwarded`, `isCorrect`
- Store only the minimum query/audit metadata needed for dispute review; do not expose expected SQL or hidden test cases.
- Unique index on `competitionId + localUserId + taskId` for the first successful completion record. Incorrect attempts may be logged separately with a capped retention policy.

### CompetitionCertificate
- `competitionId`, `localUserId`, `certificateId`, `rank`, `issuedAt`, `revokedAt`
- Unique indexes on `certificateId` and `competitionId + rank` (ranks 1–3).

## API contract

Public:
- `GET /api/competitions/:slug` — public challenge details, state, dates, task counts and scoring; never return expected queries.
- `GET /api/competitions/:slug/leaderboard` — top 10 public entries, current user's rank if authenticated, total registered participants. Hide email and internal user IDs.
- `GET /api/competitions/:slug/certificates/:certificateId/verify` — public certificate verification.

Authenticated:
- `POST /api/competitions/:slug/register` — require SQLWhale session and verified email; idempotent registration.
- `GET /api/competitions/:slug/me` — registration state, solved count, points and rank.
- `POST /api/competitions/:slug/tasks/:taskId/submit` — require active registration, contest window open, task belongs to this competition, rate limits and server-side SQL evaluation. Award points only on the first correct result for each task.

Admin-only:
- `POST /api/admin/competitions` — create draft.
- `PUT /api/admin/competitions/:id` — set dates, task IDs, state and scoring.
- `POST /api/admin/competitions/:id/finalize` — close submissions, recalculate ranking and freeze results.
- `POST /api/admin/competitions/:id/issue-certificates` — issue the Top 3 after manual identity and anti-cheat review.

## SQL execution and user-data isolation

- Add a dedicated competition workspace namespace. Do not call the normal `resolveWorkspace` path for competition datasets.
- Seed each participant's contest workspace from the same immutable challenge fixtures.
- Never reset, replace or delete the participant's existing learning workspace tables.
- Reuse `taskGrading.service.ts` for result comparison where compatible, but execute both submitted and expected queries against the dedicated competition workspace.
- Expected SQL, expected output snapshots and hidden validation cases remain server-side.
- Disable answer reveals for contest tasks during the event, regardless of subscription plan. This must not change normal task reveal behavior.
- Keep normal `TaskCompletion`, Chai points and the normal leaderboard unchanged.

## Scoring and ranking

- Easy: 10 tasks × 5 = 50 points.
- Medium: 10 tasks × 10 = 100 points.
- Hard: 10 tasks × 15 = 150 points.
- Maximum: 300 points.
- Correct answer: full task points once; incorrect answer: 0; no negative marking.
- Allow retries for incorrect attempts. A task can only earn points once.
- Rank by total points descending, then number of correctly solved tasks descending, then the earlier timestamp at which the final score was reached.
- Log all attempts and flag suspicious request volume or repeated account/device patterns for manual review.
- Freeze the final leaderboard after the deadline; do not use live mutable user profile names for historical certificate identity.

## Frontend integration phases

1. Keep the new public `/competition` page and homepage promotion informational while backend APIs are unavailable.
2. Add a clear registration action: sign in/create account, then explicitly join the competition.
3. Add a challenge-mode task list using only the 30 configured task IDs.
4. Pass submissions through the contest API, not the normal task completion route.
5. Add a competition-only leaderboard and the user's contest progress.
6. Add admin controls for challenge dates, task selection, registration status, finalization and certificate issuance.
7. Add certificate verification and winner announcement.

## Release acceptance checklist

- Normal Run Query and the existing learning tasks still work unchanged.
- A user's existing workspace tables survive backend deploys and challenge setup.
- A participant's old task completions do not generate competition points.
- A user cannot submit without joining, outside the contest window, or for a task outside the 30-task list.
- Expected SQL and answer-reveal endpoints cannot leak contest answers.
- One correct task yields one contest award, even under concurrent duplicate requests.
- Leaderboard totals match stored contest submission records.
- Top 3 certificates are unique, verifiable and can be revoked.
- Frontend mobile layout, auth redirects, API error states and production build are tested before announcing the Unstop dates.
