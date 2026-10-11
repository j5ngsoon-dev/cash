# Relates to

No issue. Only a person can create an issue in this repository, and no person
has created one for this defect. I did not find the PRD or the MVP plan in the
repository, so I cannot link a section. This PR adds no feature. It corrects
how the feed fetch that is already in `plugins/plugin-calendar` decodes the
body of a subscribed calendar.

# Change

The synchronization of a subscribed calendar (ICS feed) failed for the full
feed when one line fold was inside a character that is not ASCII.

An ICS file has long lines in parts: a line break and one space show that the
line continues. This is a fold. RFC 5545 section 3.1 counts the length of a
line in octets (bytes), not in characters. A character such as `ü`, `분`, or
an emoji has 2 to 4 octets in UTF-8. Thus a producer that folds at 75 octets
can put the fold between the octets of one character. The RFC has a note for
this case: it says that simple implementations make such folds, and that a
reader must unfold the lines in a way that gives the original octets again.

The fetch decoded the body as UTF-8 first, and the parser removed the folds
after that. A body with a fold inside a character is not valid UTF-8 before
the folds are removed. Thus the fetch stopped with the error
`ICS_FEED_INVALID_UTF8`, and no event of the feed was in the calendar. A feed
with German, Korean, or emoji text in a long title can have this result.

This PR moves a fold that is inside a UTF-8 character to the end of that
character before the body is decoded.

Before (base `4da33e0cd1`):

```
Feed folded at 75 octets (folds inside characters)
  body: 780 octets, folds inside a character: 3
  synchronization: threw ICS_FEED_INVALID_UTF8: Calendar feed body is not valid UTF-8.
  events in the feed: 0
    not stored: AA Jahresabschlussgespräch der Geschäftsführung: Prüfung der Bücher für Köln, Düsseldorf und München
    not stored: 분기 실적 검토 회의와 다음 분기 계획 수립을 위한 전체 팀 워크숍 및 저녁 식사 모임 안내
    not stored: Offsite kickoff with dinner and a walk on the beach, last session🎉🎉 see you there
```

After (this PR):

```
Feed folded at 75 octets (folds inside characters)
  body: 780 octets, folds inside a character: 3
  synchronization: outcome=complete source status=fresh error=none
  events in the feed: 3
    stored with the exact title: AA Jahresabschlussgespräch der Geschäftsführung: Prüfung der Bücher für Köln, Düsseldorf und München
    stored with the exact title: 분기 실적 검토 회의와 다음 분기 계획 수립을 위한 전체 팀 워크숍 및 저녁 식사 모임 안내
    stored with the exact title: Offsite kickoff with dinner and a walk on the beach, last session🎉🎉 see you there
```

The backend log row has the two control feeds.

# Why this implementation

Sources that I used:

- RFC 5545 section 3.1, Content Lines
  (https://www.rfc-editor.org/rfc/rfc5545#section-3.1). It gives the limit of
  75 octets for a line, and it has the note about a fold in the middle of a
  UTF-8 multi-octet sequence.
- KDE bug 271859, "vCard logical lines folded in the middle of utf-8
  character" (https://bugs.kde.org/show_bug.cgi?id=271859). KAddressBook
  folded lines at the octet and cut Cyrillic characters. The correction is in
  version 4.13. This is a vCard file, which has the same folding rule. It
  shows that a product did write such folds.
- SOGo bug 2298 (https://bugs.sogo.nu/view.php?id=2298). A user gave SOGo an
  ICS file with a fold inside an umlaut, and SOGo refused the file. The
  report says that SOGo decodes UTF-8 before it unfolds. This is the same
  defect in a different product.

Decisions:

- **The fetch moves the fold. It does not remove it.** The octets
  `C3 CR LF SP BC` become `C3 BC CR LF SP`. The decoded text is the same text
  with the fold one character later. The parser then removes the fold as
  before, and its limits for the number of lines and for the line length see
  the same lines.
- **The change is in the fetch**, because that is where the octets become
  text. The parser gets a string and cannot repair the octets.
- **The fetch now decodes the body one time, after it has read all of it.**
  Before, it decoded each part of the stream. A fold can be between two parts
  of the stream, so the repair needs the full body. The size limit of 5 MB
  and its check during the read are the same as before.
- **A body that is not UTF-8 is an error as before.** The repair moves octets
  only when a fold is directly between the octets of one sequence and the
  necessary continuation octets follow the fold. The replay has a control
  with an octet `0xFF`.

Alternatives that I examined:

- Decode with replacement characters and not with an error. I did not do
  this. It puts wrong characters in titles and hides a body that is not
  UTF-8.
- Remove all folds in the fetch before the decode. I did not do this. The
  parser owns the unfold step and its limits, and two places with the same
  step can disagree.

# Testing

All commands ran on the tree of commit `7ff26edd52aa8ef537183163556423cb8f15291a`
with Bun 1.4.2 and Node 24.15.0 on Linux x64.

- **Real service path, before and after.** A script used the same setup as
  `calendar-ics-source.pglite.test.ts`: the real `CalendarService`, the real
  PGlite tables from the production schema, and a feed body given as octets
  through the transport parameter of `syncIcsCalendarSource`. It
  synchronized three feeds and read each with `getCalendarFeed`:
  1. A feed that is folded at 75 octets. Its three titles have a fold inside
     a character of 2 octets (`ü`), of 3 octets (Korean), and of 4 octets
     (emoji).
  2. Control: the same feed folded between characters. It is correct before
     and after.
  3. Control: a body with the octet `0xFF`. It is an error before and after.
  Results are in **Change** and in the backend log row.
- `bun run test` in `plugins/plugin-calendar`: 32 files passed, 2 skipped;
  375 tests passed, 4 skipped.
- `bun run typecheck` in `plugins/plugin-calendar`: passed.
- `bun run lint:check` in `plugins/plugin-calendar`: passed.
- I added one test case to the existing file
  `calendar-ics-source.pglite.test.ts`. It gives the real service a body in
  which a fold is after the first octet of `ü`, and it compares the stored
  title. It fails on the base commit (the synchronization throws) and passes
  on this branch. I added no test file.

## How to test

1. Check out this branch. Run `bun install`.
2. Run `cd plugins/plugin-calendar && bunx vitest run --config vitest.config.ts test/calendar-ics-source.pglite.test.ts`.
   All tests must pass.
3. Revert only `src/ics/fetch.ts` to `develop` and run the command again. The
   test "reads a feed whose line fold is inside a UTF-8 character" must fail.
4. Read the note in RFC 5545 section 3.1 about a fold in the middle of a UTF-8
   multi-octet sequence.

- [x] Targets `develop` and has no conflicts with the latest `origin/develop`.
- [ ] Ran `bun install` and `bun run verify` after syncing; record blockers below.
- [x] Updated relevant documentation. `N/A - the code comment of the new function is the only text that describes this step`

# Evidence Gate

Evidence must match the reviewed commit. `packages/scripts/pr-evidence.ts rows`
sets the marker from the live PR head; rerun after each push.
<!-- evidence-head:7ff26edd52aa8ef537183163556423cb8f15291a -->

<!-- evidence-row:before-screenshots -->
- [x] Before screenshots: `N/A - backend calendar change, no UI code changes`.
<!-- evidence-row:after-screenshots -->
- [x] After screenshots: `N/A - backend calendar change, no UI code changes`.
<!-- evidence-row:walkthrough-video -->
- [x] Walkthrough video: `N/A - this PR has no UI change`.
<!-- evidence-row:backend-logs -->
- [x] Backend logs show the real code path firing end to end. The script
      synchronized each feed into a real PGlite database through
      `CalendarService` and printed what `getCalendarFeed` returned.

<details>
<summary>Feed synchronization through CalendarService, before and after</summary>

Before, base `4da33e0cd1`:

```
Feed folded at 75 octets (folds inside characters)
  body: 780 octets, folds inside a character: 3
  synchronization: threw ICS_FEED_INVALID_UTF8: Calendar feed body is not valid UTF-8.
  events in the feed: 0
    not stored: AA Jahresabschlussgespräch der Geschäftsführung: Prüfung der Bücher für Köln, Düsseldorf und München
    not stored: 분기 실적 검토 회의와 다음 분기 계획 수립을 위한 전체 팀 워크숍 및 저녁 식사 모임 안내
    not stored: Offsite kickoff with dinner and a walk on the beach, last session🎉🎉 see you there

Control, the same feed folded between characters
  body: 777 octets, folds inside a character: 0
  synchronization: outcome=complete source status=fresh error=none
  events in the feed: 3
    stored with the exact title: AA Jahresabschlussgespräch der Geschäftsführung: Prüfung der Bücher für Köln, Düsseldorf und München
    stored with the exact title: 분기 실적 검토 회의와 다음 분기 계획 수립을 위한 전체 팀 워크숍 및 저녁 식사 모임 안내
    stored with the exact title: Offsite kickoff with dinner and a walk on the beach, last session🎉🎉 see you there

Control, a body that is not UTF-8 (one octet 0xFF in a title)
  body: 777 octets, folds inside a character: 0
  synchronization: threw ICS_FEED_INVALID_UTF8: Calendar feed body is not valid UTF-8.
  events in the feed: 0
    not stored: AA Jahresabschlussgespräch der Geschäftsführung: Prüfung der Bücher für Köln, Düsseldorf und München
    not stored: 분기 실적 검토 회의와 다음 분기 계획 수립을 위한 전체 팀 워크숍 및 저녁 식사 모임 안내
    not stored: Offsite kickoff with dinner and a walk on the beach, last session🎉🎉 see you there
```

After, commit `7ff26edd52aa8ef537183163556423cb8f15291a`:

```
Feed folded at 75 octets (folds inside characters)
  body: 780 octets, folds inside a character: 3
  synchronization: outcome=complete source status=fresh error=none
  events in the feed: 3
    stored with the exact title: AA Jahresabschlussgespräch der Geschäftsführung: Prüfung der Bücher für Köln, Düsseldorf und München
    stored with the exact title: 분기 실적 검토 회의와 다음 분기 계획 수립을 위한 전체 팀 워크숍 및 저녁 식사 모임 안내
    stored with the exact title: Offsite kickoff with dinner and a walk on the beach, last session🎉🎉 see you there

Control, the same feed folded between characters
  body: 777 octets, folds inside a character: 0
  synchronization: outcome=complete source status=fresh error=none
  events in the feed: 3
    stored with the exact title: AA Jahresabschlussgespräch der Geschäftsführung: Prüfung der Bücher für Köln, Düsseldorf und München
    stored with the exact title: 분기 실적 검토 회의와 다음 분기 계획 수립을 위한 전체 팀 워크숍 및 저녁 식사 모임 안내
    stored with the exact title: Offsite kickoff with dinner and a walk on the beach, last session🎉🎉 see you there

Control, a body that is not UTF-8 (one octet 0xFF in a title)
  body: 777 octets, folds inside a character: 0
  synchronization: threw ICS_FEED_INVALID_UTF8: Calendar feed body is not valid UTF-8.
  events in the feed: 0
    not stored: AA Jahresabschlussgespräch der Geschäftsführung: Prüfung der Bücher für Köln, Düsseldorf und München
    not stored: 분기 실적 검토 회의와 다음 분기 계획 수립을 위한 전체 팀 워크숍 및 저녁 식사 모임 안내
    not stored: Offsite kickoff with dinner and a walk on the beach, last session🎉🎉 see you there
```

</details>

<!-- evidence-row:frontend-logs -->
- [x] Frontend logs: `N/A - no frontend change`.
<!-- evidence-row:llm-trajectory -->
- [x] Real-LLM trajectory: `N/A - no agent, action, provider, prompt, or model change`.
<!-- evidence-row:domain-artifacts -->
- [x] Domain artifacts: `N/A - the feed titles and the stored events are in the backend log row; no other artifact applies`.
<!-- evidence-row:ocr-review -->
- [x] OCR review: `N/A - backend calendar change has no rendered visual surface`.

# Evidence Details

The replay script is not in this PR. It does these steps for each feed:

1. Create `CalendarService` on a real PGlite database with the production
   calendar schema, as `calendar-ics-source.pglite.test.ts` does.
2. Make the feed body as octets. The first feed uses a function that cuts
   each line at 75 octets and then at each 74 octets, and puts `CR LF SP` at
   each cut. The function counts the cuts that are inside a character.
3. Create an ICS source and synchronize it with that body.
4. Print the result of the synchronization or its error code.
5. Read the feed with `getCalendarFeed` and print, for each title, if an
   event with the exact title is stored.

## Known gaps / failures

- **`bun run verify` cannot complete on my machine (2 CPUs, 8 GB memory).**
  I ran each of the 22 scripts in `verify` alone, and each passed. For the step
  `turbo run typecheck lint:check`, I ran `typecheck` and `lint:check` for
  `@elizaos/plugin-calendar` only, and both passed. On the full run for my
  earlier PR #35316, the operating system stopped nine large packages for
  memory, and `@elizaos/capacitor-notification-mirror` needs an Android SDK
  that my machine does not have. This PR changes files in
  `plugins/plugin-calendar` only.
- **I did not use a feed from a third-party product.** I made the feed body
  with a function that folds at octets. The RFC note and the two bug reports
  are my evidence that such feeds exist.
- **The fetch keeps the full body in memory before the decode.** The limit is
  5 MB, the same limit as before.
- **A fold after a fold inside one character is not repaired.** Example: a
  lead octet, a fold, one continuation octet, a second fold. A producer that
  folds at 75 octets cannot write this, because its lines are longer than one
  character.

## Deployment

None. The next synchronization of such a feed stores its events.

AI provider/model: anthropic / claude-opus-5-5
Client / agent tooling: claude-code
Contribution skill revision: N/A - ordinary GitHub contribution without optional run evidence
Attribution status: self-reported
— [contributor]
<!-- eliza-computer-attribution:v1 {"provider":"anthropic","model":"claude-opus-5-5","client":"claude-code","skill_revision":"N/A - ordinary GitHub contribution without optional run evidence"} -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_011znGg3Vnk3wpjQ1HKPJwf8
