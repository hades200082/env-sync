/**
 * Strip `//` and `/* *\/` comments plus trailing commas so hand written
 * config files can carry notes. String contents are left untouched.
 */
export function stripJsonComments(input: string): string {
  let out = "";
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i]!;
    const next = input[i + 1];
    if (ch === '"') {
      const j = endOfString(input, i);
      out += input.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < n && input[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = input.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    out += ch;
    i++;
  }
  return removeTrailingCommas(out);
}

function endOfString(input: string, start: number): number {
  let j = start + 1;
  while (j < input.length) {
    if (input[j] === "\\") {
      j += 2;
      continue;
    }
    if (input[j] === '"') break;
    j++;
  }
  return j;
}

function removeTrailingCommas(input: string): string {
  let out = "";
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i]!;
    if (ch === '"') {
      const j = endOfString(input, i);
      out += input.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < n && /\s/.test(input[j]!)) j++;
      if (input[j] === "}" || input[j] === "]") {
        i++;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonComments(text));
}
