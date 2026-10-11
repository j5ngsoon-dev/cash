# Relates to

No issue. Only a person can create an issue in this repository, and no person
has created one for this defect. I did not find the PRD or the MVP plan in the
repository, so I cannot link a section. It corrects the expansion of a
recurring series in the calendar code that is already in
`plugins/plugin-calendar`.

# Change

A subscribed calendar (ICS feed) showed only the first event of a series when
the rule had `BYSETPOS`.

`BYSETPOS` selects dates from the dates that the other parts of a rule give.
Example: `FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1` is the last work day
of each month.

Microsoft Exchange and Outlook write this form for each event on "the Nth
weekday" of a month or of a year. The Microsoft specification MS-OXCICAL gives
these templates:

- `FREQ=MONTHLY;BYDAY=SU;BYSETPOS=3` is the third Sunday of every month.
- `FREQ=YEARLY;BYDAY=SU;BYSETPOS=3;BYMONTH=6` is the third Sunday of every
  June.

Thus a monthly team meeting from an Outlook calendar has this form.

The local expansion did not support `BYSETPOS`. It put such a rule outside its
supported set. Thus the feed kept only the first event of the series, and the
feed state was `partial`.

Before (base `a90c52d8dc`):

```
feed state: partial

RFC 5545: third instance into the month of Tuesday, Wednesday, or Thursday, for 3 months
  DTSTART;TZID=America/New_York:19970904T090000
  RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3
  expected: Sep 4, 1997; Oct 7, 1997; Nov 6, 1997
  feed result (1): Sep 4, 1997
  agrees: no

MS-OXCICAL form: third Sunday of every month
  DTSTART;TZID=America/New_York:19970921T090000
  RRULE:FREQ=MONTHLY;BYDAY=SU;BYSETPOS=3;COUNT=4
  expected: Sep 21, 1997; Oct 19, 1997; Nov 16, 1997; Dec 21, 1997
  feed result (1): Sep 21, 1997
  agrees: no
```

After (this PR):

```
feed state: complete

RFC 5545: third instance into the month of Tuesday, Wednesday, or Thursday, for 3 months
  DTSTART;TZID=America/New_York:19970904T090000
  RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3
  expected: Sep 4, 1997; Oct 7, 1997; Nov 6, 1997
  feed result (3): Sep 4, 1997; Oct 7, 1997; Nov 6, 1997
  agrees: yes

MS-OXCICAL form: third Sunday of every month
  DTSTART;TZID=America/New_York:19970921T090000
  RRULE:FREQ=MONTHLY;BYDAY=SU;BYSETPOS=3;COUNT=4
  expected: Sep 21, 1997; Oct 19, 1997; Nov 16, 1997; Dec 21, 1997
  feed result (4): Sep 21, 1997; Oct 19, 1997; Nov 16, 1997; Dec 21, 1997
  agrees: yes
```

The backend log row has all seven series.

# Why this implementation

This PR adds one rule part to the set that the expansion of a subscribed
calendar supports. I say this here because it is important for the review. I
think that it is a correction and not a feature, for these reasons:

- The owner sees a defect: a monthly event from an Outlook calendar is in the
  calendar one time only.
- RFC 5545 has examples of the form with their dates. The result is not a
  matter of opinion.
- The expansion already calculates the dates of one month (PR #35468) and of
  one year (PR #35489). This PR selects dates from that list.

Sources that I used:

- RFC 5545 section 3.8.5.3 (https://www.rfc-editor.org/rfc/rfc5545#section-3.8.5.3).
  The examples "The third instance into the month of one of Tuesday,
  Wednesday, or Thursday, for the next 3 months" and "The second-to-last
  weekday of the month" give the rules and the dates. The same section says
  that `BYSETPOS` selects from the set of dates of one interval of the rule:
  one month for `MONTHLY`, one year for `YEARLY`.
- MS-OXCICAL section 2.1.3.2.2.4, "Template: Monthly Nth Recurrences"
  (https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxcical/47624472-cffc-4d8d-b1c8-ca55e1b404b6),
  and section 2.1.3.2.2.6, "Template: Yearly Nth Recurrences"
  (https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxcical/0f3eb29d-a3b3-46e4-98db-5658f14d5ca8).
  They give the templates and the export rule: `BYDAY` gets the weekdays and
  `BYSETPOS` gets the number of the instance (-1 for the last one).

Decisions:

- **Only the feed expansion uses the new part.** `parseRecurrenceRule` and
  `firstRecurrenceRule` get the option `bySetPos`, next to the options
  `localUntil` (PR #35449), `monthlyByDay` (PR #35468), and `yearlyByMonth`
  (PR #35489). Only `ics/source.ts` sets it. Without the option, the parser
  gives the same result as before. Thus the rule check for event creation,
  the check for a "this and following" change of a series, and the reply text
  do not change. The transcript is in the backend log row.
- **`BYSETPOS` is in the supported set for a `MONTHLY` rule and for a
  `YEARLY` rule that has `BYMONTH`.** For these rules, the expansion already
  has the list of the dates of one month or one year.
- **For a `YEARLY` rule, the selection is from the dates of the full year**,
  as the RFC says. With one month in `BYMONTH`, this is the same as the dates
  of that month.
- **`BYSETPOS` in a `DAILY` or `WEEKLY` rule, or in a `YEARLY` rule without
  `BYMONTH`, stays outside the supported set.** So does a value of 0 or a
  value above 366 or below -366, which the RFC does not permit.
- **A position that the month does not have gives no event.** Example: the
  fifth Sunday in a month with four Sundays.

Alternatives that I examined:

- Change `BYDAY=SU;BYSETPOS=3` into `BYDAY=3SU` in the parser. I did not do
  this. It is correct only for one weekday. The Exchange template "the last
  weekday of every month" has five weekdays and cannot have that form.
- Support the part in all callers. I did not do this, for the same reasons as
  in PR #35468: the series split check and the reply text each need more
  code, and I cannot test the series split against a calendar provider.

# Testing

All commands ran on the tree of commit `5e7548e53fbd3259d574180352118325784ba373`
with Bun 1.4.2 and Node 24.15.0 on Linux x64.

- **Real service path, before and after.** A script used the same setup as
  `calendar-ics-source.pglite.test.ts`: the real `CalendarService`, the real
  PGlite tables from the production schema, and a feed body given through the
  transport parameter of `syncIcsCalendarSource`. It stored a feed that has
  seven series and read it with `getCalendarFeed`. It compared each feed
  result with the expected dates. Two series are RFC 5545 examples with the
  dates of the RFC. Four series have the forms of the MS-OXCICAL templates. I
  calculated their dates with the Python library `dateutil` (a different
  implementation of RFC 5545). One series is a control: a monthly rule
  without `BYSETPOS`, with the same result before and after. Results are in
  **Change** and in the backend log row.
- **Other callers, before and after.** A second script called
  `normalizeRecurrence`, `describeRecurrence`, and `firstRecurrenceRule`
  without the option. The output is the same before and after. It is in the
  backend log row.
- `bun run test` in `plugins/plugin-calendar`: 31 files passed, 2 skipped;
  364 tests passed, 4 skipped.
- `bun run typecheck` in `plugins/plugin-calendar`: passed.
- `bun run lint:check` in `plugins/plugin-calendar`: passed.
- I added one test case to the existing file
  `calendar-ics-source.pglite.test.ts`. It stores one RFC example and one
  Exchange form through the real service and database and compares the feed
  with the expected dates. It fails on the base commit (the feed state is
  `partial`) and passes on this branch. I added no test file.

## How to test

1. Check out this branch. Run `bun install`.
2. Run `cd plugins/plugin-calendar && bunx vitest run --config vitest.config.ts test/calendar-ics-source.pglite.test.ts`.
   All tests must pass.
3. Revert only `src/internal/recurrence.ts` and `src/ics/source.ts` to
   `develop` and run the command again. The test "expands the rules that
   select dates with BYSETPOS" must fail.
4. Read the example "The third instance into the month of one of Tuesday,
   Wednesday, or Thursday, for the next 3 months" in RFC 5545 section 3.8.5.3
   (https://www.rfc-editor.org/rfc/rfc5545#section-3.8.5.3) and compare its
   dates with the dates in the test.

- [x] Targets `develop` and has no conflicts with the latest `origin/develop`.
- [ ] Ran `bun install` and `bun run verify` after syncing; record blockers below.
- [ ] Updated relevant documentation. `N/A - the code comments are the only text that describes the supported rule forms; this PR updates them`

# Evidence Gate

Evidence must match the reviewed commit. `packages/scripts/pr-evidence.ts rows`
sets the marker from the live PR head; rerun after each push.
<!-- evidence-head:5e7548e53fbd3259d574180352118325784ba373 -->

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

Feed replay before, base `a90c52d8dc`:

```
feed state: partial

RFC 5545: third instance into the month of Tuesday, Wednesday, or Thursday, for 3 months
  DTSTART;TZID=America/New_York:19970904T090000
  RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3
  expected: Sep 4, 1997; Oct 7, 1997; Nov 6, 1997
  feed result (1): Sep 4, 1997
  agrees: no

RFC 5545: second-to-last weekday of the month (first 7)
  DTSTART;TZID=America/New_York:19970929T090000
  RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2;COUNT=7
  expected: Sep 29, 1997; Oct 30, 1997; Nov 27, 1997; Dec 30, 1997; Jan 29, 1998; Feb 26, 1998; Mar 30, 1998
  feed result (1): Sep 29, 1997
  agrees: no

MS-OXCICAL form: third Sunday of every month
  DTSTART;TZID=America/New_York:19970921T090000
  RRULE:FREQ=MONTHLY;BYDAY=SU;BYSETPOS=3;COUNT=4
  expected: Sep 21, 1997; Oct 19, 1997; Nov 16, 1997; Dec 21, 1997
  feed result (1): Sep 21, 1997
  agrees: no

MS-OXCICAL form: last weekday of every month
  DTSTART;TZID=America/New_York:19970930T090000
  RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=4
  expected: Sep 30, 1997; Oct 31, 1997; Nov 28, 1997; Dec 31, 1997
  feed result (1): Sep 30, 1997
  agrees: no

MS-OXCICAL form: third Sunday of every June
  DTSTART;TZID=America/New_York:19970615T090000
  RRULE:FREQ=YEARLY;BYDAY=SU;BYSETPOS=3;BYMONTH=6;COUNT=4
  expected: Jun 15, 1997; Jun 21, 1998; Jun 20, 1999; Jun 18, 2000
  feed result (1): Jun 15, 1997
  agrees: no

MS-OXCICAL form: last weekday of every April
  DTSTART;TZID=America/New_York:19970430T090000
  RRULE:FREQ=YEARLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;BYMONTH=4;COUNT=3
  expected: Apr 30, 1997; Apr 30, 1998; Apr 30, 1999
  feed result (1): Apr 30, 1997
  agrees: no

Control, monthly rule without BYSETPOS
  DTSTART;TZID=America/New_York:19970905T090000
  RRULE:FREQ=MONTHLY;BYDAY=1FR;COUNT=3
  expected: Sep 5, 1997; Oct 3, 1997; Nov 7, 1997
  feed result (3): Sep 5, 1997; Oct 3, 1997; Nov 7, 1997
  agrees: yes
```

Feed replay after, commit `5e7548e53fbd3259d574180352118325784ba373`:

```
feed state: complete

RFC 5545: third instance into the month of Tuesday, Wednesday, or Thursday, for 3 months
  DTSTART;TZID=America/New_York:19970904T090000
  RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3
  expected: Sep 4, 1997; Oct 7, 1997; Nov 6, 1997
  feed result (3): Sep 4, 1997; Oct 7, 1997; Nov 6, 1997
  agrees: yes

RFC 5545: second-to-last weekday of the month (first 7)
  DTSTART;TZID=America/New_York:19970929T090000
  RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2;COUNT=7
  expected: Sep 29, 1997; Oct 30, 1997; Nov 27, 1997; Dec 30, 1997; Jan 29, 1998; Feb 26, 1998; Mar 30, 1998
  feed result (7): Sep 29, 1997; Oct 30, 1997; Nov 27, 1997; Dec 30, 1997; Jan 29, 1998; Feb 26, 1998; Mar 30, 1998
  agrees: yes

MS-OXCICAL form: third Sunday of every month
  DTSTART;TZID=America/New_York:19970921T090000
  RRULE:FREQ=MONTHLY;BYDAY=SU;BYSETPOS=3;COUNT=4
  expected: Sep 21, 1997; Oct 19, 1997; Nov 16, 1997; Dec 21, 1997
  feed result (4): Sep 21, 1997; Oct 19, 1997; Nov 16, 1997; Dec 21, 1997
  agrees: yes

MS-OXCICAL form: last weekday of every month
  DTSTART;TZID=America/New_York:19970930T090000
  RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=4
  expected: Sep 30, 1997; Oct 31, 1997; Nov 28, 1997; Dec 31, 1997
  feed result (4): Sep 30, 1997; Oct 31, 1997; Nov 28, 1997; Dec 31, 1997
  agrees: yes

MS-OXCICAL form: third Sunday of every June
  DTSTART;TZID=America/New_York:19970615T090000
  RRULE:FREQ=YEARLY;BYDAY=SU;BYSETPOS=3;BYMONTH=6;COUNT=4
  expected: Jun 15, 1997; Jun 21, 1998; Jun 20, 1999; Jun 18, 2000
  feed result (4): Jun 15, 1997; Jun 21, 1998; Jun 20, 1999; Jun 18, 2000
  agrees: yes

MS-OXCICAL form: last weekday of every April
  DTSTART;TZID=America/New_York:19970430T090000
  RRULE:FREQ=YEARLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;BYMONTH=4;COUNT=3
  expected: Apr 30, 1997; Apr 30, 1998; Apr 30, 1999
  feed result (3): Apr 30, 1997; Apr 30, 1998; Apr 30, 1999
  agrees: yes

Control, monthly rule without BYSETPOS
  DTSTART;TZID=America/New_York:19970905T090000
  RRULE:FREQ=MONTHLY;BYDAY=1FR;COUNT=3
  expected: Sep 5, 1997; Oct 3, 1997; Nov 7, 1997
  feed result (3): Sep 5, 1997; Oct 3, 1997; Nov 7, 1997
  agrees: yes
```

Other callers. The output is the same on base `a90c52d8dc` and on commit
`5e7548e53fbd3259d574180352118325784ba373`:

```
RRULE:FREQ=MONTHLY;BYDAY=SU;BYSETPOS=3
  normalizeRecurrence: ["RRULE:FREQ=MONTHLY;BYDAY=SU;BYSETPOS=3"]
  describeRecurrence: "freq=monthly;byday=su;bysetpos=3"
  firstRecurrenceRule (no option) outside the expansion subset: true
RRULE:FREQ=YEARLY;BYDAY=SU;BYSETPOS=3;BYMONTH=6
  normalizeRecurrence: ["RRULE:FREQ=YEARLY;BYDAY=SU;BYSETPOS=3;BYMONTH=6"]
  describeRecurrence: "freq=yearly;byday=su;bysetpos=3;bymonth=6"
  firstRecurrenceRule (no option) outside the expansion subset: true
RRULE:FREQ=MONTHLY;BYMONTHDAY=15
  normalizeRecurrence: ["RRULE:FREQ=MONTHLY;BYMONTHDAY=15"]
  describeRecurrence: "monthly on day 15"
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
2. Create an ICS source and synchronize it with a feed body that has seven
   series. Each series starts in 1997 in `America/New_York`.
3. Read the feed from 1997-01-01 to 2004-01-01 with `getCalendarFeed`.
4. Print the feed state and the day of each returned event in
   `America/New_York`, next to the expected dates, and print if the two lists
   are equal.

The RFC example "The second-to-last weekday of the month" has no end, and the
RFC lists its first 7 dates. I added `COUNT=7` to that rule in the replay, so
the feed result has an end to compare. I added `COUNT` to the MS-OXCICAL
templates for the same reason.

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
- **I did not use a feed from Outlook or Exchange.** I wrote the feed body
  with the forms of the MS-OXCICAL templates.
- **The reply text for such an event stays the raw rule**
  (`freq=monthly;byday=su;bysetpos=3`). I did not change `describeRecurrence`.
- **`BYSETPOS` in a `DAILY` or `WEEKLY` rule, or in a `YEARLY` rule without
  `BYMONTH`, stays outside the supported set.** The feed is `partial` for it,
  as before.

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
