// =====================================================================
//  prompt-budget.test.js  —  automatic checks for prompt-budget.js
// =====================================================================
//
//  These tests pass their OWN small budgets (like 100 tokens) instead
//  of using the real 6000, so the examples stay tiny and easy to
//  reason about. That's a common testing trick: make the numbers small
//  enough to check in your head.
//
//  Run with:  bun test
// =====================================================================

import { test, expect } from "bun:test";

const { estimateTokens, fitToBudget } = require("../public/prompt-budget.js");


// A quick way to make a message of an exact length.
// "x".repeat(40) is forty x's: about 10 tokens, plus 4 overhead = 14.
function msg(characterCount) {
  return { role: "user", content: "x".repeat(characterCount) };
}

const system = msg(0); // costs just the 4 overhead tokens


test("about four characters per token, rounded up", () => {
  expect(estimateTokens("")).toBe(0);
  expect(estimateTokens("abcd")).toBe(1);
  expect(estimateTokens("abcde")).toBe(2);
});

test("a short chat fits entirely", () => {
  const history = [msg(40), msg(40), msg(40)];
  expect(fitToBudget(system, history, 1000).firstIncluded).toBe(0);
});

test("the oldest messages are the ones left out", () => {
  // system 4 + three messages of 14 each = 46. Budget 40 fits only two.
  const history = [msg(40), msg(40), msg(40)];
  const fit = fitToBudget(system, history, 40);
  expect(fit.firstIncluded).toBe(1);
  expect(fit.tokens).toBe(4 + 14 + 14);
});

test("stops at the first message that doesn't fit, even if older ones would", () => {
  // Newest is small, middle is huge, oldest is small. Keeping the
  // oldest but skipping the middle would scramble the story.
  const history = [msg(4), msg(4000), msg(4)];
  expect(fitToBudget(system, history, 100).firstIncluded).toBe(2);
});

test("the newest message is always sent, even if it's over budget", () => {
  const history = [msg(40), msg(4000)];
  expect(fitToBudget(system, history, 50).firstIncluded).toBe(1);
});

test("an empty chat is fine", () => {
  const fit = fitToBudget(system, [], 100);
  expect(fit.firstIncluded).toBe(0);
  expect(fit.tokens).toBe(4);
});
