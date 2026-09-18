// =====================================================================
//  chat-style.test.js  —  automatic checks for chat-style.js
// =====================================================================
//
//  WHAT A TEST IS
//  --------------
//  A test is a tiny program that uses your real code and checks that
//  it gives the answer you expect. Run all the tests with:
//
//      bun test
//
//  from the tiny-rp folder. A green "pass" means the code still does
//  what these examples say. A red "fail" tells you exactly which
//  example broke.
//
//  Why bother? Because when you change splitIntoBubbles later, you
//  might break a case you forgot about. The tests remember for you.
//
//  HOW TO READ ONE
//  ---------------
//    test("description", () => {
//      expect(ACTUAL).toEqual(EXPECTED);
//    });
//  "I expect ACTUAL to equal EXPECTED." That's the whole language.
// =====================================================================

// Pull in the test tools that come with Bun.
import { test, expect } from "bun:test";

// Pull in the functions we're testing. `require` loads the file and
// gives us whatever it put in `module.exports`.
const { splitIntoBubbles, wrapInBubbleTags, typingDelay } =
  require("../public/chat-style.js");


// ---- splitIntoBubbles --------------------------------------------------

test("each <cht> tag pair becomes one bubble", () => {
  expect(splitIntoBubbles("<cht>hey</cht>\n<cht>you up?</cht>"))
    .toEqual(["hey", "you up?"]);
});

test("a single line break stays inside the bubble", () => {
  expect(splitIntoBubbles("line one\nline two"))
    .toEqual(["line one\nline two"]);
});

test("a blank line starts a new bubble", () => {
  expect(splitIntoBubbles("first\n\nsecond"))
    .toEqual(["first", "second"]);
});

test("blank lines INSIDE tags don't split the bubble", () => {
  expect(splitIntoBubbles("<cht>a\n\nb</cht>"))
    .toEqual(["a\n\nb"]);
});

test("text outside the tags is kept, not thrown away", () => {
  expect(splitIntoBubbles("*she sighs*\n<cht>fine</cht>\nafter"))
    .toEqual(["*she sighs*", "fine", "after"]);
});

test("a forgotten closing tag doesn't leave junk behind", () => {
  expect(splitIntoBubbles("<cht>oops no closing tag"))
    .toEqual(["oops no closing tag"]);
});

test("tags work in any capitalization", () => {
  expect(splitIntoBubbles("<CHT>loud</CHT>")).toEqual(["loud"]);
});

test("empty and whitespace-only bubbles are dropped", () => {
  expect(splitIntoBubbles("<cht></cht><cht>   </cht>\n\n\n")).toEqual([]);
});


// ---- wrapInBubbleTags --------------------------------------------------

test("wraps each blank-line-separated chunk in tags", () => {
  expect(wrapInBubbleTags("lol\n\nwait what"))
    .toEqual("<cht>lol</cht>\n<cht>wait what</cht>");
});

test("keeps single line breaks inside one tag", () => {
  expect(wrapInBubbleTags("a\nb")).toEqual("<cht>a\nb</cht>");
});

test("leaves text alone if you already tagged it yourself", () => {
  const handTagged = "<cht>mine</cht>";
  expect(wrapInBubbleTags(handTagged)).toEqual(handTagged);
});


// ---- malformed tags ----------------------------------------------------
//
// Models lose track of which tags they've opened, so these aren't
// hypothetical. The rule is simple: however mangled the tags are, a
// <cht> must never end up as visible text in the chat.

test("a doubled opening tag doesn't leave a tag in the bubble", () => {
  // The splitting regex is lazy, so it stops at the first </cht> and
  // captures "in<cht>side". This is a REGRESSION TEST: a fuzzer found
  // this input, and the tag used to show up in the chat.
  expect(splitIntoBubbles("<cht>in<cht>side</cht>")).toEqual(["inside"]);
});

test("nested tags don't leave a tag in the bubble", () => {
  expect(splitIntoBubbles("<cht><cht>x</cht></cht>")).toEqual(["x"]);
});

test("no arrangement of tags survives into the output", () => {
  const mangled = [
    "<cht>a</cht><cht>in<cht>side</cht></cht>",
    "<cht>unclosed",
    "</cht>stray closer",
    "<CHT>shouty<CHT>tags</CHT>",
    "<cht><cht><cht>deep</cht>",
  ];
  for (const text of mangled) {
    for (const bubble of splitIntoBubbles(text)) {
      expect(bubble).not.toMatch(/<\/?cht>/i);
    }
  }
});


// ---- typingDelay -------------------------------------------------------

test("longer bubbles take longer to type", () => {
  expect(typingDelay("a much longer message")).toBeGreaterThan(typingDelay("hi"));
});
