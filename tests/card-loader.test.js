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

// Build a chunk type we don't read, with a card-ish keyword in it.
function makeUnreadablePng(type) {
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  // zTXt is: keyword, 0, compression method, then compressed bytes.
  parts.push(makeChunk(type, new TextEncoder().encode("chara\0\0some-compressed-bytes")));
  parts.push(makeChunk("IEND", new Uint8Array(0)));

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png.buffer;
}

test("says so when the card is in a compressed chunk it can't read", () => {
  // A PNG optimiser run over a card can turn its tEXt into a zTXt. The
  // data is still in there; we just can't get at it. Saying "no
  // character data" would be a lie.
  for (const type of ["zTXt", "iTXt"]) {
    expect(() => parsePngCard(makeUnreadablePng(type))).toThrow("compressed chunk");
  }
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
