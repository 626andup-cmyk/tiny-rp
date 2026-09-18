# Changelog

A record of what changed, and more importantly *why*. Real projects keep a file like this so that future-you (or anyone else) can understand decisions without digging through old chats.

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
