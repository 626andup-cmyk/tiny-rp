// =====================================================================
//  chat-backup.test.js  —  automatic checks for chat-backup.js
// =====================================================================
//
//  Most of these test the REFUSALS rather than the successes, which
//  looks odd until you think about what this code is for. Saving works
//  or it doesn't, and you'd notice. The dangerous case is a backup that
//  loads *almost* correctly and quietly replaces a good chat with a
//  broken one. So the interesting question isn't "does it load a good
//  file," it's "does it refuse every bad one."
//
//  A useful habit in general: when you write a function that validates
//  something, the test file should be mostly bad inputs.
//
//  Run with:  bun test
// =====================================================================

import { test, expect } from "bun:test";

const {
  buildBackup,
  readBackup,
  backupFilename,
  isUsableMessage,
  BACKUP_VERSION,
} = require("../public/chat-backup.js");


const character = { name: "Wren", description: "keeps a lighthouse" };
const messages = [
  { role: "assistant", content: "The kettle screams." },
  { role: "user", content: "Where am I?" },
];

// A shortcut: build a backup, turn it into text, and change one thing
// about it first. Most tests below are "this, but broken in one way."
function backupText(changes = {}) {
  return JSON.stringify({ ...buildBackup(character, messages), ...changes });
}


// ---------------------------------------------------------------------
//  Saving
// ---------------------------------------------------------------------

test("a backup says what it is and which version it is", () => {
  const backup = buildBackup(character, messages);
  expect(backup.format).toBe("tiny-rp-chat");
  expect(backup.version).toBe(BACKUP_VERSION);
});

test("a backup keeps the character as well as the messages", () => {
  const backup = buildBackup(character, messages);
  expect(backup.character.name).toBe("Wren");
  expect(backup.messages).toHaveLength(2);
});

test("a backup records when it was saved", () => {
  const backup = buildBackup(character, messages);
  // An ISO date looks like 2026-09-18T17:40:12.000Z
  expect(backup.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});


// ---------------------------------------------------------------------
//  The round trip. This is the test that actually matters: whatever we
//  write, we must be able to read back unchanged.
// ---------------------------------------------------------------------

test("saving and reloading gives back exactly what went in", () => {
  const restored = readBackup(JSON.stringify(buildBackup(character, messages)));
  expect(restored.character).toEqual(character);
  expect(restored.messages).toEqual(messages);
});

test("emoji and accents survive the round trip", () => {
  const fancy = { name: "Zoë 🦊", description: "" };
  const said = [{ role: "assistant", content: "café — naïve — 🔥" }];
  const restored = readBackup(JSON.stringify(buildBackup(fancy, said)));
  expect(restored.character.name).toBe("Zoë 🦊");
  expect(restored.messages[0].content).toBe("café — naïve — 🔥");
});


// ---------------------------------------------------------------------
//  Refusals
// ---------------------------------------------------------------------

test("refuses a file that isn't JSON", () => {
  expect(() => readBackup("this is not json {{{")).toThrow("isn't JSON");
});

test("refuses JSON that isn't an object", () => {
  for (const notAnObject of ["null", "42", '"hello"', "[1, 2, 3]"]) {
    expect(() => readBackup(notAnObject)).toThrow("doesn't contain a backup");
  }
});

test("refuses JSON that isn't ours", () => {
  // A character card, say, which is also JSON and also has a name.
  const card = JSON.stringify({ name: "Wren", first_mes: "hi" });
  expect(() => readBackup(card)).toThrow("not a Tiny RP chat backup");
});

test("refuses a backup from a newer version of Tiny RP", () => {
  expect(() => readBackup(backupText({ version: BACKUP_VERSION + 1 })))
    .toThrow("newer version");
});

test("a missing version is reported as damage, not as being from the future", () => {
  // These used to say "saved by a newer version of Tiny RP (backup
  // version undefined)", which blames a release that doesn't exist for
  // a file that's simply broken.
  for (const version of [undefined, null, "1", {}]) {
    expect(() => readBackup(backupText({ version })))
      .toThrow("doesn't say which version");
  }
});

test("refuses a backup with no messages", () => {
  expect(() => readBackup(backupText({ messages: [] }))).toThrow("no messages");
  expect(() => readBackup(backupText({ messages: "lots" }))).toThrow("no messages");
});

test("refuses a backup with no character", () => {
  expect(() => readBackup(backupText({ character: null }))).toThrow("character is missing");
  expect(() => readBackup(backupText({ character: {} }))).toThrow("character is missing");
});

test("checks every message, not just the first", () => {
  // The first two are perfectly fine. The damage is at the end, which
  // is exactly the case a lazier check would wave through.
  const damaged = [
    { role: "user", content: "fine" },
    { role: "assistant", content: "also fine" },
    { role: "assistant", content: 12345 },
  ];
  expect(() => readBackup(backupText({ messages: damaged })))
    .toThrow("message number 3");
});

test("refuses messages with a role it doesn't understand", () => {
  const odd = [{ role: "narrator", content: "hello" }];
  expect(() => readBackup(backupText({ messages: odd }))).toThrow("message number 1");
});

test("refuses a message that is null", () => {
  expect(() => readBackup(backupText({ messages: [null] }))).toThrow("message number 1");
});


// ---------------------------------------------------------------------
//  isUsableMessage
//  app.js uses this on localStorage as well, so it's worth its own
//  tests rather than only being checked through readBackup. A saved
//  chat containing any of the rejects below used to kill the page.
// ---------------------------------------------------------------------

test("isUsableMessage accepts the two real message shapes", () => {
  expect(isUsableMessage({ role: "user", content: "hi" })).toBe(true);
  expect(isUsableMessage({ role: "assistant", content: "" })).toBe(true);
});

test("isUsableMessage rejects anything render() would choke on", () => {
  const rejects = [
    null, undefined, 42, "a string", [],
    {},                                     // no role, no content
    { role: "user" },                       // content missing
    { role: "user", content: 42 },          // content not a string
    { role: "user", content: null },
    { role: "system", content: "hi" },      // not a chat role
    { role: "narrator", content: "hi" },
  ];
  for (const reject of rejects) {
    expect(isUsableMessage(reject)).toBe(false);
  }
});


// ---------------------------------------------------------------------
//  Filenames
// ---------------------------------------------------------------------

const someDay = new Date("2026-09-18T17:40:12.000Z");

test("builds a filename from the character and the date", () => {
  expect(backupFilename("Wren", someDay)).toBe("wren-chat-2026-09-18.json");
});

test("turns spaces and punctuation into single dashes", () => {
  expect(backupFilename("Captain  J. Hook!!", someDay))
    .toBe("captain-j-hook-chat-2026-09-18.json");
});

test("falls back to a plain name when nothing survives", () => {
  // A character named only in emoji has no letters or digits at all.
  expect(backupFilename("🦊🔥", someDay)).toBe("chat-2026-09-18.json");
  expect(backupFilename("", someDay)).toBe("chat-2026-09-18.json");
  expect(backupFilename(null, someDay)).toBe("chat-2026-09-18.json");
});

test("a character name can't smuggle a path into the filename", () => {
  // Slashes and dots aren't letters or digits, so they become dashes.
  const name = backupFilename("../../etc/passwd", someDay);
  expect(name).toBe("etc-passwd-chat-2026-09-18.json");
  expect(name).not.toContain("/");
  expect(name).not.toContain("..");
});
