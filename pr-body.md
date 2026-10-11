# Relates to

No issue. Only a person can create an issue in this repository, and no person
has created one for this defect. I did not find the PRD or the MVP plan in the
repository, so I cannot link a section. This PR adds no feature. It corrects
how the availability check that is already in `plugins/plugin-calendar` reads
an event of a subscribed calendar.

# Change

The assistant reported a conflict with an event that the calendar marks as
free time, when the event came from a subscribed calendar (ICS feed).

An ICS event can have the property `TRANSP:TRANSPARENT`. RFC 5545 section
3.8.2.7 says that such an event does not use time: the time stays free.
Examples are a public holiday, a birthday, and a reminder. Holiday calendars
mark their events in this way.

The availability check already skips a free event. It reads the mark from
the event metadata key `transparency`. The Google, Microsoft, and Apple
sources write that key. The ICS source writes the mark under a different key,
`icsTransparency`, and no code read that key. Thus the check did not know that
an ICS event is free:

- A free timed event (a reminder) was a hard conflict.
- A free all-day event (a public holiday) was a warning for each new event on
  that day.

This PR makes the availability check read the key of the ICS source too.

Before (base `8cc476cbb3`):

```
Events of the subscribed feed (2026-07-01, UTC):
  Public holiday (all day, TRANSP:TRANSPARENT)
  Lunch reminder (10:00-11:00, TRANSP:TRANSPARENT)
  School pickup (14:00-15:00, TRANSP:OPAQUE)
  Dentist (16:00-17:00, no TRANSP)

New event 10:15-10:45 (at the time of the free reminder)
  definitive: true
  conflicts (2): Lunch reminder (10:00-11:00, TRANSP:TRANSPARENT) | Public holiday (all day, TRANSP:TRANSPARENT)
  summary: 1 hard conflict(s) and 1 warning(s) detected.
New event 12:00-12:30 (only the holiday is at this time)
  definitive: true
  conflicts (1): Public holiday (all day, TRANSP:TRANSPARENT)
  summary: 1 warning(s) detected.
```

After (this PR):

```
Events of the subscribed feed (2026-07-01, UTC):
  Public holiday (all day, TRANSP:TRANSPARENT)
  Lunch reminder (10:00-11:00, TRANSP:TRANSPARENT)
  School pickup (14:00-15:00, TRANSP:OPAQUE)
  Dentist (16:00-17:00, no TRANSP)

New event 10:15-10:45 (at the time of the free reminder)
  definitive: true
  conflicts (0): none
  summary: No conflicts detected.
New event 12:00-12:30 (only the holiday is at this time)
  definitive: true
  conflicts (0): none
  summary: No conflicts detected.
```

The backend log row has all four checks.

# Why this implementation

Sources that I used:

- RFC 5545 section 3.8.2.7, Time Transparency
  (https://www.rfc-editor.org/rfc/rfc5545#section-3.8.2.7). `TRANSPARENT`
  means that the event is not seen by a search for busy time.
- The code of this repository:
  - `src/ics/parser.ts` reads `TRANSP` and gives `transparent` or `opaque`.
  - `src/ics/source.ts` stores that value as `metadata.icsTransparency`.
  - `src/actions/conflict-detect.ts` (`calendarEventForAvailability`) reads
    only `metadata.transparency`.
  - `src/service/availability.ts` skips an event whose transparency is
    `transparent` or `free`.
  - The Google, Microsoft, and Apple sources write `metadata.transparency`.
  - A search of the repository finds no other use of `icsTransparency`.

Decisions:

- **The change is in the reader.** `calendarEventForAvailability` now reads
  `transparency` first and `icsTransparency` second. It is the only function
  that reads the transparency of a stored event.
- **I did not change the key that the ICS source writes.** The ICS source
  has the prefix `ics` on each of its metadata keys (`icsUid`, `icsSequence`,
  `icsClassification`). The events that are already in the database have
  `icsTransparency`. A change of the written key corrects only the events
  that a later synchronization writes again. A change of the reader corrects
  all the stored events immediately.

Alternatives that I examined:

- Write `transparency` in the ICS source, in place of `icsTransparency` or
  in addition to it. I did not do this, for the reason above. It also puts
  one value under two keys.

# Testing

All commands ran on the tree of commit `cc2ed2d4a913339223a559f5a1feb55781e3683e`
with Bun 1.4.2 and Node 24.15.0 on Linux x64.

- **Real service path, before and after.** A script used the same setup as
  `calendar-ics-source.pglite.test.ts`: the real `CalendarService`, the real
  PGlite tables from the production schema, and a feed body given through the
  transport parameter of `syncIcsCalendarSource`. It stored a feed that has
  four events. Then it called `evaluateCalendarWriteAvailability` four times.
  This is the function that the calendar action calls before it creates an
  event. Results are in **Change** and in the backend log row. Two events are
  controls: an event with `TRANSP:OPAQUE` and an event with no `TRANSP`. Each
  of them is a conflict before and after.
- `bun run test` in `plugins/plugin-calendar`: 32 files passed, 2 skipped;
  372 tests passed, 4 skipped.
- `bun run typecheck` in `plugins/plugin-calendar`: passed.
- `bun run lint:check` in `plugins/plugin-calendar`: passed.
- I added one test case to the existing file
  `calendar-ics-source.pglite.test.ts`. It stores a free event and a busy
  event through the real service and database and calls
  `evaluateCalendarWriteAvailability` for the two times. It fails on the base
  commit (the free event is a conflict) and passes on this branch. I added no
  test file.

## How to test

1. Check out this branch. Run `bun install`.
2. Run `cd plugins/plugin-calendar && bunx vitest run --config vitest.config.ts test/calendar-ics-source.pglite.test.ts`.
   All tests must pass.
3. Revert only `src/actions/conflict-detect.ts` to `develop` and run the
   command again. The test "does not report a free subscribed event as a
   conflict" must fail.
4. Search the repository for `icsTransparency`. On `develop`, the only result
   is the line in `src/ics/source.ts` that writes it.

- [x] Targets `develop` and has no conflicts with the latest `origin/develop`.
- [ ] Ran `bun install` and `bun run verify` after syncing; record blockers below.
- [x] Updated relevant documentation. `N/A - a code comment at the changed line is the only text that describes this key`

# Evidence Gate

Evidence must match the reviewed commit. `packages/scripts/pr-evidence.ts rows`
sets the marker from the live PR head; rerun after each push.
<!-- evidence-head:cc2ed2d4a913339223a559f5a1feb55781e3683e -->

<!-- evidence-row:before-screenshots -->
- [x] Before screenshots: `N/A - backend calendar change, no UI code changes`.
<!-- evidence-row:after-screenshots -->
- [x] After screenshots: `N/A - backend calendar change, no UI code changes`.
<!-- evidence-row:walkthrough-video -->
- [x] Walkthrough video: `N/A - this PR has no UI change`.
<!-- evidence-row:backend-logs -->
- [x] Backend logs show the real code path firing end to end. The script
      stored the feed in a real PGlite database through `CalendarService` and
      printed what `evaluateCalendarWriteAvailability` returned.

<details>
<summary>Availability check on a subscribed feed through CalendarService, before and after</summary>

Before, base `8cc476cbb3`:

```
Events of the subscribed feed (2026-07-01, UTC):
  Public holiday (all day, TRANSP:TRANSPARENT)
  Lunch reminder (10:00-11:00, TRANSP:TRANSPARENT)
  School pickup (14:00-15:00, TRANSP:OPAQUE)
  Dentist (16:00-17:00, no TRANSP)

New event 10:15-10:45 (at the time of the free reminder)
  definitive: true
  conflicts (2): Lunch reminder (10:00-11:00, TRANSP:TRANSPARENT) | Public holiday (all day, TRANSP:TRANSPARENT)
  summary: 1 hard conflict(s) and 1 warning(s) detected.
New event 12:00-12:30 (only the holiday is at this time)
  definitive: true
  conflicts (1): Public holiday (all day, TRANSP:TRANSPARENT)
  summary: 1 warning(s) detected.
New event 14:15-14:45 (at the time of the school pickup)
  definitive: true
  conflicts (2): Public holiday (all day, TRANSP:TRANSPARENT) | School pickup (14:00-15:00, TRANSP:OPAQUE)
  summary: 1 hard conflict(s) and 1 warning(s) detected.
New event 16:15-16:45 (at the time of the dentist)
  definitive: true
  conflicts (2): Dentist (16:00-17:00, no TRANSP) | Public holiday (all day, TRANSP:TRANSPARENT)
  summary: 1 hard conflict(s) and 1 warning(s) detected.
```

After, commit `cc2ed2d4a913339223a559f5a1feb55781e3683e`:

```
Events of the subscribed feed (2026-07-01, UTC):
  Public holiday (all day, TRANSP:TRANSPARENT)
  Lunch reminder (10:00-11:00, TRANSP:TRANSPARENT)
  School pickup (14:00-15:00, TRANSP:OPAQUE)
  Dentist (16:00-17:00, no TRANSP)

New event 10:15-10:45 (at the time of the free reminder)
  definitive: true
  conflicts (0): none
  summary: No conflicts detected.
New event 12:00-12:30 (only the holiday is at this time)
  definitive: true
  conflicts (0): none
  summary: No conflicts detected.
New event 14:15-14:45 (at the time of the school pickup)
  definitive: true
  conflicts (1): School pickup (14:00-15:00, TRANSP:OPAQUE)
  summary: 1 hard conflict(s) detected.
New event 16:15-16:45 (at the time of the dentist)
  definitive: true
  conflicts (1): Dentist (16:00-17:00, no TRANSP)
  summary: 1 hard conflict(s) detected.
```

</details>

<!-- evidence-row:frontend-logs -->
- [x] Frontend logs: `N/A - no frontend change`.
<!-- evidence-row:llm-trajectory -->
- [x] Real-LLM trajectory: `N/A - no agent, action, provider, prompt, or model change`.
<!-- evidence-row:domain-artifacts -->
- [x] Domain artifacts: `N/A - the feed events and the check results are in the backend log row; no other artifact applies`.
<!-- evidence-row:ocr-review -->
- [x] OCR review: `N/A - backend calendar change has no rendered visual surface`.

# Evidence Details

The replay script is not in this PR. It does these steps:

1. Create `CalendarService` on a real PGlite database with the production
   calendar schema, as `calendar-ics-source.pglite.test.ts` does.
2. Create an ICS source and synchronize it with a feed body that has four
   events on 2026-07-01: a free all-day event, a free timed event, a busy
   timed event, and a timed event with no `TRANSP`.
3. Call `evaluateCalendarWriteAvailability` for four new events of 30 minutes.
4. Print the titles of the conflicts and the summary text of each result.

I ran the script with the environment variable `TZ=UTC`. An all-day event of
a feed is on the local day of the owner, so its hours in UTC change with the
time zone of the machine. With `TZ=UTC`, the holiday is from 00:00 to 24:00
UTC. The test case in this PR uses timed events only, so it does not depend
on the time zone of the machine.

## Known gaps / failures

- **`bun run verify` cannot complete on my machine (2 CPUs, 8 GB memory).**
  I ran each of the 22 scripts in `verify` alone, and each passed. For the step
  `turbo run typecheck lint:check`, I ran `typecheck` and `lint:check` for
  `@elizaos/plugin-calendar` only, and both passed. On the full run for my
  earlier PR #35316, the operating system stopped nine large packages for
  memory, and `@elizaos/capacitor-notification-mirror` needs an Android SDK
  that my machine does not have. This PR changes files in
  `plugins/plugin-calendar` only.
- **I did not use a feed from a third-party product.** I wrote the feed body.
- **I did not run the calendar action with a language model.** The script
  calls the function that the action calls for the availability check.
- **The free/busy read for a guest (`getCalendarFreeBusy`) is a different
  path.** I did not examine how it uses transparency, and this PR does not
  change it.

## Deployment

None. The next availability check reads the stored events correctly. No
synchronization is necessary.

AI provider/model: anthropic / claude-opus-5-5
Client / agent tooling: claude-code
Contribution skill revision: N/A - ordinary GitHub contribution without optional run evidence
Attribution status: self-reported
— [contributor]
<!-- eliza-computer-attribution:v1 {"provider":"anthropic","model":"claude-opus-5-5","client":"claude-code","skill_revision":"N/A - ordinary GitHub contribution without optional run evidence"} -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_011znGg3Vnk3wpjQ1HKPJwf8
