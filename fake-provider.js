// =====================================================================
//  fake-provider.js  —  an AI provider that isn't one
// =====================================================================
//
//  WHAT THIS IS FOR
//  ----------------
//  Every real reply costs money and needs an internet connection. That's
//  a bad deal when what you're actually doing is fiddling with a typing
//  delay and pressing Send forty times to see how it feels.
//
//  So this is a pretend provider. It speaks the same language as
//  OpenRouter or Mancer — the "OpenAI-compatible" format — but instead
//  of asking a model anything, it makes something up locally and sends
//  it straight back. Free, instant, works on a plane.
//
//  Point Tiny RP at it and everything works: chat style, bubbles,
//  regenerate, the memory line, backups. Only the intelligence is
//  missing, and you don't need intelligence to test a typing delay.
//
//  HOW TO USE IT
//  -------------
//  Open a second Termux session (swipe from the left edge, "New
//  session") and run:
//
//      bun run fake
//
//  Leave it running. Then in your first session:
//
//      bun run practice
//
//  and open http://localhost:8123 as usual.
//
//  Two programs, two windows, talking over a port. That's not a
//  workaround, by the way — it's how nearly all software is built and
//  run. Your browser, this fake provider, and the real server are three
//  separate programs that only know each other by port number.
//
//  THE COMMANDS (the fun part)
//  ---------------------------
//  Send any of these as a message to make the fake provider misbehave
//  on purpose, so you can see how the app copes:
//
//      /slow     takes 6 seconds, so you can watch the typing indicator
//      /error    fails with a 500, so you can see the error in the chat
//      /empty    replies with nothing, so you get "(empty reply)"
//      /long     replies with a wall of text, to fill up the context
//                window fast and make the memory line appear
//      /bubbles  replies with lots of short <cht> bubbles
//
//  Deliberately breaking things is the fastest way to learn what code
//  does. This gives you a button for it.
// =====================================================================


// The port to listen on. `bun run fake 9000` would use 9000 instead.
// process.argv is the list of words typed on the command line; the
// first two are always bun itself and this file, so ours is number 2.
const PORT = Number(process.argv[2] ?? 8124);


// ---------------------------------------------------------------------
//  Canned replies. Nothing clever: a list, picked from at random.
//  `{char}` gets swapped for the character's real name below, which is
//  a miniature version of what fillMacros does in app.js.
// ---------------------------------------------------------------------
const REPLIES = [
  `{char} considers that for a moment, then nods slowly.\n\n"Go on."`,
  `"Hm." {char} doesn't look up. "And you believe that?"`,
  `{char} laughs, short and surprised. "You're serious. All right."`,
  `The lamp gutters. {char} reaches over and steadies it without comment.\n\n"Keep talking."`,
  `"That's the second time you've said that." {char} finally looks at you. "Why?"`,
  `{char} writes something down. You can't see what.\n\n"Noted."`,
  `A long pause. Then: "I don't think that's true, but I'd like it to be."`,
  `"You're changing the subject." {char} almost smiles. "I'll allow it."`,
];

const BUBBLE_REPLY =
  "<cht>wait</cht><cht>say that again</cht><cht>you're telling me you did what</cht>" +
  "<cht>no, no. i heard you</cht><cht>i just need a second</cht>";


// ---------------------------------------------------------------------
//  characterNameFrom(messages)
//  Digs the character's name out of the system message, so the fake
//  replies use it and the whole thing feels less like a stub.
//
//  app.js writes the system message starting with
//      "You are Wren in an ongoing roleplay with You."
//  so we can just pull the name back out of that sentence.
//
//  Regex decoder ring:
//    ^You are      the literal words, at the START of the text (^)
//    \s+           one or more spaces
//    (.+?)         capture anything, as FEW characters as possible
//    \s+in an      stop as soon as " in an" turns up
//  Without the `?` making it lazy, `.+` would greedily run to the last
//  " in an" in the entire card.
// ---------------------------------------------------------------------
function characterNameFrom(messages) {
  const system = messages.find((message) => message.role === "system");
  const match = system?.content?.match(/^You are\s+(.+?)\s+in an ongoing roleplay/);
  return match ? match[1] : "The character";
}


// ---------------------------------------------------------------------
//  lastUserText(messages)
//  What you most recently typed, lowercased, so we can look for the
//  slash commands in it.
// ---------------------------------------------------------------------
function lastUserText(messages) {
  const users = messages.filter((message) => message.role === "user");
  return (users.at(-1)?.content ?? "").toLowerCase();
}


// ---------------------------------------------------------------------
//  reply(messages)
//  Decides what to say. Returns the text, or null to mean "fail."
// ---------------------------------------------------------------------
function reply(messages) {
  const asked = lastUserText(messages);
  const name = characterNameFrom(messages);

  if (asked.includes("/empty")) {
    return "";
  }

  if (asked.includes("/bubbles")) {
    return BUBBLE_REPLY;
  }

  if (asked.includes("/long")) {
    // Roughly 2,000 characters, about 500 tokens. Send a handful of
    // these and you'll watch the memory line appear and start climbing.
    const sentence =
      `${name} talks at length about the weather, the tides, the state of the ` +
      `lamp housing, and the specific kind of silence that comes before a storm. `;
    return sentence.repeat(8);
  }

  // Pick a canned reply at random and put the real name into it.
  const chosen = REPLIES[Math.floor(Math.random() * REPLIES.length)];
  return chosen.replaceAll("{char}", name);
}


Bun.serve({
  port: PORT,

  async fetch(request) {
    // Real providers accept anything that looks like a chat completion
    // request, whatever the exact path, so we do the same.
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "that wasn't JSON" }, { status: 400 });
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];

    // Show what arrived. Watching this while you use the app is one of
    // the clearest views you can get of what a prompt actually is: the
    // WHOLE conversation, sent again, every single time.
    const characters = messages.reduce((total, m) => total + (m.content?.length ?? 0), 0);
    console.log(
      `→ ${messages.length} messages, ${characters.toLocaleString()} characters ` +
      `(about ${Math.ceil(characters / 4).toLocaleString()} tokens)`
    );

    const asked = lastUserText(messages);

    if (asked.includes("/error")) {
      console.log("  ↳ pretending to fail, because you asked");
      return Response.json(
        { error: { message: "The fake provider failed on purpose." } },
        { status: 500 }
      );
    }

    if (asked.includes("/slow")) {
      console.log("  ↳ thinking slowly for 6 seconds…");
      await Bun.sleep(6000);
    }

    const text = reply(messages);
    console.log(`  ↳ ${text === "" ? "(empty reply)" : text.slice(0, 60).replace(/\n/g, " ") + "…"}`);

    // The exact shape every OpenAI-compatible provider returns. server.js
    // digs the text out of choices[0].message.content — see the comment
    // there about optional chaining.
    return Response.json({
      choices: [{ message: { role: "assistant", content: text } }],
    });
  },
});

console.log(`Fake provider listening on http://localhost:${PORT}`);
console.log(`Now run:  bun run practice`);
console.log(`Try sending /slow, /error, /empty, /long or /bubbles.`);
