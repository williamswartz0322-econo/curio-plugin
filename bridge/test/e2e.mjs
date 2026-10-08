#!/usr/bin/env node
// End-to-end check of the reader <-> bridge <-> session loop, with this
// script playing Claude: it spawns the bundled MCP server exactly as Claude
// Code would, answers the channel events it emits through the curio tools,
// and drives the real reader over HTTP the way the browser does.
//
//   CURIO_LIBRARY=<library with one ingested course> \
//   CLAUDE_PLUGIN_DATA=<data dir where scripts/setup.sh built the reader> \
//   node bridge/test/e2e.mjs <course> <chapter>
//
// It writes a conversation, learner evidence, a practice item, and a graded
// outcome into that library — point it at a scratch copy.
import { spawn } from "child_process";
import assert from "assert/strict";
import path from "path";
import { fileURLToPath } from "url";

const [course, chapter] = process.argv.slice(2);
if (!course || !chapter || !process.env.CURIO_LIBRARY || !process.env.CLAUDE_PLUGIN_DATA) {
  console.error("usage: CURIO_LIBRARY=... CLAUDE_PLUGIN_DATA=... node e2e.mjs <course> <chapter>");
  process.exit(2);
}

const server = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist", "curio-mcp.mjs");
const child = spawn(process.execPath, [server], {
  env: { ...process.env, CURIO_NO_BROWSER: "1" },
  stdio: ["pipe", "pipe", "inherit"],
});

let nextId = 1;
const waiting = new Map();
const events = [];
let eventWaiter = null;
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
    } else if (msg.method === "notifications/claude/channel") {
      events.push(msg.params);
      eventWaiter?.();
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve) => waiting.set(id, resolve));
}

async function tool(name, args) {
  const res = await rpc("tools/call", { name, arguments: args });
  const text = res.result?.content?.[0]?.text ?? "";
  if (res.result?.isError || res.error) throw new Error(`${name} failed: ${text || JSON.stringify(res.error)}`);
  return text;
}

async function nextEvent(kind) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const i = events.findIndex((e) => e.meta.kind === kind);
    if (i >= 0) return events.splice(i, 1)[0];
    if (Date.now() > deadline) throw new Error(`no ${kind} event`);
    await new Promise((r) => {
      eventWaiter = r;
      setTimeout(r, 500);
    });
  }
}

const step = (label) => console.log(`✓ ${label}`);

try {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "e2e", version: "0" },
  });
  assert.ok(init.result.capabilities.experimental["claude/channel"], "channel capability");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  step("initialize: channel capability declared");

  const opened = await tool("open_reader", { course, chapter });
  const base = opened.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  step(`open_reader: ${base}`);

  let status = await (await fetch(`${base}/api/bridge`)).json();
  assert.equal(status.connected, false);
  const ping = await nextEvent("ping");
  await tool("reply", { request_id: ping.meta.request_id, text: "connected" });
  status = await (await fetch(`${base}/api/bridge`)).json();
  assert.equal(status.connected, true);
  step("ping answered; reader reports connected");

  const page = await fetch(`${base}/read/${course}/${chapter}`);
  assert.equal(page.status, 200);
  step("reader renders the chapter");

  const foreign = await fetch(`${base}/api/tutor`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://evil.example" },
    body: "{}",
  });
  assert.equal(foreign.status, 403);
  step("cross-site request refused");

  // Ask: the reader waits while "Claude" reads context, replies, and updates the learner.
  const conversationId = `e2e-${Date.now()}`;
  const asking = fetch(`${base}/api/tutor`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      course,
      chapter,
      conversationId,
      title: "e2e question",
      anchor: null,
      question: "What is the main idea of this chapter?",
    }),
  });
  const ask = await nextEvent("ask");
  assert.match(ask.content, /<learner_question>/);
  const context = await tool("context", { course, chapter, conversation_id: ask.meta.conversation_id });
  assert.match(context, /Concept ids for update_learner/);
  assert.match(context, /This conversation so far/);
  await tool("reply", { request_id: ask.meta.request_id, text: "It is about $E(y|x)$." });
  const answered = await (await asking).json();
  assert.equal(answered.reply, "It is about $E(y|x)$.");
  const conceptId = context.match(/^- ([a-z0-9-]+) — /m)[1];
  const updated = JSON.parse(
    await tool("update_learner", {
      course,
      chapter,
      concept_updates: [
        { concept_id: conceptId, mastery: "exposed", confidence: "low", evidence: "asked for the main idea", misconception: null },
        { concept_id: "not-a-concept", mastery: "solid", confidence: "high", evidence: "x", misconception: null },
      ],
      profile_note: null,
    })
  );
  assert.deepEqual(updated.dropped, ["not-a-concept"]);
  const convo = await (await fetch(`${base}/api/conversations?course=${course}&id=${conversationId}`)).json();
  assert.equal(convo.messages.length, 2);
  step("ask → context → reply → update_learner; conversation saved");

  // Practice: an item is served only after validation.
  const practising = fetch(`${base}/api/practice`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ action: "generate", course, chapter }),
  });
  const pr = await nextEvent("practice");
  const targets = JSON.parse(await tool("practice_targets", { course, chapter }));
  const key = targets[0].concept_key;
  const passages = await tool("concept_passages", { course, concept_key: key });
  const blockId = passages.match(/\[(ch\d+-s\d+-b\d+)\]/)[1];
  const draft = {
    course,
    concept_key: key,
    kind: "explanation",
    question: "Explain the idea in your own words.",
    expected: "The idea, explained.",
    common_errors: [{ wrong: "a wrong answer", reveals: "a misconception" }],
    source_block_ids: [blockId],
  };
  const rejected = JSON.parse(await tool("propose_item", draft));
  assert.match(await tool("settle_item", { course, draft_id: rejected.draft_id, approved: false, note: "ambiguous" }), /Rejected/);
  const proposed = JSON.parse(await tool("propose_item", draft));
  await tool("settle_item", {
    course,
    draft_id: proposed.draft_id,
    approved: true,
    note: "supported by the passages",
    request_id: pr.meta.request_id,
  });
  const item = await (await practising).json();
  assert.equal(item.question, draft.question);
  assert.equal(item.expected, undefined, "answer key must not reach the reader");
  step("practice → rejected draft discarded → validated item served without its key");

  const grading = fetch(`${base}/api/practice`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ action: "grade", course, itemId: item.id, answer: "My explanation." }),
  });
  const gr = await nextEvent("grade");
  assert.equal(gr.meta.item_id, item.id);
  const full = JSON.parse(await tool("get_item", { course, item_id: item.id }));
  assert.equal(full.expected, draft.expected);
  await tool("record_grade", {
    course,
    item_id: item.id,
    verdict: "correct",
    feedback: "Right.",
    misconception: null,
    mastery: "solid",
    request_id: gr.meta.request_id,
  });
  const graded = await (await grading).json();
  assert.equal(graded.verdict, "correct");
  const st = JSON.parse(await tool("status", { course }));
  assert.ok(Array.isArray(st.next_actions));
  step("grade → record_grade → learner model updated; status reports next actions");

  console.log("\nall checks passed");
} catch (err) {
  console.error(`\n✗ ${err.stack ?? err}`);
  process.exitCode = 1;
} finally {
  child.stdin.end();
  setTimeout(() => process.exit(), 500);
}
