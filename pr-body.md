# Relates to

No issue. Only a person can create an issue in this repository, and no person
has created one for this defect. I did not find the PRD or the MVP plan in the
repository, so I cannot link a section. This PR adds no feature. It corrects
how the Markdown converter that is already in `plugins/plugin-telegram` reads
a backslash escape.

# Change

When a reply of the agent had a Markdown backslash escape, the Telegram chat
showed the backslash.

In Markdown, a backslash before a punctuation character makes that character
literal. For example, `\$5` is the text `$5`, `my\_file` is the text `my_file`,
and `1\.` is the text `1.`. The reader must not see the backslash.

The connector changes the Markdown of the agent into the Telegram format
MarkdownV2 with the function `convertMarkdownToTelegram`. That function read
only two escapes: `\*` and `\\`. For each other escape, it handled the
backslash as usual text and escaped it again. Thus Telegram showed the
backslash and the character: `The fee is \$5 for my\_file\_name.`

This PR makes the function read a backslash escape before each ASCII
punctuation character, in text and in a link label. A backslash before a
letter (`C:\Users`), in inline code, and in a code block stays as before.

Before (base `e9bbb6aef5`):

```
escaped dollar sign and underscores
  agent reply: The fee is \$5 for my\_file\_name.
  POST sendMessage parse_mode=MarkdownV2 text=The fee is \\$5 for my\\\_file\\\_name\.
    -> 200, the chat shows: The fee is \$5 for my\_file\_name.
escape in a link label and in bold
  agent reply: [my\_file](https://example.com/a) has **total\_count** 3
  POST sendMessage parse_mode=MarkdownV2 text=[my\\\_file](https://example.com/a) has *total\\\_count* 3
    -> 200, the chat shows: my\_file has total\_count 3
```

After (this PR):

```
escaped dollar sign and underscores
  agent reply: The fee is \$5 for my\_file\_name.
  POST sendMessage parse_mode=MarkdownV2 text=The fee is $5 for my\_file\_name\.
    -> 200, the chat shows: The fee is $5 for my_file_name.
escape in a link label and in bold
  agent reply: [my\_file](https://example.com/a) has **total\_count** 3
  POST sendMessage parse_mode=MarkdownV2 text=[my\_file](https://example.com/a) has *total\_count* 3
    -> 200, the chat shows: my_file has total_count 3
```

The backend log row has all seven replies.

# Why this implementation

Sources that I used:

- The CommonMark specification 0.31.2, section 2.4 "Backslash escapes"
  (https://spec.commonmark.org/0.31.2/#backslash-escapes).
  - "Any ASCII punctuation character may be backslash-escaped" (example 12).
    Section 2.1 gives the list of these characters: U+0021 to U+002F,
    U+003A to U+0040, U+005B to U+0060, and U+007B to U+007E.
  - "Backslashes before other characters are treated as literal backslashes"
    (example 13).
  - "Backslash escapes do not work in code blocks, code spans, autolinks, or
    raw HTML" (examples 17 to 21).
- The TDLib source file `td/telegram/MessageEntity.cpp`, function
  `parse_markdown_v2` (https://github.com/tdlib/td). This is the MarkdownV2
  parser of TDLib, the library that the Telegram Bot API server
  (https://github.com/tdlib/telegram-bot-api) uses. It shows that a backslash
  before a character with a code from 1 to 126 gives that character. Thus
  `\\` in the sent text shows one backslash, which is the defect.

Decisions:

- **One helper has the rule.** `protectBackslashEscapes` stores the escaped
  character in the same way as the code did for `\*` and `\\`. The character
  class in the regular expression has the four CommonMark ranges.
- **The step stays at the same position** (after code and links, before bold
  and italic). Thus code keeps its backslashes, and an escaped `*`, `_` or `~`
  cannot start bold, italic or strikethrough text.
- **A link label uses the same helper.** A label is text that the reader sees
  (`[my\_file](https://example.com/a)`).
- **A link destination stays unchanged**, as the comment in the code says.

Alternatives that I examined:

- Add only `\_` and `\$` to the two escapes. I did not do this. The CommonMark
  rule is one list of characters, and a partial list leaves the same defect
  for `\.`, `\#`, `\[`, `\~` and `\|`.
- Move the step before the code step, so that an escaped backtick does not
  start code. I did not do this. Backslashes in code must stay, and that
  change is larger than this defect.

# Testing

All commands ran on the tree of commit `3bb759c2e5cccac73b13689ee7d7108a50d775ca`
with Bun 1.4.2 and Node 24.15.0 on Linux x64.

- **Real send path, before and after.** A script called
  `MessageManager.sendMessageInChunks`, the function that sends each reply.
  The Bot API client was a real Telegraf `Telegram` client. Its `apiRoot`
  pointed to an HTTP server on `127.0.0.1`. The server stood in for the Bot
  API server. It read each `MarkdownV2` text with a port of the TDLib function
  `parse_markdown_v2` and answered with the text that Telegram shows, or with
  the HTTP 400 error for text that is not valid. Three replies are controls: an
  escaped `*`, a backslash before a letter and in inline code, and a reply
  with no backslash. Their results are the same before and after. Results are
  in **Change** and in the backend log row.
- **Validity check with random text.** I gave 400,000 random Markdown strings
  (made from Markdown marks, words, and backslash escapes) to the converter and
  read each result with the same port, two times with different seeds. The
  number of results that the parser rejects did not increase: 100 and 104
  before, 63 and 60 after. The error types are the same before and after (for
  example, two italic spans with no character between them give "Can't find
  end of Italic entity").
- `bun run test` in `plugins/plugin-telegram`: 9 files passed; 104 tests
  passed.
- `bun run typecheck` in `plugins/plugin-telegram`: passed.
- `bun run lint:check` in `plugins/plugin-telegram`: passed. It shows one
  warning in `src/account-client-service.ts`. The warning is also on `develop`,
  and this PR does not change that file.
- I added two test cases to the existing file
  `__tests__/markdown-v2-escape.test.ts`. The first fails on the base commit
  and passes on this branch. The second is the control (a backslash that is
  not an escape). I added no test file.

## How to test

1. Check out this branch. Run `bun install`.
2. Run `cd plugins/plugin-telegram && bunx vitest run __tests__/markdown-v2-escape.test.ts`.
   All tests must pass.
3. Revert only `src/utils.ts` to `develop` and run the command again. The test
   "sends the escaped character without the Markdown backslash" must fail.
4. Read section 2.4 of the CommonMark specification.
5. If you have a Telegram bot, make the agent reply with the text
   `The fee is \$5 for my\_file.` and look at the chat. On `develop` the chat
   shows the two backslashes. On this branch it does not.

- [x] Targets `develop` and has no conflicts with the latest `origin/develop`.
- [ ] Ran `bun install` and `bun run verify` after syncing; record blockers below.
- [x] Updated relevant documentation. `N/A - a code comment at the changed lines is the only text that describes this rule`

# Evidence Gate

Evidence must match the reviewed commit. `packages/scripts/pr-evidence.ts rows`
sets the marker from the live PR head; rerun after each push.
<!-- evidence-head:3bb759c2e5cccac73b13689ee7d7108a50d775ca -->

<!-- evidence-row:before-screenshots -->
- [x] Before screenshots: `N/A - backend connector change, no UI code changes`.
<!-- evidence-row:after-screenshots -->
- [x] After screenshots: `N/A - backend connector change, no UI code changes`.
<!-- evidence-row:walkthrough-video -->
- [x] Walkthrough video: `N/A - this PR has no UI change`.
<!-- evidence-row:backend-logs -->
- [x] Backend logs show the real code path firing end to end. The script
      called the real `MessageManager.sendMessageInChunks`, and the loopback
      server printed each `sendMessage` request and its answer.

<details>
<summary>Replies through MessageManager.sendMessageInChunks, before and after</summary>

`<LF>` is a line feed in the text.

Before, base `e9bbb6aef5`:

```
escaped dollar sign and underscores
  agent reply: The fee is \$5 for my\_file\_name.
  POST sendMessage parse_mode=MarkdownV2 text=The fee is \\$5 for my\\\_file\\\_name\.
    -> 200, the chat shows: The fee is \$5 for my\_file\_name.
escaped list number and heading mark
  agent reply: 1\. not a list item<LF>\# not a heading
  POST sendMessage parse_mode=MarkdownV2 text=1\\\. not a list item<LF>\\\# not a heading
    -> 200, the chat shows: 1\. not a list item<LF>\# not a heading
escaped brackets, tilde and pipe
  agent reply: Use \[brackets\], about \~10 items \| second column
  POST sendMessage parse_mode=MarkdownV2 text=Use \\\[brackets\\\], about \\\~10 items \\\| second column
    -> 200, the chat shows: Use \[brackets\], about \~10 items \| second column
escape in a link label and in bold
  agent reply: [my\_file](https://example.com/a) has **total\_count** 3
  POST sendMessage parse_mode=MarkdownV2 text=[my\\\_file](https://example.com/a) has *total\\\_count* 3
    -> 200, the chat shows: my\_file has total\_count 3
control: escaped star
  agent reply: 5 \* 3 and \*not italic\*
  POST sendMessage parse_mode=MarkdownV2 text=5 \* 3 and \*not italic\*
    -> 200, the chat shows: 5 * 3 and *not italic*
control: backslash before a letter, and in code
  agent reply: C:\Users\name and `a\_b`
  POST sendMessage parse_mode=MarkdownV2 text=C:\\Users\\name and `a\\_b`
    -> 200, the chat shows: C:\Users\name and a\_b
control: no backslash
  agent reply: Total: 5 items (2 new).
  POST sendMessage parse_mode=MarkdownV2 text=Total: 5 items \(2 new\)\.
    -> 200, the chat shows: Total: 5 items (2 new).
```

After, commit `3bb759c2e5cccac73b13689ee7d7108a50d775ca`:

```
escaped dollar sign and underscores
  agent reply: The fee is \$5 for my\_file\_name.
  POST sendMessage parse_mode=MarkdownV2 text=The fee is $5 for my\_file\_name\.
    -> 200, the chat shows: The fee is $5 for my_file_name.
escaped list number and heading mark
  agent reply: 1\. not a list item<LF>\# not a heading
  POST sendMessage parse_mode=MarkdownV2 text=1\. not a list item<LF>\# not a heading
    -> 200, the chat shows: 1. not a list item<LF># not a heading
escaped brackets, tilde and pipe
  agent reply: Use \[brackets\], about \~10 items \| second column
  POST sendMessage parse_mode=MarkdownV2 text=Use \[brackets\], about \~10 items \| second column
    -> 200, the chat shows: Use [brackets], about ~10 items | second column
escape in a link label and in bold
  agent reply: [my\_file](https://example.com/a) has **total\_count** 3
  POST sendMessage parse_mode=MarkdownV2 text=[my\_file](https://example.com/a) has *total\_count* 3
    -> 200, the chat shows: my_file has total_count 3
control: escaped star
  agent reply: 5 \* 3 and \*not italic\*
  POST sendMessage parse_mode=MarkdownV2 text=5 \* 3 and \*not italic\*
    -> 200, the chat shows: 5 * 3 and *not italic*
control: backslash before a letter, and in code
  agent reply: C:\Users\name and `a\_b`
  POST sendMessage parse_mode=MarkdownV2 text=C:\\Users\\name and `a\\_b`
    -> 200, the chat shows: C:\Users\name and a\_b
control: no backslash
  agent reply: Total: 5 items (2 new).
  POST sendMessage parse_mode=MarkdownV2 text=Total: 5 items \(2 new\)\.
    -> 200, the chat shows: Total: 5 items (2 new).
```

</details>

<!-- evidence-row:frontend-logs -->
- [x] Frontend logs: `N/A - no frontend change`.
<!-- evidence-row:llm-trajectory -->
- [x] Real-LLM trajectory: `N/A - no agent, action, provider, prompt, or model change`.
<!-- evidence-row:domain-artifacts -->
- [x] Domain artifacts: `N/A - the sent text and the shown text are in the backend log row; no other artifact applies`.
<!-- evidence-row:ocr-review -->
- [x] OCR review: `N/A - backend connector change has no rendered visual surface`.

# Evidence Details

The replay script is not in this PR. It does these steps:

1. Start an HTTP server on `127.0.0.1` that answers the Bot API methods
   `sendChatAction` and `sendMessage`.
2. Make a Telegraf `Telegram` client with `apiRoot` set to that server, and a
   `MessageManager` that uses it.
3. For each reply, call `sendMessageInChunks` with the reply text.
4. In the server, read the `text` of each `sendMessage` request that has
   `parse_mode: "MarkdownV2"` with the port of `parse_markdown_v2`. Print the
   request, and print the text that the parser gives (the text that the chat
   shows) or the HTTP 400 error.

The port of `parse_markdown_v2` is TypeScript that follows the TDLib function
step by step. It gives the plain text and the errors. It does not make the
entity list, and it does not check that a link destination is a valid URL.

## Known gaps / failures

- **`bun run verify` cannot complete on my machine (2 CPUs, 8 GB memory).**
  I ran each of the 22 scripts in `verify` alone, and each passed. For the step
  `turbo run typecheck lint:check`, I ran `typecheck` and `lint:check` for
  `@elizaos/plugin-telegram` only, and both passed. On the full run for my
  earlier PR #35316, the operating system stopped nine large packages for
  memory, and `@elizaos/capacitor-notification-mirror` needs an Android SDK
  that my machine does not have. This PR changes files in
  `plugins/plugin-telegram` only.
- **I did not send a message to Telegram.** I have no bot token. The server
  in the replay is a stand-in that uses my port of the TDLib parser. A
  reviewer who has a bot can confirm the result with step 5 of **How to test**.
- **Three escapes are read as before, because code and links are found
  first.** An escaped backtick pair (``\`not code\` ``) is read as inline
  code. An escaped `[` before a link (`\[not a link](https://example.com)`) is
  read as a link. An escape in a link destination stays in the destination.
- **A backslash at the end of a line** (a hard line break in CommonMark) is
  sent as a backslash, as before.
- **`editMessage` uses the same converter.** I did not replay that path.

## Deployment

None. The next reply that has a backslash escape is shown without the
backslash.

AI provider/model: anthropic / claude-opus-5-5
Client / agent tooling: claude-code
Contribution skill revision: N/A - ordinary GitHub contribution without optional run evidence
Attribution status: self-reported
— [contributor]
<!-- eliza-computer-attribution:v1 {"provider":"anthropic","model":"claude-opus-5-5","client":"claude-code","skill_revision":"N/A - ordinary GitHub contribution without optional run evidence"} -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_011znGg3Vnk3wpjQ1HKPJwf8
