//! The types a program registers from Rust as its `ljostypes.json` describes
//! them (ljos-web requests 11 and 22): a type a dump describes stands in as
//! `ljos run --types` makes it, and is checked as any type is. The fixtures
//! are in `fixtures/types`.

use std::{
    collections::BTreeMap,
    path::Path,
    process::{Command, Output},
};

use ljos_web::given::{self, Diagnostic, Request};

/// `qmlc` run with `args` from the fixtures' directory.
fn qmlc(args: &[&str]) -> Output {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/types");
    Command::new(env!("CARGO_BIN_EXE_qmlc")).args(args).current_dir(fixtures).output().expect("qmlc runs")
}

fn compiled(args: &[&str]) -> String {
    let output = qmlc(args);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "qmlc {args:?} failed:\n{stderr}");
    String::from_utf8(output.stdout).expect("UTF-8 output")
}

fn refused(args: &[&str]) -> String {
    let output = qmlc(args);
    assert!(!output.status.success(), "qmlc {args:?} compiled what it should not have");
    assert!(output.stdout.is_empty(), "qmlc {args:?} printed a module it refused");
    String::from_utf8(output.stderr).expect("UTF-8 messages")
}

#[track_caller]
fn assert_contains(haystack: &str, needle: &str) {
    assert!(haystack.contains(needle), "expected to find\n  {needle}\nin\n{haystack}");
}

#[test]
fn a_type_a_dump_describes_compiles_with_its_properties_signals_and_methods() {
    let code = compiled(&["--root", "app", "--types", "app/native/ljostypes.json", "app/Main.qml"]);
    assert_contains(&code, r#"import Player from "./.ljostypes/App/Media/Player.qml";"#);
    assert_contains(&code, "volume: 3");
    // Its stand-in holds what it is given, has its signals and enums, and
    // its methods do nothing.
    let stand_in = compiled(&["--root", "app", "--types", "app/native/ljostypes.json", "app/.ljostypes/App/Media/Player.qml"]);
    assert_contains(&stand_in, r#"import { QtObject } from "ljos-web/QtQml";"#);
    assert_contains(&stand_in, "volume: $int");
    assert_contains(&stand_in, r#"signals: ["finished"]"#);
    assert_contains(&stand_in, "seek: function seek(position) {}");
    assert_contains(&stand_in, "Playing: 1");
}

#[test]
fn a_member_the_dump_does_not_describe_is_an_error() {
    let said = refused(&["--root", "app", "--types", "app/native/ljostypes.json", "app/Unknown.qml"]);
    assert_contains(&said, "app/Unknown.qml:6:9: `volum` is not a property of `Player`");
    let said = refused(&["--root", "app", "--types", "app/native/ljostypes.json", "app/UnknownSignal.qml"]);
    assert_contains(&said, "`onFinishd` handles the signal `finishd`, which `Player` does not have");
}

#[test]
fn a_type_no_dump_is_given_for_is_not_installed() {
    let said = refused(&["--root", "app", "app/Main.qml"]);
    assert_contains(&said, r#"module "App.Media" is not installed"#);
}

#[test]
fn several_dumps_are_read_as_one() {
    // `Meter` of the one is built on `Player` of the other.
    let args = ["--root", "app", "--types", "app/native/ljostypes.json", "--types", "app/sensors/ljostypes.json"];
    let code = compiled(&[&args[..], &["app/Both.qml"]].concat());
    assert_contains(&code, r#"import Meter from "./.ljostypes/App/Sensors/Meter.qml";"#);
    let meter = compiled(&[&args[..], &["app/.ljostypes/App/Sensors/Meter.qml"]].concat());
    assert_contains(&meter, r#"import Player from "../Media/Player.qml";"#);
}

#[test]
fn a_module_of_the_project_comes_before_a_dump() {
    let code = compiled(&["--root", "app", "-I", "app/mocks", "--types", "app/native/ljostypes.json", "app/Main.qml"]);
    assert_contains(&code, r#"import Player from "./mocks/App/Media/Player.qml";"#);
}

#[test]
fn a_dump_that_does_not_read_is_an_error_naming_it() {
    let said = refused(&["--types", "broken/ljostypes.json", "broken/Main.qml"]);
    assert_contains(&said, "broken/ljostypes.json:2:1: EOF while parsing a list");
}

#[test]
fn the_listing_of_qt_s_types_is_still_asked_by_uri() {
    let listed = compiled(&["--types", "QtQuick"]);
    assert!(listed.starts_with("QtQuick "), "{listed}");
}

const PLAYER: &str = r#"{"format": 2, "modules": [{"uri": "App.Media", "versions": ["1.0"], "types": [
  {"name": "Player", "since": "1.0", "base": "QtObject", "baseModule": "QtQml", "creatable": true,
   "defaultProperty": null, "attached": null,
   "properties": [{"name": "volume", "type": "int", "kind": "value", "readonly": false, "final": true,
     "required": false, "constant": false, "group": false, "notify": "volumeChanged"}],
   "signals": [], "methods": []}]}]}"#;

const MAIN: &str = "import QtQuick\nimport App.Media\nItem {\n    Player { volume: 3 }\n}\n";

fn given(files: &[(&str, &str)], types: Option<Vec<String>>) -> Result<given::Compiled, Vec<Diagnostic>> {
    let files: BTreeMap<String, String> = files.iter().map(|(path, text)| (path.to_string(), text.to_string())).collect();
    given::compile(&Request { files, entry: "Main.qml".into(), types, ..Request::default() })
}

#[test]
fn a_page_finds_the_project_s_dumps_by_their_name() {
    let compiled = given(&[("Main.qml", MAIN), ("native/ljostypes.json", PLAYER)], None).expect("compiles");
    let files: Vec<&str> = compiled.modules.iter().map(|module| module.file.as_str()).collect();
    assert_eq!(files, ["Main.qml", ".ljostypes/App/Media/Player.qml"]);
}

#[test]
fn a_page_takes_the_dumps_it_is_given() {
    let found = given(&[("Main.qml", MAIN), ("native/player.json", PLAYER)], Some(vec!["native/player.json".into()]));
    assert!(found.is_ok(), "{:?}", found.err());
    let none = given(&[("Main.qml", MAIN), ("native/ljostypes.json", PLAYER)], Some(Vec::new()));
    assert!(none.is_err(), "a dump not given is not read");
}

#[test]
fn a_page_s_dump_that_does_not_read_is_the_answer() {
    let diagnostics = given(&[("Main.qml", MAIN), ("native/ljostypes.json", "{\"format\": 2, \"modules\": [\n")], None)
        .expect_err("refused");
    assert_eq!(
        diagnostics,
        [Diagnostic {
            file: Some("native/ljostypes.json".into()),
            line: Some(2),
            column: Some(1),
            message: "EOF while parsing a list".into(),
        }]
    );
}
