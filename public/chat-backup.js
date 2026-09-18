// =====================================================================
//  chat-backup.js  —  saving a chat to a file, and reading it back
// =====================================================================
//
//  WHY THIS EXISTS
//  ---------------
//  Everything Tiny RP remembers lives in localStorage, which sounds
//  permanent and isn't. It's tied to one browser on one device. Clearing
//  your browsing data wipes it. So does "clear site data," some cleaner
//  apps, and getting a new phone. There's no warning and no undo.
//
//  So: a chat you care about should exist as a FILE you can copy
//  somewhere safe. That's all a backup is.
//
//  THE INTERESTING PART: designing a file format
//  ---------------------------------------------
//  It would be tempting to just dump the messages array to a file. Don't.
//  A file outlives the program that wrote it, and future-you will open
//  this file with a version of Tiny RP that doesn't exist yet. Two small
//  fields make that survivable, and both are standard practice:
//
//    "format"  — a name, so we can tell our file from any other JSON.
//                Without it, opening the wrong file gives a confusing
//                error deep in the code instead of "that isn't a chat."
//
//    "version" — a number we bump if the shape ever changes. It doesn't
//                do anything today. Its whole job is to let a LATER
//                version of this file say "ah, a version 1 backup, I
//                know how to convert that" instead of guessing.
//
//  Almost every file format you've met does this. PNG starts with eight
//  magic bytes (see card-loader.js). Character cards carry a "spec"
//  field. It's the same idea each time: say what you are, and say which
//  edition you are.
//
//  We save the CHARACTER alongside the messages, because half a
//  roleplay is the character it was with. A backup you can't actually
//  resume isn't a backup.
//
//  Like chat-style.js, everything here is a PURE FUNCTION, so it's all
//  testable. The browser parts (making a download, reading a chosen
//  file) live in app.js, because those touch the page.
// =====================================================================


const BACKUP_FORMAT = "tiny-rp-chat";
const BACKUP_VERSION = 1;


// ---------------------------------------------------------------------
//  buildBackup(character, messages)
//  Returns the plain object we'll turn into JSON and save.
//  `savedAt` is for you, not for the code: when you find four backups
//  in your downloads folder, you'll want to know which is which.
//
//  new Date().toISOString() gives a date like "2026-09-18T17:40:12.000Z".
//  The Z means UTC, which sidesteps every timezone argument ever had.
// ---------------------------------------------------------------------
function buildBackup(character, messages) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    savedAt: new Date().toISOString(),
    character: character,
    messages: messages,
  };
}


// ---------------------------------------------------------------------
//  readBackup(text)
//  Takes the TEXT of a backup file and returns { character, messages }.
//  Throws an Error with a readable explanation if it can't.
//
//  This function is deliberately suspicious. Everything it's handed came
//  from a file, and files get truncated, half-copied, edited by hand,
//  and picked by mistake. Every `throw` below is a sentence you'd
//  actually want to read when it happens, rather than a crash.
//
//  There's a general rule hiding here, worth more than this feature:
//  VALIDATE AT THE EDGES. Check data where it enters your program, once,
//  thoroughly. Then the rest of the code can just trust it. (server.js
//  does exactly the same thing to the request body.)
// ---------------------------------------------------------------------
function readBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("that file isn't JSON at all.");
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("that file doesn't contain a backup.");
  }

  if (data.format !== BACKUP_FORMAT) {
    throw new Error("that's a JSON file, but not a Tiny RP chat backup.");
  }

  // A file from the FUTURE: written by a later version of Tiny RP than
  // this one. We can't know what changed, so we say so plainly instead
  // of loading it wrong and corrupting a chat you cared about.
  if (typeof data.version !== "number" || data.version > BACKUP_VERSION) {
    throw new Error(
      `it was saved by a newer version of Tiny RP (backup version ${data.version}).`
    );
  }

  if (!Array.isArray(data.messages) || data.messages.length === 0) {
    throw new Error("there are no messages in it.");
  }

  // Check every message, not just the first. A backup that's half good
  // is worse than one that's plainly broken, because you won't notice
  // until the damage is saved over the top of the real thing.
  //
  // .entries() gives us the position too, so the error can point at it.
  for (const [position, message] of data.messages.entries()) {
    const looksRight =
      message !== null &&
      typeof message === "object" &&
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string";

    if (!looksRight) {
      throw new Error(`message number ${position + 1} is damaged.`);
    }
  }

  if (data.character === null || typeof data.character !== "object" || !data.character.name) {
    throw new Error("the character is missing from it.");
  }

  return { character: data.character, messages: data.messages };
}


// ---------------------------------------------------------------------
//  backupFilename(characterName, date)
//  Builds a filename like "wren-chat-2026-09-18.json".
//
//  Why bother? Because the alternative is four files called
//  "download.json" and no way to tell them apart.
//
//  The regexes, decoded:
//    /[^a-z0-9]+/g   any run of characters that ISN'T a letter or digit
//                    (the ^ inside [ ] means NOT). Spaces, punctuation,
//                    emoji and accents all become a single "-".
//    /^-+|-+$/g      one or more dashes at the start (^) or the end ($),
//                    so we don't get "-wren-.json".
//
//  Being strict here is a small security habit as well as a tidy one:
//  a character named "../../secret" can't turn into a path that way.
// ---------------------------------------------------------------------
function backupFilename(characterName, date = new Date()) {
  const slug = String(characterName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // .toISOString() is "2026-09-18T17:40:12.000Z"; the first 10
  // characters are the date part.
  const day = date.toISOString().slice(0, 10);

  // A card named entirely in emoji slugs down to nothing at all. Adding
  // the name back in anyway would give "chat-chat-2026-09-18.json",
  // which is how the test for this caught it.
  return slug === "" ? `chat-${day}.json` : `${slug}-chat-${day}.json`;
}


// Share with the tests (see the note at the bottom of chat-style.js).
if (typeof module !== "undefined") {
  module.exports = {
    buildBackup,
    readBackup,
    backupFilename,
    BACKUP_FORMAT,
    BACKUP_VERSION,
  };
}
