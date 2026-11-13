// fetch in a file of Ljós's API, as ljos-ui's
// `features/platform/fetch.feature` writes it, and as `qmlc` emits it: the
// names are the page's own `fetch`, `Request`, `Response`, `Headers` and
// `AbortController`, which the runtime leaves as they are. "/served" is the
// test's server (`page.route`). Each scenario writes what it got to `got`.
//
// import Ljos.Ui
// import Ljos.Core
// Item {
//     id: root
//     readonly property var deadline: AbortSignal.timeout(500)
//     Component.onCompleted: { …each scenario's script… }
// }
import { $object } from "ljos-web/object";
import { Item } from "ljos-web/Ljos/Ui";
import { make } from "../scene.js";

export const objects = { got: {} };

function scenarios(deadline) {
  const { got } = objects;

  (async () => {
    const reply = await fetch("/served/act.json");
    const given = await reply.json();
    let activity = "none";
    if (typeof given === "object" && given !== null && "activity" in given && typeof given.activity === "string") activity = given.activity;
    got.json = `${reply.status} ${reply.ok} ${reply.statusText} ${reply.headers.get("content-type")} ${activity}`;
  })();

  fetch("/served/missing.json").then(async (reply) => {
    got.missing = `${reply.status} ${reply.ok} ${reply.statusText} ${await reply.text()}`;
  });

  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("X-One", "1");
  headers.append("x-one", "2");
  headers.set("Connection", "close");
  fetch("/served/echo", { method: "POST", headers, body: JSON.stringify({ a: 1 }) })
    .then((reply) => reply.text())
    .then((text) => (got.sent = text));
  fetch(new Request("/served/echo", { method: "PUT", body: "hi" }))
    .then((reply) => reply.text())
    .then((text) => (got.text = text));
  fetch("/served/echo", { method: "POST", body: new Uint8Array([104, 105, 33]) })
    .then((reply) => reply.text())
    .then((text) => (got.bytes = text));

  (async () => {
    const reply = await fetch("/served/act.json");
    const bytes = await reply.arrayBuffer();
    let again = "";
    try {
      await reply.text();
    } catch (e) {
      again = `${e instanceof TypeError} ${reply.bodyUsed}`;
    }
    got.once = `${bytes.byteLength} ${again}`;
  })();

  // Port 9, the feature's, is one the browser will not ask at all.
  fetch("http://127.0.0.1:4/nothing")
    .then(() => (got.unreachable = "answered"))
    .catch((e) => (got.unreachable = `${e instanceof TypeError} ${e.name}`));

  const sent = new AbortController();
  fetch("/served/act.json", { signal: sent.signal })
    .then(() => (got.aborted = "answered"))
    .catch((e) => (got.aborted = `${e instanceof DOMException} ${e.name} ${e.code}`));
  sent.abort();
  got.aborted = `aborted ${sent.signal.aborted}`;

  const reasoned = new AbortController();
  got.reason = "";
  reasoned.signal.onabort = () => (got.reason += "abort ");
  reasoned.abort("gone");
  reasoned.abort("twice");
  fetch("/served/echo", { method: "POST", body: "never", signal: reasoned.signal }).catch(
    (e) => (got.reason += `${e} ${reasoned.signal.reason}`),
  );

  got.timedOut = `${deadline.aborted}`;
  deadline.addEventListener("abort", () => {
    got.timedOut += ` ${deadline.reason.name} ${deadline.reason.code}`;
    fetch("/served/act.json", { signal: deadline }).catch((e) => (got.later = e.name));
  });

  const user = new AbortController();
  const page = new AbortController();
  const either = AbortSignal.any([user.signal, page.signal]);
  got.either = `${either.aborted}`;
  page.abort("left the page");
  user.abort("pressed stop");
  got.either += ` ${either.aborted} ${either.reason}`;
  try {
    either.throwIfAborted();
  } catch (e) {
    got.either += ` threw ${e}`;
  }

  const h = new Headers([
    ["Accept", "text/plain"],
    ["X-B", "2"],
  ]);
  h.append("x-b", "3");
  h.set("X-A", "1");
  h.delete("accept");
  const seen = [];
  h.forEach((value, name) => seen.push(`${name}=${value}`));
  for (const [name, value] of h.entries()) seen.push(`${name}:${value}`);
  got.headers = `${seen.join(" ")} ${h.has("X-A")} ${h.get("accept")}`;
}

export default function Fetching() {
  objects.root = $object();
  const deadline = AbortSignal.timeout(500);
  return make(Item, { $self: objects.root, width: 200, height: 100, Component$onCompleted: () => scenarios(deadline) });
}
