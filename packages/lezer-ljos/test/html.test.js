import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightToHtml } from "../src/html.js";

const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const spans = (html) => [...html.matchAll(/<span class="([^"]+)">([^<]*)<\/span>/g)].map((m) => [m[1], unesc(m[2])]);
const classOf = (html, text) => spans(html).find(([, t]) => t === text)?.[0];

test("QML names, keywords and values each carry their role", () => {
  const html = highlightToHtml(
    'import QtQuick\nItem {\n  readonly property int n: 3 // three\n  signal moved()\n  text: "a" + true + null\n  onTapped: go(/x/)\n}',
    "qml",
  );
  assert.equal(classOf(html, "import"), "tok-keyword");
  assert.equal(classOf(html, "QtQuick"), "tok-typeName");
  assert.equal(classOf(html, "Item"), "tok-typeName");
  assert.equal(classOf(html, "readonly"), "tok-keyword");
  assert.equal(classOf(html, "property"), "tok-keyword");
  assert.equal(classOf(html, "int"), "tok-typeName");
  assert.equal(classOf(html, "n"), "tok-propertyName");
  assert.equal(classOf(html, "3"), "tok-number");
  assert.equal(classOf(html, "// three"), "tok-comment");
  assert.equal(classOf(html, "moved"), "tok-function");
  assert.equal(classOf(html, "text"), "tok-propertyName");
  assert.equal(classOf(html, '"a"'), "tok-string");
  assert.equal(classOf(html, "+"), "tok-operator");
  assert.equal(classOf(html, "true"), "tok-bool");
  assert.equal(classOf(html, "null"), "tok-null");
  assert.equal(classOf(html, "go"), "tok-function");
  assert.equal(classOf(html, "/x/"), "tok-regexp");
  assert.equal(classOf(html, "{"), "tok-punctuation");
});

test("the topic has its own class; modulo stays an operator", () => {
  const got = spans(highlightToHtml("x |> % % 3", "lts"));
  assert.deepEqual(got, [
    ["tok-variableName", "x"],
    ["tok-operator", "|>"],
    ["tok-topic", "%"],
    ["tok-operator", "%"],
    ["tok-number", "3"],
  ]);
});

test("match and when read as keywords", () => {
  const html = highlightToHtml('match (n) { when 0: "none"; default: "some"; }', "lts");
  assert.equal(classOf(html, "match"), "tok-keyword");
  assert.equal(classOf(html, "when"), "tok-keyword");
  assert.equal(classOf(html, "default"), "tok-keyword");
});

test("the text survives escaped, and an unknown language comes back plain", () => {
  const code = 'Text { text: "<b>&</b>" }';
  const html = highlightToHtml(code, "qml");
  assert.equal(unesc(html.replace(/<span class="[^"]+">|<\/span>/g, "")), code);
  assert.equal(highlightToHtml("a < b", "sh"), "a &lt; b");
});

test("a broken line marks the break, not the whole block", () => {
  const html = highlightToHtml("Item {\n  width: )\n}", "qml");
  assert.equal(classOf(html, ")"), "tok-invalid");
  assert.equal(classOf(html, "width"), "tok-propertyName");
  assert.equal(classOf(html, "Item"), "tok-typeName");
});
