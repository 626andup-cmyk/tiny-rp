// =====================================================================
//  card-loader.js  —  reading real character cards (.png or .json)
// =====================================================================
//
//  A "character card" PNG looks like an ordinary picture, but the
//  character's data is hidden INSIDE the image file. This file digs it
//  out. Cards exported from the Lumiverse Weaver, SillyTavern, Chub, etc.
//  all work the same way, so this reads any of them.
//
//  THE BIG LESSON IN THIS FILE: files are just bytes.
//  -------------------------------------------------
//  Every file on your phone, whether a photo, a song, or a card, is a
//  long list of numbers from 0 to 255 (BYTES). A "file format" is just
//  an agreement about what those numbers mean. We're going to read the
//  PNG format by hand, which is much less scary than it sounds.
//
//  HOW A PNG FILE IS LAID OUT
//  --------------------------
//    [8-byte signature]  always the same: says "I am a PNG"
//    [chunk] [chunk] [chunk] ...
//
//  Each chunk looks like this:
//    4 bytes   LENGTH of the data (a number)
//    4 bytes   TYPE, four letters, e.g. "IHDR", "IDAT", "tEXt", "IEND"
//    LENGTH    the DATA itself
//    4 bytes   a checksum (CRC) we can ignore
//
//  "IDAT" chunks hold the actual picture. "tEXt" chunks hold labeled
//  text, which is where cards hide their data:
//    keyword, then a zero byte, then the text
//  The keyword is "ccv3" (Character Card V3) or "chara" (older cards),
//  and the text is the card's JSON, encoded in BASE64 (a way of writing
//  any data using only letters, digits, +, and /).
// =====================================================================


// ---------------------------------------------------------------------
//  readCardFile(file)
//  The only function app.js needs to call. Give it a File (from a file
//  picker) and it returns a clean character object, or throws an Error
//  with a readable explanation.
// ---------------------------------------------------------------------
async function readCardFile(file) {
  const name = file.name.toLowerCase();

  let rawCard;
  if (name.endsWith(".json")) {
    // JSON cards are easy: the whole file is the card.
    rawCard = JSON.parse(await file.text());
  } else if (name.endsWith(".png")) {
    // .arrayBuffer() gives us the file's raw bytes.
    rawCard = parsePngCard(await file.arrayBuffer());
  } else {
    throw new Error("Choose a .png or .json character card.");
  }

  return normalizeCard(rawCard);
}


// ---------------------------------------------------------------------
//  parsePngCard(buffer)
//  `buffer` is an ArrayBuffer: raw bytes with no meaning attached yet.
// ---------------------------------------------------------------------
function parsePngCard(buffer) {

  // A Uint8Array lets us read the bytes one at a time as numbers 0–255.
  const bytes = new Uint8Array(buffer);

  // A DataView lets us read several bytes together as one bigger number.
  // We need that for the 4-byte chunk lengths.
  const view = new DataView(buffer);

  // Check the signature. Every PNG in existence starts with these 8 bytes.
  const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
  // .every() is true only if the test passes for EVERY item.
  const isPng = PNG_SIGNATURE.every((value, i) => bytes[i] === value);
  if (!isPng) {
    throw new Error("That file isn't a real PNG.");
  }

  // TextDecoder turns bytes into text. "latin1" maps each byte to one
  // character, which is exactly right for tEXt chunks.
  const latin1 = new TextDecoder("latin1");

  // Collect every text chunk we find, by keyword.
  const found = {};

  // Start reading right after the 8-byte signature.
  let offset = 8;

  // Keep going while there's room for at least a chunk header.
  while (offset + 8 <= bytes.length) {

    // getUint32 reads 4 bytes as one number. PNG stores numbers
    // "big-endian" (biggest part first), which is getUint32's default.
    const length = view.getUint32(offset);
    const type = latin1.decode(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (type === "tEXt") {
      const data = bytes.subarray(dataStart, dataEnd);
      // Find the zero byte that separates the keyword from the text.
      const zero = data.indexOf(0);
      const keyword = latin1.decode(data.subarray(0, zero));
      const text = latin1.decode(data.subarray(zero + 1));
      found[keyword.toLowerCase()] = text;
    }

    if (type === "IEND") {
      break; // "image end": nothing more to read
    }

    // Jump to the next chunk: header (8) + data (length) + checksum (4).
    offset = dataEnd + 4;
  }

  // Prefer the newer V3 data if both are present.
  const encoded = found["ccv3"] ?? found["chara"];
  if (!encoded) {
    throw new Error("This PNG doesn't have character data inside it.");
  }

  return JSON.parse(decodeBase64Utf8(encoded));
}


// ---------------------------------------------------------------------
//  decodeBase64Utf8(base64Text)
//  atob() decodes base64, but it hands back one character PER BYTE.
//  Emoji and accented letters take several bytes each (that's what
//  UTF-8 means), so we turn the result back into bytes and decode it
//  properly. Skip this step and "café" comes out as "cafÃ©".
// ---------------------------------------------------------------------
function decodeBase64Utf8(base64Text) {
  const binary = atob(base64Text.trim());
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}


// ---------------------------------------------------------------------
//  normalizeCard(rawCard)
//  Cards come in a few versions:
//    V1: the fields sit at the top level:   { name, description, ... }
//    V2/V3: they're inside "data":          { spec, data: { name, ... } }
//  This returns the same simple shape no matter which kind we got, and
//  keeps ONLY the fields Tiny RP uses. (Real cards carry much more,
//  like lorebooks, alternate greetings, and creator notes. To peek at
//  everything, add console.log(rawCard) as the first line of this
//  function and open your browser's developer console.)
// ---------------------------------------------------------------------
function normalizeCard(rawCard) {
  const data = rawCard.data ?? rawCard;

  if (!data.name) {
    throw new Error("That card has no character name in it.");
  }

  return {
    name: data.name,
    description: data.description ?? "",
    personality: data.personality ?? "",
    scenario: data.scenario ?? "",
    first_mes: data.first_mes ?? "",
    mes_example: data.mes_example ?? "",
  };
}


// Share with the tests (see the note at the bottom of chat-style.js).
if (typeof module !== "undefined") {
  module.exports = { parsePngCard, normalizeCard, decodeBase64Utf8 };
}
