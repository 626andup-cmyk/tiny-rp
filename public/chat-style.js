// =====================================================================
//  chat-style.js  —  turning one reply into several text bubbles
// =====================================================================
//
//  WHAT THIS FILE IS FOR
//  ---------------------
//  Normally an AI reply shows up as one big block of text. "Chat style"
//  makes it look like texting instead: the reply is split into several
//  separate bubbles, and they appear one at a time, with a delay that
//  depends on how long each bubble is (like the other person is typing).
//
//  THE SPLITTING RULES (the same for you and for the character)
//  -------------------------------------------------------------
//    * Text wrapped in <cht> ... </cht> tags is one bubble.
//    * Any text NOT inside tags is split on BLANK lines.
//        one line break   = same bubble, new line
//        a blank line     = new bubble
//
//  WHY THIS IS ITS OWN FILE
//  ------------------------
//  Everything in here is a "PURE FUNCTION": it takes some input, returns
//  some output, and doesn't touch the page, the network, or any saved
//  data. Pure functions are the easiest code in the world to TEST,
//  because you just check "for this input, do I get that output?"
//  See tests/chat-style.test.js — those tests run on this exact file.
//
//  HOW THE BROWSER FINDS THESE FUNCTIONS
//  -------------------------------------
//  index.html loads this file BEFORE app.js. Functions declared at the
//  top level of a plain script become "global," so app.js can call them.
//  (Bigger projects use `import`/`export` instead. Globals are simpler
//  but get messy fast, which is a lesson you'll eventually learn the
//  fun way.)
// =====================================================================


// ---------------------------------------------------------------------
//  SETTINGS for the typing delay. Tweak these!
// ---------------------------------------------------------------------

// How long the "other person" spends typing each character, in
// milliseconds (1000 ms = 1 second). 150 ms per character is roughly a
// quick phone texter (about 80 words per minute). Raise it for slower,
// more realistic pacing. There is deliberately NO maximum: a long bubble
// takes a long time. Double-tap the typing indicator to skip ahead.
const MS_PER_CHARACTER = 150;

// A short pause before each bubble, like someone reading and thinking
// before they start typing.
const PAUSE_BEFORE_BUBBLE_MS = 800;


// ---------------------------------------------------------------------
//  splitIntoBubbles(text)
//  Takes a whole message and returns an ARRAY of bubble strings.
//
//  Example:
//    splitIntoBubbles("<cht>hey</cht>\n<cht>you up?</cht>")
//      →  ["hey", "you up?"]
//
//    splitIntoBubbles("first thought\nstill first\n\nsecond thought")
//      →  ["first thought\nstill first", "second thought"]
// ---------------------------------------------------------------------
function splitIntoBubbles(text) {

  // STEP 1: cut the text at every <cht>...</cht> pair.
  //
  // When you .split() using a regular expression that has a CAPTURE
  // GROUP (the part in parentheses), the captured text is KEPT in the
  // result. So the pieces alternate:
  //
  //   "intro <cht>A</cht> middle <cht>B</cht> end"
  //   → ["intro ", "A", " middle ", "B", " end"]
  //        outside  inside  outside  inside  outside
  //
  // Regex decoder ring:
  //   <cht>      the literal opening tag
  //   ([\s\S]*?) capture ANY characters, including newlines, as FEW as
  //              possible (the ? makes it "lazy," so it stops at the
  //              FIRST closing tag instead of the last one)
  //   <\/cht>    the literal closing tag (the / needs a backslash)
  //   i          the flag at the end: ignore upper/lower case
  const pieces = text.split(/<cht>([\s\S]*?)<\/cht>/i);

  const bubbles = [];

  // `for ... of` with .entries() gives us each piece AND its position.
  for (const [position, piece] of pieces.entries()) {

    // Odd positions (1, 3, 5...) are the insides of tags.
    // The % operator gives the remainder: 3 % 2 is 1, 4 % 2 is 0.
    const isInsideTags = position % 2 === 1;

    if (isInsideTags) {
      // A tagged bubble stays whole, even if it has blank lines in it.
      bubbles.push(piece);
    } else {
      // Untagged text: remove any stray, unmatched tags (models
      // sometimes forget to close one), then split on blank lines.
      //   \n\s*\n  means: a newline, maybe some spaces, another newline
      const cleaned = piece.replace(/<\/?cht>/gi, "");
      bubbles.push(...cleaned.split(/\n\s*\n/));
    }
  }

  // STEP 2: tidy up. .map() transforms every item; .filter() keeps only
  // the items that pass a test. Here: trim spaces, drop empty bubbles.
  return bubbles
    .map((bubble) => bubble.trim())
    .filter((bubble) => bubble !== "");
}


// ---------------------------------------------------------------------
//  wrapInBubbleTags(text)
//  Used on YOUR messages in chat style. Models copy the formatting they
//  see, so if your messages are tagged, the model is more likely to tag
//  its replies too. This does the tagging so you don't have to.
//
//  If you already typed tags yourself, it leaves your text alone.
//
//  Example:
//    wrapInBubbleTags("lol\n\nwait what")
//      →  "<cht>lol</cht>\n<cht>wait what</cht>"
// ---------------------------------------------------------------------
function wrapInBubbleTags(text) {
  if (/<cht>/i.test(text)) {
    return text; // already tagged by hand
  }
  return splitIntoBubbles(text)
    .map((bubble) => `<cht>${bubble}</cht>`)
    .join("\n");
}


// ---------------------------------------------------------------------
//  typingDelay(bubble)
//  How many milliseconds to "type" a bubble before showing it.
// ---------------------------------------------------------------------
function typingDelay(bubble) {
  return PAUSE_BEFORE_BUBBLE_MS + bubble.length * MS_PER_CHARACTER;
}


// ---------------------------------------------------------------------
//  This last bit is ONLY for the tests. In the browser, `module` doesn't
//  exist, so `typeof module` is "undefined" and this does nothing.
//  When Bun runs the tests, `module` DOES exist, so the functions get
//  shared with the test file.
// ---------------------------------------------------------------------
if (typeof module !== "undefined") {
  module.exports = { splitIntoBubbles, wrapInBubbleTags, typingDelay };
}
