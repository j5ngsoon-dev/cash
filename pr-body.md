# Relates to

No issue. Only a person can create an issue in this repository, and no person
has created one for this defect. I did not find the PRD or the MVP plan in the
repository, so I cannot link a section. This PR adds no feature. It adds three
missing rows to the Windows time zone table that is already in
`plugins/plugin-calendar`.

# Change

A subscribed calendar (ICS feed) lost each timed event that had one of three
new Windows time zone names.

Outlook and Exchange write the time zone of an event as a Windows zone name,
for example `TZID=Pacific Standard Time`. The feed parser has a table that
changes such a name into an IANA time zone id. The comment of the table says
that it has the CLDR `windowsZones.xml` mappings for territory `001`.

In 2026, Windows got new zones for the time zone changes in Canada. The CLDR
table now has three names that the table in this repository does not have:

| Windows zone name | IANA id (CLDR, territory 001) |
| --- | --- |
| `British Columbia Standard Time` | `America/Vancouver` |
| `Alberta Standard Time` | `America/Edmonton` |
| `Manitoba Standard Time` | `America/Winnipeg` |

For an event with one of these names, the parser found no zone. It put the
event in quarantine, so the event was not in the calendar, and the feed state
was `partial`. A person in Vancouver whose Windows computer has the new zone
gets this result for each new event from Outlook.

This PR adds the three rows.

Before (base `3934f8208b`):

```
feed state: partial

British Columbia Standard Time (new)
  DTSTART;TZID=British Columbia Standard Time:20261020T180000
  not in the feed
Alberta Standard Time (new)
  DTSTART;TZID=Alberta Standard Time:20261020T180000
  not in the feed
Manitoba Standard Time (new)
  DTSTART;TZID=Manitoba Standard Time:20261020T180000
  not in the feed
```

After (this PR):

```
feed state: partial

British Columbia Standard Time (new)
  DTSTART;TZID=British Columbia Standard Time:20261020T180000
  in the feed: startAt=2026-10-21T01:00:00.000Z timezone=America/Vancouver
Alberta Standard Time (new)
  DTSTART;TZID=Alberta Standard Time:20261020T180000
  in the feed: startAt=2026-10-21T00:00:00.000Z timezone=America/Edmonton
Manitoba Standard Time (new)
  DTSTART;TZID=Manitoba Standard Time:20261020T180000
  in the feed: startAt=2026-10-20T23:00:00.000Z timezone=America/Winnipeg
```

The feed state stays `partial` after the change because of a control event
with an unknown name. The backend log row has the two control events.

# Why this implementation

Sources that I used:

- The CLDR file `common/supplemental/windowsZones.xml` on the `main` branch
  (https://github.com/unicode-org/cldr/blob/main/common/supplemental/windowsZones.xml).
  It has these three lines, each below a comment with the Windows display name:
  - `<mapZone other="British Columbia Standard Time" territory="001" type="America/Vancouver"/>`
  - `<mapZone other="Alberta Standard Time" territory="001" type="America/Edmonton"/>`
  - `<mapZone other="Manitoba Standard Time" territory="001" type="America/Winnipeg"/>`
- I compared all the territory `001` names of that file with the table in this
  repository. The CLDR file has 142 names. The table has all of them but these
  three and `UTC`. `UTC` is a valid IANA id, so the parser already accepts it
  before it reads the table.
- The Microsoft 365 message MC1479468, "Interim time zone guidance for
  Alberta, British Columbia, and Morocco"
  (https://mc.merill.net/message/MC1479468 has a copy). It says that the new
  zones for Alberta and British Columbia are in the September 2026 preview
  update of Windows 11 and in the October 2026 security update of the other
  Windows versions, and that the time zone changes start on 2026-11-01. The
  message does not speak about Manitoba. For Manitoba, the CLDR file is my
  only source.

Decisions:

- **I added the rows at the positions that they have in the CLDR file.** The
  table has the order of that file, so a later comparison stays easy.
- **I did not change the other rows.** The table also has
  `Kamchatka Standard Time`, which the CLDR file does not have now. An old
  feed can have that name, so I did not remove it.

Alternatives that I examined:

- Generate the table from the CLDR file at build time. I did not do this. It
  adds a build step and a dependency for three rows.

# Testing

All commands ran on the tree of commit `8d5bf3037cf1e983e7587a2973871bb654ea61b2`
with Bun 1.4.2 and Node 24.15.0 on Linux x64.

- **Real service path, before and after.** A script used the same setup as
  `calendar-ics-source.pglite.test.ts`: the real `CalendarService`, the real
  PGlite tables from the production schema, and a feed body given through the
  transport parameter of `syncIcsCalendarSource`. It stored a feed that has
  five events and read it with `getCalendarFeed`. Results are in **Change**
  and in the backend log row. Two events are controls: a Windows zone name
  that the table already has, and a name that is not a Windows zone and must
  stay in quarantine.
- `bun run test` in `plugins/plugin-calendar`: 31 files passed, 2 skipped;
  364 tests passed, 4 skipped.
- `bun run typecheck` in `plugins/plugin-calendar`: passed.
- `bun run lint:check` in `plugins/plugin-calendar`: passed.
- I added one test case to the existing file
  `calendar-ics-source.pglite.test.ts`. It stores three events through the
  real service and database and reads the feed. It fails on the base commit
  and passes on this branch. I added no test file.

The events of the replay and of the test are on 2026-10-20. On that date the
three zones have the offsets that they had before the changes of 2026-11-01
(UTC-7, UTC-6, and UTC-5). Thus the expected instants do not depend on the
version of the time zone data of the machine.

## How to test

1. Check out this branch. Run `bun install`.
2. Run `cd plugins/plugin-calendar && bunx vitest run --config vitest.config.ts test/calendar-ics-source.pglite.test.ts`.
   All tests must pass.
3. Revert only `src/ics/windows-timezones.ts` to `develop` and run the command
   again. The test "reads the Windows zone names that the 2026 Canada changes
   added" must fail.
4. Open the CLDR file in **Why this implementation** and find the three names.

- [x] Targets `develop` and has no conflicts with the latest `origin/develop`.
- [ ] Ran `bun install` and `bun run verify` after syncing; record blockers below.
- [ ] Updated relevant documentation. `N/A - the table comment already names the CLDR file as its source; no other text describes the zone names`

# Evidence Gate

Evidence must match the reviewed commit. `packages/scripts/pr-evidence.ts rows`
sets the marker from the live PR head; rerun after each push.
<!-- evidence-head:8d5bf3037cf1e983e7587a2973871bb654ea61b2 -->

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
<summary>Feed replay through CalendarService, before and after</summary>

Before, base `3934f8208b`:

```
feed state: partial

British Columbia Standard Time (new)
  DTSTART;TZID=British Columbia Standard Time:20261020T180000
  not in the feed
Alberta Standard Time (new)
  DTSTART;TZID=Alberta Standard Time:20261020T180000
  not in the feed
Manitoba Standard Time (new)
  DTSTART;TZID=Manitoba Standard Time:20261020T180000
  not in the feed
Control, Pacific Standard Time
  DTSTART;TZID=Pacific Standard Time:20261020T180000
  in the feed: startAt=2026-10-21T01:00:00.000Z timezone=America/Los_Angeles
Control, a name that is not a Windows zone
  DTSTART;TZID=Ontario Standard Time:20261020T180000
  not in the feed
```

After, commit `8d5bf3037cf1e983e7587a2973871bb654ea61b2`:

```
feed state: partial

British Columbia Standard Time (new)
  DTSTART;TZID=British Columbia Standard Time:20261020T180000
  in the feed: startAt=2026-10-21T01:00:00.000Z timezone=America/Vancouver
Alberta Standard Time (new)
  DTSTART;TZID=Alberta Standard Time:20261020T180000
  in the feed: startAt=2026-10-21T00:00:00.000Z timezone=America/Edmonton
Manitoba Standard Time (new)
  DTSTART;TZID=Manitoba Standard Time:20261020T180000
  in the feed: startAt=2026-10-20T23:00:00.000Z timezone=America/Winnipeg
Control, Pacific Standard Time
  DTSTART;TZID=Pacific Standard Time:20261020T180000
  in the feed: startAt=2026-10-21T01:00:00.000Z timezone=America/Los_Angeles
Control, a name that is not a Windows zone
  DTSTART;TZID=Ontario Standard Time:20261020T180000
  not in the feed
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

The replay script is not in this PR. It does these steps:

1. Create `CalendarService` on a real PGlite database with the production
   calendar schema, as `calendar-ics-source.pglite.test.ts` does.
2. Create an ICS source and synchronize it with a feed body that has five
   events. Each event starts at `20261020T180000` and has a different `TZID`.
3. Read the feed from 2026-10-20 to 2026-10-22 with `getCalendarFeed`.
4. Print the feed state, and for each event print its start instant and its
   time zone, or "not in the feed".

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
  with the zone names of the CLDR file.
- **The CLDR names are on the `main` branch.** The CLDR releases 47 and 48 do
  not have them. I did not examine other releases.
- **The instants after 2026-11-01 depend on the time zone data of the
  runtime.** This PR gives the IANA id only. The offset of an id comes from
  the time zone data of Node or Bun.
- **My PR #35628 adds a test case to the same test file**, at a different
  place. The two changes are independent.

## Deployment

None. The next synchronization of a subscribed feed stores the events.

AI provider/model: anthropic / claude-opus-5-5
Client / agent tooling: claude-code
Contribution skill revision: N/A - ordinary GitHub contribution without optional run evidence
Attribution status: self-reported
— [contributor]
<!-- eliza-computer-attribution:v1 {"provider":"anthropic","model":"claude-opus-5-5","client":"claude-code","skill_revision":"N/A - ordinary GitHub contribution without optional run evidence"} -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_011znGg3Vnk3wpjQ1HKPJwf8
