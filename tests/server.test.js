// =====================================================================
//  server.test.js  —  automatic checks for server.js
// =====================================================================
//
//  The other test files check PURE FUNCTIONS: hand one an input, look at
//  what comes back, nothing else is involved. server.js isn't like that.
//  It listens on a port, reads a config file, and calls a real AI
//  provider over the internet. So this file does the other kind of test,
//  an INTEGRATION test: we start the real server and talk to it exactly
//  the way your browser would.
//
//  Two tricks make that possible with no API key and no money spent:
//
//    1. A FAKE PROVIDER. We start our own tiny server that answers the
//       way OpenRouter would, and point the config at it instead. Now we
//       can test the whole relay end to end, and even look at what our
//       server SENT (did it really attach the key and the model?).
//
//    2. A TEMPORARY CONFIG. server.js reads the TINY_RP_CONFIG
//       environment variable if it's set, so we write a throwaway config
//       into the system's temp folder and point the server at that.
//       Your own config.json is never touched, and never read.
//
//  This is the shape of most "does my back end work?" testing, in every
//  language: start the thing, poke it with requests, check the answers.
//
//  Run with:  bun test
// =====================================================================

import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";

const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

// import.meta.dir is the folder THIS file is in (tests/), so "..") is
// the project root, where server.js lives.
const PROJECT_ROOT = path.join(import.meta.dir, "..");

// A distinctive fake key. Nothing the server sends back to a browser
// should ever contain this string; one of the tests below checks that.
const TEST_API_KEY = "test-key-must-never-leak";

// Set in beforeAll, used by every test.
let baseUrl;
let serverProcess;
let providerServer;
let configPath;

// What the fake provider should do next. Reset before each test so one
// test can't accidentally change the behaviour of the next one.
const provider = {
  status: 200,
  body: { choices: [{ message: { role: "assistant", content: "Hi there!" } }] },
  lastRequest: null,
};


// ---------------------------------------------------------------------
//  freePort()
//  Port 0 is a special request meaning "any free port, you choose."
//  We start a throwaway server just to be told a number, stop it, and
//  reuse that number. Much more reliable than guessing 9000 and hoping.
// ---------------------------------------------------------------------
function freePort() {
  const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = probe.port;
  probe.stop(true);
  return port;
}


// ---------------------------------------------------------------------
//  waitForServer(url)
//  A freshly started program isn't listening the instant we ask for it.
//  So we retry until it answers, instead of sleeping a fixed amount of
//  time and hoping that was enough. (Fixed sleeps are the number one
//  cause of tests that pass on your machine and fail everywhere else.)
// ---------------------------------------------------------------------
async function waitForServer(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Nothing listening yet. That's expected; try again in a moment.
    }
    await Bun.sleep(50);
  }

  // If it never came up, the server's own output is the best clue.
  const complaint = await new Response(serverProcess.stderr).text();
  throw new Error("The server didn't start in time. It said:\n" + complaint);
}


beforeAll(async () => {
  // --- 1. Start the fake AI provider. ---
  providerServer = Bun.serve({
    port: 0,
    async fetch(request) {
      // Remember what our server sent us, so tests can inspect it.
      provider.lastRequest = {
        authorization: request.headers.get("authorization"),
        body: await request.json(),
      };
      return Response.json(provider.body, { status: provider.status });
    },
  });

  // --- 2. Write a temporary config pointing at the fake provider. ---
  const serverPort = freePort();
  baseUrl = `http://localhost:${serverPort}`;

  configPath = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "tiny-rp-test-")),
    "config.json"
  );

  await fs.writeFile(
    configPath,
    JSON.stringify({
      port: serverPort,
      apiUrl: `http://localhost:${providerServer.port}/v1/chat/completions`,
      apiKey: TEST_API_KEY,
      model: "test-model",
      maxTokens: 123,
      temperature: 0.5,
    })
  );

  // --- 3. Start the real server, pointed at that config. ---
  // Bun.spawn runs another program. `env` hands it environment
  // variables; we keep the existing ones and add ours on top.
  serverProcess = Bun.spawn(["bun", "server.js"], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, TINY_RP_CONFIG: configPath },
    stdout: "pipe",
    stderr: "pipe",
  });

  await waitForServer(baseUrl + "/");
});


afterAll(async () => {
  // Always clean up what you started, or the next `bun test` run finds
  // the port still busy.
  serverProcess?.kill();
  await serverProcess?.exited;
  providerServer?.stop(true);
  if (configPath) {
    await fs.rm(path.dirname(configPath), { recursive: true, force: true });
  }
});


beforeEach(() => {
  provider.status = 200;
  provider.body = { choices: [{ message: { role: "assistant", content: "Hi there!" } }] };
  provider.lastRequest = null;
});


// =====================================================================
//  JOB 1: serving files
// =====================================================================

test("serves the main page at the root address", async () => {
  const response = await fetch(baseUrl + "/");
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("<title>");
});

test("serves other files out of the public folder", async () => {
  const response = await fetch(baseUrl + "/style.css");
  expect(response.status).toBe(200);
  // Bun works the content type out from the file extension, which is
  // how the browser knows this is a stylesheet and not just text.
  expect(response.headers.get("content-type")).toContain("text/css");
});

test("answers 404 for a file that isn't there", async () => {
  const response = await fetch(baseUrl + "/not-a-real-file.js");
  expect(response.status).toBe(404);
});


// ---------------------------------------------------------------------
//  The security one. This is a REGRESSION TEST: it doesn't check a
//  feature, it checks that a specific bad thing stays impossible. If
//  someone later "simplifies" the path check in serveStaticFile, this
//  test goes red and explains why it mattered.
//
//  Two separate things protect us, which is the point of the test:
//    * Bun's URL parser resolves ".." away before our code ever sees
//      the path, so "/../config.json" arrives as "/config.json" and
//      looks for public/config.json (which doesn't exist).
//    * The explicit `path.includes("..")` check in serveStaticFile
//      catches the encoded forms that survive that, like "/..%2f".
//  Belt and braces. Neither one alone is obvious enough to trust.
// ---------------------------------------------------------------------
test("never serves the config file, however the path is disguised", async () => {
  const attacks = [
    "/../config.json",
    "/%2e%2e/config.json",
    "/..%2fconfig.json",
    "/..\\config.json",
    "/public/../../config.json",
    "/./../../config.json",
  ];

  for (const attack of attacks) {
    const response = await fetch(baseUrl + attack);
    const text = await response.text();

    // The only acceptable answers are "no" (400) and "not found" (404).
    expect([400, 404]).toContain(response.status);

    // And whatever we said, the key must not be in it.
    expect(text).not.toContain(TEST_API_KEY);
  }
});


// =====================================================================
//  JOB 2: relaying to the AI provider
// =====================================================================

test("relays the chat and hands back the provider's reply", async () => {
  const response = await fetch(baseUrl + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ reply: "Hi there!" });
});

test("attaches the key, model and settings from the config", async () => {
  await fetch(baseUrl + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
  });

  // This is the bit the browser must never see, and the reason the
  // server exists at all. Here we can confirm it really was added.
  expect(provider.lastRequest.authorization).toBe(`Bearer ${TEST_API_KEY}`);
  expect(provider.lastRequest.body.model).toBe("test-model");
  expect(provider.lastRequest.body.max_tokens).toBe(123);
  expect(provider.lastRequest.body.temperature).toBe(0.5);
  expect(provider.lastRequest.body.messages).toEqual([
    { role: "user", content: "hello" },
  ]);
});

test("passes the provider's complaint through instead of hiding it", async () => {
  provider.status = 401; // what a wrong API key usually gets you
  provider.body = { error: "invalid api key" };

  const response = await fetch(baseUrl + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
  });

  // 502 means "the server I talked to gave me a bad answer."
  expect(response.status).toBe(502);
  const data = await response.json();
  expect(data.error).toContain("401");
  expect(data.error).toContain("invalid api key");
});

test("a reply sent as a list of pieces comes back as plain text", async () => {
  // The OpenAI-compatible format allows content to be a LIST as well as
  // a string — that's how images and attachments are carried — and some
  // providers use it even for plain text. app.js calls .split() on
  // whatever it gets, so a list arriving there crashed the page three
  // files away. Flattening it here means the front end can just trust
  // that a reply is text.
  provider.body = {
    choices: [{
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Two " },
          { type: "image_url", image_url: { url: "http://example.com/x.png" } },
          { type: "text", text: "pieces." },
        ],
      },
    }],
  };

  const response = await fetch(baseUrl + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
  });

  expect(await response.json()).toEqual({ reply: "Two pieces." });
});

test("a reply that is neither text nor a list becomes an empty string", async () => {
  provider.body = { choices: [{ message: { role: "assistant", content: 42 } }] };

  const response = await fetch(baseUrl + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
  });

  expect(await response.json()).toEqual({ reply: "" });
});

test("an empty reply comes back as an empty string, not a crash", async () => {
  provider.body = { choices: [] };

  const response = await fetch(baseUrl + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ reply: "" });
});


// ---------------------------------------------------------------------
//  Bad input. app.js expects every answer to be JSON shaped like
//  { error: "..." }, so it can show the problem in the chat. If the
//  server ever answers with an HTML error page instead, app.js's
//  `response.json()` throws and you get a blank, silent failure.
// ---------------------------------------------------------------------
test("a body that isn't JSON gets a clean JSON error, not an HTML page", async () => {
  const response = await fetch(baseUrl + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "this is not json {{{",
  });

  expect(response.status).toBe(400);
  expect(response.headers.get("content-type")).toContain("application/json");

  const data = await response.json();
  expect(data.error).toBeString();

  // The old version leaked the server's folder path in an HTML page.
  expect(data.error).not.toContain("<html");
  expect(data.error).not.toContain(PROJECT_ROOT);

  // And it should never have reached the provider.
  expect(provider.lastRequest).toBe(null);
});

test("a body with no messages array is refused before the provider is called", async () => {
  for (const body of [{}, { messages: [] }, { messages: "hello" }]) {
    provider.lastRequest = null;

    const response = await fetch(baseUrl + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("messages");

    // Not calling the provider matters: a request that was never going
    // to work shouldn't cost you anything.
    expect(provider.lastRequest).toBe(null);
  }
});
