// The build side of a generated face (docs/LJOS_WEB.md A22): what `ljos-web
// faces` makes of the lines the macros wrote. A face in a browser is
// examples/wasm-counter's and examples/wasm-gauge's.
import { expect, test } from "@playwright/test";
import { dumpOf, faceSource, FaceError, takeSection, typesOf } from "../web/faces.js";

const custom = (name, text) => {
  const payload = Buffer.concat([Buffer.from([name.length]), Buffer.from(name), Buffer.from(text)]);
  return Buffer.concat([Buffer.from([0, payload.length]), payload]);
};
const HEADER = Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
const prop = (name, more = {}) => ({
  name,
  kind: "int",
  readonly: false,
  required: false,
  constant: false,
  notify: true,
  ...more,
});
const type = (rust, more = {}) => ({ rust, name: rust, module: "My.Types", base: "QtObject", props: [], ...more });
const lines = (...entries) => entries.map((entry) => JSON.stringify(entry)).join("\n");

test("the section is read out of the wasm and a page doesn't download it", () => {
  const kept = custom("other", "stays");
  const wasm = Buffer.concat([HEADER, custom("ljos_web_types", '{"a":1}\n'), kept, custom("ljos_web_types", '{"b":2}\n')]);
  const taken = takeSection(wasm);
  expect(taken.text).toBe('{"a":1}\n{"b":2}\n');
  expect(taken.wasm.equals(Buffer.concat([HEADER, kept]))).toBe(true);
});

test("a type's derive, impl and singleton lines come together in any order", () => {
  const [merged] = typesOf(
    lines(
      { singleton: "One", scope: "engine" },
      { impl: "One", signals: [{ name: "said", parameters: [] }], methods: [], complete: true },
      type("One", { props: [prop("count")] }),
    ),
  );
  expect(merged).toMatchObject({ rust: "One", singleton: true, scope: "engine", complete: true });
  expect(merged.signals.map((signal) => signal.name)).toEqual(["said"]);
});

test("the padding a linker leaves between lines is no part of them", () => {
  expect(typesOf(`\0\0${JSON.stringify(type("One"))}\0\n`).map((one) => one.rust)).toEqual(["One"]);
});

test("a group's type is no type of its own to QML, and its group carries its members", () => {
  const types = typesOf(
    lines(
      type("Limits", { module: null, props: [prop("low")] }),
      type("Host", { props: [{ name: "limits", group: true, of: "Limits" }] }),
    ),
  );
  expect(types.find((one) => one.rust === "Limits").groupOnly).toBe(true);
  const [group] = types.find((one) => one.rust === "Host").props;
  expect(group.members.map((member) => member.name)).toEqual(["low"]);
});

test("a group of a type with no derive says which", () => {
  expect(() => typesOf(lines(type("Host", { props: [{ name: "limits", group: true, of: "Gone" }] })))).toThrow(FaceError);
});

test("the dump is what the compiler reads of any other type", () => {
  const types = typesOf(
    lines(
      type("Tag", { module: null, uncreatable: true }),
      type("Gauge", { base: "Item", attached: "Tag", default: "value", props: [prop("value", { kind: "real" })] }),
      { impl: "Gauge", signals: [], methods: [{ name: "read", parameters: [{ name: "at", type: "int" }], returns: "string" }], complete: false },
    ),
  );
  const dump = dumpOf(types);
  expect(dump.format).toBe(2);
  expect(dump.unnamed.map((one) => one.name)).toEqual(["Tag"]);
  const [module] = dump.modules;
  expect(module.uri).toBe("My.Types");
  const [gauge] = module.types;
  expect(gauge).toMatchObject({ name: "Gauge", base: "Item", baseModule: "QtQuick", attached: "Tag", defaultProperty: "value", creatable: true });
  expect(gauge.properties[0]).toMatchObject({ name: "value", type: "double", notify: "valueChanged" });
  expect(gauge.methods[0]).toMatchObject({ returnType: "QString", parameters: [{ name: "at", type: "int" }] });
});

test("a method with nothing to return returns void", () => {
  const types = typesOf(lines(type("One"), { impl: "One", signals: [], methods: [{ name: "go", parameters: [], returns: null }], complete: false }));
  expect(dumpOf(types).modules[0].types[0].methods[0].returnType).toBe("void");
});

test("a non-visual face loads no visual runtime and a visual one does", () => {
  const plain = type("Plain", { signals: [], methods: [] });
  const drawn = type("Drawn", { base: "Item", signals: [], methods: [] });
  expect(faceSource(plain, [plain], "app")).not.toContain("ljos-web/web/visual");
  expect(faceSource(drawn, [drawn], "app")).toContain("ljos-web/web/visual");
});

test("an attached type without a derive says which", () => {
  const one = type("One", { attached: "Gone", signals: [], methods: [] });
  expect(() => faceSource(one, [one], "app")).toThrow(FaceError);
});
