import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJsonc, stripJsonComments } from "../src/jsonc.js";

test("strips line and block comments", () => {
  const text = `{
    // a comment
    "a": 1, /* block */
    "b": "x" // trailing
  }`;
  assert.deepEqual(parseJsonc(text), { a: 1, b: "x" });
});

test("leaves comment-like text inside strings alone", () => {
  const text = `{ "url": "https://example.com/path", "glob": "/* not a comment */" }`;
  assert.deepEqual(parseJsonc(text), { url: "https://example.com/path", glob: "/* not a comment */" });
});

test("removes trailing commas in objects and arrays", () => {
  const text = `{ "list": [1, 2, 3,], "obj": { "k": "v", }, }`;
  assert.deepEqual(parseJsonc(text), { list: [1, 2, 3], obj: { k: "v" } });
});

test("keeps escaped quotes inside strings", () => {
  const text = `{ "s": "say \\"hi\\" // still string", }`;
  assert.deepEqual(parseJsonc(text), { s: 'say "hi" // still string' });
});

test("plain JSON passes through unchanged", () => {
  const text = `{"a":[1,2],"b":{"c":null}}`;
  assert.equal(stripJsonComments(text), text);
});
