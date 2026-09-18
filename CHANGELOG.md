# Changelog

A record of what changed, and more importantly *why*. Real projects keep a file like this so that future-you (or anyone else) can understand decisions without digging through old chats.

## Version 5

### Why these features

Version 4 was about the project surviving being downloaded. This one is about *your chats* surviving.

Everything Tiny RP remembers — every chat, the card you loaded, whether chat style is on — lives in `localStorage`, which sounds permanent and isn't. It belongs to one browser on one device. Clearing your browsing data wipes it. So do some cleaner apps, "clear site data," and getting a new phone. There's no warning and no undo, and the first time you find out is the time it matters. A roleplay you've been in for weeks deserves to exist as a file you can copy somewhere.

The file format is the part worth reading. It would be easy to dump the `messages` array to a file and call it done; `chat-backup.js` explains why it says what format and version it is instead, and that's a lesson that applies to every file you'll ever design.

As always, **no README exercises were solved.** Backing up isn't one of them. Three new exercises (19 to 21) were added, built on the new code.

### Added

- **Back up** saves the current chat to a file like `wren-chat-2026-09-18.json`, and **Restore** reads one back. Both are in the top bar.
  - The backup holds the **character as well as the messages**, so a restore actually resumes the roleplay instead of leaving you with orphaned text.
  - The file is indented, so you can open a backup in any text editor and just read your own chat.
  - Restoring **asks before replacing** what you have open — but only *after* checking the file, so you're never asked to confirm something that was going to fail anyway.
- **`public/chat-backup.js`**, all pure functions, plus 18 tests. Mostly tests of the *refusals*, because the dangerous case isn't a backup that fails to load, it's one that loads *almost* correctly over the top of a good chat.
  - It refuses: files that aren't JSON, JSON that isn't an object, JSON that isn't ours (a character card, say — also JSON, also has a name), backups from a **newer version** of Tiny RP, ones with no messages or no character, and ones where **any** message is damaged, not just the first.
  - Filenames are built from the character's name with everything that isn't a letter or digit turned into a dash, so a character called `../../etc/passwd` becomes `etc-passwd-chat-….json`.
- There are now **55 tests**, up from 37.

### Changed

- **The top bar wraps properly on narrow phones.** Six buttons wouldn't fit beside the character's name on a 320px screen: they stacked five rows deep and ate 40% of the display. Below 26rem the name now takes its own line and the buttons get the full width, slightly tightened.

  The measurements are in `style.css`, and they're there because the obvious fix was wrong. Wrapping *alone* made 360px and 390px screens **worse** (172px, up from 137px) while only partly helping 320px. Wrapping plus slightly smaller buttons beats doing nothing everywhere:

  | top bar height | 320 | 360 | 390 | 412 | 430 |
  | --- | --- | --- | --- | --- | --- |
  | before | 220 | 137 | 137 | 137 | 137 |
  | wrapping only | 172 | 172 | 172 | 172 | 137 |
  | wrapping + tighter | **151** | 151 | **116** | **116** | 137 |

### How it was tested

- All **55 tests** pass.
- One test **caught a real (if small) bug while being written**: a character named entirely in emoji slugged down to nothing, and the filename came out `chat-chat-2026-09-18.json`. The test was right and the code was wrong, which is the nicer way round.
- The whole feature was driven in **real Chromium**, 21 checks: pressing Back up really does produce a download, with the right name, containing the right character and the actual words that were said. Then the chat was **wiped** and restored from that file, and the restore survived a reload — so it was genuinely saved, not just drawn on screen. Feeding it a character card gives "not a Tiny RP chat backup"; feeding it a corrupt file gives "that file isn't JSON at all"; and in both cases **the good chat is still there afterwards**.
- Top bar heights were measured at five phone widths for four different CSS approaches before picking one. That's the table above.

### Not tested yet

- **Restoring a backup on a different phone**, which is the actual use case. It should be no different — the file has no device in it — but it hasn't been done.
- Everything in version 4's list still applies.

## Version 4

### Why these changes

This one is different from versions 2 and 3: no new features. Tiny RP went up on GitHub between then and now, and putting something where other people can download it exposes a different class of problem than using it yourself. The first one was fatal and completely invisible from inside Termux, where it already worked.

`config.json` is in `.gitignore`, which is correct — your API key must never be uploaded. But it means the file **isn't in the repository**, so anyone who downloads Tiny RP (including future-you on a new phone) gets a copy with no config at all. The first thing it did was crash on line 60, reading a file that wasn't there. The fix is the standard answer to this, and worth knowing because you'll meet it in most projects you clone: ship an **example** config with no secrets in it, and have the program tell you to copy it.

The rest came from deliberately mistreating the server to see what it did. The interesting find: posting a malformed body to `/api/generate` returned a 79KB Bun **HTML error page** — which included the folder path the server was running from — instead of the `{ "error": ... }` shape `app.js` knows how to display. So the app showed nothing at all, and the real explanation only existed in a page you'd never see. One line in the wrong place caused it: `await request.json()` sat *just above* the `try` block instead of inside one.

There's a lesson in that worth more than the fix. `try` doesn't protect the lines near it, only the lines inside it. It's the kind of bug that never shows up while things work.

As with every version so far, **no README exercises were solved.** They're still yours.

### Added

- **`config.example.json`**, tracked in git, with no real key in it. Copy it to `config.json` and fill it in. This is what makes a fresh download work.
- **`TINY_RP_CONFIG`**: an environment variable to run against a different config file, so you can keep one per provider:
  ```
  TINY_RP_CONFIG=mancer.config.json bun run start
  ```
  (`*.config.json` is now gitignored too, so those stay private as well.)
- **Server tests** (`tests/server.test.js`) — the first tests for `server.js`. The other test files check *pure functions*; this one starts the real server and talks to it like a browser would, which is called an **integration test**. Two tricks make it work with no API key and no money spent: a **fake provider** (our own tiny server answering the way OpenRouter would) and a **temporary config** in the system temp folder. Your real `config.json` is never read or touched.
  - Among them is a **regression test** for path traversal: it asks for the config file six different ways (`/../config.json`, `/%2e%2e/config.json`, `/..%2f…`, and so on) and checks that the API key never appears in any answer.
- **Continuous integration** (`.github/workflows/test.yml`): GitHub now runs `bun test` on every push. It needs no API key, which is a useful proof in itself — if the tests ever needed one, they'd be depending on your machine.
- There are now **37 tests**, up from 26.

### Fixed

- **A fresh download couldn't start at all.** `bun run start` with no `config.json` crashed with a raw `ENOENT`. It now explains what's missing and exactly which command fixes it, and stops with exit code 1. A `config.json` with a syntax error (a stray comma) gets its own message instead of the same crash.
- **Malformed JSON posted to `/api/generate` returned a 79KB HTML error page** leaking the server's folder path, and left the chat silently blank. It now returns `400` with a one-sentence JSON error, which `app.js` already knows how to display.
- **A request with no `messages` was forwarded to the provider anyway**, so a front-end bug came back as a confusing complaint from the AI company — and, on a paid account, could be billed. It's now refused locally with a `400`, before the provider is contacted.
- **`normalizeCard(null)` threw `Cannot read properties of null`.** A `.json` file is allowed to contain `null`, a number, or a list, and none of those are cards. You now get "That file doesn't look like a character card."
- **A failed character load left a completely blank page.** If `character.json` was missing or the server wasn't running, `init()` threw, nothing rendered, and the only explanation was in the developer console. The error now appears in the chat the way every other error does, the heading stops claiming "Loading…", and Send is disabled. (This needed its own error path rather than the usual `render()`, because `render()` reads `character.name` — and having no character is the whole problem.)

### How it was tested

- All **37 unit and integration tests** pass.
- The two new server tests were **checked against the old code first**, and both failed on it — the malformed-body case returned `500` instead of `400`, and the missing-`messages` case returned `200`, having gone to the provider. A regression test that passes on the broken version isn't testing anything, so this is always worth doing.
- The **whole suite passes with `config.json` moved away**, which is what CI and a fresh download see.
- **GitHub Actions ran the suite and it passed** on the first push, on a clean machine with no `config.json` and no API key. That's the strongest evidence that a fresh download genuinely works — stronger than any check run here, because that machine had nothing of this one's on it.
- The app was driven in a **real Chromium browser** against a fake provider, with 13 checks: the page loads and renders the greeting; a full send → reply round trip works; **Show prompt** shows the size summary and the system message; the API key never reaches the browser; and on the error path the page shows the message, disables Send, and logs no uncaught errors.
- Path traversal was probed over a **raw socket** as well as through the test suite, to get past the fact that `curl` quietly tidies up `..` in paths before sending them. Worth knowing: for a while the defense looked stronger than it was, because the test client was fixing the attack.
- A further **25 checks in real Chromium** covered the features that versions 2 and 3 had only ever tested in a *simulated* browser (happy-dom). All passed, and nothing needed fixing:
  - **Chat style**: bubbles genuinely arrive one at a time rather than all at once, your own messages really are auto-wrapped in `<cht>` tags, and the setting survives a reload.
  - **Double-tap to skip**: revealed the rest in 79 ms, against the ~20 seconds the timers would otherwise have taken.
  - **The memory line on a 120-message chat**: exactly one line is drawn, it reads "Wren can't see the 65 older messages above this line," and the number in it **matches** the 65 messages actually faded — the count and the fading are drawn from the same calculation, so they can't drift apart. The prompt sent 55 of 120, excluded the oldest message, included the newest, and all 120 stayed on the page.
  - **Phone layouts** at 360×640 and 390×844: no horizontal overflow, no button pushed off-screen, text box reachable.
  - **Hammering Send** six times during a slow reply produced exactly one request.
- **Performance was measured** rather than guessed, since this runs on a phone. See the new table in the README: `render()` costs about 27 ms at 100 messages and 91 ms at 400, on a browser slowed 4× to imitate a mid-range Android. Left alone deliberately — redraw-everything is the point of the design, and the fix is most of a framework.

One note in the tradition of version 3's: the memory-line test **failed on its first run**, reporting no memory line at all. The app was right and the test was wrong. It seeded 120 messages that added up to about 5,600 tokens — comfortably *under* the 6,000 budget, so correctly nothing was forgotten. Making the messages longer turned it green. "The test is wrong" is always worth considering before "the code is broken," and it's much easier to consider when the test says what it expected.

### A note on how the traversal defense actually works

The comment in `serveStaticFile` says the `path.includes("..")` check is what stops `/../config.json`. That's true but incomplete, and the tests now spell out the rest. By the time our code sees the path, Bun's URL parser has **already resolved** `..` away, so that request arrives as plain `/config.json` and simply looks for `public/config.json`, which doesn't exist. The explicit check earns its keep on the encoded forms that survive parsing, like `/..%2fconfig.json`.

Both layers hold. But if you'd removed the check after reading only that comment, testing `/../config.json` by hand would have reassured you, and `/..%2f` would still have been open. Security that you haven't tested from the outside is a guess.

### Not tested yet

- A **real AI provider**. Still only fakes. (The sandbox this was worked in can't reach `openrouter.ai` at all, which is its own kind of proof that nothing here needs it.)
- A **real Weaver card**, same as before.
- The **on-screen keyboard**, still. A real Chromium at phone size has no keyboard, so `interactive-widget=resizes-content` remains unverified. The *layout* around it is now checked at two phone sizes, which is as close as this gets without a phone.
- **Double-tap on a real touchscreen.** It now passes in a real browser with touch emulation, which is better than before, but emulated taps have perfect timing and real thumbs don't. If 350 ms feels wrong, `DOUBLE_TAP_WINDOW_MS` is still the knob.

## Version 3

### Why these features

Up to version 2, Tiny RP sent the *entire* chat with every message. That works for a while, then a long chat grows past the model's context window and every reply fails. Every real frontend handles this, so it belonged in the skeleton. Making it *visible* in the chat was the teaching choice: the README can tell you "the AI has no memory," but watching messages fade behind a line as you play makes it stick.

The phone-keyboard fix is here because you use this on mobile, where the keyboard can cover the text box.

As before, no README exercises were solved. Three new memory exercises were added (16 to 18).

### Added

- **Context memory** (`public/prompt-budget.js`, plus changes in `app.js` and `style.css`):
  - Before each generation, chat history is fitted to a token budget (`PROMPT_BUDGET_TOKENS`, default 6000), keeping the newest messages.
  - It stops at the first message that doesn't fit rather than skipping it and keeping older ones, so the story never arrives out of order.
  - The newest message is always sent, even if it's huge on its own.
  - Tokens are *estimated* at about 4 characters each, rather than shipping a large tokenizer. The file explains the trade-off.
- Messages outside the prompt are **faded**, and a dashed **memory line** marks where the character's memory starts.
- **Show prompt** now begins with a one-line size summary: estimated tokens against the budget, and how many chat messages are being sent.
- **Tests** in `tests/prompt-budget.test.js`. There are now 26 in total.

### Changed

- `buildPrompt()` in `app.js` was split into three functions:
  - `buildSystemMessage()` builds the character part.
  - `planPrompt()` works out what fits.
  - `buildPrompt()` assembles the final list.

  Splitting it lets `render()` reuse the same calculation to draw the memory line, instead of doing the math twice in two slightly different ways, which is a classic source of bugs.
- **Phone keyboard:** the page now shrinks to fit when the on-screen keyboard opens. This uses `interactive-widget=resizes-content` in `index.html` and `100dvh` in `style.css`, both with comments explaining them. Before, the keyboard could cover the text box on Android.

### How it was tested

- All 26 unit tests pass.
- The simulated-browser run was repeated in full. Every version 2 check still passes, plus new checks with a 100-message chat:
  - 43 old messages are faded, with the memory line directly above the first remembered one.
  - The request actually sent contains the system message and the 58 newest messages, at about 5,988 of 6,000 estimated tokens.
  - All 102 messages remain saved.
  - Short chats show no memory line.

  One note for the curious: the first run of that test failed, but because of the *testing tool*, not the app. The tool ran each script file in isolation, and in that setup a `const` at the top of one file is invisible to the next. Real browsers share those between `<script>` tags, which is what `app.js` relies on to read `PROMPT_BUDGET_TOKENS`. After making the tool load the files together like a browser does, everything passed. Telling "my code is broken" apart from "my test setup is broken" is a real and very common part of programming.

### Not tested yet

- The **keyboard fix on your actual phone**. The simulated browser has no on-screen keyboard.
- Whether **6000 tokens** suits your model. Check your provider's context size for the model you use.
- The same untested items from version 2 still apply.

## Version 2

### Why these features

When you gave me free rein, I picked the features that close the gap between this teaching project and how you actually roleplay. You want replies to show up as separate chat bubbles, with realistic typing delays and a way to skip ahead. Your cards come out of the Lumiverse Weaver as PNGs. Version 2 lets you load a card like that and talk to it in chat style, in a frontend small enough to read end to end.

It's also a smaller, easier version of the Lumiverse extension problem. There's no extension API to fight here, so the core ideas (splitting, pacing, skipping) are laid out in plain view. If you ever go back to the extension, `chat-style.js` is written so it could be copied over nearly unchanged.

I deliberately did **not** solve any of the README exercises. They're still yours.

### Added

- **Chat style** (`public/chat-style.js`, plus new sections in `app.js` and `style.css`). A toggle in the top bar, remembered between visits. Replies are split into bubbles and revealed one at a time:
  - Each bubble waits `PAUSE_BEFORE_BUBBLE_MS + length × MS_PER_CHARACTER`, with no maximum.
  - The time spent waiting for the AI counts toward the first bubble's delay, since the character was "typing" then too.
  - Double-tap the "is typing" line to show everything now. It's a real button, so it also works from a keyboard.
  - Typing in the box never disturbs the reveal. Sending, regenerating, deleting, or switching characters finishes it instantly.
  - Returning to the tab after leaving mid-reveal shows the rest at once, since phones throttle timers in the background anyway.
  - When chat style is on, the system prompt asks the model to use `<cht>` tags, and your own messages are tagged automatically.
- **Safe by design**: the full reply is saved the moment it arrives. The bubble-by-bubble effect is display only, so a refresh or crash mid-reveal never loses text.
- **Load card** (`public/card-loader.js`). Reads `.png` cards (the `ccv3` chunk, falling back to `chara`) and `.json` cards, V1 through V3. The last card you load is remembered. Each character keeps its own saved chat.
- **Tests** (`tests/`). 20 checks run with `bun test`, using Bun's built-in test runner: no new dependencies.
- **`package.json`** with `bun run start` and `bun run test`, matching the way you start Lumiverse.
- `{{Char}}`/`{{USER}}` in any capitalization, and the old `<BOT>`/`<USER>` placeholders, are now filled in.
- The chat no longer jumps to the bottom when a new bubble appears while you've scrolled up to reread something.
- `CHANGELOG.md` (this file).

### Changed

- In normal (non-chat) style, `<cht>` tags are hidden from display. They're still in the saved text and the prompt; press Show prompt to see them.
- `index.html`: the `<!DOCTYPE html>` line is now truly the first line. In version 1 a comment came before it, which quietly puts browsers into "quirks mode." There's a note about this at the top of the file.
- The top-bar buttons wrap onto a second line on narrow phone screens.

### How it was tested

- The 20 unit tests in `tests/` all pass.
- The whole app was run in a simulated browser (happy-dom) with a fake AI provider. That run checked:
  - chat-style toggling and the saved setting
  - automatic tagging of your messages and the new system-prompt line
  - bubbles appearing on their timers, and double-tap skipping to the end
  - chat saving
  - regenerating into an empty reply, which shows "(empty reply)"
  - a provider error appearing in the chat
  - tags hidden in normal style
  - the prompt viewer
  - loading a PNG card with an emoji in the character's name
  - a helpful error for a wrong file type
- The server was started and checked to serve every new file, and to still refuse files outside `public/`.

### Not tested yet (things to check on your phone)

- A **real AI provider**. Only a fake one was used, so your first real message is the true test. Errors appear right in the chat.
- A **real Weaver card**. The loader follows the published card format and passed tests with cards built to that format, but a real export hasn't been through it.
- **Double-tap on your actual phone.** It's built from ordinary taps rather than the browser's `dblclick` event, which is unreliable on phones. If 350 ms feels too tight or too loose, change `DOUBLE_TAP_WINDOW_MS` in `app.js`.
- **The pacing itself.** 150 ms per character is a guess at a quick phone texter. Whether it *feels* right is up to you. See exercise 13.

## Version 1

The original skeleton: a relay server, one character, chat history with delete and regenerate, local saving, and the prompt viewer.
