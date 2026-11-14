//! The Ljós dialect, compiled for the page as `ljos check` reads it: no `Qt`
//! in a file of Ljós's API, what `Ljos.Core` gives in its place, `match` and
//! `|>`, and `.lts` and `.ts` modules. Each test is a scenario of ljos-ui's
//! `features/language/` with its inputs, and what it says is what
//! `ljos check` prints there: the same words at the same line and column.

use std::collections::BTreeMap;

use ljos_web::given::{Compiled, Diagnostic, Request, compile};

/// A file as ljos-ui's feature runner gives it: the doc string's own
/// indentation kept, which is what its lines and columns count.
fn given(text: &str) -> String {
    text.lines()
        .map(|line| {
            if line.is_empty() {
                String::new()
            } else {
                format!("        {line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
        + "\n"
}

/// A file given "without its indentation".
fn bare(text: &str) -> String {
    format!("{text}\n")
}

fn project(files: &[(&str, String)], entry: &str) -> Result<Compiled, Vec<Diagnostic>> {
    let files: BTreeMap<String, String> = files
        .iter()
        .map(|(name, text)| (name.to_string(), text.clone()))
        .collect();
    compile(&Request {
        files,
        entry: entry.into(),
        ..Request::default()
    })
}

/// Each diagnostic as `ljos check` prints it.
fn printed(diagnostics: &[Diagnostic]) -> Vec<String> {
    diagnostics
        .iter()
        .map(|diagnostic| {
            let code = diagnostic
                .code
                .as_deref()
                .map(|code| format!(" [{code}]"))
                .unwrap_or_default();
            format!(
                "{}:{}:{}: error: {}{code}",
                diagnostic.file.as_deref().unwrap_or(""),
                diagnostic.line.unwrap_or(0),
                diagnostic.column.unwrap_or(0),
                diagnostic.message
            )
        })
        .collect()
}

#[track_caller]
fn checked(files: &[(&str, String)], entry: &str) -> Vec<String> {
    match project(files, entry) {
        Ok(compiled) => panic!("expected errors, compiled:\n{}", compiled.modules[0].code),
        Err(diagnostics) => printed(&diagnostics),
    }
}

#[track_caller]
fn code_of(files: &[(&str, String)], entry: &str, file: &str) -> String {
    let compiled =
        project(files, entry).unwrap_or_else(|diagnostics| panic!("{:#?}", printed(&diagnostics)));
    compiled
        .modules
        .iter()
        .find(|module| module.file == file)
        .unwrap_or_else(|| panic!("{file} is compiled with {entry}"))
        .code
        .clone()
}

#[track_caller]
fn assert_contains(haystack: &str, needle: &str) {
    assert!(
        haystack.contains(needle),
        "expected to find\n  {needle}\nin\n{haystack}"
    );
}

#[track_caller]
fn assert_lacks(haystack: &str, needle: &str) {
    assert!(
        !haystack.contains(needle),
        "expected not to find\n  {needle}\nin\n{haystack}"
    );
}

// features/language/no-qt-global.feature

#[test]
fn qt_in_a_file_of_ljos_api_is_an_error_that_names_the_members_home() {
    let main = given(
        r#"import Ljos.Ui
import Ljos.Core
Item {
  property int align: Qt.AlignLeft
  property int calls: 0
  function tick(): void { Qt.callLater(() => calls += 1) }
  function make(): void { Qt.createComponent("Page.qml") }
}"#,
    );
    assert_eq!(
        checked(&[("Main.qml", main)], "Main.qml"),
        [
            "Main.qml:4:31: error: `Qt.AlignLeft` is not in a Ljós file: use `Align.Left` (Ljos.Ui) [qt-global]",
            "Main.qml:6:35: error: `Qt.callLater` is not in a Ljós file: use `later` (Ljos.Core) [qt-global]",
            "Main.qml:7:35: error: `Qt.createComponent` is not in a Ljós file, and Ljós's API has no home for it yet: write the file in Qt's QML [qt-global]",
        ]
    );
}

#[test]
fn a_file_of_ljos_api_whose_scripts_are_javascript_has_no_qt_either() {
    let loose = given(
        r#"pragma Scripts: JavaScript
import Ljos.Ui
Item {
  property string os: Qt.platform.os
}"#,
    );
    assert_eq!(
        checked(&[("Loose.qml", loose)], "Loose.qml"),
        [
            "Loose.qml:4:31: error: `Qt.platform` is not in a Ljós file: use `App.platform` (Ljos.Core) [qt-global]"
        ]
    );
}

#[test]
fn qt_alone_in_a_file_of_ljos_api_names_where_its_members_went() {
    let main = given(
        r#"import Ljos.Ui
Item {
  property var all: Qt
}"#,
    );
    assert_eq!(
        checked(&[("Main.qml", main)], "Main.qml"),
        [
            "Main.qml:3:29: error: `Qt` is not in a Ljós file: each of its members has a home in Ljos.Core or Ljos.Ui [qt-global]"
        ]
    );
}

#[test]
fn the_error_spans_the_name_qt() {
    let main = given(
        r#"import Ljos.Ui
Item {
  property int align: Qt.AlignLeft
}"#,
    );
    let diagnostics = project(&[("Main.qml", main)], "Main.qml").unwrap_err();
    let diagnostic = &diagnostics[0];
    assert_eq!(
        (
            diagnostic.line,
            diagnostic.column,
            diagnostic.end_line,
            diagnostic.end_column
        ),
        (Some(3), Some(31), Some(3), Some(33))
    );
}

#[test]
fn a_file_in_qts_qml_keeps_qt() {
    let panel = given(
        r#"import QtQuick
Item {
  property int align: Qt.AlignLeft
  property string os: Qt.platform.os
}"#,
    );
    let code = code_of(&[("Panel.qml", panel)], "Panel.qml", "Panel.qml");
    assert_contains(&code, r#"import { Qt } from "ljos-web/QtQml";"#);
}

// What Ljos.Core gives (docs/DIALECT.md §4.3), from its module of the page.

#[test]
fn what_ljos_core_gives_is_imported_from_its_module() {
    let main = given(
        r#"import Ljos.Ui
import Ljos.Core
Item {
  property color c: rgba(0.8, 0.4, 0.2, 1)
  property color dark: Color.of(c).darker(2)
  property string named: App.name
  property int base: 3; property int twice: 0
  Component.onCompleted: {
    twice = bind(() => base * 2)
    later(() => App.language = "is_IS")
  }
}"#,
    );
    let code = code_of(&[("Main.qml", main)], "Main.qml", "Main.qml");
    assert_contains(
        &code,
        r#"import { App, Color, bind, later, rgba } from "ljos-web/Ljos/Core";"#,
    );
    assert_lacks(&code, "ljos-web/QtQml");
}

#[test]
fn a_property_of_the_name_of_a_core_global_is_the_propertys() {
    let main = given(
        r#"import Ljos.Ui
import Ljos.Core
Item {
  property real size: 2
  property real twice: size * 2
}"#,
    );
    let code = code_of(&[("Main.qml", main)], "Main.qml", "Main.qml");
    assert_lacks(&code, "ljos-web/Ljos/Core");
}

#[test]
fn a_file_that_does_not_import_ljos_core_has_none_of_it() {
    let main = given(
        r#"import Ljos.Ui
Item {
  property color c: rgba(0.8, 0.4, 0.2, 1)
}"#,
    );
    assert_eq!(
        checked(&[("Main.qml", main)], "Main.qml"),
        ["Main.qml:3:29: error: `rgba` has no type: it is not in scope [ts-no-any]"]
    );
}

// features/language/pipe.feature

#[test]
fn a_pipe_compiles_to_its_steps() {
    let main = given(
        r#"import Ljos.Ui
Item {
  id: root; objectName: "root"
  property real oldPrice: 40
  property real newPrice: 30
  readonly property real discountPercent:
    oldPrice - newPrice |> Math.max(%, 0) / oldPrice * 100 |> Math.round(%)
}"#,
    );
    let code = code_of(&[("Main.qml", main)], "Main.qml", "Main.qml");
    assert_lacks(&code, "|>");
    assert_contains(&code, "Math.round(");
}

#[test]
fn a_body_that_does_not_use_the_topic_is_an_error_that_says_so() {
    let card = given(
        r#"import Ljos.Ui
Item {
  property real n: 2
  readonly property real a: n |> 1
  readonly property real b: n |> % + 1 |> 2
  readonly property real c: % + 1
  function d(): number { return n |> (() => 1)() }
}"#,
    );
    assert_eq!(
        checked(&[("Card.qml", card)], "Card.qml"),
        [
            "Card.qml:4:42: error: the pipe's body does not use its topic `%` [syntax]",
            "Card.qml:5:51: error: the pipe's body does not use its topic `%` [syntax]",
            "Card.qml:6:37: error: `%` is the topic of a pipe's body, and there is no pipe here: write it after `|>`, as in `x |> f(%)` [syntax]",
            "Card.qml:7:46: error: the pipe's body does not use its topic `%` [syntax]",
        ]
    );
}

#[test]
fn a_body_that_is_an_arrow_a_conditional_an_assignment_or_a_yield_needs_parentheses() {
    let card = given(
        r#"import Ljos.Ui
Item {
  property real n: 2
  readonly property unknown a: n |> () => %
  readonly property real b: n |> % > 1 ? % : 0
  function c(): void { n |> n = % }
  function* d(): Generator<number, void, number> { n |> yield % }
}"#,
    );
    assert_eq!(
        checked(&[("Card.qml", card)], "Card.qml"),
        [
            "Card.qml:4:45: error: an arrow function as a pipe's body is written in parentheses: `|> (() => %)` [syntax]",
            "Card.qml:5:42: error: a conditional as a pipe's body is written in parentheses: `|> (% > 0 ? % : 0)` [syntax]",
            "Card.qml:6:37: error: an assignment as a pipe's body is written in parentheses: `|> (total = %)` [syntax]",
            "Card.qml:7:65: error: a `yield` as a pipe's body is written in parentheses: `|> (yield %)` [syntax]",
        ]
    );
}

// features/language/match.feature

#[test]
fn a_match_compiles_with_the_helpers_it_is_lowered_to() {
    let main = given(
        r#"import QtQuick
Item {
  id: root; objectName: "root"
  property int minutes: 75
  readonly property string span: match (minutes) {
    when if (minutes < 60): "minutes";
    when if (minutes < 1440): "hours";
    default: "days";
  }
  property int code: 304
  property var pick: (n) => n > 300
  readonly property string kind: match (code) {
    when 200: "ok";
    when 301 or 304: "moved";
    when pick: "picked";
  }
}"#,
    );
    let code = code_of(&[("Main.qml", main)], "Main.qml", "Main.qml");
    assert_lacks(&code, "when ");
    // A match with no default throws when nothing matches, and a name in
    // a pattern is compared, or asked: the runtime's helpers, by import.
    assert_contains(
        &code,
        r#"import { $is, $nomatch } from "ljos-web/compiler/sugar";"#,
    );
}

#[test]
fn an_extractor_a_relational_pattern_and_a_sticky_expression_are_errors() {
    let gauge = given(
        r#"import Ljos.Ui
Item {
  property real level: 0
  readonly property int b: match (level) { when Some(let x): 1; default: 0; }
  readonly property int c: match (level) { when < 10: 1; default: 0; }
  readonly property bool d: "x" is /x/g
}"#,
    );
    assert_eq!(
        checked(&[("Gauge.qml", gauge)], "Gauge.qml"),
        [
            "Gauge.qml:4:57: error: an extractor is not in Ljós's `match`: test the value with a predicate, as in `when let x and isSome:` [syntax]",
            "Gauge.qml:5:57: error: a relational pattern is not in the proposal: write a guard, as in `when let n and if (n < 10):` [syntax]",
            "Gauge.qml:6:44: error: a regular expression with the `g` or `y` flag keeps its place between tests: leave the flag out [syntax]",
        ]
    );
}

#[test]
fn and_and_or_mixed_need_parentheses() {
    let gauge = given(
        r#"import Ljos.Ui
Item {
  property real level: 0
  readonly property int a: match (level) { when 1 and 2 or 3: 1; default: 0; }
}"#,
    );
    assert_eq!(
        checked(&[("Gauge.qml", gauge)], "Gauge.qml"),
        [
            "Gauge.qml:4:65: error: `and` and `or` mixed need parentheses, as in `(a and b) or c` [syntax]"
        ]
    );
}

// features/language/lts-modules.feature

const SIZE: &str = r#"export type Size = "small" | "large"
export function margin(size: Size): number {
  return match (size) {
    when "small": 4;
    when "large": 12;
  }
}"#;

#[test]
fn an_lts_module_with_a_match_compiles() {
    let pad = given(
        r#"import Ljos.Ui
import "size.lts" as Size
Item {
  objectName: "root"
  property real gap: Size.margin("large")
}"#,
    );
    let files = [("Main.qml", pad), ("size.lts", given(SIZE))];
    let main = code_of(&files, "Main.qml", "Main.qml");
    assert_contains(&main, r#"import * as Size from "./size.lts";"#);
    let size = code_of(&files, "Main.qml", "size.lts");
    assert_contains(&size, "export function margin(size) {");
    assert_lacks(&size, "type Size");
    assert_lacks(&size, ": number");
    assert_lacks(&size, "when ");
    assert_contains(
        &size,
        r#"import { $nomatch } from "ljos-web/compiler/sugar";"#,
    );
}

#[test]
fn a_pipe_in_an_lts_module_compiles() {
    let pad = given(
        r#"import Ljos.Ui
import "size.lts" as Size
Item {
  objectName: "root"
  property real gap: Size.half(24) |> % + 1
}"#,
    );
    let size = given(
        r#"export function half(n: number): number {
  return n |> % / 2
}"#,
    );
    let files = [("Main.qml", pad), ("size.lts", size)];
    let size = code_of(&files, "Main.qml", "size.lts");
    assert_lacks(&size, "|>");
    assert_contains(&size, "export function half(n) {");
}

#[test]
fn the_new_syntax_in_a_ts_module_is_an_error_that_names_the_rename() {
    let pad = given(
        r#"import Ljos.Ui
import "size.ts" as Size
Item {
  property real gap: Size.margin("large")
}"#,
    );
    assert_eq!(
        checked(&[("Pad.qml", pad), ("size.ts", bare(SIZE))], "Pad.qml"),
        [
            "size.ts:3:10: error: `match` is Ljós syntax, which stock TypeScript tools cannot read in a `.ts` file; rename `size.ts` to `size.lts` [ts-lts-syntax]"
        ]
    );
}

#[test]
fn a_pipe_in_a_ts_module_is_an_error_that_names_the_rename() {
    let pad = given(
        r#"import Ljos.Ui
import "size.ts" as Size
Item {
  property real gap: Size.half(8)
}"#,
    );
    let size = bare(
        r#"export function half(n: number): number {
  return n |> % / 2
}"#,
    );
    assert_eq!(
        checked(&[("Pad.qml", pad), ("size.ts", size)], "Pad.qml"),
        [
            "size.ts:2:12: error: `|>` is Ljós syntax, which stock TypeScript tools cannot read in a `.ts` file; rename `size.ts` to `size.lts` [ts-lts-syntax]"
        ]
    );
}

#[test]
fn the_rename_is_not_offered_when_an_lts_module_of_the_name_is_already_there() {
    let pad = given(
        r#"import Ljos.Ui
import "size.ts" as Size
Item {
  property real gap: Size.margin(true)
}"#,
    );
    let size = bare(
        r#"export function margin(big: boolean): number {
  return match (big) {
    when true: 12;
    when false: 4;
  }
}"#,
    );
    let taken = given("export const margin: number = 4");
    assert_eq!(
        checked(
            &[("Pad.qml", pad), ("size.ts", size), ("size.lts", taken)],
            "Pad.qml"
        ),
        [
            "size.ts:2:10: error: `match` is Ljós syntax, which stock TypeScript tools cannot read in a `.ts` file; it would be renamed to `size.lts`, but `size.lts` is in the way [ts-lts-syntax]"
        ]
    );
}

#[test]
fn ts_and_lts_modules_import_each_others_values_and_types() {
    let kinds = given(
        r#"export type Kind = "dot" | "dash"
export const fallback: Kind = "dot""#,
    );
    let width = given(
        r#"import { type Kind, fallback } from "./kinds.ts"
export type Width = 1 | 3
export function width(kind: Kind | undefined): Width {
  return match (kind ?? fallback) {
    when "dot": 1;
    when "dash": 3;
  }
}"#,
    );
    let line = given(
        r#"import { type Width, width } from "./width.lts"
export function total(): number {
  const thin: Width = width("dot")
  return thin + width("dash")
}"#,
    );
    let main = given(
        r#"import Ljos.Ui
import "line.ts" as Line
Item {
  objectName: "root"
  property real total: Line.total()
}"#,
    );
    let files = [
        ("Main.qml", main),
        ("kinds.ts", kinds),
        ("width.lts", width),
        ("line.ts", line),
    ];
    let compiled = project(&files, "Main.qml")
        .unwrap_or_else(|diagnostics| panic!("{:#?}", printed(&diagnostics)));
    let order: Vec<&str> = compiled
        .modules
        .iter()
        .map(|module| module.file.as_str())
        .collect();
    assert_eq!(order, ["Main.qml", "line.ts", "width.lts", "kinds.ts"]);
    let line = &compiled.modules[1].code;
    assert_contains(line, r#"import { width } from "./width.lts";"#);
    assert_contains(line, "const thin = width(\"dot\");");
    let width = &compiled.modules[2].code;
    assert_contains(width, r#"import { fallback } from "./kinds.ts";"#);
    let kinds = &compiled.modules[3].code;
    assert_contains(kinds, r#"export const fallback = "dot";"#);
    assert_lacks(kinds, "Kind");
}

#[test]
fn a_ts_module_that_does_not_erase_is_an_error_that_says_what_to_write() {
    let main = given(
        r#"import Ljos.Ui
import "mode.ts" as Mode
Item {
  property string mode: Mode.first
}"#,
    );
    let mode = bare(
        r#"export enum Mode { A, B }
export const first: string = "a"
export default first"#,
    );
    assert_eq!(
        checked(&[("Main.qml", main), ("mode.ts", mode)], "Main.qml"),
        [
            "mode.ts:1:8: error: an `enum` is not only a type, and does not erase: write a union of strings (`type Mode = \"a\" | \"b\"`) [ts-forbidden]",
            "mode.ts:3:1: error: a module gives its names, not a default: export it by name (`export function name`) [ts-forbidden]",
        ]
    );
}

#[test]
fn a_ts_module_imports_a_file_beside_it_by_its_path() {
    let main = given(
        r#"import Ljos.Ui
import "line.ts" as Line
Item {
  property real total: Line.total
}"#,
    );
    let line = bare(
        r#"import { half } from "size.ts"
export const total: number = half(8)"#,
    );
    assert_eq!(
        checked(&[("Main.qml", main), ("line.ts", line)], "Main.qml"),
        [
            "line.ts:1:22: error: `size.ts` is not a file beside the module: import a `.ts`, `.lts` or `.js` file by its path from here (`./size.ts`) [ts-forbidden]"
        ]
    );
}

#[test]
fn a_ts_module_is_typescript_in_a_qml_file_too() {
    let main = given(
        r#"import Ljos.Ui
Item {
  property int n: 2
  function twice(by: number): number { return n * by as number }
  property int four: twice(2)
}"#,
    );
    let code = code_of(&[("Main.qml", main)], "Main.qml", "Main.qml");
    assert_lacks(&code, ": number");
    assert_lacks(&code, " as number");
}

#[test]
fn a_module_calls_fetch_as_a_page_does() {
    let main = given(
        r#"import Ljos.Ui
import "net.lts" as Net
Item {
  function go() { Net.get("/x") }
}"#,
    );
    let net = given(
        r#"export async function get(u: string): Promise<number> {
  const r = await fetch(u, { headers: new Headers() });
  return r.status;
}"#,
    );
    let code = code_of(
        &[("Main.qml", main), ("net.lts", net)],
        "Main.qml",
        "net.lts",
    );
    assert_contains(&code, "await fetch(u, { headers: new Headers() });");
}

/// What `ljos check` says of a `.ts` module with a `match` and a fault
/// elsewhere: the desugar refuses the file, so it is read as it is, and
/// the parser stops at the `match`.
#[test]
fn a_ts_module_broken_beside_its_match_says_what_ljos_check_says() {
    let main = given(
        r#"import Ljos.Ui
import "s.ts" as S
Item {
  property real gap: S.f("big")
}"#,
    );
    let s = bare(
        r#"export function f(name: string): number {
  return match (name) { when "big": 2; default: 1 };
}
const x = ;"#,
    );
    assert_eq!(
        checked(&[("Main.qml", main), ("s.ts", s)], "Main.qml"),
        [
            "s.ts:2:22: error: Expected a semicolon or an implicit semicolon after a statement, but found none [syntax]"
        ]
    );
}

/// `qmlc` with `args`, in a directory of `files`.
fn qmlc(name: &str, files: &[(&str, &str)], args: &[&str]) -> std::process::Output {
    let place = std::path::Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = std::fs::remove_dir_all(&place);
    std::fs::create_dir_all(&place).unwrap();
    for (file, text) in files {
        std::fs::write(place.join(file), text).unwrap();
    }
    std::process::Command::new(env!("CARGO_BIN_EXE_qmlc"))
        .args(args)
        .current_dir(&place)
        .output()
        .expect("qmlc runs")
}

#[test]
fn qmlc_compiles_a_module_lists_what_it_imports_and_names_its_output() {
    let main = "import Ljos.Ui\nimport \"line.ts\" as Line\nItem {\n    property real total: Line.total()\n}\n";
    let line = "import { width } from \"./width.lts\"\nexport function total(): number {\n  return width(\"dot\") |> % + 1\n}\n";
    let width = "export function width(kind: string): number {\n  return match (kind) { when \"dot\": 1; when \"dash\": 3; }\n}\n";
    let files = [("Main.qml", main), ("line.ts", line), ("width.lts", width)];

    let printed = qmlc("qmlc-module", &files, &["width.lts"]);
    assert!(
        printed.status.success(),
        "{}",
        String::from_utf8_lossy(&printed.stderr)
    );
    let code = String::from_utf8(printed.stdout).unwrap();
    assert_contains(&code, "export function width(kind) {");
    assert_contains(
        &code,
        r#"import { $nomatch } from "ljos-web/compiler/sugar";"#,
    );

    let refused = qmlc("qmlc-module-ts", &files, &["line.ts"]);
    assert!(!refused.status.success());
    assert_contains(
        &String::from_utf8_lossy(&refused.stderr),
        "line.ts:3:23: `|>` is Ljós syntax",
    );

    let listed = qmlc(
        "qmlc-module-imports",
        &files,
        &["--imports", "width.lts", "line.ts"],
    );
    let listed: serde_json::Value = serde_json::from_slice(&listed.stdout).unwrap();
    assert_eq!(listed[0]["paths"], serde_json::json!([]));
    assert_eq!(listed[1]["paths"], serde_json::json!(["./width.lts"]));

    let out = std::path::Path::new(env!("CARGO_TARGET_TMPDIR")).join("qmlc-module-out");
    let written = qmlc(
        "qmlc-module-out",
        &files,
        &["--out-dir", "out", "Main.qml", "width.lts"],
    );
    assert!(
        written.status.success(),
        "{}",
        String::from_utf8_lossy(&written.stderr)
    );
    assert!(out.join("out/Main.qml.js").is_file());
    assert!(out.join("out/width.lts.js").is_file());
}

/// A name imported only as a type and exported again is a type there too:
/// the export gives nothing, as TypeScript's does.
#[test]
fn a_module_exports_again_a_type_it_imports_and_gives_nothing_of_it() {
    let main = given(
        r#"import Ljos.Ui
import "shapes.ts" as Shapes
Item {
  property string kind: Shapes.fallback
}"#,
    );
    let kinds = bare(
        r#"export type Kind = "dot" | "dash"
export const fallback: Kind = "dot""#,
    );
    let shapes = bare(
        r#"import type { Kind } from "./kinds.ts"
import { type Kind as Other, fallback } from "./kinds.ts"
export { Kind, Other, fallback }"#,
    );
    let code = code_of(
        &[
            ("Main.qml", main),
            ("kinds.ts", kinds),
            ("shapes.ts", shapes),
        ],
        "Main.qml",
        "shapes.ts",
    );
    assert_contains(&code, "export { fallback };");
    assert_lacks(&code, "Kind");
    assert_lacks(&code, "Other");
}

/// Erasing a type-only name from an import or an export list moves nothing
/// after it: an error further on is where the file has it.
#[test]
fn an_error_after_an_erased_type_import_is_at_its_own_line_and_column() {
    let main = given(
        r#"import Ljos.Ui
import "shapes.ts" as Shapes
Item {
  property real x: Shapes.x
}"#,
    );
    let kinds = bare(
        r#"export type Kind = "dot" | "dash"
export const fallback: Kind = "dot""#,
    );
    let shapes = bare(
        r#"import { type Kind,
  fallback } from "./kinds.ts"
export { type Kind, fallback } from "./kinds.ts"
export const x: number = missing"#,
    );
    assert_eq!(
        checked(
            &[
                ("Main.qml", main),
                ("kinds.ts", kinds),
                ("shapes.ts", shapes)
            ],
            "Main.qml"
        ),
        ["shapes.ts:4:26: error: `missing` has no type: it is not in scope [ts-no-any]"]
    );
}

/// TypeScript lets an arrow's return type run over lines; JavaScript wants
/// `=>` on the line of its parameters, so erasing the type puts it there.
#[test]
fn an_arrow_whose_return_type_runs_over_lines_compiles() {
    let main = given(
        r#"import Ljos.Ui
import "pick.ts" as Pick
Item {
  property real two: Pick.twice(1)
}"#,
    );
    let pick = bare(
        r#"export const twice = (n: number):
  | number
  | undefined => n * 2"#,
    );
    let code = code_of(
        &[("Main.qml", main), ("pick.ts", pick)],
        "Main.qml",
        "pick.ts",
    );
    assert_contains(&code, "export const twice = (n) => n * 2;");
}
