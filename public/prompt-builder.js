// =====================================================================
//  prompt-builder.js  —  turning a character card into a system message
// =====================================================================
//
//  This is the most important code in the app. Everything else moves
//  text around; this decides who the AI thinks it is.
//
//  WHY IT LIVES IN ITS OWN FILE
//  ----------------------------
//  It used to be inside app.js, and it worked fine there. It moved for
//  one reason: it couldn't be TESTED there.
//
//  In app.js these functions read `character`, `USER_NAME` and
//  `chatStyle` straight out of the surrounding file. That's convenient
//  to write and impossible to check, because to test one you'd have to
//  load the whole app — which needs a browser, a page full of elements,
//  and a server to fetch the card from. So the heart of the app had no
//  tests at all, while the bubble splitter had twenty.
//
//  The change that fixed that is tiny and worth stealing:
//
//      before:  function fillMacros(text)                 // reads globals
//      after:   function fillMacros(text, characterName, userName)
//
//  Take what you need as ARGUMENTS instead of reaching outside for it,
//  and a function becomes something you can call with made-up values
//  and check the answer of. That's most of what people mean by
//  "testable code": it isn't a testing trick, it's a design choice you
//  make while writing the function.
//
//  It also makes the code honest. Reading the line below, you can see
//  exactly what goes into a system message. In the old version you had
//  to go hunting for which globals it happened to read.
// =====================================================================


// ---------------------------------------------------------------------
//  fillMacros(text, characterName, userName)
//  Character cards use placeholders like {{char}} and {{user}}.
//  This swaps them for the real names.
//
//  We use regular expressions with the `g` (global: replace them ALL)
//  and `i` (ignore case, so {{Char}} works too) flags. Some very old
//  cards use <BOT> and <USER> instead, so we handle those as well.
//
//  `text ?? ""` guards against a card that's missing a field:
//  if `text` is undefined, we use an empty string instead.
//
//  THE ARROW FUNCTIONS ARE NOT DECORATION
//  --------------------------------------
//  Look closely: we pass `() => characterName`, not `characterName`.
//
//  When you hand .replace() a STRING, a few characters inside it are
//  magic. `$&` means "whatever was matched", `` $` `` means "everything
//  before the match", `$'` means "everything after it". They're a
//  shorthand nobody remembers, and they apply to the replacement even
//  when it came from somewhere else entirely — like a character's name.
//
//  So a card for a character called  Do$`t  used to produce this:
//
//      "Hello {{char}}"   ->   "Hello DoHello t"
//
//  because `` $` `` pasted the start of the sentence into the middle of
//  her name. Not a crash; just a quietly corrupted prompt, in the one
//  place you'd least want one.
//
//  Passing a FUNCTION turns all of that off. Whatever it returns is
//  used exactly as-is. Any time you replace text with a value you
//  didn't write yourself, use the function form.
// ---------------------------------------------------------------------
function fillMacros(text, characterName, userName) {
  return (text ?? "")
    .replace(/{{char}}|<BOT>/gi, () => characterName)
    .replace(/{{user}}|<USER>/gi, () => userName);
}


// ---------------------------------------------------------------------
//  systemMessageParts(character, userName, chatStyle)
//  The system message, in labelled pieces, in order.
//  Returns:  [ { label: "Description", text: "Description:\n…" }, … ]
//
//  WHY PIECES INSTEAD OF ONE STRING
//  --------------------------------
//  buildSystemMessage below just glues these together, so you could ask
//  what the labels are for. They're for the size summary in Show prompt,
//  which tells you how many tokens each part of your card is costing.
//
//  It's the same trick planPrompt uses: work it out ONCE, in a shape
//  that more than one caller can use. The alternative is a second
//  function that re-does the same string-building to count it, which
//  works right up until someone edits one and not the other, and then
//  the screen confidently reports numbers that aren't true.
//
//  If you want to know why your character forgets things so fast, this
//  is the answer: a card with 1,500 tokens of example messages is
//  spending a quarter of an 6,000-token budget before you say a word.
// ---------------------------------------------------------------------
function systemMessageParts(character, userName, chatStyle) {
  const fill = (text) => fillMacros(text, character.name, userName);

  // An array of lines joined with "\n" (newline) is an easy way to
  // build a long block of text.
  const instructions = [
    `You are ${character.name} in an ongoing roleplay with ${userName}.`,
    `Write only ${character.name}'s replies. Never write ${userName}'s actions or dialogue.`,
  ];

  // In chat style, ask the model to format replies as bubbles.
  // (Cards whose example messages already use <cht> tags will mostly
  // do this anyway. Models copy what they see.)
  if (chatStyle) {
    instructions.push(
      "This conversation is happening over text messages. Write each reply as one or more short messages, wrapping each message in <cht></cht> tags."
    );
  }

  return [
    { label: "Instructions", text: instructions.join("\n") },
    { label: "Description", text: "Description:\n" + fill(character.description) },
    { label: "Personality", text: "Personality:\n" + fill(character.personality) },
    { label: "Scenario", text: "Scenario:\n" + fill(character.scenario) },
    {
      label: "Examples",
      // <START> is a divider SillyTavern-style cards use between
      // examples. The AI doesn't need to see it, so we remove it.
      text:
        "Example of the writing style:\n" +
        fill(character.mes_example).replaceAll("<START>", "").trim(),
    },
  ];
}


// ---------------------------------------------------------------------
//  buildSystemMessage(character, userName, chatStyle)
//  The "system" message: the part of the prompt that describes the
//  character and the rules. It's the same every turn (unless you change
//  characters or switch chat style).
//
//  Returns a message object ready to go into the prompt:
//      { role: "system", content: "..." }
// ---------------------------------------------------------------------
function buildSystemMessage(character, userName, chatStyle) {
  const content = systemMessageParts(character, userName, chatStyle)
    .map((part) => part.text)
    .join("\n\n");

  return { role: "system", content: content };
}


// Share with the tests (see the note at the bottom of chat-style.js).
if (typeof module !== "undefined") {
  module.exports = { fillMacros, buildSystemMessage, systemMessageParts };
}
