// =====================================================================
//  prompt-builder.test.js  —  automatic checks for prompt-builder.js
// =====================================================================
//
//  These tests couldn't exist until prompt-builder.js did. The same
//  code used to live in app.js, where it read the character and the
//  settings out of the surrounding file — and a function that reaches
//  outside itself can only be run by loading the whole app, browser and
//  all. Making it take arguments is what made it checkable.
//
//  So the moral of this file isn't really about prompts. It's that
//  "can I test this?" is a question about how the code is SHAPED, and
//  you answer it while writing the function, not afterwards.
//
//  Run with:  bun test
// =====================================================================

import { test, expect } from "bun:test";

const { fillMacros, buildSystemMessage } = require("../public/prompt-builder.js");


// A minimal card. Real ones have more, but these are the fields that
// end up in the prompt.
const wren = {
  name: "Wren",
  description: "{{char}} keeps a lighthouse.",
  personality: "Dry.",
  scenario: "{{user}} washed up on the rocks.",
  first_mes: "Hello, {{user}}.",
  mes_example: "<START>\n{{user}}: Hi\n{{char}}: Hm.",
};


// ---------------------------------------------------------------------
//  fillMacros
// ---------------------------------------------------------------------

test("swaps {{char}} and {{user}} for the real names", () => {
  expect(fillMacros("{{char}} greets {{user}}.", "Wren", "You"))
    .toBe("Wren greets You.");
});

test("ignores capitalisation, and replaces every copy", () => {
  expect(fillMacros("{{Char}} {{CHAR}} {{char}}", "Wren", "You"))
    .toBe("Wren Wren Wren");
});

test("understands the old <BOT> and <USER> placeholders", () => {
  expect(fillMacros("<BOT> nods at <USER>.", "Wren", "You"))
    .toBe("Wren nods at You.");
});

test("a missing field becomes an empty string instead of crashing", () => {
  expect(fillMacros(undefined, "Wren", "You")).toBe("");
  expect(fillMacros(null, "Wren", "You")).toBe("");
});

test("text with no placeholders is left exactly alone", () => {
  expect(fillMacros("Nothing to do here.", "Wren", "You"))
    .toBe("Nothing to do here.");
});


// ---------------------------------------------------------------------
//  The $ bug. This is a REGRESSION TEST for something that used to
//  silently corrupt the prompt.
//
//  .replace() treats a few characters in a STRING replacement as magic:
//  `$&` is "the matched text", "$`" is "everything before the match",
//  `$'` is "everything after it". Those rules applied to a character's
//  name, because the name was being used as the replacement.
//
//  Passing a function instead switches all of it off. If someone ever
//  "simplifies" those arrow functions away, these go red.
// ---------------------------------------------------------------------

test("a name containing $& doesn't paste the placeholder back in", () => {
  expect(fillMacros("Hello {{char}}.", "Ca$&h", "You")).toBe("Hello Ca$&h.");
});

test("a name containing a $-backtick doesn't paste the sentence in", () => {
  // The old code turned this into "Hello DoHello t." — the start of the
  // sentence appeared in the middle of her name.
  expect(fillMacros("Hello {{char}}.", "Do$`t", "You")).toBe("Hello Do$`t.");
});

test("a name containing $' doesn't paste the rest of the text in", () => {
  expect(fillMacros("Hello {{char}}, goodbye.", "M$'s", "You"))
    .toBe("Hello M$'s, goodbye.");
});

test("the same is true of the user's name", () => {
  expect(fillMacros("Hi {{user}}.", "Wren", "A$&B")).toBe("Hi A$&B.");
});

test("an ordinary dollar sign is still just a dollar sign", () => {
  expect(fillMacros("{{char}} pays.", "A$AP", "You")).toBe("A$AP pays.");
  expect(fillMacros("{{char}} pays.", "$5 Steve", "You")).toBe("$5 Steve pays.");
});


// ---------------------------------------------------------------------
//  buildSystemMessage
// ---------------------------------------------------------------------

test("the system message is a system message", () => {
  const system = buildSystemMessage(wren, "You", false);
  expect(system.role).toBe("system");
  expect(typeof system.content).toBe("string");
});

test("it names the character and the user in the instructions", () => {
  const { content } = buildSystemMessage(wren, "Alex", false);
  expect(content).toContain("You are Wren in an ongoing roleplay with Alex.");
  expect(content).toContain("Never write Alex's actions or dialogue.");
});

test("it fills the macros inside the card's own fields", () => {
  const { content } = buildSystemMessage(wren, "Alex", false);
  expect(content).toContain("Wren keeps a lighthouse.");
  expect(content).toContain("Alex washed up on the rocks.");
  expect(content).not.toContain("{{char}}");
  expect(content).not.toContain("{{user}}");
});

test("it strips the <START> dividers out of the examples", () => {
  const { content } = buildSystemMessage(wren, "You", false);
  expect(content).not.toContain("<START>");
  expect(content).toContain("Hm.");
});

test("chat style adds the bubble instruction, and only then", () => {
  const off = buildSystemMessage(wren, "You", false).content;
  const on = buildSystemMessage(wren, "You", true).content;
  expect(off).not.toContain("<cht></cht>");
  expect(on).toContain("<cht></cht>");
  expect(on).toContain("over text messages");
});

test("a card missing most of its fields still builds a prompt", () => {
  // Cards in the wild are often mostly empty. normalizeCard fills the
  // gaps with empty strings, but a hand-made card might not.
  const sparse = { name: "Ghost" };
  const { content } = buildSystemMessage(sparse, "You", false);
  expect(content).toContain("You are Ghost");
  expect(content).toContain("Description:");
  expect(content).not.toContain("undefined");
});

test("the greeting is not part of the system message", () => {
  // first_mes is the character's opening line in the chat, not an
  // instruction. If it leaked in here it would be said twice.
  const { content } = buildSystemMessage(wren, "You", false);
  expect(content).not.toContain("Hello, You.");
});
