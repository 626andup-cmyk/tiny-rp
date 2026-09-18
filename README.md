# Tiny RP

A deliberately tiny AI roleplay frontend, built to be read. It does about 5% of what Lumiverse or SillyTavern does, and every line of it is explained. The goal isn't to replace those apps; it's to understand how apps like them work, and then to break and rebuild this one until you could write it yourself.

There are no libraries, no build step, and no `node_modules` folder. A handful of small files, and Bun (which you already have from running Lumiverse).

## What it can do

It loads a character card, shows the greeting, lets you chat, and saves the chat in your browser so it survives a refresh. You can delete any message, regenerate the character's last reply, start a new chat, and (most importantly for learning) press **Show prompt** to see the exact data being sent to the AI.

Bigger features added since version 1 (see `CHANGELOG.md` for the full story):

**Load card** opens a real character card, `.png` or `.json`, including ones exported from the Lumiverse Weaver. The card is remembered, and each character keeps its own saved chat.

**Chat style** turns replies into separate text bubbles that appear one at a time, each after a "typing" delay based on its length. There's no cap on the delay. Double-tap the "is typing" line to show the rest immediately. The splitting rules are the same for you and the character:
- Text inside `<cht>...</cht>` tags is one bubble.
- Untagged text splits on blank lines. A single line break stays inside a bubble.

Your own messages get wrapped in `<cht>` tags automatically, so you never have to type them (but typing them yourself still works). Typing never interrupts the bubbles, but sending does: anything still waiting appears at once, so your message lands after the full reply. If you leave the browser mid-reply, the rest shows up all at once when you come back.

**Context memory** keeps long chats working. Models can only read so much at once, so when a chat outgrows the prompt budget, the oldest messages are left out of what gets sent. You can *see* this happen: those messages fade, and a dashed line reads "Wren can't see the 12 older messages above this line." Nothing is deleted; it's just out of the character's reach. **Show prompt** now opens with a size summary like "About 5,210 of 6,000 tokens. Sending 48 of 60 chat messages." The budget is `PROMPT_BUDGET_TOKENS` in `prompt-budget.js`; set it to fit your model.

## The files

```
tiny-rp/
├── server.js            The back end. Serves the page and relays messages to the AI.
├── config.json          Your settings: API address, key, model. KEEP THIS PRIVATE.
├── package.json         Short names for commands: `bun run start`, `bun run test`.
├── .gitignore           Tells git never to upload config.json.
├── README.md            This file.
├── CHANGELOG.md         What changed in each version, and why.
├── public/              Everything in here gets sent to the browser.
│   ├── index.html       The page's structure (the nouns).
│   ├── style.css        The page's look (the adjectives).
│   ├── app.js           The page's behavior (the verbs).
│   ├── chat-style.js    Helpers that split replies into bubbles.
│   ├── card-loader.js   Reads character cards out of .png and .json files.
│   ├── prompt-budget.js Decides how much chat history fits in the prompt.
│   └── character.json   The default character card.
└── tests/               Automatic checks. Run them with `bun test`.
    ├── chat-style.test.js
    ├── card-loader.test.js
    └── prompt-budget.test.js
```

A suggested reading order: `index.html` first (shortest, sets the scene), then `app.js` (the main event), then `server.js`. After that, `prompt-budget.js` (short, and it explains the single most important limit in AI chat), then `chat-style.js` and its test file side by side: reading a function next to the examples that test it is one of the best ways to understand it. Save `card-loader.js` for when you're curious how files work at the byte level. `style.css` is for whenever you want to change how it looks.

## Setting it up

1. Put the `tiny-rp` folder somewhere in Termux, for example `~/tiny-rp`.
2. Open `config.json` (for example with `nano config.json`) and fill in:
   - `apiUrl`: your provider's **OpenAI-compatible chat completions** address. The example is OpenRouter's. Mancer and most other providers offer one too; check their docs for the exact URL.
   - `apiKey`: your key.
   - `model`: the model's name exactly as your provider spells it.
3. Start it:
   ```
   cd ~/tiny-rp
   bun run start
   ```
   (`bun run start` is a shortcut defined in `package.json` for `bun run server.js`. Either works.)
4. Open `http://localhost:8123` in your phone's browser.

It uses port 8123 so it can run at the same time as Lumiverse. Stop the server with Ctrl+C in Termux.

If something goes wrong, the error appears right in the chat, and the Termux window logs every request the browser makes. Watching that log while you click around is one of the best ways to learn what's going on.

## How one message travels through the app

This is the whole app in one story. Follow along in the code.

```
  YOU                BROWSER (app.js)               SERVER (server.js)          AI PROVIDER
   │                        │                               │                         │
   │  type + press Enter    │                               │                         │
   ├───────────────────────▶│ sendMessage()                 │                         │
   │                        │  push into `messages`         │                         │
   │                        │ generate()                    │                         │
   │                        │  buildPrompt()                │                         │
   │                        │  POST /api/generate ─────────▶│ handleGenerate()        │
   │                        │                               │  adds key + model       │
   │                        │                               │  POST ─────────────────▶│
   │                        │                               │                         │ thinks…
   │                        │                               │◀───────── reply ────────┤
   │                        │◀──────────── { reply } ───────┤                         │
   │                        │  push into `messages`         │                         │
   │                        │  saveChat()                   │                         │
   │◀─── new message ───────┤  render()                     │                         │
```

1. You press Enter. The `keydown` listener at the bottom of `app.js` notices and calls `sendMessage()`.
2. `sendMessage()` adds your text to the `messages` array, then calls `generate()`.
3. `generate()` calls `buildPrompt()`, which glues the character card and the chat history into one list, and sends it to our own server at `/api/generate`.
4. `server.js` receives it in `handleGenerate()`, attaches your secret API key and model name, and forwards it to the AI provider.
5. The provider answers. The server digs the reply text out and hands it back to the browser.
6. `generate()` adds the reply to `messages`, saves, and calls `render()`, which redraws the chat.

If you understand those six steps, you understand the skeleton of every AI chat app, including the big ones.

## The two ideas that matter most

**State and render.** The `messages` array is the truth. The screen is only a picture of it. Every action changes the array and then redraws the picture. When something looks wrong on screen, the question is always "what's in the array?" (Try typing `messages` into your browser's developer console.)

**The AI has no memory.** Every generation, the whole prompt is sent again from scratch: the character description, the scenario, and every message so far. That's why long chats get slow and expensive, and it's why features like summaries and lorebooks exist in bigger frontends: they're all clever ways of deciding what goes into that one prompt. Press **Show prompt** and look. You've spent years reading raw generations; this is the other half, the raw input.

## Tests

The `tests/` folder holds 26 small automatic checks, each one an example of how the bubble splitter, the card reader, or the prompt budget should behave. Run them with:

```
bun test
```

Get into the habit of running them after you change any of the helper files. If a test goes red, either you broke something, or you changed your mind about how it should work, in which case you update the test. Writing a new test *before* you add a feature ("I want this input to give that output") is a surprisingly relaxing way to program.

## Glossary

**Front end / back end.** The code running in your browser vs. the code running on a server.

**Request / response.** The browser asks (request), the server answers (response). Every click that talks to the server is one round trip.

**GET / POST.** Two kinds of request. GET means "give me something." POST means "here's some data, do something with it."

**Status code.** A number in each response. 200 means OK, 404 means not found, 401 usually means a bad API key, 500 means something broke.

**JSON.** A text format for data that looks almost exactly like JavaScript objects. `JSON.stringify` turns an object into text; `JSON.parse` (or `.json()`) turns text back into an object.

**API.** A set of addresses and rules a program offers so other programs can use it. The AI provider has an API; so does our tiny server (it has one address, `/api/generate`).

**Proxy.** A middleman that forwards requests. Our server is a proxy for the AI provider.

**Async / await.** Some things take time (network, files). `await` means "pause this function until that finishes." A function has to be marked `async` to use it.

**Event listener.** A function that runs when something happens, like a click.

**DOM.** "Document Object Model": the page as JavaScript sees it, a tree of elements you can find, create, change, and remove.

**Token.** The chunks of text a model actually reads: often a whole word, sometimes part of one. Prices and limits are counted in tokens. For English, one token is roughly four characters.

**Context window.** The most tokens a model can read at once, prompt and reply together. When a chat outgrows it, something has to be left out. See `prompt-budget.js`.

**Pure function.** A function whose answer depends only on what you give it, and that doesn't change anything else. Easy to test, easy to trust. Everything in `chat-style.js` is one.

**Regular expression (regex).** A tiny pattern language for finding text, like `/<cht>([\s\S]*?)<\/cht>/`. Hard to read at first; `chat-style.js` decodes its regexes piece by piece.

**Timer.** `setTimeout(fn, ms)` runs a function later. Chat style is a chain of timers, each one scheduling the next.

**Bytes.** Every file is a list of numbers from 0 to 255. A file format is an agreement about what they mean. `card-loader.js` reads the PNG format by hand.

## Exercises

Roughly easiest to hardest. Do them in any order. Break things on purpose; that's how you find out what each line does. If you get stuck, you can paste the relevant code into a chat and ask about it.

**Warm-ups (just editing values)**

1. Change the colors in `style.css`. Make the lighthouse keeper's chat feel like a candlelit library instead.
2. Change `USER_NAME` in `app.js` to your own name, then check **Show prompt** to see where it appears.
3. Write your own character in `character.json`. Try pasting in a real card's fields.
4. Change `temperature` in `config.json` to 0.2, then to 1.5. Regenerate the same reply a few times each way. What changes?

**Small features**

5. Add a message counter to the top bar that shows how many messages are in the chat.
6. Add an **Edit** button to each message. Hint: `prompt("Edit message:", message.content)` is the easiest possible version.
7. Make Regenerate remember old replies so you can flip between them (this is what "swipes" are).
8. Add a user persona: a short description of *you* that goes into the system prompt.

**Real features**

9. Render `*asterisks*` as italics. The catch: do it *without* using `innerHTML` on the raw text (read the security note in `createMessageElement`). Hint: split the text on `*` and alternate between plain text and `<em>` elements.
10. Make the AI's replies stream in word by word instead of arriving all at once. Look up `"stream": true` in your provider's docs, and `response.body.getReader()` for the browser side. This one touches both files.
11. Build a character library: remember every card you've loaded (not just the last one) and add a dropdown to switch between them. `saveCharacter` and `loadSavedCharacter` in `app.js` are the place to start.
12. Build a tiny lorebook: a list of keywords and text entries. When a keyword appears in the last few messages, add its entry to the system prompt. Real cards already carry one in `character_book`; `normalizeCard` in `card-loader.js` currently throws it away, so keeping it is step one.

When you finish number 12, you'll have built the core ideas of most of what you see in Lumiverse's prompt settings.

**Chat-style exercises**

13. Tune the pacing. Change `MS_PER_CHARACTER` in `chat-style.js` until the rhythm feels human to you. Then make the delay depend on more than length: should a bubble ending in `?` come faster?
14. Add a "seen" marker under your last message that appears when the character starts typing.
15. Write a test first: decide how `splitIntoBubbles` should treat a message that's *only* a `*roleplay action*`, write that as a test, watch it fail (or pass!), then change the code to match.

**Memory exercises**

16. Change `PROMPT_BUDGET_TOKENS` to something tiny, like 300, and chat for a few turns. Watch the memory line climb, and see how quickly the character forgets things. Then set it back.
17. Pin a message: let one important message (a first meeting, a promise) be marked "always remember" so it stays in the prompt even after it passes the memory line. You'll need to change `fitToBudget` *and* write a test for it.
18. Rescue what's forgotten: when messages fall out of memory, ask the model to summarize them, and put the summary into the system message. That's how the "summarize" features in bigger frontends work.
