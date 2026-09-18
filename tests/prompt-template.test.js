// =====================================================================
//  prompt-template.test.js  —  automatic checks for prompt-template.js
// =====================================================================
//
//  These tests couldn't exist while this code lived in app.js. It read
//  the character and the settings out of the surrounding file, and a
//  function that reaches outside itself can only be run by loading the
//  whole app, browser and all. Making it take arguments is what made it
//  checkable.
//
//  So the moral isn't really about prompts. It's that "can I test
//  this?" is a question about how the code is SHAPED, and you answer it
//  while writing the function, not afterwards.
//
//  Run with:  bun test
// =====================================================================

import { test, expect } from "bun:test";

const {
  fillTemplateText,
  systemMessageParts,
  buildSystemMessage,
  applyTemplate,
  macrosUsedIn,
  isUsableTemplate,
  defaultTemplate,
} = require("../public/prompt-template.js");


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

// A shortcut for the common case of filling text against Wren.
const fill = (text, name = "Wren", user = "You") =>
  fillTemplateText(text, { ...wren, name: name }, user);


// ---------------------------------------------------------------------
//  Filling in the macros
// ---------------------------------------------------------------------

test("swaps {{char}} and {{user}} for the real names", () => {
  expect(fill("{{char}} greets {{user}}.")).toBe("Wren greets You.");
});

test("ignores capitalisation, and replaces every copy", () => {
  expect(fill("{{Char}} {{CHAR}} {{char}}")).toBe("Wren Wren Wren");
});

test("allows spaces inside the braces", () => {
  expect(fill("{{ char }} and {{  user  }}")).toBe("Wren and You");
});

test("understands the old <BOT> and <USER> placeholders", () => {
  expect(fill("<BOT> nods at <USER>.")).toBe("Wren nods at You.");
});

test("a missing field becomes an empty string instead of crashing", () => {
  expect(fillTemplateText(undefined, wren, "You")).toBe("");
  expect(fillTemplateText(null, wren, "You")).toBe("");
});

test("text with no placeholders is left exactly alone", () => {
  expect(fill("Nothing to do here.")).toBe("Nothing to do here.");
});


// ---------------------------------------------------------------------
//  Card fields as macros. This is what makes the shape of the prompt
//  yours: a block can say "Description:\n{{description}}" or just
//  "{{char}} is {{description}}", and they're the same mechanism.
// ---------------------------------------------------------------------

test("card fields can be dropped into a block by name", () => {
  expect(fillTemplateText("She says: {{personality}}", wren, "You"))
    .toBe("She says: Dry.");
});

test("macros INSIDE a card field get filled too", () => {
  // wren.description is "{{char}} keeps a lighthouse." — the field goes
  // in first, then the names, so the nested macro resolves.
  expect(fillTemplateText("{{description}}", wren, "You"))
    .toBe("Wren keeps a lighthouse.");
  expect(fillTemplateText("{{scenario}}", wren, "Alex"))
    .toBe("Alex washed up on the rocks.");
});

test("<START> is stripped out of the examples macro", () => {
  const filled = fillTemplateText("{{examples}}", wren, "You");
  expect(filled).not.toContain("<START>");
  expect(filled).toContain("Hm.");
});

test("a field that isn't a macro name is left alone", () => {
  expect(fillTemplateText("{{nonsense}}", wren, "You")).toBe("{{nonsense}}");
});

test("macrosUsedIn reports only the card fields a block mentions", () => {
  expect(macrosUsedIn("Description:\n{{description}}")).toEqual(["description"]);
  expect(macrosUsedIn("{{char}} says hi to {{user}}")).toEqual([]);
  expect(macrosUsedIn("{{description}} {{description}}")).toEqual(["description"]);
  expect(macrosUsedIn("{{scenario}} then {{examples}}")).toEqual(["scenario", "examples"]);
});


// ---------------------------------------------------------------------
//  The $ bug. A REGRESSION TEST for something that used to silently
//  corrupt the prompt.
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
  expect(fill("Hello {{char}}.", "Ca$&h")).toBe("Hello Ca$&h.");
});

test("a name containing a $-backtick doesn't paste the sentence in", () => {
  // The old code turned this into "Hello DoHello t." — the start of the
  // sentence appeared in the middle of her name.
  expect(fill("Hello {{char}}.", "Do$`t")).toBe("Hello Do$`t.");
});

test("a name containing $' doesn't paste the rest of the text in", () => {
  expect(fill("Hello {{char}}, goodbye.", "M$'s")).toBe("Hello M$'s, goodbye.");
});

test("the same is true of the user's name", () => {
  expect(fill("Hi {{user}}.", "Wren", "A$&B")).toBe("Hi A$&B.");
});

test("the same is true of text coming from a card field", () => {
  const sneaky = { ...wren, description: "worth $& a lot" };
  expect(fillTemplateText("Description: {{description}}", sneaky, "You"))
    .toBe("Description: worth $& a lot");
});

test("an ordinary dollar sign is still just a dollar sign", () => {
  expect(fill("{{char}} pays.", "A$AP")).toBe("A$AP pays.");
  expect(fill("{{char}} pays.", "$5 Steve")).toBe("$5 Steve pays.");
});


// ---------------------------------------------------------------------
//  Building the system message from the default template
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

test("the greeting is not part of the system message", () => {
  // first_mes is the character's opening line in the chat, not an
  // instruction. If it leaked in here it would be said twice.
  const { content } = buildSystemMessage(wren, "You", false);
  expect(content).not.toContain("Hello, You.");
});

test("the parts joined back together ARE the system message", () => {
  // Show prompt counts these pieces to say what each block costs. If
  // the pieces and the message ever drifted apart, the screen would
  // report sizes that weren't true.
  for (const chatStyle of [false, true]) {
    const joined = systemMessageParts(wren, "You", chatStyle)
      .map((part) => part.text)
      .join("\n\n");
    expect(joined).toBe(buildSystemMessage(wren, "You", chatStyle).content);
  }
});

test("the parts are labelled, in the order they appear", () => {
  const labels = systemMessageParts(wren, "You", false).map((part) => part.label);
  expect(labels).toEqual([
    "Instructions", "Description", "Personality", "Scenario", "Examples",
  ]);
});


// ---------------------------------------------------------------------
//  Blocks with nothing to say.
//
//  This is the rule that most directly answers "the formatting is so
//  unnatural it affects the output". A heading introducing nothing is
//  exactly the sort of small mess a fixed template can't avoid.
// ---------------------------------------------------------------------

test("a block whose card fields are all empty is left out entirely", () => {
  const sparse = { name: "Ghost", description: "Fades.", personality: "",
                   scenario: "", first_mes: "", mes_example: "" };
  const { content } = buildSystemMessage(sparse, "You", false);

  expect(content).toContain("Description:");
  expect(content).not.toContain("Personality:");
  expect(content).not.toContain("Scenario:");
  expect(content).not.toContain("Example of the writing style:");
});

test("a card with nothing but a name still builds a usable prompt", () => {
  const { content } = buildSystemMessage({ name: "Ghost" }, "You", false);
  expect(content).toContain("You are Ghost");
  expect(content).not.toContain("undefined");
  expect(content.trim()).not.toBe("");
});

test("a block with no card fields at all is always kept", () => {
  // The instructions block mentions only {{char}} and {{user}}, which
  // are names rather than card fields. It must survive even for a
  // character with nothing else filled in.
  const labels = systemMessageParts({ name: "Ghost" }, "You", false)
    .map((part) => part.label);
  expect(labels).toEqual(["Instructions"]);
});


// ---------------------------------------------------------------------
//  Templates you've changed
// ---------------------------------------------------------------------

test("reordering the blocks reorders the prompt", () => {
  const template = defaultTemplate();
  const reversed = [...template].reverse();
  const labels = applyTemplate(reversed, wren, "You", false).map((p) => p.label);
  expect(labels[0]).toBe("Examples");
  expect(labels.at(-1)).toBe("Instructions");
});

test("turning a block off removes it", () => {
  const template = defaultTemplate().map((block) =>
    block.id === "personality" ? { ...block, enabled: false } : block
  );
  const { content } = buildSystemMessage(wren, "You", false, template);
  expect(content).not.toContain("Personality:");
  expect(content).toContain("Description:");
});

test("a block can be written as prose instead of a labelled field", () => {
  // The whole point. Same card, no headings.
  const template = [
    { id: "prose", label: "Prose", enabled: true,
      text: "You are {{char}}. {{description}} {{personality}}" },
  ];
  const { content } = buildSystemMessage(wren, "You", false, template);
  expect(content).toBe("You are Wren. Wren keeps a lighthouse. Dry.");
  expect(content).not.toContain(":");
});

test("a block can be your own words with no card fields at all", () => {
  const template = [
    { id: "rule", label: "Rule", enabled: true,
      text: "Keep replies under three sentences." },
  ];
  expect(buildSystemMessage(wren, "You", false, template).content)
    .toBe("Keep replies under three sentences.");
});

test("an empty template gives an empty system message rather than throwing", () => {
  expect(buildSystemMessage(wren, "You", false, []).content).toBe("");
});


// ---------------------------------------------------------------------
//  Templates are saved, and will eventually be shared, which makes them
//  outside data. Same lesson as chat-backup.js: check at the edge.
// ---------------------------------------------------------------------

test("isUsableTemplate accepts the default", () => {
  expect(isUsableTemplate(defaultTemplate())).toBe(true);
});

test("isUsableTemplate rejects anything that would break prompt building", () => {
  const rejects = [
    null, undefined, 42, "a string", {}, [],
    [null],
    [{ id: "a" }],                                          // no text
    [{ id: "a", label: "A", text: 42, enabled: true }],     // text isn't text
    [{ id: "a", label: "A", text: "x" }],                   // no enabled flag
    [{ id: 1, label: "A", text: "x", enabled: true }],      // id isn't a string
    [{ id: "a", label: "A", text: "x", enabled: true }, null], // one bad block
  ];
  for (const reject of rejects) {
    expect(isUsableTemplate(reject)).toBe(false);
  }
});

test("defaultTemplate hands out a fresh copy each time", () => {
  // Otherwise editing the template in the app would quietly edit the
  // default, and "reset to default" would stop working.
  const first = defaultTemplate();
  first[0].text = "changed";
  expect(defaultTemplate()[0].text).not.toBe("changed");
});
