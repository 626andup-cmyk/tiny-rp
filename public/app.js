// =====================================================================
//  app.js  —  what the page DOES
// =====================================================================
//
//  This file runs inside your browser. It:
//    1. Loads a character card (the default one, or one you picked).
//    2. Keeps the list of chat messages in memory.
//    3. Draws those messages on the page.
//    4. When you hit Send, builds a PROMPT and asks the server
//       (server.js) to get a reply from the AI.
//    5. In chat style, shows replies as separate bubbles that appear
//       one by one, like someone typing.
//
//  It uses functions from the helper files that load before it:
//    chat-style.js     splitIntoBubbles, wrapInBubbleTags, typingDelay
//    card-loader.js    readCardFile
//    prompt-budget.js  fitToBudget, PROMPT_BUDGET_TOKENS
//    prompt-template.js fillTemplateText, buildSystemMessage,
//                      systemMessageParts, defaultTemplate
//    chat-backup.js    buildBackup, readBackup, backupFilename,
//                      isUsableMessage
//
//  Everything in those files is a PURE FUNCTION, which is why they all
//  have tests and this file doesn't. That split is on purpose: the
//  logic worth checking lives where it can be checked, and what's left
//  in here is the part that genuinely needs a browser — elements,
//  clicks, timers and state.
//
//  THE ONE BIG IDEA IN THIS FILE: "state" and "render"
//  ---------------------------------------------------
//  We keep the TRUTH in one place: the `messages` array below.
//  The page is just a picture of that array.
//
//  Whenever something changes (you send, you delete, the AI replies)
//  we do two things:
//      a) change the array
//      b) call render(), which erases the chat on screen and
//         redraws it from the array
//
//  This sounds wasteful, but it keeps everything simple: the screen
//  can never get "out of sync" with the data. Big frameworks like
//  React are built around this exact same idea, just faster.
//
//  Chat style is a great example of why this matters. When a reply
//  arrives, the WHOLE reply is saved to `messages` immediately. The
//  one-bubble-at-a-time effect is purely a drawing trick in render().
//  So if you refresh halfway through, nothing is lost; you just see
//  the whole reply at once.
// =====================================================================


// ---------------------------------------------------------------------
//  SETTINGS
// ---------------------------------------------------------------------
//  `const` makes a variable that can't be reassigned.
//  By convention, ALL_CAPS names mean "a setting you might tweak."
const USER_NAME = "You";           // what {{user}} becomes in the prompt
const CHARACTER_FILE = "character.json";

// Two taps closer together than this (in milliseconds) count as a
// double-tap on the typing indicator.
const DOUBLE_TAP_WINDOW_MS = 350;

// Names for the things we save in the browser's localStorage.
const SAVED_CHARACTER_KEY = "tiny-rp-character";
const CHAT_STYLE_KEY = "tiny-rp-chat-style";
const TEMPLATE_KEY = "tiny-rp-template";


// ---------------------------------------------------------------------
//  STATE  (the data the whole app revolves around)
// ---------------------------------------------------------------------
//  `let` makes a variable that CAN be reassigned later.

// The character card, once it's loaded. `null` means "nothing yet."
let character = null;

// The chat history. Each message is an object like:
//     { role: "user",      content: "Hello!" }
//     { role: "assistant", content: "*waves*" }
// "user" and "assistant" are the exact words the AI API expects.
let messages = [];

// True while we're waiting for the AI. Used to disable buttons so you
// can't accidentally send five requests at once.
let isGenerating = false;

// The most recent error message, so render() can show it.
// Cleared as soon as you do something else.
let lastError = null;

// Is chat style switched on? We remember your choice between visits.
let chatStyle = loadSetting(CHAT_STYLE_KEY) === "on";

// While bubbles are appearing one by one, this describes the progress:
//     { index: which message, bubbles: [...], shown: how many so far,
//       timer: the id of the waiting timer }
// When no reveal is happening, it's null.
let reveal = null;

// When the typing indicator was last tapped (for double-tap detection).
let lastTapTime = 0;

// What you've typed into the name box but haven't committed yet. The
// name is only written into `character` when you LEAVE the box, because
// the chat's save slot is named after the character and a reply landing
// mid-keystroke would be filed under a half-typed name and orphaned.
// This holds the in-progress text so the preview can still show it.
let pendingName = null;

// What the character was called when you started editing the name box.
// Renaming has to move the saved chat, and we need the old name to do
// it. See finishRename().
let nameBeforeEdit = null;

// The list of blocks that become the system prompt. Yours to rearrange;
// see prompt-template.js for what a block is, and the Blocks button for
// editing them. Falls back to the default, which is exactly what Tiny RP
// did before any of this was editable.
let template = loadTemplate();

// How many times we've swapped the whole chat out from under ourselves:
// pressed New chat, loaded a card, restored a backup. It only ever goes
// up, and the number itself means nothing. What matters is whether it
// CHANGED while we were waiting for a reply. See generate().
let chatChangeCount = 0;


// ---------------------------------------------------------------------
//  FINDING ELEMENTS ON THE PAGE
// ---------------------------------------------------------------------
//  `document` is the whole web page, as JavaScript sees it.
//  getElementById finds the element with a matching id="..." in
//  index.html. We look them up once and keep them in variables.
const chatLog         = document.getElementById("chat-log");
const input           = document.getElementById("message-input");
const sendButton      = document.getElementById("send-button");
const nameHeading     = document.getElementById("character-name");
const promptButton    = document.getElementById("show-prompt-button");
const newChatButton   = document.getElementById("new-chat-button");
const promptViewer    = document.getElementById("prompt-viewer");
const chatStyleButton = document.getElementById("chat-style-button");
const loadCardButton  = document.getElementById("load-card-button");
const cardFileInput   = document.getElementById("card-file-input");
const backUpButton    = document.getElementById("back-up-button");
const restoreButton   = document.getElementById("restore-button");
const backupFileInput = document.getElementById("backup-file-input");
const blocksButton    = document.getElementById("blocks-button");
const templateEditor  = document.getElementById("template-editor");
const blockList       = document.getElementById("block-list");
const addBlockButton  = document.getElementById("add-block-button");
const resetTemplateButton = document.getElementById("reset-template-button");
const templatePreview = document.getElementById("template-preview");
const cardFieldList   = document.getElementById("card-fields");
const exportCardButton = document.getElementById("export-card-button");


// =====================================================================
//  STARTUP
// =====================================================================

// ---------------------------------------------------------------------
//  init()
//  Runs once when the page loads. Called at the very bottom of the file.
// ---------------------------------------------------------------------
async function init() {
  applyChatStyleSetting();

  try {
    // Use the card you loaded last time, if there is one.
    // Otherwise, ask the server for the default card.
    let startingCharacter = loadSavedCharacter();
    if (startingCharacter === null) {
      // `fetch` is how the browser requests things over the network.
      const response = await fetch(CHARACTER_FILE);

      // fetch only rejects when the network itself fails. A 404 is a
      // perfectly successful round trip that happens to carry bad news,
      // so we have to check `ok` ourselves or we'd try to read an error
      // page as if it were a character.
      if (!response.ok) {
        throw new Error(`the server answered ${response.status}`);
      }

      // Turn the response's JSON text into a JavaScript object.
      startingCharacter = await response.json();
    }

    setCharacter(startingCharacter);

  } catch (error) {
    lastError =
      `Couldn't load ${CHARACTER_FILE}: ${error.message}. ` +
      `Check that the server is running, then refresh the page.`;

    // The heading still says "Loading…" from index.html, which would be
    // a lie from here on.
    nameHeading.textContent = "Tiny RP";

    // render() knows how to draw a page with no character (see the top
    // of it). Reporting the problem the same way every other error is
    // reported, rather than writing to the page by hand, is what stops
    // the next button press from wiping this message off the screen.
    render();
  }
}


// ---------------------------------------------------------------------
//  setCharacter(newCharacter)
//  Switches to a character and loads that character's saved chat.
//  Used at startup AND when you load a new card.
// ---------------------------------------------------------------------
function setCharacter(newCharacter) {
  stopReveal();

  // Anything still being generated belongs to the chat we're leaving,
  // not the one we're arriving at.
  chatChangeCount = chatChangeCount + 1;

  character = newCharacter;

  // Show the name at the top of the page and on the browser tab.
  // `textContent` sets the plain text inside an element.
  nameHeading.textContent = character.name;
  document.title = character.name + " — Tiny RP";

  // Each character has its own saved chat. If there isn't one yet,
  // start fresh with the greeting.
  const saved = loadChat();
  if (saved) {
    messages = saved;
  } else {
    startNewChat();
  }

  render();

  // If the editor happens to be open, it's still showing the PREVIOUS
  // card's text. Leave it and the next keystroke writes the old
  // character's description into the new one, because each box writes
  // its whole value back on every edit.
  if (!templateEditor.hidden) {
    renderCardEditor();
    renderTemplateEditor();
    refreshPrompt();
  }
}


// ---------------------------------------------------------------------
//  startNewChat()
//  Every RP chat begins with the character's greeting ("first_mes").
// ---------------------------------------------------------------------
function startNewChat() {
  stopReveal();

  // Same reason as in setCharacter: a reply that's still on its way
  // was meant for the chat we're throwing away.
  chatChangeCount = chatChangeCount + 1;

  messages = [
    { role: "assistant", content: fillTemplateText(character.first_mes, character, USER_NAME) },
  ];
  saveChat();
}


// =====================================================================
//  BUILDING THE PROMPT
//  This is the heart of every RP frontend. The AI has no memory at
//  all. Every single time, we send it EVERYTHING it needs to know:
//  who it's playing, the setting, and the whole conversation so far.
// =====================================================================

// ---------------------------------------------------------------------
//  Building the system message used to live here. It moved to
//  prompt-template.js so it could be TESTED: in here it read
//  `character`, `USER_NAME` and `chatStyle` out of thin air, and a
//  function that reaches outside itself can only be run by loading the
//  whole app. Over there it takes what it needs as arguments, which is
//  why the calls below look more long-winded than they used to.
//
//  That file is worth reading. It's also where the SHAPE of the prompt
//  is decided, which is now yours to change rather than ours.
// ---------------------------------------------------------------------


// ---------------------------------------------------------------------
//  planPrompt()
//  Works out what will be sent, WITHOUT building the final list yet.
//  Returns:
//    {
//      system:        the system message,
//      firstIncluded: index of the oldest chat message that still fits,
//      tokens:        estimated size of the whole prompt
//    }
//  render() uses this to draw the "memory line," and buildPrompt()
//  uses it to decide what to send. One calculation, two uses.
//  fitToBudget comes from prompt-budget.js.
// ---------------------------------------------------------------------
function planPrompt() {
  const system = buildSystemMessage(character, USER_NAME, chatStyle, template);
  const fit = fitToBudget(system, messages);
  return { system: system, firstIncluded: fit.firstIncluded, tokens: fit.tokens };
}


// ---------------------------------------------------------------------
//  buildPrompt()
//  Returns the full list of messages to send to the AI:
//    1. The system message.
//    2. As much of the chat history as fits, newest last.
//
//  Press "Show prompt" in the app to see the result for real!
// ---------------------------------------------------------------------
function buildPrompt() {
  const plan = planPrompt();

  // .slice(start) copies the array from `start` to the end, which
  // leaves out the oldest messages that didn't fit.
  const history = messages.slice(plan.firstIncluded);

  // The `...` is the SPREAD operator. It "unpacks" the history array
  // into this new array, so we get:
  //     [ systemMessage, message1, message2, message3, ... ]
  // instead of:
  //     [ systemMessage, [message1, message2, message3] ]
  return [plan.system, ...history];
}


// =====================================================================
//  TALKING TO THE SERVER
// =====================================================================

// ---------------------------------------------------------------------
//  generate()
//  Asks the server for the character's next reply and adds it to the
//  chat. Called after you send a message, and by Regenerate.
// ---------------------------------------------------------------------
async function generate() {
  isGenerating = true;
  render(); // redraw so the buttons disable and "writing…" appears

  // Date.now() is the current time in milliseconds. We note when we
  // started so chat style can count the waiting time as "typing" time.
  const startedAt = Date.now();

  // ---------------------------------------------------------------
  //  THE STALE REPLY PROBLEM
  //  -----------------------
  //  A reply takes seconds to arrive, and you can do things while you
  //  wait. Send disables itself, but "New chat" and "Load card" don't
  //  — so you can throw away the whole conversation, or switch to a
  //  different character entirely, while a reply is still in the post.
  //
  //  When it lands, the code below pushes it into `messages`. But by
  //  then `messages` might be a DIFFERENT chat. That really happened:
  //  pressing New chat mid-reply put the old character's answer at the
  //  top of the fresh chat, and switching characters filed it under the
  //  new character's name in storage. Nothing crashed; it just quietly
  //  put words in the wrong person's mouth and saved them.
  //
  //  The fix is the standard one for every "what if it finished after I
  //  stopped caring?" situation: note which chat you're generating FOR,
  //  and when the answer arrives, check it's still that chat. If not,
  //  throw the answer away. You'll meet this pattern any time a slow
  //  answer can outlive the question — searching as you type, loading a
  //  page you've already navigated away from, all of it.
  // ---------------------------------------------------------------
  const chatWhenStarted = chatChangeCount;

  try {
    // Send the prompt to OUR server (server.js), not straight to the
    // AI provider. See the top of server.js for why.
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: buildPrompt() }),
    });

    const data = await response.json();

    // The answer is here — but is it still wanted? If the chat was
    // swapped out while we waited, this reply belongs to a conversation
    // that no longer exists. Dropping it is the only correct thing to
    // do; there's nowhere to put it.
    if (chatWhenStarted !== chatChangeCount) {
      return; // `finally` below still runs, which is the point of it
    }

    if (!response.ok || data.error) {
      // `throw` jumps straight down to the `catch` block below.
      throw new Error(data.error || "Unknown error from server");
    }

    // Save the WHOLE reply right away. It's safe even if you refresh
    // in the middle of the bubbles appearing.
    messages.push({ role: "assistant", content: data.reply });
    saveChat();

    if (chatStyle) {
      startReveal(messages.length - 1, Date.now() - startedAt);
    }

  } catch (error) {
    // Only complain if this is still the chat that asked. An error
    // about a conversation you've already left is just confusing.
    if (chatWhenStarted === chatChangeCount) {
      // Remember the problem so render() can show it in the chat.
      lastError = error.message;
    }

  } finally {
    // `finally` runs no matter what: success OR error.
    // It's the perfect place for cleanup.
    isGenerating = false;
    render();
  }
}


// =====================================================================
//  CHAT STYLE: showing bubbles one at a time
//  This is a small example of a TIMER-DRIVEN process. Each step
//  schedules the next step with setTimeout, like a chain of dominoes.
// =====================================================================

// ---------------------------------------------------------------------
//  startReveal(index, alreadyWaitedMs)
//  Begins showing message number `index` one bubble at a time.
//  `alreadyWaitedMs` is how long you already waited for the AI. We
//  subtract it from the first bubble's delay, since "she was typing"
//  during that time anyway.
// ---------------------------------------------------------------------
function startReveal(index, alreadyWaitedMs) {
  stopReveal();
  reveal = {
    index: index,
    bubbles: splitIntoBubbles(messages[index].content),
    shown: 0,
    timer: null,
  };
  scheduleNextBubble(alreadyWaitedMs);
}


// ---------------------------------------------------------------------
//  scheduleNextBubble(creditMs)
//  Waits the right amount of time, shows one more bubble, and then
//  calls ITSELF to schedule the next. When a function calls itself,
//  that's called RECURSION. Here it's safe because each call happens
//  later, from a timer, and it stops when the bubbles run out.
// ---------------------------------------------------------------------
function scheduleNextBubble(creditMs = 0) {
  // All bubbles shown? Then the reveal is finished.
  if (reveal.shown >= reveal.bubbles.length) {
    reveal = null;
    render();
    return;
  }

  const nextBubble = reveal.bubbles[reveal.shown];

  // Math.max(0, x) means "x, but never less than 0." A negative delay
  // would just mean "right away," but it's clearer to say so.
  const delay = Math.max(0, typingDelay(nextBubble) - creditMs);

  // setTimeout(fn, ms) runs `fn` once, after `ms` milliseconds.
  // It returns an id number we can use to cancel it with clearTimeout.
  reveal.timer = setTimeout(() => {
    reveal.shown = reveal.shown + 1;
    render();
    scheduleNextBubble();
  }, delay);
}


// ---------------------------------------------------------------------
//  stopReveal()  and  revealAll()
//  Cancel the timer and forget the reveal. Because the whole message
//  is already in `messages`, "stopping" just means render() will show
//  everything. No data is ever lost.
// ---------------------------------------------------------------------
function stopReveal() {
  if (reveal !== null) {
    clearTimeout(reveal.timer);
    reveal = null;
  }
}

function revealAll() {
  stopReveal();
  render();
}


// ---------------------------------------------------------------------
//  handleIndicatorTap()
//  Double-tapping the "typing" indicator skips to the end of the reply.
//  Browsers don't have a reliable "double-tap" event on phones, so we
//  build one: remember when the last tap was, and if this tap comes
//  soon enough after it, that's a double-tap.
// ---------------------------------------------------------------------
function handleIndicatorTap() {
  const now = Date.now();
  if (reveal !== null && now - lastTapTime < DOUBLE_TAP_WINDOW_MS) {
    revealAll();
  }
  lastTapTime = now;
}


// =====================================================================
//  USER ACTIONS  (things that happen when you click or type)
// =====================================================================

// ---------------------------------------------------------------------
//  sendMessage()
// ---------------------------------------------------------------------
function sendMessage() {
  // `.trim()` removes spaces and newlines from both ends, so a message
  // of only spaces counts as empty.
  const text = input.value.trim();

  // Don't send empty messages, and don't send while already waiting.
  if (text === "" || isGenerating) {
    return; // `return` leaves the function immediately
  }

  // Typing never interrupts the bubbles, but SENDING does: anything
  // still waiting to appear shows up at once, so your message lands
  // after the whole reply instead of in the middle of it.
  stopReveal();
  lastError = null;

  // In chat style, your message gets wrapped in <cht> tags so the
  // model sees (and copies) the bubble format.
  const content = chatStyle ? wrapInBubbleTags(text) : text;

  messages.push({ role: "user", content: content });
  input.value = ""; // clear the text box
  saveChat();

  // generate() will call render() for us, so we don't need to here.
  generate();
}


// ---------------------------------------------------------------------
//  regenerate()
//  Throws away the character's last reply and asks for a new one.
//  (This is a simple version of what other frontends call a "swipe.")
// ---------------------------------------------------------------------
function regenerate() {
  // `messages.at(-1)` means "the last item." Negative numbers count
  // backwards from the end.
  const last = messages.at(-1);

  if (isGenerating || !last || last.role !== "assistant") {
    return;
  }

  stopReveal();
  lastError = null;
  messages.pop(); // .pop() removes the last item

  // Save immediately, rather than leaving it to generate() to save the
  // replacement. If the new reply never arrives — the provider is down,
  // the key is wrong — `messages` has dropped the old one but storage
  // still has it, and the next refresh brings the discarded reply back
  // from the dead. Whenever the array changes, the save should follow.
  saveChat();

  generate();
}


// ---------------------------------------------------------------------
//  deleteMessage(index)
//  `index` is the message's position in the array (0 = the first one).
// ---------------------------------------------------------------------
function deleteMessage(index) {
  if (isGenerating) {
    return;
  }
  stopReveal();
  // .splice(start, howMany) removes items from the middle of an array.
  messages.splice(index, 1);
  lastError = null;
  saveChat();
  render();
}


// ---------------------------------------------------------------------
//  toggleChatStyle()
// ---------------------------------------------------------------------
function toggleChatStyle() {
  chatStyle = !chatStyle;
  saveSetting(CHAT_STYLE_KEY, chatStyle ? "on" : "off");
  applyChatStyleSetting();
  revealAll(); // switching modes mid-reveal just shows everything

  // One block only applies in chat style, so the preview is now out of
  // date if the editor is open.
  refreshPrompt();
}

// Makes the page match the `chatStyle` variable.
function applyChatStyleSetting() {
  // classList.toggle(name, force) adds the class if `force` is true
  // and removes it if false. style.css uses "chat-style" on <body>
  // to switch the look.
  document.body.classList.toggle("chat-style", chatStyle);

  // aria-pressed tells screen readers this is an on/off button.
  chatStyleButton.setAttribute("aria-pressed", String(chatStyle));
  chatStyleButton.textContent = chatStyle ? "Chat style: on" : "Chat style: off";
}


// ---------------------------------------------------------------------
//  handleCardFile()
//  Runs after you choose a card file in the file picker.
// ---------------------------------------------------------------------
async function handleCardFile() {
  // A file input can hold several files; we want the first.
  const file = cardFileInput.files[0];
  if (!file) {
    return; // you closed the picker without choosing anything
  }

  try {
    const newCharacter = await readCardFile(file); // from card-loader.js
    saveCharacter(newCharacter);
    lastError = null;
    setCharacter(newCharacter);
  } catch (error) {
    lastError = "Couldn't load that card: " + error.message;
    render();
  }

  // Clear the picker so choosing the SAME file again still counts as
  // a change. (Otherwise nothing would happen the second time.)
  cardFileInput.value = "";
}


// ---------------------------------------------------------------------
//  saveBackup()
//  Saves the chat to a file you can keep somewhere safe.
//
//  There is no "write a file" function in JavaScript, and that's on
//  purpose: a web page that could drop files on your phone without
//  asking would be a catastrophe. What a page CAN do is offer you a
//  link, and it can click that link itself. So:
//
//    1. A BLOB is a lump of data with a type attached. Think of it as
//       a file that only exists in memory.
//    2. URL.createObjectURL gives that lump a temporary address, which
//       looks like blob:http://localhost:8123/2f9c-… and only works
//       inside this page.
//    3. An <a> tag with a `download` attribute is a link that SAVES
//       instead of navigating. We never add it to the page; an element
//       doesn't have to be visible to be clicked.
//    4. revokeObjectURL throws the address away again. Until you do,
//       the browser keeps the whole blob in memory.
//
//  JSON.stringify(value, null, 2) indents the file with 2 spaces. It
//  makes the file bigger, and it means you can open a backup in any
//  text editor and read your own chat. Worth it.
// ---------------------------------------------------------------------
function saveBackup() {
  downloadJson(
    JSON.stringify(buildBackup(character, messages), null, 2),
    backupFilename(character.name)
  );
}


// ---------------------------------------------------------------------
//  downloadJson(text, filename)
//  The actual plumbing, used by backups and by saving a card.
// ---------------------------------------------------------------------
function downloadJson(text, filename) {
  const blob = new Blob([text], { type: "application/json" });
  const address = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = address;
  link.download = filename;
  link.click();

  // Throw the temporary address away once the download has had a moment
  // to start. Doing it on the very next line works in Chrome, but some
  // browsers haven't begun reading the blob yet and quietly cancel the
  // download instead — which would look exactly like nothing happening.
  setTimeout(() => URL.revokeObjectURL(address), 1000);
}


// ---------------------------------------------------------------------
//  handleBackupFile()
//  Runs after you choose a backup file in the file picker.
//
//  Note the ORDER: we read and check the file BEFORE asking you to
//  confirm anything. Being asked "replace your chat?" and then told the
//  file was broken anyway is a small, avoidable insult.
// ---------------------------------------------------------------------
async function handleBackupFile() {
  const file = backupFileInput.files[0];
  if (!file) {
    return; // you closed the picker without choosing anything
  }

  try {
    // readBackup comes from chat-backup.js. It throws a readable
    // Error if anything about the file is wrong.
    const restored = readBackup(await file.text());

    const question =
      `Restore ${restored.messages.length} messages with ` +
      `${restored.character.name}?\n\n` +
      `This replaces the chat you have open.`;

    if (confirm(question)) {
      saveCharacter(restored.character);

      // setCharacter switches us over and loads whatever chat that
      // character already had saved; we then replace it with the
      // backup's messages and save that instead.
      setCharacter(restored.character);
      messages = restored.messages;
      saveChat();

      lastError = null;
      render();
    }
  } catch (error) {
    lastError = "Couldn't restore that backup: " + error.message;
    render();
  }

  backupFileInput.value = "";
}


// =====================================================================
//  DRAWING THE PAGE
// =====================================================================

// ---------------------------------------------------------------------
//  render()
//  Erases the chat log and redraws every message from `messages`.
//  The text box is NOT inside the chat log, so redrawing never
//  disturbs what you're typing.
// ---------------------------------------------------------------------
function render() {
  // ---------------------------------------------------------------
  //  No character? Then there's no chat to draw, and everything below
  //  this point reads `character.name`. That happens when the card
  //  fails to load at startup.
  //
  //  This guard is load-bearing. Without it, pressing ANY toolbar
  //  button on that error screen — they aren't all disabled, and
  //  "Load card" mustn't be, since it's the way out — cleared the chat
  //  log and then threw half way through, leaving a blank page with
  //  the explanation deleted. The error had been on screen a moment
  //  earlier, which is the most annoying possible way to lose it.
  // ---------------------------------------------------------------
  if (character === null) {
    chatLog.replaceChildren();
    if (lastError) {
      chatLog.append(createNoteElement(lastError, "error"));
    }
    sendButton.disabled = true;
    blocksButton.disabled = true;
    return;
  }

  blocksButton.disabled = false;

  // Remember whether you were already looking at the bottom of the
  // chat. If you scrolled up to reread something, we shouldn't yank
  // you back down every time a bubble appears.
  // (scrollHeight = total height of the content, scrollTop = how far
  // down you've scrolled, clientHeight = the visible height.)
  const wasNearBottom =
    chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 80;

  // Remove everything currently inside the chat log.
  chatLog.replaceChildren();

  // Which messages will the AI actually see next time? Anything before
  // `firstIncluded` is too old to fit in the prompt.
  const { firstIncluded } = planPrompt();
  //    ^ this is DESTRUCTURING: it pulls the `firstIncluded` property
  //      out of the object into a variable with the same name.

  // `.forEach` runs a function once for each item in the array.
  // It hands us the item AND its position (index).
  messages.forEach((message, index) => {
    // Draw the memory line just above the oldest remembered message.
    // (If firstIncluded is 0, everything fits and there's no line.)
    if (index === firstIncluded && firstIncluded > 0) {
      chatLog.append(createMemoryLine(firstIncluded));
    }

    let bubbles = splitIntoBubbles(message.content);

    // If this message is mid-reveal, only draw the bubbles shown so far.
    // .slice(0, n) makes a copy of just the first n items.
    const isRevealing = reveal !== null && reveal.index === index;
    if (isRevealing) {
      bubbles = bubbles.slice(0, reveal.shown);
      if (bubbles.length === 0) {
        return; // nothing to show yet (inside forEach, `return` skips one item)
      }
    }

    const isLast = index === messages.length - 1;
    const element = createMessageElement(message, index, isLast, bubbles);

    // Fade out messages the AI can no longer see.
    if (index < firstIncluded) {
      element.classList.add("forgotten");
    }

    chatLog.append(element);
  });

  // While waiting OR while bubbles are still coming, show "typing".
  if (isGenerating || reveal !== null) {
    chatLog.append(createTypingIndicator());
  }

  // If the last attempt failed, show why.
  if (lastError) {
    chatLog.append(createNoteElement(lastError, "error"));
  }

  // Disable the send button while generating.
  sendButton.disabled = isGenerating;

  // Scroll to the bottom so the newest message is visible,
  // but only if you were already there.
  if (wasNearBottom) {
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  // If the prompt viewer is open, keep it up to date too.
  if (!promptViewer.hidden) {
    updatePromptViewer();
  }
}


// ---------------------------------------------------------------------
//  createMessageElement(message, index, isLast, bubbles)
//  Builds the HTML for ONE message and returns it.
//  `bubbles` is the message already split up by splitIntoBubbles.
//
//  In chat style the result looks like this (you can see it with your
//  browser's "Inspect" tool):
//
//    <div class="message from-user">
//      <div class="speaker">You</div>
//      <div class="bubble">first bubble</div>
//      <div class="bubble">second bubble</div>
//      <div class="message-actions">
//        <button>Delete</button>
//      </div>
//    </div>
//
//  In normal style, there's one <div class="text"> instead of bubbles.
// ---------------------------------------------------------------------
function createMessageElement(message, index, isLast, bubbles) {
  const isUser = message.role === "user";

  // createElement makes a new, empty tag. It isn't on the page until
  // we .append() it somewhere.
  const wrapper = document.createElement("div");
  wrapper.className = isUser ? "message from-user" : "message from-character";
  //                  ^ this is the TERNARY operator:
  //                    condition ? valueIfTrue : valueIfFalse

  const speaker = document.createElement("div");
  speaker.className = "speaker";
  speaker.textContent = isUser ? USER_NAME : character.name;
  wrapper.append(speaker);

  // A reply can come back completely empty. Say so instead of drawing
  // nothing, or you'd be left wondering what happened.
  if (bubbles.length === 0) {
    bubbles = ["(empty reply)"];
  }

  if (chatStyle) {
    for (const bubbleText of bubbles) {
      wrapper.append(createTextBlock("bubble", bubbleText));
    }
  } else {
    // Normal style: one block. Tags are already stripped out by
    // splitIntoBubbles, and we put the blank lines back between parts.
    wrapper.append(createTextBlock("text", bubbles.join("\n\n")));
  }

  const actions = document.createElement("div");
  actions.className = "message-actions";

  // Every message gets a Delete button.
  actions.append(
    createButton("Delete", () => deleteMessage(index))
  );

  // Only the character's LAST reply gets a Regenerate button.
  if (isLast && !isUser) {
    actions.append(createButton("Regenerate", regenerate));
  }

  wrapper.append(actions);
  return wrapper;
}


// ---------------------------------------------------------------------
//  createTextBlock(className, text)
//
//  SECURITY LESSON: we use textContent, NOT innerHTML.
//  innerHTML would treat the AI's words as real HTML code. If a reply
//  ever contained something like <img src=x onerror="...">, the
//  browser would RUN it. textContent always shows text as plain text.
//  (This also means *asterisks* show up as asterisks. Turning them
//  into italics safely is one of the exercises in README.md!)
// ---------------------------------------------------------------------
function createTextBlock(className, text) {
  const block = document.createElement("div");
  block.className = className;
  block.textContent = text;
  return block;
}


// ---------------------------------------------------------------------
//  createTypingIndicator()
//  The "Wren is typing…" line. During a chat-style reveal, it's also
//  the skip control: double-tap it to show the rest at once. It's a
//  real <button> so keyboards and screen readers can use it too.
// ---------------------------------------------------------------------
function createTypingIndicator() {
  const indicator = document.createElement("button");
  indicator.type = "button";
  indicator.className = "typing-indicator";
  indicator.textContent = `${character.name} is typing`;

  if (reveal !== null) {
    indicator.title = "Double-tap to show the rest now";
    indicator.addEventListener("click", handleIndicatorTap);
  } else {
    // While still waiting on the AI there's nothing to skip to.
    indicator.disabled = true;
  }

  return indicator;
}


// ---------------------------------------------------------------------
//  createMemoryLine(hiddenCount)
//  A divider in the chat: everything above it has fallen out of the
//  prompt. The messages are still saved and still readable; the AI
//  just can't see them anymore.
//  <hr> is a "horizontal rule," HTML's built-in divider line.
// ---------------------------------------------------------------------
function createMemoryLine(hiddenCount) {
  const line = document.createElement("div");
  line.className = "memory-line";
  line.append(document.createElement("hr"));

  const label = document.createElement("p");
  // A tiny grammar fix: "1 message" but "2 messages".
  const noun = hiddenCount === 1 ? "message" : "messages";
  label.textContent =
    `${character.name} can't see the ${hiddenCount} older ${noun} above this line.`;
  line.append(label);

  return line;
}


// ---------------------------------------------------------------------
//  createNoteElement(text, extraClass)
//  A simple message-shaped box for status notes and errors.
// ---------------------------------------------------------------------
function createNoteElement(text, extraClass) {
  const note = document.createElement("div");
  note.className = "message " + extraClass;
  note.append(createTextBlock("text", text));
  return note;
}


// ---------------------------------------------------------------------
//  createButton(label, onClick)
//  A small helper, because we make buttons in more than one place.
//  `onClick` is a FUNCTION passed in as a value. Functions in
//  JavaScript can be handed around just like numbers or strings.
// ---------------------------------------------------------------------
function createButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = isGenerating;
  button.addEventListener("click", onClick);
  return button;
}


// ---------------------------------------------------------------------
//  updatePromptViewer()
//  Shows the exact data that gets sent to the AI, as pretty JSON,
//  with a one-line summary of its size on top.
//  JSON.stringify(value, null, 2) means "indent with 2 spaces."
// ---------------------------------------------------------------------
function updatePromptViewer() {
  promptViewer.textContent =
    promptSizeSummary() + "\n\n" + JSON.stringify(buildPrompt(), null, 2);
}


// ---------------------------------------------------------------------
//  promptSizeSummary()
//  A few lines showing not just how big the prompt is, but WHERE the
//  space goes.
//
//  This is the most useful thing in the app for anyone who writes
//  cards. Every turn you pay for the whole character card again, before
//  a single line of conversation. If your example messages come to
//  1,500 tokens, that's a quarter of the budget gone permanently, and
//  it's exactly why your character starts forgetting things so early.
//  You can't tell that from a single total; you can tell it instantly
//  from a list.
// ---------------------------------------------------------------------
function promptSizeSummary() {
  const plan = planPrompt();
  const included = messages.length - plan.firstIncluded;

  // toLocaleString() adds thousands separators: 6000 → "6,000".
  const lines = [
    `About ${plan.tokens.toLocaleString()} of ${PROMPT_BUDGET_TOKENS.toLocaleString()} tokens. ` +
      `Sending ${included} of ${messages.length} chat messages.`,
  ];

  // The card is a FIXED cost: paid in full on every single turn.
  // Everything left over is the conversation itself.
  const cardTokens = estimateTokens(plan.system.content);
  const historyTokens = Math.max(0, plan.tokens - cardTokens);
  const total = Math.max(1, cardTokens + historyTokens); // never divide by 0

  lines.push("", "Where the space goes:");
  lines.push(costLine("the character card", cardTokens, total));
  lines.push(costLine("the conversation", historyTokens, total));

  // And which part of the card, biggest first — the one you can act on.
  // [...array] copies it before sorting, because .sort() rearranges the
  // array you give it, and that one came from prompt-template.js.
  const parts = [...systemMessageParts(character, USER_NAME, chatStyle, template)]
    .map((part) => ({ label: part.label, tokens: estimateTokens(part.text) }))
    .sort((a, b) => b.tokens - a.tokens);

  lines.push("", "The card, biggest part first:");
  for (const part of parts) {
    lines.push(costLine("  " + part.label, part.tokens, total));
  }

  return lines.join("\n");
}


// ---------------------------------------------------------------------
//  costLine(label, tokens, total)
//  One row of the size summary, with a little bar drawn out of block
//  characters. padEnd/padStart add spaces to line the columns up, which
//  only works because the prompt viewer is a <pre> in a fixed-width
//  font: every character is exactly as wide as every other one.
// ---------------------------------------------------------------------
function costLine(label, tokens, total) {
  const share = tokens / total;
  const filled = Math.round(share * 16);

  // The bar goes LAST on purpose. Block characters aren't guaranteed to
  // be the same width as everything else in whatever font your phone
  // picks for monospace, and if one is even slightly off, a bar in the
  // middle of the line would shove the column after it out of line.
  // Nothing comes after it, so nothing can be pushed about.
  return (
    label.padEnd(22) +
    tokens.toLocaleString().padStart(6) +
    (share * 100).toFixed(0).padStart(5) + "%  " +
    "█".repeat(filled) + "·".repeat(16 - filled)
  );
}


// =====================================================================
//  THE CHARACTER EDITOR
//  The card itself, editable in the browser instead of by hand in a
//  JSON file. Sits above the blocks, because these are the values the
//  blocks' macros stand for.
// =====================================================================

// Which fields to show, in this order. `rows` is how tall the box
// starts; you can drag any of them bigger.
const CARD_FIELDS = [
  { key: "description", label: "Description", rows: 4 },
  { key: "personality", label: "Personality", rows: 3 },
  { key: "scenario",    label: "Scenario",    rows: 3 },
  { key: "first_mes",   label: "First message (the greeting)", rows: 4 },
  { key: "mes_example", label: "Example messages", rows: 4 },
];


// ---------------------------------------------------------------------
//  renderCardEditor()
//  Draws the name box and one labelled box per field. Like the block
//  list, this is built once when the editor opens and NOT redrawn as
//  you type — see the long note on renderTemplateEditor for why.
// ---------------------------------------------------------------------
function renderCardEditor() {
  // Drawing the boxes fresh means nothing is half-typed any more.
  pendingName = null;
  cardFieldList.replaceChildren();

  // --- the name, which is a special case (see renameField) ---
  cardFieldList.append(createCardField("name", "Name", 1));

  for (const field of CARD_FIELDS) {
    cardFieldList.append(createCardField(field.key, field.label, field.rows));
  }
}


// ---------------------------------------------------------------------
//  createCardField(key, label, rows)
//  One labelled box, wired to write straight into the character.
// ---------------------------------------------------------------------
function createCardField(key, label, rows) {
  const wrapper = document.createElement("div");
  wrapper.className = "card-field";

  const box = document.createElement("textarea");
  box.rows = rows;
  box.value = character[key] ?? "";
  box.id = "card-field-" + key;

  const caption = document.createElement("label");
  caption.htmlFor = box.id;
  caption.textContent = label;

  box.addEventListener("input", () => {
    if (key === "name") {
      // The name is deliberately NOT written into `character` yet. The
      // chat's save slot is named after the character, so if a reply
      // arrived while you were half way through typing "Marisol", it
      // would be saved under "Mari" and lost. The real rename happens
      // on `change` below, which fires once, when you leave the box.
      //
      // The heading and the preview still follow along, using the
      // in-progress text — see refreshPrompt.
      pendingName = box.value;
      nameHeading.textContent = box.value;
      refreshPrompt();
      return;
    }

    character[key] = box.value;
    saveCharacter(character);
    refreshPrompt();
  });

  if (key === "name") {
    // Remember what it was called when you started editing.
    box.addEventListener("focus", () => {
      nameBeforeEdit = character.name;
      pendingName = character.name;
    });
    box.addEventListener("change", () => finishRename(box));
  }

  wrapper.append(caption, box);
  return wrapper;
}


// ---------------------------------------------------------------------
//  finishRename(box)
//  Runs when you leave the name box. Moves the saved chat to its new
//  name so a rename doesn't look like it deleted the conversation.
// ---------------------------------------------------------------------
function finishRename(box) {
  const from = nameBeforeEdit;
  const to = (pendingName ?? character.name).trim();
  pendingName = null; // committed (or rejected) from here on

  // An empty name would give every chat the same save slot, and leave
  // the heading blank. Put the old one back rather than allowing it.
  if (to === "") {
    character.name = from;
    box.value = from;
    nameHeading.textContent = from;
    document.title = from + " — Tiny RP";
    saveCharacter(character);
    refreshPrompt();
    return;
  }

  character.name = to;
  box.value = to;
  document.title = to + " — Tiny RP";

  if (from && from !== to) {
    try {
      const ours = localStorage.getItem(chatKeyFor(from));
      const theirsExists = localStorage.getItem(chatKeyFor(to)) !== null;

      if (theirsExists) {
        // That name already has a chat of its own. We must not write
        // over it — but simply declining to move ours isn't enough
        // either, because `messages` would still hold the old
        // conversation and the very next save would land on their slot
        // and destroy it anyway. So we switch to theirs: renaming onto
        // an existing character means you're now in THAT chat.
        const theirs = loadChat();
        if (theirs) {
          stopReveal();
          chatChangeCount = chatChangeCount + 1;
          messages = theirs;
        }
      } else if (ours !== null) {
        localStorage.setItem(chatKeyFor(to), ours);
        localStorage.removeItem(chatKeyFor(from));
      }
    } catch (error) {
      console.warn("Couldn't move the saved chat:", error);
    }
  }

  nameBeforeEdit = to;
  saveCharacter(character);
  render();
}


// ---------------------------------------------------------------------
//  exportCard()
//  Saves the character as a .json card other apps can read. It's
//  written in the V2 shape — fields inside a `data` object, with a
//  `spec` saying which version it is — because that's what everything
//  else expects. See card-loader.js, which reads exactly this.
// ---------------------------------------------------------------------
function exportCard() {
  const card = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: character.name,
      description: character.description ?? "",
      personality: character.personality ?? "",
      scenario: character.scenario ?? "",
      first_mes: character.first_mes ?? "",
      mes_example: character.mes_example ?? "",
    },
  };

  downloadJson(JSON.stringify(card, null, 2), cardFilename(character.name));
}


// =====================================================================
//  THE PROMPT BLOCK EDITOR
//  Lets you change the SHAPE of the system prompt, not just its
//  contents. See the top of prompt-template.js for why that matters.
// =====================================================================

// ---------------------------------------------------------------------
//  renderTemplateEditor()
//  Draws one row per block. Called when the list CHANGES — a block
//  added, removed, moved or switched off — and not while you type.
//
//  THAT DISTINCTION IS THE WHOLE TRICK. Rebuilding the list replaces
//  every element in it, including the textarea you're typing into, and
//  the new one isn't focused and has no cursor position. Redraw on
//  every keystroke and the box drops your cursor after one letter.
//
//  So typing updates the DATA and the PREVIEW, and deliberately leaves
//  the list alone. Everything else redraws. It's the one place in this
//  app where "just redraw everything" is the wrong answer, and it's
//  worth knowing why: the DOM is holding state of its own (what's
//  focused, where the cursor is) that our `template` array doesn't
//  describe, so wiping it throws that state away.
// ---------------------------------------------------------------------
function renderTemplateEditor() {
  blockList.replaceChildren();

  template.forEach((block, index) => {
    const row = document.createElement("div");
    row.className = "block-row";

    // --- the top line: on/off, name, and the move/delete buttons ---
    const head = document.createElement("div");
    head.className = "block-head";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = block.enabled;
    toggle.id = "block-toggle-" + index;
    toggle.addEventListener("change", () => {
      block.enabled = toggle.checked;
      saveTemplate();
      renderTemplateEditor();
      refreshPrompt();
    });

    // A real <label> tied to the checkbox, so tapping the name toggles
    // it too. That's a much bigger target than the box itself, which
    // matters a lot on a phone.
    const name = document.createElement("label");
    name.htmlFor = toggle.id;
    name.className = "block-name";
    name.textContent = block.label;

    head.append(toggle, name);

    // Moving a block up or down is what reorders the prompt.
    // These use their own helper rather than createButton(), which
    // disables everything while a reply is generating. That's right for
    // the chat — you shouldn't delete a message mid-reply — but nothing
    // redraws this list when generation ends, so a block button
    // disabled here would stay dead for the rest of the session.
    // Rearranging blocks while waiting is harmless anyway.
    head.append(
      createEditorButton("↑", () => moveBlock(index, -1)),
      createEditorButton("↓", () => moveBlock(index, 1)),
      createEditorButton("✕", () => removeBlock(index))
    );

    row.append(head);

    // --- the text itself ---
    const text = document.createElement("textarea");
    text.className = "block-text";
    text.rows = 3;
    text.value = block.text;
    text.spellcheck = false;
    text.setAttribute("aria-label", block.label + " text");

    text.addEventListener("input", () => {
      block.text = text.value;
      saveTemplate();
      refreshPrompt(); // NOT renderTemplateEditor — see the note above
    });

    row.append(text);

    // Say which card fields this block uses, and which of them are
    // empty — because an empty one is why a block vanishes from the
    // preview, and that's confusing without an explanation.
    const used = macrosUsedIn(block.text);
    if (used.length > 0 && character !== null) {
      const fields = cardFields(character);
      const empty = used.filter((field) => fields[field].trim() === "");

      const note = document.createElement("p");
      note.className = "block-note";
      note.textContent =
        empty.length === used.length
          ? `Left out: ${listOut(empty)} ${empty.length === 1 ? "is" : "are"} empty on this card.`
          : `Uses ${listOut(used)}.`;
      row.append(note);
    }

    if (block.chatStyleOnly) {
      const note = document.createElement("p");
      note.className = "block-note";
      note.textContent = "Only used when chat style is on.";
      row.append(note);
    }

    blockList.append(row);
  });
}


// Like createButton, but never disabled: see the note above.
function createEditorButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}


// A tiny grammar helper: ["a"] → "a", ["a","b"] → "a and b",
// ["a","b","c"] → "a, b and c".
function listOut(items) {
  if (items.length <= 1) {
    return items.join("");
  }
  return items.slice(0, -1).join(", ") + " and " + items.at(-1);
}


// ---------------------------------------------------------------------
//  moveBlock / removeBlock / addBlock / resetTemplate
//  The four ways the list itself changes. Each one edits `template`,
//  saves, and redraws — state and render, same as the chat.
// ---------------------------------------------------------------------
function moveBlock(index, direction) {
  const to = index + direction;
  if (to < 0 || to >= template.length) {
    return; // already at the end; nothing to do
  }

  // Swap the two entries. The [a, b] = [b, a] trick swaps without
  // needing a temporary variable.
  [template[index], template[to]] = [template[to], template[index]];

  saveTemplate();
  renderTemplateEditor();
  refreshPrompt();
}

function removeBlock(index) {
  if (!confirm(`Remove the "${template[index].label}" block?`)) {
    return;
  }
  template.splice(index, 1);
  saveTemplate();
  renderTemplateEditor();
  refreshPrompt();
}

function addBlock() {
  const label = prompt("What should this block be called?", "New block");
  if (label === null || label.trim() === "") {
    return;
  }

  template.push({
    // Date.now() is a quick way to get an id nothing else is using.
    id: "custom-" + Date.now(),
    label: label.trim(),
    enabled: true,
    text: "",
  });

  saveTemplate();
  renderTemplateEditor();
  refreshPrompt();
}

function resetTemplate() {
  if (!confirm("Put the blocks back exactly as they started?")) {
    return;
  }
  template = defaultTemplate();
  saveTemplate();
  renderTemplateEditor();
  refreshPrompt();
}


// ---------------------------------------------------------------------
//  refreshPrompt()
//  Updates everything that shows the prompt: the live preview in the
//  editor, and the raw viewer if it happens to be open.
//
//  Being able to watch the prompt change as you type IS the feature.
//  Formatting affects how a model writes, and you can't judge that
//  from a settings screen that hides the result.
// ---------------------------------------------------------------------
function refreshPrompt() {
  if (!templateEditor.hidden && character !== null) {
    // Preview against the name you're typing, which isn't committed to
    // `character` until you leave the box.
    const shown =
      pendingName === null ? character : { ...character, name: pendingName };

    const system = buildSystemMessage(shown, USER_NAME, chatStyle, template);
    const tokens = estimateTokens(system.content);

    templatePreview.textContent =
      `About ${tokens.toLocaleString()} tokens, every single turn.\n\n` +
      (system.content.trim() === "" ? "(nothing — every block is empty or off)" : system.content);
  }

  if (!promptViewer.hidden) {
    updatePromptViewer();
  }
}


// =====================================================================
//  SAVING AND LOADING
//  localStorage is a small storage area the browser gives each
//  website. It survives refreshing and closing the tab. It only
//  stores TEXT, so we convert our data to JSON and back.
//
//  Storage can fail (private browsing, storage full), so every use
//  is wrapped in try/catch. If saving fails, the app still works;
//  it just won't remember things.
// =====================================================================

// Each character gets its own chat save slot, named after the character.
// Split in two because renaming a character has to move the saved chat
// from one slot to the other, and needs to name a slot that isn't the
// current character's. See finishRename().
function chatKeyFor(name) {
  return "tiny-rp-chat:" + name;
}

function storageKey() {
  return chatKeyFor(character.name);
}

function saveChat() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(messages));
  } catch (error) {
    console.warn("Couldn't save chat:", error);
  }
}

// Returns the saved array, or null if there isn't a usable one.
//
//  Be as suspicious here as chat-backup.js is about files. Saved data is
//  outside data: you didn't write it this run, and something else might
//  have. A half-finished exercise that writes the wrong shape into
//  storage is the likeliest cause, and this project actively encourages
//  half-finished experiments.
//
//  Getting this wrong is nastier than it sounds. One message whose
//  `content` isn't a string makes render() throw, which leaves the page
//  dead — for a chat you now can't reach to delete. Refusing it here
//  costs one line and means the worst case is "you get a fresh chat."
function loadChat() {
  try {
    const text = localStorage.getItem(storageKey());
    if (text === null) {
      return null; // nothing saved yet
    }

    const saved = JSON.parse(text);
    if (!Array.isArray(saved) || saved.length === 0) {
      return null;
    }

    // isUsableMessage comes from chat-backup.js, which already had to
    // decide what a valid message looks like. One answer, not two.
    if (!saved.every(isUsableMessage)) {
      // Move the damaged text aside BEFORE giving up on it. Returning
      // null here makes setCharacter call startNewChat(), which saves
      // immediately — straight over the very data we're complaining
      // about. (That's not a guess: the first version of this said "the
      // old data is still in your storage" while quietly destroying it.)
      //
      // Data you don't understand is still data. Park it somewhere
      // instead of deleting it, and say where you put it.
      const rescueKey = storageKey() + " (damaged)";
      localStorage.setItem(rescueKey, text);

      lastError =
        `That character's saved chat was damaged, so this is a fresh one. ` +
        `The old data was moved aside under "${rescueKey}" in your browser's storage.`;
      console.warn("Damaged chat moved to", rescueKey);
      return null;
    }

    return saved;
  } catch (error) {
    console.warn("Couldn't load chat:", error);
    return null;
  }
}

// The card you loaded, so it's still there after a refresh.
function saveCharacter(newCharacter) {
  try {
    localStorage.setItem(SAVED_CHARACTER_KEY, JSON.stringify(newCharacter));
  } catch (error) {
    console.warn("Couldn't save character:", error);
  }
}

function loadSavedCharacter() {
  try {
    const text = localStorage.getItem(SAVED_CHARACTER_KEY);
    if (text === null) {
      return null;
    }

    const saved = JSON.parse(text);

    // A character with no name can't even name its own save slot (see
    // storageKey), so every chat would pile into "tiny-rp-chat:undefined"
    // together. Treat it as nothing and fall back to the default card.
    if (saved === null || typeof saved !== "object" || !saved.name) {
      console.warn("Ignoring a damaged saved character.");
      return null;
    }

    return saved;
  } catch (error) {
    console.warn("Couldn't load saved character:", error);
    return null;
  }
}

// The prompt blocks. Saved whenever you change one.
function saveTemplate() {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(template));
  } catch (error) {
    console.warn("Couldn't save the prompt blocks:", error);
  }
}

// Returns a usable template, always. A damaged one falls back to the
// default rather than taking the app down — isUsableTemplate is in
// prompt-template.js, and it's the same lesson as loadChat above:
// saved data is outside data, so check it at the edge.
//
// This one matters more than most, because a broken template breaks
// EVERY generation, not just one chat, and the editor that would let
// you fix it is drawn from the same broken data.
function loadTemplate() {
  try {
    const text = localStorage.getItem(TEMPLATE_KEY);
    if (text === null) {
      return defaultTemplate();
    }

    const saved = JSON.parse(text);
    if (!isUsableTemplate(saved)) {
      console.warn("Ignoring damaged prompt blocks; using the default.");
      return defaultTemplate();
    }

    return saved;
  } catch (error) {
    console.warn("Couldn't load the prompt blocks:", error);
    return defaultTemplate();
  }
}

// Tiny settings, stored as plain strings.
function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Couldn't save setting:", error);
  }
}

function loadSetting(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}


// =====================================================================
//  EVENT LISTENERS
//  "When THIS happens, run THAT function."
//  Nothing in the app happens on its own. Everything is a reaction
//  to an event: a click, a key press, the page finishing loading.
// =====================================================================

sendButton.addEventListener("click", sendMessage);

// Enter sends. Shift+Enter makes a new line (the textarea's normal
// behavior, which we just leave alone).
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    // preventDefault stops the browser's normal action,
    // which would be inserting a newline into the box.
    event.preventDefault();
    sendMessage();
  }
});

promptButton.addEventListener("click", () => {
  // Flip hidden → visible, or visible → hidden.
  promptViewer.hidden = !promptViewer.hidden;
  promptButton.textContent = promptViewer.hidden ? "Show prompt" : "Hide prompt";
  if (!promptViewer.hidden) {
    updatePromptViewer();
  }
});

newChatButton.addEventListener("click", () => {
  // confirm() shows a built-in OK/Cancel popup and returns true or false.
  if (confirm("Erase this chat and start over?")) {
    lastError = null;
    startNewChat();
    render();
  }
});

chatStyleButton.addEventListener("click", toggleChatStyle);

// The visible "Load card" button just clicks the hidden file picker.
// (Styling real file pickers is famously awkward, so this is the
// usual trick.)
loadCardButton.addEventListener("click", () => cardFileInput.click());
cardFileInput.addEventListener("change", handleCardFile);

// The prompt block editor. Opening it draws the list and the preview;
// after that, only changes redraw anything.
blocksButton.addEventListener("click", () => {
  // There is nothing to edit without a card, and everything below reads
  // `character`. render() disables this button on the error screen, but
  // guard here too: a disabled button can still be clicked from code,
  // and the cost of being wrong is wiping the error off the page.
  if (character === null) {
    return;
  }

  templateEditor.hidden = !templateEditor.hidden;
  blocksButton.textContent = templateEditor.hidden ? "Blocks" : "Hide blocks";

  // The chat gets out of the way while you're editing; see style.css.
  document.body.classList.toggle("editing-blocks", !templateEditor.hidden);

  if (!templateEditor.hidden) {
    renderCardEditor();
    renderTemplateEditor();
    refreshPrompt();
  }
});

exportCardButton.addEventListener("click", exportCard);

addBlockButton.addEventListener("click", addBlock);
resetTemplateButton.addEventListener("click", resetTemplate);

// Backups. Same trick as above: the visible button clicks the hidden
// file picker.
backUpButton.addEventListener("click", saveBackup);
restoreButton.addEventListener("click", () => backupFileInput.click());
backupFileInput.addEventListener("change", handleBackupFile);

// When you switch away from the browser, phones pause or slow down
// timers. Rather than have bubbles trickle in strangely when you come
// back, we just show the rest of the reply all at once.
// `document.hidden` is true while the page isn't visible.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && reveal !== null) {
    revealAll();
  }
});


// =====================================================================
//  GO!
//  Everything above just DEFINED things. This line actually starts
//  the app.
// =====================================================================
init();
