# Relates to

No issue. Only a person can create an issue in this repository, and no person
has created one for this defect. I did not find the PRD or the MVP plan in the
repository, so I cannot link a section. This PR adds no feature. It corrects
how the unsubscribe service that is already in `plugins/plugin-inbox` reads a
`mailto` unsubscribe target.

# Change

When the owner unsubscribed from a mailing list by email, the assistant sent
an unsubscribe email with a damaged token or with no token, and it recorded
the result as `succeeded`.

A newsletter gives its unsubscribe target in the header `List-Unsubscribe`.
One form of the target is a `mailto` URI with a subject or a body, for example
`<mailto:leave@lists.example.com?subject=unsubscribe%20a1B2+c3D4>`. The list
server reads the subject or the body to find the subscriber. The text is
frequently a token.

The service read the subject and the body with `URLSearchParams`. That class
is for HTML form data. It has two rules that are not correct for a `mailto`
URI:

- It reads `+` as a space. In a `mailto` URI, `+` is the character `+`. A
  token such as `a1B2+c3D4` was sent as `a1B2 c3D4`.
- It finds a field only when the name has small letters (`subject`). A
  `mailto` field name can have capital letters (`Subject`). The service did
  not find such a field, and it sent the default text `unsubscribe` with no
  token.

In the two cases, the list server cannot find the subscriber, so the owner
stays on the list. The record says `succeeded`.

This PR keeps `+` and finds a field name in all letter cases.

Before (base `6b83a01fcf`):

```
A token with '+' in the subject
  List-Unsubscribe: <mailto:unsubscribe@lists.example.com?subject=unsubscribe%20a1B2+c3D4/e5==>
  record: method=mailto status=succeeded
  expected email: {"recipient":"unsubscribe@lists.example.com","subject":"unsubscribe a1B2+c3D4/e5==","body":null}
  email sent:     {"recipient":"unsubscribe@lists.example.com","subject":"unsubscribe a1B2 c3D4/e5==","body":null}
  agrees: no

Field names with capital letters
  List-Unsubscribe: <mailto:requests@lists.example.com?Subject=unsubscribe%20list-42&Body=stop>
  record: method=mailto status=succeeded
  expected email: {"recipient":"requests@lists.example.com","subject":"unsubscribe list-42","body":"stop"}
  email sent:     {"recipient":"requests@lists.example.com","subject":null,"body":null}
  agrees: no
```

After (this PR):

```
A token with '+' in the subject
  List-Unsubscribe: <mailto:unsubscribe@lists.example.com?subject=unsubscribe%20a1B2+c3D4/e5==>
  record: method=mailto status=succeeded
  expected email: {"recipient":"unsubscribe@lists.example.com","subject":"unsubscribe a1B2+c3D4/e5==","body":null}
  email sent:     {"recipient":"unsubscribe@lists.example.com","subject":"unsubscribe a1B2+c3D4/e5==","body":null}
  agrees: yes

Field names with capital letters
  List-Unsubscribe: <mailto:requests@lists.example.com?Subject=unsubscribe%20list-42&Body=stop>
  record: method=mailto status=succeeded
  expected email: {"recipient":"requests@lists.example.com","subject":"unsubscribe list-42","body":"stop"}
  email sent:     {"recipient":"requests@lists.example.com","subject":"unsubscribe list-42","body":"stop"}
  agrees: yes
```

The backend log row has all five targets.

# Why this implementation

Sources that I used:

- RFC 6068, the `mailto` URI scheme (https://www.rfc-editor.org/rfc/rfc6068).
  - Section 2 has the grammar. `+` is in `some-delims`, so a field value can
    have a literal `+`. The same section says that a field name (`hfname`) is
    case-insensitive.
  - Section 5 says that a `+` that stands for a space cannot be told from a
    real `+`, that a producer SHOULD write a space as `%20`, and that a
    producer MAY write `+` as `%2B`. Thus a literal `+` is the character `+`.
- RFC 2369 defines `List-Unsubscribe` and its `mailto` form.

Decisions:

- **The code keeps `URLSearchParams` and protects `+` first.** It changes
  each `+` into `%2B` before the parse. All other decoding stays the same as
  before, also for a value that has a `%` with no hexadecimal digits.
- **The field name is compared in small letters.** The first field with the
  name is used, as before.
- **I did not change the address part.** It already keeps `+`
  (`unsub+token@lists.example.com`). The replay has this as a control.

Alternatives that I examined:

- Decode each field with `decodeURIComponent`. I did not do this. It throws
  an error for a value such as `100%`, which `URLSearchParams` accepts. That
  changes a request that works now into a failure.

# Testing

All commands ran on the tree of commit `684a65ec88f84bf1540da702b574360b252d2d35`
with Bun 1.4.2 and Node 24.15.0 on Linux x64.

- **Real service path, before and after.** A script used the same setup as
  `inbox.real-db.test.ts`: a real runtime with a real PGlite database and the
  real `InboxUnsubscribeService`. The Gmail gateway is a double, as in that
  test file, because it is the network boundary. For each of five
  `List-Unsubscribe` values, the script called `unsubscribeEmailSender` and
  printed the email that the service gave to the gateway
  (`sendMailtoUnsubscribeEmail`) and the stored record. Two values are
  controls: `+` written as `%2B`, and `+` in the address. Their results are
  the same before and after. Results are in **Change** and in the backend log
  row.
- `bun run test` in `plugins/plugin-inbox`: 13 files passed, 1 skipped;
  81 tests passed, 2 skipped.
- `bun run typecheck` in `plugins/plugin-inbox`: passed.
- `bun run lint:check` in `plugins/plugin-inbox`: passed.
- I added one test case to the existing file `inbox.real-db.test.ts`. It uses
  the real service and database and compares the email that the gateway
  gets. It fails on the base commit and passes on this branch. I added no
  test file.

## How to test

1. Check out this branch. Run `bun install`.
2. Run `cd plugins/plugin-inbox && bunx vitest run --config ./vitest.config.ts test/inbox.real-db.test.ts`.
   All tests must pass.
3. Revert only `src/inbox/unsubscribe-service.ts` to `develop` and run the
   command again. The test "sends the mailto unsubscribe fields as RFC 6068
   defines them" must fail.
4. Read RFC 6068 section 2 (the grammar and the sentence about `hfname`) and
   section 5 (the paragraph about `+`).

- [x] Targets `develop` and has no conflicts with the latest `origin/develop`.
- [ ] Ran `bun install` and `bun run verify` after syncing; record blockers below.
- [x] Updated relevant documentation. `N/A - a code comment at the changed lines is the only text that describes this parse`

# Evidence Gate

Evidence must match the reviewed commit. `packages/scripts/pr-evidence.ts rows`
sets the marker from the live PR head; rerun after each push.
<!-- evidence-head:684a65ec88f84bf1540da702b574360b252d2d35 -->

<!-- evidence-row:before-screenshots -->
- [x] Before screenshots: `N/A - backend inbox change, no UI code changes`.
<!-- evidence-row:after-screenshots -->
- [x] After screenshots: `N/A - backend inbox change, no UI code changes`.
<!-- evidence-row:walkthrough-video -->
- [x] Walkthrough video: `N/A - this PR has no UI change`.
<!-- evidence-row:backend-logs -->
- [x] Backend logs show the real code path firing end to end. The script
      called the real `InboxUnsubscribeService` on a real PGlite database and
      printed the email that the service gave to the Gmail gateway.

<details>
<summary>Unsubscribe requests through InboxUnsubscribeService, before and after</summary>

Before, base `6b83a01fcf`:

```
A token with '+' in the subject
  List-Unsubscribe: <mailto:unsubscribe@lists.example.com?subject=unsubscribe%20a1B2+c3D4/e5==>
  record: method=mailto status=succeeded
  expected email: {"recipient":"unsubscribe@lists.example.com","subject":"unsubscribe a1B2+c3D4/e5==","body":null}
  email sent:     {"recipient":"unsubscribe@lists.example.com","subject":"unsubscribe a1B2 c3D4/e5==","body":null}
  agrees: no

A token with '+' in the body
  List-Unsubscribe: <mailto:leave@lists.example.com?subject=leave&body=token%3Aq9+Zx%2Fw>
  record: method=mailto status=succeeded
  expected email: {"recipient":"leave@lists.example.com","subject":"leave","body":"token:q9+Zx/w"}
  email sent:     {"recipient":"leave@lists.example.com","subject":"leave","body":"token:q9 Zx/w"}
  agrees: no

Field names with capital letters
  List-Unsubscribe: <mailto:requests@lists.example.com?Subject=unsubscribe%20list-42&Body=stop>
  record: method=mailto status=succeeded
  expected email: {"recipient":"requests@lists.example.com","subject":"unsubscribe list-42","body":"stop"}
  email sent:     {"recipient":"requests@lists.example.com","subject":null,"body":null}
  agrees: no

Control, '+' written as %2B
  List-Unsubscribe: <mailto:unsubscribe@lists.example.com?subject=unsubscribe%20a1B2%2Bc3D4>
  record: method=mailto status=succeeded
  expected email: {"recipient":"unsubscribe@lists.example.com","subject":"unsubscribe a1B2+c3D4","body":null}
  email sent:     {"recipient":"unsubscribe@lists.example.com","subject":"unsubscribe a1B2+c3D4","body":null}
  agrees: yes

Control, '+' in the address
  List-Unsubscribe: <mailto:unsub+a1b2c3@lists.example.com?subject=unsubscribe>
  record: method=mailto status=succeeded
  expected email: {"recipient":"unsub+a1b2c3@lists.example.com","subject":"unsubscribe","body":null}
  email sent:     {"recipient":"unsub+a1b2c3@lists.example.com","subject":"unsubscribe","body":null}
  agrees: yes
```

After, commit `684a65ec88f84bf1540da702b574360b252d2d35`:

```
A token with '+' in the subject
  List-Unsubscribe: <mailto:unsubscribe@lists.example.com?subject=unsubscribe%20a1B2+c3D4/e5==>
  record: method=mailto status=succeeded
  expected email: {"recipient":"unsubscribe@lists.example.com","subject":"unsubscribe a1B2+c3D4/e5==","body":null}
  email sent:     {"recipient":"unsubscribe@lists.example.com","subject":"unsubscribe a1B2+c3D4/e5==","body":null}
  agrees: yes

A token with '+' in the body
  List-Unsubscribe: <mailto:leave@lists.example.com?subject=leave&body=token%3Aq9+Zx%2Fw>
  record: method=mailto status=succeeded
  expected email: {"recipient":"leave@lists.example.com","subject":"leave","body":"token:q9+Zx/w"}
  email sent:     {"recipient":"leave@lists.example.com","subject":"leave","body":"token:q9+Zx/w"}
  agrees: yes

Field names with capital letters
  List-Unsubscribe: <mailto:requests@lists.example.com?Subject=unsubscribe%20list-42&Body=stop>
  record: method=mailto status=succeeded
  expected email: {"recipient":"requests@lists.example.com","subject":"unsubscribe list-42","body":"stop"}
  email sent:     {"recipient":"requests@lists.example.com","subject":"unsubscribe list-42","body":"stop"}
  agrees: yes

Control, '+' written as %2B
  List-Unsubscribe: <mailto:unsubscribe@lists.example.com?subject=unsubscribe%20a1B2%2Bc3D4>
  record: method=mailto status=succeeded
  expected email: {"recipient":"unsubscribe@lists.example.com","subject":"unsubscribe a1B2+c3D4","body":null}
  email sent:     {"recipient":"unsubscribe@lists.example.com","subject":"unsubscribe a1B2+c3D4","body":null}
  agrees: yes

Control, '+' in the address
  List-Unsubscribe: <mailto:unsub+a1b2c3@lists.example.com?subject=unsubscribe>
  record: method=mailto status=succeeded
  expected email: {"recipient":"unsub+a1b2c3@lists.example.com","subject":"unsubscribe","body":null}
  email sent:     {"recipient":"unsub+a1b2c3@lists.example.com","subject":"unsubscribe","body":null}
  agrees: yes
```

</details>

<!-- evidence-row:frontend-logs -->
- [x] Frontend logs: `N/A - no frontend change`.
<!-- evidence-row:llm-trajectory -->
- [x] Real-LLM trajectory: `N/A - no agent, action, provider, prompt, or model change`.
<!-- evidence-row:domain-artifacts -->
- [x] Domain artifacts: `N/A - the email fields and the stored record are in the backend log row; no other artifact applies`.
<!-- evidence-row:ocr-review -->
- [x] OCR review: `N/A - backend inbox change has no rendered visual surface`.

# Evidence Details

The replay script is not in this PR. It does these steps for each
`List-Unsubscribe` value:

1. Create a real runtime with a PGlite database and the inbox schema, as
   `inbox.real-db.test.ts` does.
2. Make a Gmail gateway double that returns one newsletter message with the
   `List-Unsubscribe` header, and that records the argument of
   `sendMailtoUnsubscribeEmail`.
3. Call `unsubscribeEmailSender` of the real `InboxUnsubscribeService`.
4. Print the method and the status of the stored record, the expected email,
   and the email that the gateway got, and print if the two are equal.

## Known gaps / failures

- **`bun run verify` cannot complete on my machine (2 CPUs, 8 GB memory).**
  I ran each of the 22 scripts in `verify` alone, and each passed. For the step
  `turbo run typecheck lint:check`, I ran `typecheck` and `lint:check` for
  `@elizaos/plugin-inbox` only, and both passed. On the full run for my
  earlier PR #35316, the operating system stopped nine large packages for
  memory, and `@elizaos/capacitor-notification-mirror` needs an Android SDK
  that my machine does not have. This PR changes files in
  `plugins/plugin-inbox` only.
- **I did not send an email through Gmail.** The gateway is a double. The
  evidence is the argument that the real service gives to the gateway.
- **I did not use a header from a real newsletter.** I wrote the header
  values with the forms that RFC 6068 permits.
- **A producer that writes a space as `+` now gets a `+` in the email.**
  RFC 6068 section 5 says that this form cannot be told from a real `+`. The
  RFC form for a space is `%20`, and it is read as before.

## Deployment

None. The next unsubscribe request by email sends the correct fields.

AI provider/model: anthropic / claude-opus-5-5
Client / agent tooling: claude-code
Contribution skill revision: N/A - ordinary GitHub contribution without optional run evidence
Attribution status: self-reported
— [contributor]
<!-- eliza-computer-attribution:v1 {"provider":"anthropic","model":"claude-opus-5-5","client":"claude-code","skill_revision":"N/A - ordinary GitHub contribution without optional run evidence"} -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_011znGg3Vnk3wpjQ1HKPJwf8
