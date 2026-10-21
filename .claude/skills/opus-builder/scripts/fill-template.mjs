#!/usr/bin/env node
// Fills a template's {{PLACEHOLDERS}} from a client file and prints the result.
// Stops with an error if any placeholder has no value, so nothing half-filled
// is pasted into a client's setup.
//
// Usage:
//   node fill-template.mjs <client.json> [template]   (default: templates/worker-prompt.md)
//   node fill-template.mjs client.json references/client-guide.md > guide.md

import { readFileSync } from "node:fs";

const [clientFile, templateArg] = process.argv.slice(2);
if (!clientFile) {
  console.error("Usage: node fill-template.mjs <client.json> [template]");
  process.exit(1);
}
const here = new URL("..", import.meta.url);
const templatePath = templateArg ? templateArg : new URL("templates/worker-prompt.md", here);
const values = JSON.parse(readFileSync(clientFile, "utf8"));

// "+19175550101" -> "917-555-0101", for the *_PRETTY placeholders.
for (const key of Object.keys(values)) {
  const v = values[key];
  if (typeof v === "string" && /^\+1\d{10}$/.test(v)) {
    values[`${key}_PRETTY`] = `${v.slice(2, 5)}-${v.slice(5, 8)}-${v.slice(8)}`;
  }
}

let text = readFileSync(templatePath, "utf8").replace(/^<!--[\s\S]*?-->\s*/, "");
const missing = new Set();
text = text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (whole, key) => {
  const v = values[key];
  if (typeof v !== "string" || !v.trim()) {
    missing.add(key);
    return whole;
  }
  return v.trim();
});
if (missing.size) {
  console.error(`Missing values in ${clientFile}: ${[...missing].join(", ")}`);
  process.exit(1);
}
process.stdout.write(text);
