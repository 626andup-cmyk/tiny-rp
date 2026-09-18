// =====================================================================
//  properties.test.js  —  tests that make up their own examples
// =====================================================================
//
//  A DIFFERENT WAY TO TEST
//  -----------------------
//  Every other test in this project is an EXAMPLE: "for this input,
//  expect that output." Examples are clear and easy to write, and they
//  have one weakness — they only ever check the cases you thought of.
//  Bugs, by definition, live in the cases you didn't.
//
//  So here we do the opposite. Instead of an example, we state a RULE
//  that has to hold for *every* input:
//
//      "no matter what text you give splitIntoBubbles,
//       no <cht> tag is ever left in the result"
//
//  Then the computer makes up a few hundred horrible inputs and checks
//  the rule against every one. This is called PROPERTY-BASED TESTING,
//  and the rules are called properties. It's one of the highest-value
//  testing ideas there is, and almost nobody is taught it.
//
//  It works. Writing the rule above found a real bug in chat-style.js:
//  a doubled opening tag, like <cht>in<cht>side</cht>, left a visible
//  "<cht>" in the chat. Models really do produce that, no example test
//  had thought to try it, and it had been there for three versions.
//  See the regression test in chat-style.test.js.
//
//  THE HARD PART: thinking of rules
//  --------------------------------
//  Good properties are usually one of a few shapes:
//
//    * "the output always looks like this"  (no empty bubbles, ever)
//    * "doing it backwards gets the original back"  (save then load)
//    * "it never crashes, whatever you feed it"  (random bytes)
//    * "two ways of computing it agree"  (the token count matches
//      the messages it says it's sending)
//
//  WHY THE RANDOMNESS IS FAKE
//  --------------------------
//  Math.random() would make this test do something different every run.
//  A test that fails once in fifty runs is worse than no test: nobody
//  trusts it, and eventually everybody ignores it. So we use our own
//  generator with a fixed starting SEED, which makes the "random"
//  numbers identical every time. Same inputs, same result, always.
//
//  The trade: it only ever tries these few hundred inputs. To go
//  hunting for new bugs, change START_SEED to any other number and run
//  it again. That's a genuinely fun thing to do for five minutes.
//
//  Run with:  bun test
// =====================================================================

import { test, expect } from "bun:test";

const { splitIntoBubbles, wrapInBubbleTags, typingDelay } = require("../public/chat-style.js");
const { parsePngCard, normalizeCard } = require("../public/card-loader.js");
const { estimateTokens, fitToBudget } = require("../public/prompt-budget.js");
const { buildBackup, readBackup, backupFilename } = require("../public/chat-backup.js");


// How many made-up inputs each rule gets checked against. Higher finds
// more, and makes `bun test` slower. A few hundred is plenty here.
const RUNS = 400;

// Change this number to hunt for new bugs. Any number works.
const START_SEED = 12345;


// ---------------------------------------------------------------------
//  A tiny random number generator.
//
//  This is a "linear congruential generator", about the simplest one
//  that exists: multiply, add, keep the low bits, repeat. The numbers
//  look scattered but follow exactly from the seed, so the same seed
//  always gives the same sequence. (Don't use one of these for anything
//  that needs to be secret — it's trivial to predict. For making up
//  test data it's perfect.)
//
//  `& 0x7fffffff` keeps the lowest 31 bits, which is a fast way of
//  saying "wrap around instead of growing forever."
// ---------------------------------------------------------------------
let seed = START_SEED;

function random() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

const pick = (list) => list[Math.floor(random() * list.length)];
const upTo = (n) => Math.floor(random() * n);


// ---------------------------------------------------------------------
//  forAll(makeInput, rule)
//  Makes up RUNS inputs and checks the rule against each. Returns the
//  FIRST input that broke it, or null if none did.
//
//  Returning the offending input (the "counterexample") rather than
//  just true/false is the whole trick: when a property fails you need
//  to know *what* broke it, or you can't fix anything.
// ---------------------------------------------------------------------
function forAll(makeInput, rule) {
  for (let i = 0; i < RUNS; i++) {
    const input = makeInput();
    let held;
    try {
      held = rule(input);
    } catch (error) {
      // A rule that throws is a rule that failed, and the crash itself
      // is usually the bug we were looking for.
      return { input: input, threw: error.message };
    }
    if (!held) {
      return { input: input };
    }
  }
  return null;
}


// ---------------------------------------------------------------------
//  Input generators. These are deliberately nasty: the point is to
//  produce the text a tired model at 2am would produce, not the tidy
//  text you had in mind while writing the function.
// ---------------------------------------------------------------------
const NASTY_PIECES = [
  "", " ", "\n", "\n\n", "\n \n", "\t", "\r\n", "\r\n\r\n",
  "<cht>", "</cht>", "<CHT>", "</CHT>", "<cht/>", "<cht >",
  "hello", "a", "café", "🦊", "🦊🔥", "​",
  "*waves*", "<img src=x onerror=alert(1)>", "&amp;", "\\", '"',
  "x".repeat(300), "  padded  ", "line1\nline2", "<cht>a</cht>",
  "nested <cht>in<cht>side</cht></cht>",
];

function nastyText() {
  let text = "";
  const parts = upTo(8);
  for (let i = 0; i < parts; i++) {
    text += pick(NASTY_PIECES);
  }
  return text;
}

function nastyMessages() {
  const messages = [];
  const count = 1 + upTo(12);
  for (let i = 0; i < count; i++) {
    messages.push({ role: pick(["user", "assistant"]), content: nastyText() });
  }
  return messages;
}


// =====================================================================
//  chat-style.js
// =====================================================================

test("property: a bubble is never empty and never has spare whitespace", () => {
  const broken = forAll(nastyText, (text) =>
    splitIntoBubbles(text).every(
      (bubble) => typeof bubble === "string" && bubble !== "" && bubble === bubble.trim()
    )
  );
  expect(broken).toBeNull();
});

test("property: no <cht> tag ever survives into a bubble", () => {
  // This is the rule that found the real bug. It's worth understanding
  // why an example test missed it: you'd have had to guess that a model
  // would open the same tag twice. The computer doesn't have to guess.
  const broken = forAll(nastyText, (text) =>
    splitIntoBubbles(text).every((bubble) => !/<\/?cht>/i.test(bubble))
  );
  expect(broken).toBeNull();
});

test("property: tagging your message doesn't change how it splits", () => {
  // wrapInBubbleTags adds tags, splitIntoBubbles takes them away, so
  // doing both should land exactly where doing neither does. When a
  // function has an opposite, "there and back again" is usually the
  // best property you can write about it.
  const broken = forAll(nastyText, (text) => {
    const direct = splitIntoBubbles(text);
    const roundTripped = splitIntoBubbles(wrapInBubbleTags(text));
    return JSON.stringify(direct) === JSON.stringify(roundTripped);
  });
  expect(broken).toBeNull();
});

test("property: a typing delay is always a real, non-negative number", () => {
  const broken = forAll(nastyText, (text) =>
    splitIntoBubbles(text).every((bubble) => {
      const delay = typingDelay(bubble);
      return Number.isFinite(delay) && delay >= 0;
    })
  );
  expect(broken).toBeNull();
});


// =====================================================================
//  prompt-budget.js
// =====================================================================

test("property: what we send fits the budget, unless one message can't", () => {
  const broken = forAll(
    () => ({ history: nastyMessages(), budget: 1 + upTo(400) }),
    ({ history, budget }) => {
      const system = { role: "system", content: nastyText() };
      const fit = fitToBudget(system, history, budget);

      const sane =
        Number.isInteger(fit.firstIncluded) &&
        fit.firstIncluded >= 0 &&
        fit.firstIncluded <= history.length;

      // prompt-budget.js promises the newest message is always sent,
      // even when it's over budget on its own. So going over is only
      // allowed in exactly that case.
      const onlyTheNewest = fit.firstIncluded === history.length - 1;
      return sane && (fit.tokens <= budget || onlyTheNewest);
    }
  );
  expect(broken).toBeNull();
});

test("property: the reported token count matches the messages included", () => {
  // Two ways of working out the same number, which must agree. This
  // one matters because app.js shows that count to you in Show prompt
  // AND uses it to decide what to send. If they ever disagreed, the
  // screen would be quietly lying about what the character can see.
  const broken = forAll(
    () => ({ history: nastyMessages(), budget: 1 + upTo(400) }),
    ({ history, budget }) => {
      const system = { role: "system", content: nastyText() };
      const fit = fitToBudget(system, history, budget);

      const cost = (message) => estimateTokens(message.content) + 4;
      let total = cost(system);
      for (let i = fit.firstIncluded; i < history.length; i++) {
        total += cost(history[i]);
      }
      return total === fit.tokens;
    }
  );
  expect(broken).toBeNull();
});


// =====================================================================
//  card-loader.js
// =====================================================================

test("property: random bytes never crash the PNG reader", () => {
  // The PNG reader walks through a file trusting numbers it reads out
  // of that same file — chunk lengths it uses to jump forward. That's
  // exactly the shape of code that runs off the end of a buffer or
  // loops forever, so it's worth pointing random noise at it.
  const broken = forAll(
    () => {
      const bytes = new Uint8Array(upTo(300));
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = upTo(256);
      }
      // Half the time, make it claim to be a real PNG so the reader
      // gets past the signature check and into the interesting part.
      if (random() < 0.5 && bytes.length >= 8) {
        [137, 80, 78, 71, 13, 10, 26, 10].forEach((b, i) => (bytes[i] = b));
      }
      return bytes;
    },
    (bytes) => {
      try {
        parsePngCard(bytes.buffer);
        return true; // it found something; fine
      } catch (error) {
        // Refusing is the expected outcome. What matters is that it
        // refuses *deliberately*, with a sentence a person can read,
        // rather than falling over with a TypeError.
        return error instanceof Error && typeof error.message === "string" && error.message !== "";
      }
    }
  );
  expect(broken).toBeNull();
});

test("property: normalizeCard either returns every field, or explains itself", () => {
  const SHAPES = [
    null, undefined, 42, "text", true, [], {}, { data: null }, { data: 42 },
    { data: [] }, { name: "x" }, { data: { name: "x" } }, { name: "" },
    { data: { name: 0 } }, { data: { name: "x", description: null } },
  ];
  const broken = forAll(
    () => pick(SHAPES),
    (card) => {
      try {
        const out = normalizeCard(card);
        return ["name", "description", "personality", "scenario", "first_mes", "mes_example"]
          .every((field) => field in out);
      } catch (error) {
        return error instanceof Error;
      }
    }
  );
  expect(broken).toBeNull();
});


// =====================================================================
//  chat-backup.js
// =====================================================================

test("property: any chat we save, we can load back unchanged", () => {
  // The most important property in the whole file. A backup that
  // quietly alters your chat is worse than no backup at all.
  const broken = forAll(
    () => ({
      character: { name: nastyText() || "x", description: nastyText() },
      messages: nastyMessages(),
    }),
    ({ character, messages }) => {
      const restored = readBackup(JSON.stringify(buildBackup(character, messages)));
      return (
        JSON.stringify(restored.messages) === JSON.stringify(messages) &&
        JSON.stringify(restored.character) === JSON.stringify(character)
      );
    }
  );
  expect(broken).toBeNull();
});

test("property: a filename can never turn into a path", () => {
  // Character names come from cards other people made. A name like
  // "../../etc/passwd" must not become a filename that escapes your
  // downloads folder.
  const broken = forAll(nastyText, (name) => {
    const file = backupFilename(name, new Date("2026-09-18T00:00:00Z"));
    return (
      !file.includes("/") &&
      !file.includes("\\") &&
      !file.includes("..") &&
      !file.startsWith(".") &&
      file.endsWith(".json") &&
      /^[a-z0-9.-]+$/.test(file)
    );
  });
  expect(broken).toBeNull();
});
