# Relates to

No issue. Only a person can create an issue in this repository, and no person
has created one for this defect. I did not find the PRD or the MVP plan in the
repository, so I cannot link a section. It corrects the expansion of a daily
series in the calendar code that is already in `plugins/plugin-calendar`.

# Change

A subscribed calendar (ICS feed) showed only the first event of a daily
series when the rule listed weekdays.

A daily rule can list weekdays with `BYDAY`. The rule
`FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR` is "every weekday": each day from Monday
to Friday, and no event on Saturday and Sunday. The Zimbra web client makes
this rule when the user selects "every weekday".

The local expansion did not support `BYDAY` for a `DAILY` rule. It put such a
rule outside its supported set. Thus the feed kept only the first event of
the series, and the feed state was `partial`. A daily meeting on work days
was in the calendar one time only.

Before (base `0eaad0ee2f`):

```
feed state: partial

Every weekday for 8 occurrences (the Zimbra form)
  DTSTART;TZID=America/New_York:19970902T090000
  RRULE:FREQ=DAILY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;COUNT=8
  expected: Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997
  feed result (1): Sep 2, 1997
  agrees: no
```

After (this PR):

```
feed state: complete

Every weekday for 8 occurrences (the Zimbra form)
  DTSTART;TZID=America/New_York:19970902T090000
  RRULE:FREQ=DAILY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;COUNT=8
  expected: Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997
  feed result (8): Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997
  agrees: yes
```

The backend log row has all five series.

# Why this implementation

This PR adds one rule form to the set that the expansion of a subscribed
calendar supports. I say this here because it is important for the review. I
think that it is a correction and not a feature, for these reasons:

- The owner sees a defect: a meeting on each work day is in the calendar one
  time only.
- RFC 5545 defines the result, and a real product writes the form.
- The expansion already has the loop for the days of a `DAILY` rule. This PR
  adds one condition to that loop.

Sources that I used:

- RFC 5545 section 3.8.5.3 (https://www.rfc-editor.org/rfc/rfc5545#section-3.8.5.3).
  The table of the rule parts says "Limit" for `BYDAY` in a `DAILY` rule. Thus
  the rule keeps only the days that are on the listed weekdays.
- The Zimbra web client file `ZmRecurrence.js`
  (https://github.com/Zimbra/zm-web-client/blob/develop/WebRoot/js/zimbraMail/calendar/model/ZmRecurrence.js).
  Lines 131 to 146 make the rule for a daily series with "every weekday": the
  frequency is daily, and `byday` gets each day of the week but `SA` and `SU`.
  The comment of the field `repeatWeekday` says: "set to true if freq = "DAI"
  and custom repeats every weekday".
- RFC 5545 has no example with dates for this form. I calculated the expected
  dates with the Python library `dateutil`, which is a different
  implementation of RFC 5545.

Decisions:

- **Only the feed expansion uses the new form.** `parseRecurrenceRule` and
  `firstRecurrenceRule` get the option `dailyByDay`, next to the options of
  PR #35449, #35468, #35489, and #35628. Only `ics/source.ts` sets it. Without
  the option, the parser gives the same result as before. Thus the rule check
  for event creation, the check for a "this and following" change of a
  series, and the reply text do not change. The transcript is in the backend
  log row.
- **`INTERVAL` counts all days, and `BYDAY` then removes days.** This is the
  order of RFC 5545. Example: `FREQ=DAILY;INTERVAL=2;BYDAY=MO,WE,FR` from a
  Monday gives Monday, Wednesday, and Friday of each second week. The replay
  has this case.
- **`COUNT` counts the days that stay**, as the RFC says.
- **A weekday with a number (`2MO`) in a `DAILY` rule stays outside the
  supported set.** RFC 5545 does not permit it.
- **`BYMONTH` and `BYMONTHDAY` in a `DAILY` rule stay outside the supported
  set.** I found no product that writes them.

Alternatives that I examined:

- Change the rule into `FREQ=WEEKLY` with the same weekdays. I did not do
  this. It is correct only for `INTERVAL=1`. With `INTERVAL=2`, the daily rule
  counts days and the weekly rule counts weeks.
- Support the form in all callers. I did not do this, for the same reasons as
  in PR #35468: the series split check and the reply text each need more
  code, and I cannot test the series split against a calendar provider.

# Testing

All commands ran on the tree of commit `d8d94236c76a6383931c91443f238667feedceb7`
with Bun 1.4.2 and Node 24.15.0 on Linux x64.

- **Real service path, before and after.** A script used the same setup as
  `calendar-ics-source.pglite.test.ts`: the real `CalendarService`, the real
  PGlite tables from the production schema, and a feed body given through the
  transport parameter of `syncIcsCalendarSource`. It stored a feed that has
  five series and read it with `getCalendarFeed`. It compared each feed
  result with the dates from `dateutil`. Two series are controls: a daily
  rule without `BYDAY`, and a weekly rule with the same weekdays. Their
  results are the same before and after. Results are in **Change** and in the
  backend log row.
- **Other callers, before and after.** A second script called
  `normalizeRecurrence`, `describeRecurrence`, and `firstRecurrenceRule`
  without the option. The output is the same before and after. It is in the
  backend log row.
- `bun run test` in `plugins/plugin-calendar`: 32 files passed, 2 skipped;
  371 tests passed, 4 skipped.
- `bun run typecheck` in `plugins/plugin-calendar`: passed.
- `bun run lint:check` in `plugins/plugin-calendar`: passed.
- I added one test case to the existing file
  `calendar-ics-source.pglite.test.ts`. It stores one "every weekday" series
  through the real service and database and compares the feed with the
  expected dates. It fails on the base commit (the feed state is `partial`)
  and passes on this branch. I added no test file.

## How to test

1. Check out this branch. Run `bun install`.
2. Run `cd plugins/plugin-calendar && bunx vitest run --config vitest.config.ts test/calendar-ics-source.pglite.test.ts`.
   All tests must pass.
3. Revert only `src/internal/recurrence.ts` and `src/ics/source.ts` to
   `develop` and run the command again. The test "expands a daily series that
   lists weekdays" must fail.
4. Look at a calendar of September 1997. September 2 is a Tuesday, and
   September 6 and 7 are a Saturday and a Sunday. Compare with the dates in
   the test.

- [x] Targets `develop` and has no conflicts with the latest `origin/develop`.
- [ ] Ran `bun install` and `bun run verify` after syncing; record blockers below.
- [ ] Updated relevant documentation. `N/A - the code comments are the only text that describes the supported rule forms; this PR updates them`

# Evidence Gate

Evidence must match the reviewed commit. `packages/scripts/pr-evidence.ts rows`
sets the marker from the live PR head; rerun after each push.
<!-- evidence-head:d8d94236c76a6383931c91443f238667feedceb7 -->

<!-- evidence-row:before-screenshots -->
- [ ] Before screenshots: `N/A - backend calendar change, no UI code changes`.
<!-- evidence-row:after-screenshots -->
- [ ] After screenshots: `N/A - backend calendar change, no UI code changes`.
<!-- evidence-row:walkthrough-video -->
- [ ] Walkthrough video: `N/A - this PR has no UI change`.
<!-- evidence-row:backend-logs -->
- [x] Backend logs show the real code path firing end to end. The script
      stored the feed in a real PGlite database through `CalendarService` and
      printed what `getCalendarFeed` returned.

<details>
<summary>Feed replay through CalendarService, and the other callers, before and after</summary>

Feed replay before, base `0eaad0ee2f`:

```
feed state: partial

Every weekday for 8 occurrences (the Zimbra form)
  DTSTART;TZID=America/New_York:19970902T090000
  RRULE:FREQ=DAILY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;COUNT=8
  expected: Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997
  feed result (1): Sep 2, 1997
  agrees: no

Every weekday to September 12
  DTSTART;TZID=America/New_York:19970902T090000
  RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;UNTIL=19970912T130000Z
  expected: Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997; Sep 12, 1997
  feed result (1): Sep 2, 1997
  agrees: no

Every other day, on Monday, Wednesday, and Friday only
  DTSTART;TZID=America/New_York:19970901T090000
  RRULE:FREQ=DAILY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=5
  expected: Sep 1, 1997; Sep 3, 1997; Sep 5, 1997; Sep 15, 1997; Sep 17, 1997
  feed result (1): Sep 1, 1997
  agrees: no

Control, daily rule without BYDAY
  DTSTART;TZID=America/New_York:19970902T090000
  RRULE:FREQ=DAILY;COUNT=4
  expected: Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997
  feed result (4): Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997
  agrees: yes

Control, weekly rule with the same weekdays
  DTSTART;TZID=America/New_York:19970902T090000
  RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=8
  expected: Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997
  feed result (8): Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997
  agrees: yes
```

Feed replay after, commit `d8d94236c76a6383931c91443f238667feedceb7`:

```
feed state: complete

Every weekday for 8 occurrences (the Zimbra form)
  DTSTART;TZID=America/New_York:19970902T090000
  RRULE:FREQ=DAILY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;COUNT=8
  expected: Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997
  feed result (8): Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997
  agrees: yes

Every weekday to September 12
  DTSTART;TZID=America/New_York:19970902T090000
  RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;UNTIL=19970912T130000Z
  expected: Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997; Sep 12, 1997
  feed result (9): Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997; Sep 12, 1997
  agrees: yes

Every other day, on Monday, Wednesday, and Friday only
  DTSTART;TZID=America/New_York:19970901T090000
  RRULE:FREQ=DAILY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=5
  expected: Sep 1, 1997; Sep 3, 1997; Sep 5, 1997; Sep 15, 1997; Sep 17, 1997
  feed result (5): Sep 1, 1997; Sep 3, 1997; Sep 5, 1997; Sep 15, 1997; Sep 17, 1997
  agrees: yes

Control, daily rule without BYDAY
  DTSTART;TZID=America/New_York:19970902T090000
  RRULE:FREQ=DAILY;COUNT=4
  expected: Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997
  feed result (4): Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997
  agrees: yes

Control, weekly rule with the same weekdays
  DTSTART;TZID=America/New_York:19970902T090000
  RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=8
  expected: Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997
  feed result (8): Sep 2, 1997; Sep 3, 1997; Sep 4, 1997; Sep 5, 1997; Sep 8, 1997; Sep 9, 1997; Sep 10, 1997; Sep 11, 1997
  agrees: yes
```

Other callers. The output is the same on base `0eaad0ee2f` and on commit
`d8d94236c76a6383931c91443f238667feedceb7`:

```
RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR
  normalizeRecurrence: ["RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"]
  describeRecurrence: "freq=daily;byday=mo,tu,we,th,fr"
  firstRecurrenceRule (no option) outside the expansion subset: true
RRULE:FREQ=DAILY
  normalizeRecurrence: ["RRULE:FREQ=DAILY"]
  describeRecurrence: "daily"
  firstRecurrenceRule (no option) outside the expansion subset: false
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
  normalizeRecurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]
  describeRecurrence: "weekly on Monday, Tuesday, Wednesday, Thursday, Friday"
  firstRecurrenceRule (no option) outside the expansion subset: false
```

</details>

<!-- evidence-row:frontend-logs -->
- [ ] Frontend logs: `N/A - no frontend change`.
<!-- evidence-row:llm-trajectory -->
- [ ] Real-LLM trajectory: `N/A - no agent, action, provider, prompt, or model change`.
<!-- evidence-row:domain-artifacts -->
- [ ] Domain artifacts: `N/A - the feed body and the returned events are in the backend log row; no other artifact applies`.
<!-- evidence-row:ocr-review -->
- [ ] OCR review: `N/A - backend calendar change has no rendered visual surface`.

# Evidence Details

The two scripts are not in this PR.

The feed replay does these steps:

1. Create `CalendarService` on a real PGlite database with the production
   calendar schema, as `calendar-ics-source.pglite.test.ts` does.
2. Create an ICS source and synchronize it with a feed body that has five
   series. Each series starts in September 1997 in `America/New_York`.
3. Read the feed from 1997-01-01 to 2004-01-01 with `getCalendarFeed`.
4. Print the feed state and the day of each returned event in
   `America/New_York`, next to the expected dates, and print if the two lists
   are equal.

In the output, the line `expected:` has the dates from `dateutil`.

The second script imports `recurrence.ts` and calls `normalizeRecurrence`,
`describeRecurrence`, and `firstRecurrenceRule` with each rule.

## Known gaps / failures

- **`bun run verify` cannot complete on my machine (2 CPUs, 8 GB memory).**
  I ran each of the 22 scripts in `verify` alone, and each passed. For the step
  `turbo run typecheck lint:check`, I ran `typecheck` and `lint:check` for
  `@elizaos/plugin-calendar` only, and both passed. On the full run for my
  earlier PR #35316, the operating system stopped nine large packages for
  memory, and `@elizaos/capacitor-notification-mirror` needs an Android SDK
  that my machine does not have. This PR changes files in
  `plugins/plugin-calendar` only.
- **I did not use a feed from Zimbra.** I wrote the feed body. The Zimbra
  source file is my evidence that a product makes this rule. I did not see
  the text that the Zimbra server writes in a feed.
- **The reply text for such an event stays the raw rule**
  (`freq=daily;byday=mo,tu,we,th,fr`). I did not change `describeRecurrence`.
- **`BYMONTH`, `BYMONTHDAY`, and a weekday with a number in a `DAILY` rule
  stay outside the supported set.** The feed is `partial` for them, as before.

## Deployment

None. The next read of a subscribed feed shows all the events of the series.

AI provider/model: anthropic / claude-opus-5-5
Client / agent tooling: claude-code
Contribution skill revision: N/A - ordinary GitHub contribution without optional run evidence
Attribution status: self-reported
— [contributor]
<!-- eliza-computer-attribution:v1 {"provider":"anthropic","model":"claude-opus-5-5","client":"claude-code","skill_revision":"N/A - ordinary GitHub contribution without optional run evidence"} -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_011znGg3Vnk3wpjQ1HKPJwf8
