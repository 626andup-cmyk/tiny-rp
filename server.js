// =====================================================================
//  server.js  —  the "back end" of Tiny RP
// =====================================================================
//
//  WHAT THIS FILE DOES (the big picture)
//  -------------------------------------
//  A web app usually has two halves:
//
//    1. The FRONT END: the stuff that runs inside your browser.
//       (index.html, style.css, app.js — all in the /public folder.)
//
//    2. The BACK END: a program running on a computer somewhere
//       that the browser talks to. That's this file.
//
//  Our back end has exactly two jobs:
//
//    JOB 1: When the browser asks for a file (like "/app.js"),
//           find it in the /public folder and send it back.
//
//    JOB 2: When the browser says "please generate a reply" (by
//           sending a request to "/api/generate"), forward that
//           request to the AI provider (OpenRouter, Mancer, etc.),
//           wait for the answer, and pass the answer back.
//
//  WHY NOT HAVE THE BROWSER TALK TO THE AI PROVIDER DIRECTLY?
//  ----------------------------------------------------------
//  Two reasons, and both are things real frontends like Lumiverse
//  and SillyTavern deal with too:
//
//    a) SECRETS. Your API key is like a password that costs money.
//       If it lives in browser code, anyone who can open the page
//       can read it. Here it lives in config.json on the server,
//       and the browser never sees it.
//
//    b) CORS. Browsers have a safety rule called "Cross-Origin
//       Resource Sharing." A page from one website usually isn't
//       allowed to read responses from a different website unless
//       that other website says it's okay. Many AI providers don't
//       say it's okay. Servers don't have this rule, so the server
//       can make the call for us. This pattern is called a PROXY.
//
//  HOW TO RUN IT
//  -------------
//      bun run server.js
//  then open http://localhost:8123 in your browser.
//  (The port number comes from config.json.)
// =====================================================================


// ---------------------------------------------------------------------
//  STEP 0: Load the settings.
// ---------------------------------------------------------------------
//  `Bun.file("config.json")` gives us a handle to the file.
//  `.json()` reads it and turns the JSON text into a JavaScript object.
//
//  `await` means "pause here until this finishes." Reading a file
//  takes a moment, and JavaScript won't wait unless you tell it to.
//  (We can use `await` at the top level of this file because Bun
//  treats it as a "module." In older JavaScript you couldn't.)
//
//  WHY ALL THE CHECKING BELOW?
//  ---------------------------
//  config.json is deliberately NOT stored in git (see .gitignore),
//  because it holds your API key. The upside is that your key can never
//  be uploaded by accident. The downside is that a freshly downloaded
//  copy of Tiny RP doesn't have a config.json at all, so the very first
//  thing it would do is crash. An error that tells you what to do next
//  is worth a few lines.
//
//  You can also keep more than one config (say, one per provider) and
//  choose between them when you start the server:
//      TINY_RP_CONFIG=mancer.config.json bun run start
//  Give extra configs names ending in ".config.json": .gitignore hides
//  those too, so a second key can't be uploaded by accident either.
//  `process.env` holds ENVIRONMENT VARIABLES: settings handed to a
//  program by whatever started it. `??` means "if that's missing, use
//  this instead," so leaving it unset gives the normal config.json.
const CONFIG_PATH = process.env.TINY_RP_CONFIG ?? "config.json";

const configFile = Bun.file(CONFIG_PATH);

if (!(await configFile.exists())) {
  console.error(`Couldn't find ${CONFIG_PATH}.`);
  console.error(`Make one by copying the example:`);
  console.error(`    cp config.example.json ${CONFIG_PATH}`);
  console.error(`then open it and fill in your API address, key, and model.`);
  // process.exit(1) stops the program. The 1 means "something went
  // wrong" (0 means "finished fine"). Other programs can read that
  // number to find out whether we succeeded.
  process.exit(1);
}

let config;
try {
  config = await configFile.json();
} catch (error) {
  console.error(`${CONFIG_PATH} isn't valid JSON: ${error.message}`);
  console.error(`A stray comma or a missing quote is usually the cause.`);
  process.exit(1);
}

// A tiny safety check. If you forgot to fill in your key, it's
// kinder to say so now than to fail mysteriously later.
if (!config.apiKey || config.apiKey.startsWith("PUT-")) {
  console.warn(`⚠  ${CONFIG_PATH} still has the placeholder API key.`);
  console.warn("   The page will load, but generating replies will fail.");
}


// ---------------------------------------------------------------------
//  STEP 1: Start the web server.
// ---------------------------------------------------------------------
//  `Bun.serve` starts listening for web requests on a port.
//  Think of a port like an apartment number: the computer is the
//  building, and the port says which program should get the mail.
//
//  We give it an object with two things:
//    - `port`:  which apartment number to use
//    - `fetch`: a FUNCTION that Bun calls every single time a
//               request arrives. Whatever that function returns
//               is what gets sent back to the browser.
Bun.serve({
  port: config.port,

  // `async` means this function is allowed to use `await` inside it.
  // `request` is an object describing what the browser asked for.
  async fetch(request) {

    // `request.url` is a full address like
    // "http://localhost:8123/app.js". The URL class splits it into
    // parts so we can grab just the path ("/app.js").
    const url = new URL(request.url);

    // Print every request to the terminal. This is called LOGGING.
    // Watching it scroll by is a great way to understand what the
    // browser is actually doing.
    console.log(request.method, url.pathname);

    // -------------------------------------------------------------
    //  JOB 2: the AI relay.
    //  We check this first because it's the special case.
    //  "POST" is the HTTP method used when you're SENDING data.
    //  (Asking for a file is usually "GET".)
    // -------------------------------------------------------------
    if (url.pathname === "/api/generate" && request.method === "POST") {
      return handleGenerate(request);
    }

    // -------------------------------------------------------------
    //  JOB 1: serve a file from /public.
    // -------------------------------------------------------------
    return serveStaticFile(url.pathname);
  },
});

console.log(`Tiny RP is running at http://localhost:${config.port}`);


// =====================================================================
//  HELPER FUNCTIONS
//  (Functions declared with the `function` keyword are "hoisted,"
//  which means you can call them from code that appears ABOVE them
//  in the file. That's why Bun.serve can use them up there.)
// =====================================================================


// ---------------------------------------------------------------------
//  serveStaticFile(path)
//  "Static" means the file is sent exactly as it is on disk.
//  Nothing is generated or changed.
// ---------------------------------------------------------------------
async function serveStaticFile(path) {

  // If someone visits the bare address "/", give them the main page.
  if (path === "/") {
    path = "/index.html";
  }

  // SECURITY LESSON: "path traversal."
  // A sneaky visitor could ask for "/../config.json", and ".." means
  // "go up one folder." Without this check, that could leak your API
  // key! So we refuse any path containing "..".
  if (path.includes("..")) {
    return new Response("Nope.", { status: 400 });
  }

  const file = Bun.file("public" + path);

  // `file.exists()` checks whether the file is really there.
  // 404 is the famous status code for "not found."
  if (!(await file.exists())) {
    return new Response("Not found: " + path, { status: 404 });
  }

  // Returning a Response built from a Bun.file sends the file.
  // Bun also figures out the "content type" (HTML vs CSS vs JS)
  // from the file extension, so the browser knows what it got.
  return new Response(file);
}


// ---------------------------------------------------------------------
//  handleGenerate(request)
//  The browser sends us a list of chat messages. We add the secret
//  stuff (API key, model name, settings), send it all to the AI
//  provider, and pass the AI's reply back to the browser.
// ---------------------------------------------------------------------
async function handleGenerate(request) {

  // The browser sent JSON in the "body" of the request.
  // `request.json()` reads it and turns it into an object.
  // We expect it to look like: { messages: [ ... ] }
  //
  // This gets its OWN try/catch, because the body might not be valid
  // JSON at all. An error thrown out here, outside of any catch, escapes
  // the function entirely; Bun then answers with a big HTML error page
  // (which even includes the folder this server is running from) instead
  // of the { error: ... } shape app.js knows how to display. Handling it
  // turns a mystery into a sentence.
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return Response.json(
      { error: "That request body wasn't valid JSON." },
      { status: 400 } // 400 = "you sent me something I can't use"
    );
  }

  // Never trust the SHAPE of data that arrived over the network, even
  // when you wrote the code that sent it. Checking here means a bug in
  // app.js shows up as a clear message from our own server, instead of
  // a confusing complaint from the provider (or a charge for a request
  // that was never going to work).
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json(
      { error: 'Expected a non-empty "messages" array.' },
      { status: 400 }
    );
  }

  // `try { ... } catch (error) { ... }` means:
  // "Try to do this. If ANYTHING in here throws an error, jump to the
  //  catch block instead of crashing the whole server."
  // Network calls fail all the time (bad wifi, provider down, typo in
  // the URL), so this is important.
  try {

    // This is the request to the AI provider.
    // Almost every provider speaks the same "OpenAI-compatible"
    // format, which is why one frontend can work with many of them.
    const upstream = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // "Bearer <key>" is the standard way to send an API key.
        // The backticks (`) make a TEMPLATE STRING: anything inside
        // ${ } gets replaced with its value.
        "Authorization": `Bearer ${config.apiKey}`,
      },
      // JSON.stringify turns a JavaScript object INTO JSON text.
      // (It's the opposite of .json(), which turns text into an object.)
      body: JSON.stringify({
        model: config.model,
        messages: body.messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
      }),
    });

    // `upstream.ok` is true when the status code is in the 200s
    // ("success"). If the provider complained (wrong key = 401,
    // out of credits = 402, etc.) we pass its complaint along so
    // you can actually see what went wrong.
    if (!upstream.ok) {
      const errorText = await upstream.text();
      return Response.json(
        { error: `Provider answered ${upstream.status}: ${errorText}` },
        { status: 502 } // 502 = "the server I talked to gave me a bad answer"
      );
    }

    const data = await upstream.json();

    // The reply is buried inside the response, like this:
    //   { choices: [ { message: { role: "assistant", content: "Hi!" } } ] }
    //
    // The `?.` is called OPTIONAL CHAINING. Normally, if `choices`
    // didn't exist, `data.choices[0]` would crash. With `?.`, it just
    // gives back `undefined` instead.
    // The `??` means "if the left side is null/undefined, use the
    // right side instead." So a missing reply becomes "".
    const reply = data.choices?.[0]?.message?.content ?? "";

    return Response.json({ reply: reply });

  } catch (error) {
    // Something went wrong before we even got an answer.
    console.error("Generation failed:", error);
    return Response.json(
      { error: "Couldn't reach the provider: " + error.message },
      { status: 500 } // 500 = "something broke on the server"
    );
  }
}
