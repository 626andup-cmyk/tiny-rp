// =====================================================================
//  prompt-template.js  —  deciding what the system prompt LOOKS like
// =====================================================================
//
//  THE PROBLEM THIS EXISTS TO SOLVE
//  --------------------------------
//  Until now, Tiny RP glued your character card into a fixed shape:
//
//      Description:
//      <your text>
//
//      Personality:
//      <your text>
//
//  That's a choice, and it was made for you. It's also a choice with
//  consequences, because models copy the shape of what they're shown.
//  Hand one a filled-in form and you tend to get form-shaped writing
//  back: clipped, declarative, a bit dead. Card creators that generate
//  rigid labelled fields have exactly this problem, and the complaint
//  people have about them — "the formatting is so unnatural it affects
//  the output" — is real, and it isn't about the model.
//
//  So the shape is now yours. This file is the machinery for that.
//
//  THE IDEA
//  --------
//  A template is a LIST OF BLOCKS. Each block is a piece of text that
//  becomes part of the system prompt, and that text can mention parts
//  of the card using the same {{macro}} spelling cards already use:
//
//      { text: "Description:\n{{description}}" }   the old, labelled way
//      { text: "{{char}} is {{description}}" }     a sentence instead
//      { text: "You're playing {{char}}. Keep it short." }  your own words
//
//  One mechanism — macros — does all of it. Reordering the list
//  reorders the prompt. Turning a block off removes it. Writing prose
//  instead of a label gets you prose.
//
//  THE MACROS
//  ----------
//      {{char}}         the character's name
//      {{user}}         your name
//      {{description}}  }
//      {{personality}}  }  straight from the card
//      {{scenario}}     }
//      {{greeting}}     the first message (not usually wanted here —
//                       it's already the first thing in the chat)
//      {{examples}}     the example messages, with <START> removed
//
//  Card fields can themselves contain {{char}} and {{user}}, and they
//  get filled too. Fields are substituted first, then names, so a
//  description reading "{{char}} keeps a lighthouse" comes out right.
//
//  THE RULE THAT MATTERS MOST
//  --------------------------
//  A block whose card fields are ALL empty is dropped entirely.
//
//  Without that, a character with no personality written gets
//
//      Personality:
//
//  in their prompt: a heading introducing nothing. That's precisely the
//  kind of small, stupid, invisible mess that teaches a model to write
//  badly, and it's the sort of thing a fixed template can't avoid.
//
//  Everything here is a PURE FUNCTION and tested in
//  tests/prompt-template.test.js.
// =====================================================================


// ---------------------------------------------------------------------
//  The default template. It reproduces exactly what Tiny RP produced
//  before any of this existed — deliberately, so that turning the
//  feature on changes nothing until you change something.
//
//  `id` is a stable name used for saving. `label` is what the editor
//  and the token breakdown call it. `chatStyleOnly` means the block
//  only appears when chat style is switched on.
// ---------------------------------------------------------------------
const DEFAULT_TEMPLATE = [
  {
    id: "role",
    label: "Instructions",
    enabled: true,
    text:
      "You are {{char}} in an ongoing roleplay with {{user}}.\n" +
      "Write only {{char}}'s replies. Never write {{user}}'s actions or dialogue.",
  },
  {
    id: "chat-style",
    label: "Chat style",
    enabled: true,
    chatStyleOnly: true,
    text:
      "This conversation is happening over text messages. Write each reply " +
      "as one or more short messages, wrapping each message in <cht></cht> tags.",
  },
  { id: "description", label: "Description", enabled: true, text: "Description:\n{{description}}" },
  { id: "personality", label: "Personality", enabled: true, text: "Personality:\n{{personality}}" },
  { id: "scenario",    label: "Scenario",    enabled: true, text: "Scenario:\n{{scenario}}" },
  { id: "examples",    label: "Examples",    enabled: true, text: "Example of the writing style:\n{{examples}}" },
];


// Which macros pull text out of the card. {{char}} and {{user}} aren't
// in here: they're names, they're never "missing" in the same way, and
// a block made only of the character's name is still worth keeping.
const CARD_FIELD_MACROS = [
  "description", "personality", "scenario", "greeting", "examples",
];


// ---------------------------------------------------------------------
//  cardFields(character)
//  The card, as the values the macros stand for.
// ---------------------------------------------------------------------
function cardFields(character) {
  return {
    description: character.description ?? "",
    personality: character.personality ?? "",
    scenario: character.scenario ?? "",
    greeting: character.first_mes ?? "",
    // <START> is a divider SillyTavern-style cards use between
    // examples. The AI doesn't need to see it.
    examples: (character.mes_example ?? "").replaceAll("<START>", "").trim(),
  };
}


// ---------------------------------------------------------------------
//  macrosUsedIn(text)
//  Which card-field macros a block mentions. Used to decide whether a
//  block has anything to say.
//
//  Regex decoder ring:
//    \{\{      two literal { characters (they mean something in regex,
//              so they're escaped)
//    \s*       any spaces, so {{ char }} works too
//    (\w+)     capture one or more letters/digits/underscores
//    \s*\}\}   optional spaces, then two literal }
//    g         find them all, not just the first
//    i         ignore case
// ---------------------------------------------------------------------
function macrosUsedIn(text) {
  const used = [];
  for (const match of String(text ?? "").matchAll(/\{\{\s*(\w+)\s*\}\}/gi)) {
    const name = match[1].toLowerCase();
    if (CARD_FIELD_MACROS.includes(name) && !used.includes(name)) {
      used.push(name);
    }
  }
  return used;
}


// ---------------------------------------------------------------------
//  fillTemplateText(text, character, userName)
//  Substitutes every macro in one block's text.
//
//  Fields go in FIRST, then names — so a description that itself says
//  "{{char}} keeps a lighthouse" ends up with the name filled in too.
//  Doing it in this order also means the substitution can't run away
//  with itself: each pass happens exactly once.
//
//  THE ARROW FUNCTIONS ARE NOT DECORATION
//  --------------------------------------
//  Look closely: every replace is handed `() => value`, not `value`.
//
//  When you give .replace() a STRING, a few characters inside it are
//  magic. `$&` means "whatever was matched", `` $` `` means "everything
//  before the match", `$'` means "everything after it". It's a
//  shorthand nobody remembers, and it applies to the replacement even
//  when that came from somewhere else entirely — like a character's
//  name, out of a card somebody else wrote.
//
//  A character called  Do$`t  used to produce this:
//
//      "Hello {{char}}"   ->   "Hello DoHello t"
//
//  because `` $` `` pasted the start of the sentence into the middle of
//  her name. Not a crash; just a quietly corrupted prompt, in the one
//  place you'd least want one.
//
//  Passing a FUNCTION turns all of it off: whatever it returns is used
//  exactly as written. Any time you replace text with a value you
//  didn't type yourself, use the function form.
// ---------------------------------------------------------------------
function fillTemplateText(text, character, userName) {
  const fields = cardFields(character);
  let filled = String(text ?? "");

  for (const name of CARD_FIELD_MACROS) {
    const pattern = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "gi");
    filled = filled.replace(pattern, () => fields[name]);
  }

  return filled
    .replace(/\{\{\s*char\s*\}\}|<BOT>/gi, () => character.name)
    .replace(/\{\{\s*user\s*\}\}|<USER>/gi, () => userName);
}


// ---------------------------------------------------------------------
//  applyTemplate(template, character, userName, chatStyle)
//  Turns a template into the labelled pieces of a system message:
//      [ { label: "Description", text: "Description:\nShe keeps…" }, … ]
//
//  The same shape prompt-builder.js used to build by hand, so the token
//  breakdown in Show prompt keeps working and now names YOUR blocks.
// ---------------------------------------------------------------------
function applyTemplate(template, character, userName, chatStyle) {
  const parts = [];

  for (const block of template) {
    if (!block.enabled) {
      continue;
    }
    if (block.chatStyleOnly && !chatStyle) {
      continue;
    }

    const fieldsUsed = macrosUsedIn(block.text);
    const fields = cardFields(character);

    // If a block exists only to present card fields, and every one of
    // them is empty, it has nothing to say. Keeping it would leave a
    // heading introducing nothing. See the note at the top.
    const everyFieldEmpty =
      fieldsUsed.length > 0 &&
      fieldsUsed.every((name) => fields[name].trim() === "");

    if (everyFieldEmpty) {
      continue;
    }

    const text = fillTemplateText(block.text, character, userName).trim();
    if (text === "") {
      continue; // nothing left after filling
    }

    parts.push({ label: block.label, text: text });
  }

  return parts;
}


// ---------------------------------------------------------------------
//  systemMessageParts(character, userName, chatStyle, template)
//  buildSystemMessage(character, userName, chatStyle, template)
//
//  The two the rest of the app actually calls. `parts` is the labelled
//  list (Show prompt counts these to tell you what each block costs);
//  `buildSystemMessage` glues them into the message that gets sent.
//
//  They're kept as two functions so the numbers on screen and the text
//  on the wire come from ONE calculation. A second function that
//  re-built the string to measure it would work until someone changed
//  one and not the other, and then the screen would confidently report
//  sizes that weren't true.
//
//  Leaving `template` off gets you the default, so every existing call
//  keeps working and the app behaves exactly as it did before any of
//  this existed.
// ---------------------------------------------------------------------
function systemMessageParts(character, userName, chatStyle, template = defaultTemplate()) {
  return applyTemplate(template, character, userName, chatStyle);
}

function buildSystemMessage(character, userName, chatStyle, template = defaultTemplate()) {
  const content = systemMessageParts(character, userName, chatStyle, template)
    .map((part) => part.text)
    .join("\n\n");

  return { role: "system", content: content };
}


// ---------------------------------------------------------------------
//  isUsableTemplate(value)
//  Is this something we can safely use as a template?
//
//  Templates get saved in the browser and will eventually be shared
//  between people, which makes them outside data — the same lesson as
//  chat-backup.js. A template with a block whose `text` is a number
//  would throw in the middle of building a prompt, and you'd have no
//  obvious way back. Check it once, here, at the edge.
// ---------------------------------------------------------------------
function isUsableTemplate(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (block) =>
        block !== null &&
        typeof block === "object" &&
        typeof block.id === "string" &&
        typeof block.label === "string" &&
        typeof block.text === "string" &&
        typeof block.enabled === "boolean"
    )
  );
}


// ---------------------------------------------------------------------
//  defaultTemplate()
//  A fresh copy, so nothing can accidentally edit the original.
//  JSON.parse(JSON.stringify(x)) is the laziest deep copy there is, and
//  for plain data like this it's perfectly good.
// ---------------------------------------------------------------------
function defaultTemplate() {
  return JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
}


// Share with the tests (see the note at the bottom of chat-style.js).
if (typeof module !== "undefined") {
  module.exports = {
    applyTemplate,
    fillTemplateText,
    systemMessageParts,
    buildSystemMessage,
    macrosUsedIn,
    isUsableTemplate,
    defaultTemplate,
    cardFields,
    CARD_FIELD_MACROS,
  };
}
