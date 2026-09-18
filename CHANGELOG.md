# Changelog

A record of what changed, and more importantly *why*. Real projects keep a file like this so that future-you (or anyone else) can understand decisions without digging through old chats.

## Version 6

### Why these features

This one came from a complaint, which is usually where the good features come from. Paraphrasing: *the concept of a card creator on board is good, but the results are too rigid — the formatting is so unnatural that it affects the output. I want to fully customise the blocks, and to be able to hook into the prompt builder.*

That's a sharper observation than it looks, and the uncomfortable part is that **Tiny RP had exactly the same problem.** It glued every card into one fixed shape:

```
Description:
<your text>

Personality:
<your text>
```

That's a choice, it was made for you, and it has consequences. Models copy the shape of what they're shown. Hand one a filled-in form and you tend to get form-shaped writing back — clipped, declarative, a bit dead. It isn't the model being bad at prose; it's doing what it was shown.

So the shape is now yours, and the card is editable in the app rather than in a text file. The two together are the point: you can rewrite a block, watch the prompt change under it as you type, and see what the model will actually get.

There was a lucky accident behind it. Version 5 split the prompt builder into `systemMessageParts` purely so the token breakdown could count each piece — and that turned out to be exactly the seam this needed. Making the pieces *data* rather than hardcoded string-joining was a much smaller change from there than it would have been a day earlier. Worth remembering: clean seams pay out later, in ways you don't plan.

As always, **no README exercises were solved.**

### Added

- **A character editor**, in the app. Name, description, personality, scenario, greeting and example messages, all editable in the browser. Changes save as you make them.
  - **Save card to a file** writes a standard `chara_card_v2` JSON card. Other apps can read it, and Tiny RP can load it straight back in — which the tests check by doing exactly that round trip.
  - **Renaming a character brings their chat with them.** A chat's save slot is named after the character, so a rename would otherwise look like it had deleted the conversation. It moves on the way *out* of the name box rather than on each keystroke — otherwise typing "Wren" would leave chats filed under "W", "Wr" and "Wre". An empty name is refused, since every character would then share one slot.
- **An editable prompt template** (`public/prompt-template.js`). The system prompt is a list of blocks you can reorder, switch off, relabel and rewrite. A block's text is itself a template, and card fields are macros with the same spelling cards already use:

  ```
  Description:\n{{description}}        the old, labelled way
  {{char}} is {{description}}          a sentence instead
  Keep replies under three sentences.  your own words, no card at all
  ```

  One mechanism — macros — does reordering, disabling, relabelling and rewriting. `{{char}}`, `{{user}}`, `{{description}}`, `{{personality}}`, `{{scenario}}`, `{{greeting}}` and `{{examples}}` are all available, and macros nested *inside* a card field get filled too.
- **A live preview** under the editor, with a token count, updating as you type — whether you're editing the card or the blocks. This is the part that answers the original complaint: formatting affects how a model writes, and you can't judge that from a settings screen that hides the result.
- **Blocks with nothing to say are dropped.** A character with no personality written no longer gets a bare `Personality:` heading introducing nothing. That is exactly the class of small, invisible mess that teaches a model to write badly, and a fixed template can't avoid it.
- **Reset to default** puts everything back. The default template reproduces the old output **byte for byte** — verified by the token breakdown reporting identical numbers before and after — so none of this changes anything until you change something.
- There are now **117 tests**, up from 101.

### Changed

- `prompt-builder.js` is folded into `prompt-template.js`. One file owning "card plus template becomes prompt" reads better than two with a cross-file dependency that the tests would have to work around.
- The chat hides while the editor is open. Sharing the screen sounds friendlier and isn't: on a phone it left about one and a half blocks visible, and you spent the whole time scrolling a letterbox.

### How it was tested

- All **117 tests** pass, including new ones for reordering, disabling, prose-instead-of-labels, empty-field dropping, nested macros, and that a template loaded from storage is validated before use.
- **28 checks in a real browser** across two suites — the block editor and the character editor — at 390px and 320px. Among them: the live preview updating from both halves, the real sent prompt matching the edited blocks, edits surviving a reload, reset restoring, a rename carrying the chat across, an empty name being refused, and the exported card **loading back into the app**.
- One test failed first and was wrong, not the code: it asserted the default prompt contained "keeps a lighthouse", which was never in it.

### A note on redrawing

There's one place in this app where "just redraw everything" — the idea the whole README is built on — is the **wrong** answer, and the editor is it.

Rebuilding the block list replaces every element in it, including the textarea you're typing into. The replacement isn't focused and has no cursor position, so redrawing on each keystroke drops your cursor after one letter. Text edits therefore update the data and the preview and deliberately leave the list alone; only structural changes (add, delete, move, toggle) redraw.

The reason is worth keeping: the DOM is holding state of its own — what's focused, where the cursor sits, how far a box is scrolled — that our arrays don't describe. Wiping and rebuilding throws that away. It's the exact problem that makes real frameworks complicated, met here in about fifteen lines.

### Not tested yet

- **A card edited here, opened in another app.** The export follows the V2 spec and Tiny RP reads its own output, but no other tool has seen one.
- Everything in version 5's list still applies.

## Version 5

### Why these features

Version 4 was about the project surviving being downloaded. This one is about *your chats* surviving.

Everything Tiny RP remembers — every chat, the card you loaded, whether chat style is on — lives in `localStorage`, which sounds permanent and isn't. It belongs to one browser on one device. Clearing your browsing data wipes it. So do some cleaner apps, "clear site data," and getting a new phone. There's no warning and no undo, and the first time you find out is the time it matters. A roleplay you've been in for weeks deserves to exist as a file you can copy somewhere.

The file format is the part worth reading. It would be easy to dump the `messages` array to a file and call it done; `chat-backup.js` explains why it says what format and version it is instead, and that's a lesson that applies to every file you'll ever design.

The other three additions are about making it cheaper to learn, and easier to see what the app is doing.

**Practice mode** exists because every real reply costs money and needs a connection, which is a bad deal when what you're doing is pressing Send forty times to see how a typing delay feels. Now there's a pretend provider that makes replies up locally, with commands to make it fail, stall, or send twenty bubbles on purpose. You can take the whole app apart on a bus with no signal and no credit.

**Property-based tests** are in here because they're one of the highest-value ideas in testing and almost nobody gets taught them. Rather than writing examples, you state a rule that must hold for every input and let the computer invent the inputs. It earned its place immediately by finding a real bug that had survived three versions — see Fixed, below.

**The prompt size breakdown** answers the question every roleplayer eventually asks: why does she start forgetting things so soon? Show prompt now itemises where the budget goes, and the answer is usually "your example messages", which you can do something about.

There's also a lot in Fixed. Six real bugs turned up, several of them the kind that lose data quietly rather than crashing — and the tools that found them (a fuzzer, a chaos test, a slow fake provider, and a proper read of the diff) are described alongside, because how you go looking is more reusable than any individual fix.

As always, **no README exercises were solved.** Neither backing up nor practice mode is one of them. Four new exercises (19 to 22) were added, built on the new code.

### Added

- **Back up** saves the current chat to a file like `wren-chat-2026-09-18.json`, and **Restore** reads one back. Both are in the top bar.
  - The backup holds the **character as well as the messages**, so a restore actually resumes the roleplay instead of leaving you with orphaned text.
  - The file is indented, so you can open a backup in any text editor and just read your own chat.
  - Restoring **asks before replacing** what you have open — but only *after* checking the file, so you're never asked to confirm something that was going to fail anyway.
- **`public/chat-backup.js`**, all pure functions, plus 18 tests. Mostly tests of the *refusals*, because the dangerous case isn't a backup that fails to load, it's one that loads *almost* correctly over the top of a good chat.
  - It refuses: files that aren't JSON, JSON that isn't an object, JSON that isn't ours (a character card, say — also JSON, also has a name), backups from a **newer version** of Tiny RP, ones with no messages or no character, and ones where **any** message is damaged, not just the first.
  - Filenames are built from the character's name with everything that isn't a letter or digit turned into a dash, so a character called `../../etc/passwd` becomes `etc-passwd-chat-….json`.
- **Practice mode**: `fake-provider.js`, a pretend AI that speaks the same OpenAI-compatible language as OpenRouter but makes the replies up locally. Free, instant, works with no key and no internet.
  - `bun run fake` in one Termux session, `bun run practice` in another.
  - It digs the character's name out of the system prompt, so the canned replies say "Wren almost smiles" rather than something generic.
  - Five commands you can send to make it misbehave **on purpose**: `/slow` (6 seconds, to watch the typing indicator), `/error` (a 500, to see errors land in the chat), `/empty` (`(empty reply)`), `/long` (a wall of text, to make the memory line appear fast) and `/bubbles` (a pile of short `<cht>` bubbles). Breaking things deliberately is the quickest way to learn what code does, so now there's a button for it.
  - It prints every prompt it receives with its size. Watching that scroll past while you chat is the clearest possible demonstration that the *whole conversation* is sent again every single time.
- **Show prompt now says where the space goes**, not just how much of it there is: the character card against the conversation, and then the card broken down by field, biggest first, with a small bar for each.

  This is the most useful thing in the app for anyone who writes cards. The card is a *fixed* cost paid in full on every single turn, before a word of conversation. A card with 1,500 tokens of example messages has spent a quarter of a 6,000-token budget before you say hello — and that, not the model being forgetful, is why your character loses the thread so early. You can't see that in one total. You can see it instantly in a list.

  The counting and the message come from **the same function**, `systemMessageParts`, so they can't drift apart and start reporting numbers that aren't true. There's a test asserting the parts joined back together are exactly the message that gets sent.
- **20 tests for the prompt builder**, which had none at all before it moved out of `app.js` — see Changed, below. They cover macro filling in both spellings, the old `<BOT>`/`<USER>` forms, missing card fields, `<START>` stripping, the chat-style instruction appearing only in chat style, and five regression tests for the `$` bug.
- **Property-based tests** (`tests/properties.test.js`), a kind of test that makes up its own examples. Instead of "for this input, expect that output," each one states a rule that must hold for *every* input, and a few hundred deliberately horrible inputs are generated to test it against. The rules cover: bubbles are never empty, no tag ever survives splitting, wrapping-then-splitting matches splitting, the prompt never exceeds its budget, the reported token count matches what's actually sent, random bytes never crash the PNG reader, and any chat that's saved can be loaded back unchanged.
  - The randomness is deliberately **fake** — a hand-written generator with a fixed seed — so the test is identical on every run. A test that fails one run in fifty is worse than no test. Change one number at the top to go hunting for new bugs.
- There are now **101 tests**, up from 37.

### Fixed

- **A reply could land in the wrong chat — or the wrong character's chat — and be saved there.** This is the worst bug found so far, because nothing crashed and nothing looked wrong.

  A reply takes seconds to arrive, and you can act while you wait. Send disables itself during generation; **New chat** and **Load card** don't, because they're written in `index.html` rather than built by `createButton()`. So:

  - Press **New chat** while a reply is in flight, and the old character's answer arrives and is pushed onto the top of your brand-new chat, then saved.
  - **Switch character** mid-reply, and Wren's answer is filed under the new character's name in storage. It appears as something *they* said.

  The cause is that `generate()` pushed its result into whatever `messages` happened to be by the time the reply came back, with no check that it was still the same conversation. The fix is the standard one: note which chat the request was *for*, and when the answer arrives, check that's still the chat you're in. If it isn't, drop the answer — there's nowhere correct to put it.

  It's worth reading the comment in `generate()` even if you never touch this code, because the shape of the problem is everywhere in async programming: **a slow answer can outlive the question.** Search-as-you-type, loading a page you've already navigated away from, any request you can cancel by clicking something else — all the same bug wearing different clothes.

- **One bad message in storage killed the whole app, permanently.** `loadChat` accepted anything that was a non-empty array. Hand `render()` a message whose `content` is a number and `splitIntoBubbles` calls `.split()` on it, which throws, which takes the page down — for a chat you now can't reach to delete. Every reload did it again. The only way out was knowing to clear site data from the developer console.

  This matters more here than in most projects, because this one's whole purpose is that you'll be editing it. A half-finished exercise that writes the wrong shape into storage is the likeliest cause, and "your app is bricked and the error blames the wrong file" is a miserable place for a lesson to end. (The error really did blame the wrong file: it read `Couldn't load character.json: text.split is not a function`, because the failure surfaced in the startup handler added in version 4. `character.json` was fine.)

  Saved chats are now checked the same way backup files are — literally the same function, `isUsableMessage`, exported from `chat-backup.js` and used by both. Storage is outside data in exactly the way a file is. A damaged saved character is ignored too, since a character with no name can't even name its own save slot.

  **The damaged chat is moved aside rather than deleted**, to `tiny-rp-chat:<name> (damaged)`, and the app tells you where it went. The first version of this fix said "the old data is still in your browser's storage" while quietly destroying it, because giving up on the chat makes `startNewChat()` save straight over it. Checking that claim instead of trusting it is the only reason this line is true.

- **A character whose name contained certain punctuation could corrupt her own system prompt.** `fillMacros` replaced `{{char}}` with the name by passing it to `.replace()` as a string — and a few characters are magic inside a replacement string. `$&` means "the text that was matched", `` $` `` means "everything before the match", `$'` means "everything after it".

  Those rules applied to the name, which came out of somebody else's character card. A character called ``Do$`t`` turned this:

  ```
  Hello {{char}}.      ->      Hello DoHello t.
  ```

  The start of the sentence appeared in the middle of her name. Nothing crashed; the prompt was just quietly wrong, in the one place you'd least want it to be.

  Passing a **function** to `.replace()` instead of a string turns all of that off — whatever it returns is used exactly as written. The rule worth keeping: any time you replace text with a value you didn't write yourself, use the function form. There are five regression tests for this now, including one checking that an ordinary `$` in a name (`A$AP`, `$5 Steve`) still comes through untouched.

- **Three card-loading errors pointed at the wrong thing.** The loader itself turned out to be sturdier than expected — fourteen realistic card shapes were thrown at it, including base64 wrapped across lines, text chunks placed after the image data, truncated files and a chunk lying about its own length, and it handled or refused all of them correctly. What was wrong was what it *said*:

  - A card whose data sits in a compressed `zTXt` or `iTXt` chunk got "This PNG doesn't have character data inside it", which is a flat lie — the data is right there, just compressed. (A PNG optimiser run over a card can do this.) It now says which chunk it found and that re-exporting usually fixes it.
  - Base64 that wouldn't decode produced `atob`'s own "The string contains invalid characters."
  - A truncated card produced `JSON.parse`'s "Unterminated string".

  None of those tell you it's the card that's broken. An error message is a user interface, and if a real card of yours won't load, the difference between these messages and the old ones is the difference between fixing it and giving up. Exercise 22 is now teaching the loader to read the compressed ones.

- **Seven more, found by reviewing the whole version-5 diff from scratch** before calling it finished. All of them were confirmed by reproducing them first, and all have tests:

  - **Any toolbar button blanked the page after a failed startup.** Version 4 added a friendly message when `character.json` won't load — but pressing Chat style, or New chat, or Show prompt on that screen called `render()`, which clears the chat log and *then* threw on `character.name`, deleting the explanation that had been there a second earlier. `render()` now knows how to draw a page with no character, which also means the "Load card" escape hatch works from that screen. This was a bug introduced by the previous fix, which is a good argument for reviewing your own diff.
  - **A card field holding a list instead of text crashed every render, permanently.** `normalizeCard` checked only that a name existed. A card with `description: ["a", "b"]` was accepted, *saved*, and then threw on `.replace()` forever after, including across reloads, with an error blaming `character.json`. Card fields are now coerced to text at the edge.
  - **A provider replying with a list of content pieces crashed the page.** The OpenAI-compatible format allows `content` to be a list — that's how images are carried — and some providers use it for plain text too. `server.js` now flattens it to text, so the front end can simply trust that a reply is a string.
  - **A failed regeneration resurrected the reply it discarded.** `regenerate()` removed the last message but didn't save, so memory and storage disagreed until the next successful reply. If the provider was down, a refresh brought the old reply back.
  - **Backups could be silently cancelled in some browsers.** The temporary download address was released on the line after the click, which Chrome tolerates and others don't.
  - **A backup with no version was blamed on a future release** ("saved by a newer version of Tiny RP (backup version undefined)") rather than being called damaged.
  - **Uncompressed `iTXt` cards are now read** instead of being turned away. The compression flag was ignored, so a perfectly readable card was met with "re-export this". `card-loader.js` now parses the chunk properly.

- **A `<cht>` tag could show up as visible text in the chat.** The splitting regex is lazy, so it stops at the first closing tag: given `<cht>in<cht>side</cht>` it captures `in<cht>side`, inner tag and all. The untagged branch of `splitIntoBubbles` stripped stray tags; the tagged branch didn't. Models really do open the same tag twice, and this had been there since version 2.

  It was found by the property test above, which is exactly the point of writing one. No example test had tried a doubled opening tag, because it wouldn't occur to a person to try it. There's now a regression test with the fuzzer's own counterexample in it.

### Changed

- **The prompt builder moved out of `app.js` into `public/prompt-builder.js`**, and `fillMacros` / `buildSystemMessage` now take what they need as arguments instead of reading `character`, `USER_NAME` and `chatStyle` out of the surrounding file.

  It moved for one reason: it couldn't be tested where it was. `app.js` is 1,195 lines and has no automated tests at all, because it needs a browser, a page full of elements and a server to do anything. So the single most important code in the app — the bit that decides who the AI thinks it is — had zero tests, while the bubble splitter had twenty.

  The change that fixed that is tiny:

  ```
  before:  function fillMacros(text)
  after:   function fillMacros(text, characterName, userName)
  ```

  That's most of what people mean by "testable code". It isn't a testing technique you apply afterwards; it's a shape you give the function while writing it. A function that reaches outside itself can only be run by recreating everything outside it. One that takes arguments can be called with made-up values and checked.

  The `$` bug above was found *while* writing those tests, which is the usual way round: making code testable and then testing it is how you find out what it actually does. Call sites in `app.js` are a little longer now, and say plainly what goes into a prompt.

- **The top bar wraps properly on narrow phones.** Six buttons wouldn't fit beside the character's name on a 320px screen: they stacked five rows deep and ate 40% of the display. Below 26rem the name now takes its own line and the buttons get the full width, slightly tightened.

  The measurements are in `style.css`, and they're there because the obvious fix was wrong. Wrapping *alone* made 360px and 390px screens **worse** (172px, up from 137px) while only partly helping 320px. Wrapping plus slightly smaller buttons beats doing nothing everywhere:

  | top bar height | 320 | 360 | 390 | 412 | 430 |
  | --- | --- | --- | --- | --- | --- |
  | before | 220 | 137 | 137 | 137 | 137 |
  | wrapping only | 172 | 172 | 172 | 172 | 137 |
  | wrapping + tighter | **151** | 151 | **116** | **116** | 137 |

### How it was tested

- All **101 tests** pass, in well under a second.
- One test **caught a real (if small) bug while being written**: a character named entirely in emoji slugged down to nothing, and the filename came out `chat-chat-2026-09-18.json`. The test was right and the code was wrong, which is the nicer way round.
- The whole feature was driven in **real Chromium**, 21 checks: pressing Back up really does produce a download, with the right name, containing the right character and the actual words that were said. Then the chat was **wiped** and restored from that file, and the restore survived a reload — so it was genuinely saved, not just drawn on screen. Feeding it a character card gives "not a Tiny RP chat backup"; feeding it a corrupt file gives "that file isn't JSON at all"; and in both cases **the good chat is still there afterwards**.
- Top bar heights were measured at five phone widths for four different CSS approaches before picking one. That's the table above.
- The property tests were run against **ten different random seeds** (about 40,000 generated inputs) after the tag fix. No further violations turned up. They were also checked against the *unfixed* `chat-style.js`, where the tag rule fails as it should — a property test that passes on the broken version is testing nothing, same as any other test.
- **The app was chaos tested.** Two kinds:
  - *Targeted*: start a generation against a deliberately slow provider, then press New chat or switch character while it's in the air, and check where the reply ends up. That's what caught the stale-reply bug, in both its forms, including the copy written to storage.
  - *Storage*: nine kinds of corrupted saved data (a message with no content, one whose content is a number, a null message, a bare string, a good message followed by a broken one, an array of numbers, and three malformed saved characters). Every one of them used to leave the app dead with Send disabled. All nine now start a usable fresh chat, and the damaged copy is verified to still be in storage afterwards.
  - *Random*: 300 randomly chosen actions — send, delete, regenerate, toggle chat style, tap the typing indicator, new chat, redraw — fired in a deterministic random order, checking after **every single one** that `messages` still holds only valid messages, that any in-progress reveal still points at a message that exists, and that the screen never shows more messages than exist. No violations, and no uncaught errors. The state machine is sound; the bug was purely in the async gap.
- **The new size breakdown was checked for cost**, since `render()` refreshes the prompt viewer on every redraw and chat style redraws once per bubble. It adds nothing measurable: with the viewer open, a render takes 20.6 ms against 20.3 ms closed at 100 messages, and 77.9 against 80.6 at 400. Building the message elements dominates so completely that the JSON work disappears into the noise.

  Getting that number took three attempts, and the two wrong ones are more instructive than the right one. The first was too few samples with no warm-up, and reported the viewer being *faster* at some sizes, which is impossible. The second alternated open and closed to cancel out drift — and made it worse, reporting the viewer as four times faster. The reason is a nice trap: `render()` reads `chatLog.scrollHeight`, and reading that forces the browser to recompute layout *synchronously*. Toggling `hidden` on a large element just before each measurement invalidated the layout, so every render was billed for the toggle rather than for itself. Measuring each state in its own batch fixed it.

  If a measurement says something impossible, the measurement is what's broken. That's worth more than the 20 ms.
- **Practice mode was driven in a real browser**, 7 checks: a normal reply arrives using the character's actual name, `/error` shows the failure in the chat, `/empty` gives `(empty reply)`, `/bubbles` reveals bubbles one at a time under chat style, and a long practice chat makes the memory line appear. No uncaught errors throughout.

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
- A **card exported by a real editor**, same as before.
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

When you gave me free rein, I picked the features that close the gap between this teaching project and how you actually roleplay. You want replies to show up as separate chat bubbles, with realistic typing delays and a way to skip ahead. Your cards are PNGs in the standard card format. Version 2 lets you load a card like that and talk to it in chat style, in a frontend small enough to read end to end.

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
- A **card exported by a real editor**. The loader follows the published card format and passed tests with cards built to that format, but a real export hasn't been through it.
- **Double-tap on your actual phone.** It's built from ordinary taps rather than the browser's `dblclick` event, which is unreliable on phones. If 350 ms feels too tight or too loose, change `DOUBLE_TAP_WINDOW_MS` in `app.js`.
- **The pacing itself.** 150 ms per character is a guess at a quick phone texter. Whether it *feels* right is up to you. See exercise 13.

## Version 1

The original skeleton: a relay server, one character, chat history with delete and regenerate, local saving, and the prompt viewer.
