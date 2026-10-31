//! Which modules a file may import: those of the project, of Qt, of the
//! runtime and of the stand-ins. The fixtures are in `fixtures/modules`.

use std::{
    path::Path,
    process::{Command, Output},
};

/// `qmlc` run with `args` from the fixtures' directory.
fn qmlc(args: &[&str]) -> Output {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/modules");
    Command::new(env!("CARGO_BIN_EXE_qmlc")).args(args).current_dir(fixtures).output().expect("qmlc runs")
}

/// What `qmlc` printed for a file it compiled.
fn compiled(args: &[&str]) -> String {
    let output = qmlc(args);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "qmlc {args:?} failed:\n{stderr}");
    String::from_utf8(output.stdout).expect("UTF-8 output")
}

/// What `qmlc` said of a file it did not compile.
fn refused(args: &[&str]) -> String {
    let output = qmlc(args);
    assert!(!output.status.success(), "qmlc {args:?} compiled what it should not have");
    String::from_utf8(output.stderr).expect("UTF-8 messages")
}

#[track_caller]
fn assert_contains(haystack: &str, needle: &str) {
    assert!(haystack.contains(needle), "expected to find\n  {needle}\nin\n{haystack}");
}

#[test]
fn an_import_of_a_module_nobody_has_is_an_error_where_it_is_written() {
    let messages = refused(&["--root", "unknown", "unknown/Main.qml"]);
    assert_contains(&messages, "unknown/Main.qml:2:1: module \"No.Such.Module\" is not installed");
}

#[test]
fn the_modules_of_qt_the_runtime_and_the_stand_ins_are_installed() {
    // A style of Qt's, a module the runtime has and Qt's table does not
    // (`Qt.labs.settings`), and a stand-in for C++.
    let code = compiled(&["--root", "provided", "--with", "provided/standins", "provided/Main.qml"]);
    assert_contains(&code, r#"from "ljos-web/QtQuick/Controls/Basic""#);
    assert_contains(&code, r#"import Backend from "./standins/Backend/Backend.qml";"#);
}
