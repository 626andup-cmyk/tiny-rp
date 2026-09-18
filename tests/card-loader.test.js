// =====================================================================
//  card-loader.test.js  —  automatic checks for card-loader.js
// =====================================================================
//
//  To test the PNG reader without keeping a real image in the project,
//  we BUILD a tiny fake PNG in code: the signature, a text chunk with
//  a card hidden in it, and an end chunk. If the reader can find the
//  card in our fake, it understands the format.
//
//  Run with:  bun test
// =====================================================================

import { test, expect } from "bun:test";

const { parsePngCard, normalizeCard } = require("../public/card-loader.js");


// ---------------------------------------------------------------------
//  Helpers for building a fake PNG
// ---------------------------------------------------------------------

// Build one PNG chunk: length, type, data, and a checksum. Our reader
// ignores the checksum, so four zero bytes are fine here.
function makeChunk(type, dataBytes) {
  const chunk = new Uint8Array(12 + dataBytes.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, dataBytes.length);                       // length
  chunk.set(new TextEncoder().encode(type), 4);              // type
  chunk.set(dataBytes, 8);                                   // data
  return chunk;                                              // (crc = 0)
}

// Turn a JavaScript object into base64 JSON the same way card makers do.
function encodeCard(card) {
  const utf8 = new TextEncoder().encode(JSON.stringify(card));
  // Buffer is a Bun/Node tool. It does base64 in one step.
  return Buffer.from(utf8).toString("base64");
}

// Build a whole fake PNG with text chunks: { keyword: text, ... }
function makePng(textChunks) {
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  for (const [keyword, text] of Object.entries(textChunks)) {
    const data = new TextEncoder().encode(keyword + "\0" + text);
    parts.push(makeChunk("tEXt", data));
  }
  parts.push(makeChunk("IEND", new Uint8Array(0)));

  // Glue all the parts into one byte array.
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png.buffer;
}


// ---------------------------------------------------------------------
//  The tests
// ---------------------------------------------------------------------

test("reads an older 'chara' card from a PNG", () => {
  const png = makePng({ chara: encodeCard({ spec: "chara_card_v2", data: { name: "Wren" } }) });
  expect(parsePngCard(png).data.name).toBe("Wren");
});

test("prefers the V3 'ccv3' chunk when both are present", () => {
  const png = makePng({
    chara: encodeCard({ data: { name: "Old" } }),
    ccv3: encodeCard({ spec: "chara_card_v3", data: { name: "New" } }),
  });
  expect(parsePngCard(png).data.name).toBe("New");
});

test("keeps emoji and accents intact (UTF-8)", () => {
  const png = makePng({ chara: encodeCard({ data: { name: "Zoë 🦊" } }) });
  expect(parsePngCard(png).data.name).toBe("Zoë 🦊");
});

test("rejects a file that isn't a PNG", () => {
  const notPng = new TextEncoder().encode("just some text").buffer;
  expect(() => parsePngCard(notPng)).toThrow("isn't a real PNG");
});

test("explains when a PNG has no card inside", () => {
  const plainPicture = makePng({ Software: "a paint program" });
  expect(() => parsePngCard(plainPicture)).toThrow("doesn't have character data");
});


// ---------------------------------------------------------------------
//  Cards that are broken in ways you'd actually meet.
//
//  All of these used to produce an error that pointed somewhere else —
//  either "this PNG doesn't have character data inside it" when it
//  demonstrably did, or a raw message from deep inside `atob` or
//  `JSON.parse` about invalid characters and unterminated strings.
//
//  An error message is a user interface. If a real card of yours fails
//  to load, the difference between these messages and the old ones is
//  the difference between fixing it and giving up.
// ---------------------------------------------------------------------

// Glue a list of byte arrays into one PNG.
function assemble(chunks) {
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks,
                 makeChunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png.buffer;
}

// zTXt is:  keyword \0 [method] compressed-bytes
function makeZtxtPng() {
  return assemble([
    makeChunk("zTXt", new TextEncoder().encode("chara\0\0" + "squashed-bytes")),
  ]);
}

// iTXt is:  keyword \0 [flag] [method] language \0 translated \0 text
// The FLAG byte is the one that matters: 0 means the text isn't
// compressed at all, and is readable exactly as it sits.
function makeItxtPng(compressionFlag, text) {
  const head = new TextEncoder().encode("chara");
  const tail = new TextEncoder().encode(text);
  const data = new Uint8Array(head.length + 5 + tail.length);
  data.set(head, 0);
  data[head.length] = 0;                     // end of keyword
  data[head.length + 1] = compressionFlag;
  data[head.length + 2] = 0;                 // compression method
  data[head.length + 3] = 0;                 // empty language tag
  data[head.length + 4] = 0;                 // empty translated keyword
  data.set(tail, head.length + 5);
  return assemble([makeChunk("iTXt", data)]);
}

test("says so when the card is in a chunk it genuinely can't read", () => {
  // A PNG optimiser run over a card can turn its tEXt into a zTXt. The
  // data is still in there; we just can't get at it. Saying "no
  // character data" would be a lie.
  expect(() => parsePngCard(makeZtxtPng())).toThrow("compressed chunk");

  // An iTXt whose flag says "compressed" is the same story.
  expect(() => parsePngCard(makeItxtPng(1, "squashed"))).toThrow("compressed chunk");
});

test("reads an iTXt chunk that isn't actually compressed", () => {
  // Flag 0 means the text is sitting right there in plain UTF-8. It
  // would be silly to tell someone to re-export a card we can read.
  const png = makeItxtPng(0, encodeCard({ data: { name: "Wren" } }));
  expect(parsePngCard(png).data.name).toBe("Wren");
});

test("an iTXt chunk that stops early is refused rather than misread", () => {
  // Truncated after the flags: the language tag's terminator is missing,
  // so there's no way to tell where the text begins.
  const head = new TextEncoder().encode("chara");
  const data = new Uint8Array(head.length + 3);
  data.set(head, 0);
  data[head.length] = 0;
  data[head.length + 1] = 0; // uncompressed…
  data[head.length + 2] = 0; // …but nothing follows
  expect(() => parsePngCard(assemble([makeChunk("iTXt", data)]))).toThrow("compressed chunk");
});

test("says the data is damaged when the base64 won't decode", () => {
  const png = makePng({ chara: "!!!! not base64 at all !!!!" });
  expect(() => parsePngCard(png)).toThrow("damaged");
});

test("says the file may be truncated when the JSON won't parse", () => {
  // Valid base64 of text that isn't complete JSON — what a half-copied
  // download looks like.
  const halfJson = Buffer.from('{"data": {"name": "Wr').toString("base64");
  const png = makePng({ chara: halfJson });
  expect(() => parsePngCard(png)).toThrow("truncated");
});

test("copes with base64 wrapped across several lines", () => {
  // Plenty of tools wrap base64 at 60 or 76 characters. The data is
  // perfectly good; it just has newlines in the middle of it.
  const encoded = encodeCard({ data: { name: "Wren" } }).replace(/(.{20})/g, "$1\n");
  expect(parsePngCard(makePng({ chara: encoded })).data.name).toBe("Wren");
});

test("normalizeCard handles V2/V3 cards (fields inside 'data')", () => {
  const card = normalizeCard({ spec: "chara_card_v3", data: { name: "A", first_mes: "hi" } });
  expect(card.name).toBe("A");
  expect(card.first_mes).toBe("hi");
  expect(card.scenario).toBe(""); // missing fields become empty strings
});

test("normalizeCard handles V1 cards (fields at the top level)", () => {
  expect(normalizeCard({ name: "B", description: "desc" }).description).toBe("desc");
});

test("normalizeCard refuses a card with no name", () => {
  expect(() => normalizeCard({ data: {} })).toThrow("no character name");
});

test("normalizeCard turns non-text fields into text", () => {
  // A list of paragraphs instead of one string is the usual way a card
  // arrives malformed. Everything downstream calls .replace() and
  // .split() on these, so a list used to be accepted, saved, and then
  // throw on every render — including after a reload.
  const card = normalizeCard({
    name: "X",
    description: ["one", "two"],
    personality: null,
    scenario: { nested: true },
    first_mes: 42,
  });

  for (const field of ["description", "personality", "scenario", "first_mes", "mes_example"]) {
    expect(typeof card[field]).toBe("string");
  }

  // A number is meaningful, so it's kept. Anything we can't read
  // becomes empty rather than "[object Object]": a missing description
  // is obviously missing, while a line of nonsense looks deliberate.
  expect(card.first_mes).toBe("42");
  expect(card.description).toBe("");
  expect(card.scenario).toBe("");
});

test("normalizeCard always gives back a string name", () => {
  expect(normalizeCard({ name: 42 }).name).toBe("42");
  expect(typeof normalizeCard({ name: "Wren" }).name).toBe("string");
});

test("normalizeCard refuses JSON that isn't a card at all", () => {
  // JSON.parse happily returns any of these, and every one of them used
  // to crash with an unreadable TypeError instead of saying what's wrong.
  for (const notACard of [null, 42, "hello", true]) {
    expect(() => normalizeCard(notACard)).toThrow("doesn't look like a character card");
  }

  // A list is an object as far as `typeof` is concerned, so it gets
  // past the first check and is caught by the missing-name one instead.
  expect(() => normalizeCard([])).toThrow("no character name");
});
