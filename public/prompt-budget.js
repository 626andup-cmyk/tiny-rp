// =====================================================================
//  prompt-budget.js  —  fitting a long chat into a limited prompt
// =====================================================================
//
//  THE PROBLEM
//  -----------
//  Every model has a CONTEXT WINDOW: a maximum amount of text it can
//  read at once, measured in TOKENS. Remember, the AI has no memory,
//  so every generation we send the whole prompt: the character card
//  plus the chat history. Eventually a long chat won't fit.
//
//  Every real frontend solves this the same basic way, and so do we:
//  keep the system message (the character), then add chat messages
//  starting from the NEWEST and working backwards, until we run out
//  of room. The oldest messages get left out. They're still saved and
//  still on your screen; the AI just can't see them anymore.
//
//  (Fancier tricks, like summaries and lorebooks, are all attempts to
//  rescue important stuff from those left-out messages.)
//
//  WHAT'S A TOKEN?
//  ---------------
//  Models don't read letters or words; they read TOKENS, chunks that
//  are often a word or part of a word. "Lighthouse" might be two
//  tokens: "Light" + "house". Every model family chops text slightly
//  differently, and getting the EXACT count would mean shipping a big
//  tokenizer file. Instead we ESTIMATE: for English, one token is
//  about four characters. It's rough, so we leave some breathing room.
//
//  Like chat-style.js, everything in here is a PURE FUNCTION and has
//  tests in tests/prompt-budget.test.js.
// =====================================================================


// ---------------------------------------------------------------------
//  SETTINGS. Tweak these to match your model!
// ---------------------------------------------------------------------

// How many tokens of prompt we're willing to send. Look up your
// model's context size and pick a number safely BELOW it, leaving room
// for the reply (the reply counts against the same window!). With
// "maxTokens": 400 in config.json, a model with an 8k window could go
// up to about 7500. 6000 is a cautious default that works almost
// anywhere. Bigger numbers mean more memory but slower, pricier replies.
const PROMPT_BUDGET_TOKENS = 6000;

// Roughly how many characters make one token (see above).
const CHARACTERS_PER_TOKEN = 4;

// Each message costs a few extra tokens beyond its text, for the
// behind-the-scenes labels that mark who's speaking.
const TOKENS_PER_MESSAGE_OVERHEAD = 4;


// ---------------------------------------------------------------------
//  estimateTokens(text)
//  Math.ceil rounds UP, so even one character counts as one token.
// ---------------------------------------------------------------------
function estimateTokens(text) {
  return Math.ceil(text.length / CHARACTERS_PER_TOKEN);
}


// ---------------------------------------------------------------------
//  messageCost(message)
//  The estimated cost of one whole message, overhead included.
// ---------------------------------------------------------------------
function messageCost(message) {
  return estimateTokens(message.content) + TOKENS_PER_MESSAGE_OVERHEAD;
}


// ---------------------------------------------------------------------
//  fitToBudget(systemMessage, history, budget)
//
//  Returns an object describing what fits:
//    {
//      firstIncluded: index in `history` of the oldest message that
//                     still fits (0 means everything fits),
//      tokens:        the estimated total size of what we'll send
//    }
//
//  We return an INDEX rather than a trimmed copy so app.js can use it
//  twice: to build the prompt, and to draw the "memory line" in the
//  chat showing where the AI's memory begins.
//
//  The newest message is ALWAYS included, even if it alone is over
//  budget. Sending the AI a prompt with no chat in it would be useless.
// ---------------------------------------------------------------------
function fitToBudget(systemMessage, history, budget = PROMPT_BUDGET_TOKENS) {
  let tokens = messageCost(systemMessage);

  // Start past the end: "nothing included yet."
  let firstIncluded = history.length;

  // Walk BACKWARDS from the newest message (the last index) to the
  // oldest (index 0). `i--` subtracts one each time around.
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = messageCost(history[i]);
    const isNewest = i === history.length - 1;

    // Would this one push us over? Then stop: everything older than
    // this is left out too. (Skipping just this message and keeping
    // older ones would scramble the conversation's order of events.)
    if (tokens + cost > budget && !isNewest) {
      break;
    }

    tokens = tokens + cost;
    firstIncluded = i;
  }

  return { firstIncluded: firstIncluded, tokens: tokens };
}


// Share with the tests (see the note at the bottom of chat-style.js).
if (typeof module !== "undefined") {
  module.exports = { estimateTokens, fitToBudget, PROMPT_BUDGET_TOKENS };
}
