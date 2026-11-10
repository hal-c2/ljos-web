//! Where `qmlc` finds the module a file imports: the `qmldir` at the
//! module's place under an import path, the first to have one, as Qt finds
//! it. The fixtures are in `fixtures/modules`.

use std::{
    path::Path,
    process::{Command, Output},
};

/// `qmlc` run with `args` from the fixtures' directory.
fn qmlc(args: &[&str]) -> Output {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/modules");
    Command::new(env!("CARGO_BIN_EXE_qmlc"))
        .args(args)
        .current_dir(fixtures)
        .output()
        .expect("qmlc runs")
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
    assert!(
        !output.status.success(),
        "qmlc {args:?} compiled what it should not have"
    );
    String::from_utf8(output.stderr).expect("UTF-8 messages")
}

#[track_caller]
fn assert_contains(haystack: &str, needle: &str) {
    assert!(
        haystack.contains(needle),
        "expected to find\n  {needle}\nin\n{haystack}"
    );
}

#[test]
fn a_module_is_the_qmldir_at_its_place_under_the_root() {
    // `mocks/App/Media/qmldir` says `module App.Media` too, but under the
    // root it is in the place of `mocks.App.Media`.
    let code = compiled(&["--root", "twice", "twice/Main.qml"]);
    assert_contains(&code, r#"import Player from "./App/Media/Player.qml";"#);
    // The root is where the file is when nothing says otherwise.
    let code = compiled(&["twice/Main.qml"]);
    assert_contains(&code, r#"import Player from "./App/Media/Player.qml";"#);
}

#[test]
fn an_import_path_given_comes_before_the_root() {
    let code = compiled(&["--root", "twice", "-I", "twice/mocks", "twice/Main.qml"]);
    assert_contains(
        &code,
        r#"import Player from "./mocks/App/Media/Player.qml";"#,
    );
    let code = compiled(&[
        "--root",
        "twice",
        "--import-path",
        "twice/mocks",
        "twice/Main.qml",
    ]);
    assert_contains(
        &code,
        r#"import Player from "./mocks/App/Media/Player.qml";"#,
    );
}

#[test]
fn of_the_import_paths_given_the_first_with_the_module_has_it() {
    let code = compiled(&[
        "--root",
        "twice",
        "-I",
        "twice/stubs",
        "-I",
        "twice/mocks",
        "twice/Main.qml",
    ]);
    assert_contains(
        &code,
        r#"import Player from "./stubs/App/Media/Player.qml";"#,
    );
    let code = compiled(&[
        "--root",
        "twice",
        "-I",
        "twice/mocks",
        "-I",
        "twice/stubs",
        "twice/Main.qml",
    ]);
    assert_contains(
        &code,
        r#"import Player from "./mocks/App/Media/Player.qml";"#,
    );
}

#[test]
fn a_qmldir_out_of_its_modules_place_declares_nothing() {
    // `Widgets/qmldir` says `module Gadgets`: Qt would look for it in
    // `Gadgets/qmldir`, and finds none.
    let messages = refused(&["--root", "misplaced", "misplaced/Main.qml"]);
    assert_contains(&messages, "Widgets/qmldir");
    assert_contains(&messages, "`Gadgets`");
    assert_contains(
        &messages,
        "misplaced/Main.qml:2:1: module \"Gadgets\" is not installed",
    );
}

#[test]
fn a_module_of_the_project_imported_as_a_name_is_its_files() {
    let code = compiled(&["--root", "qualified", "qualified/Main.qml"]);
    assert_contains(&code, "/Media/Player.qml\"");
    assert_contains(&code, "$namespace");
    assert!(
        !code.contains("ljos-web/App/Media"),
        "no such module of the package:\n{code}"
    );
    // Two of the project's own modules under names share the one
    // `$namespace` import: declared twice, the file is not JavaScript a
    // browser will load, and `qmlc` says nothing of it.
    let code = compiled(&["--root", "qualified-two", "qualified-two/Main.qml"]);
    assert_contains(&code, "/Media/Player.qml\"");
    assert_contains(&code, "/Audio/Speaker.qml\"");
    let imports = code.matches("import { $namespace }").count();
    assert_eq!(imports, 1, "`$namespace` imported {imports} times:\n{code}");
    let place = Path::new(env!("CARGO_TARGET_TMPDIR")).join("qualified-two.mjs");
    std::fs::write(&place, &code).expect("the compiled file written out");
    let checked = Command::new("node")
        .args(["--check", place.to_str().expect("a Node path")])
        .output()
        .expect("Node runs (mise.toml installs it)");
    let stderr = String::from_utf8_lossy(&checked.stderr);
    assert!(
        checked.status.success(),
        "node --check refused the compiled file:\n{stderr}\n{code}"
    );
}

#[test]
fn a_block_line_of_a_qmldir_declares_its_type() {
    // Ljós's `# block Name Version File` is a comment to Qt and a type of
    // the module to Ljós (ADR 0003).
    let code = compiled(&["--root", "blocks", "blocks/Main.qml"]);
    assert_contains(&code, r#"import Player from "./App/Media/Player.qml";"#);
}

#[test]
fn an_import_of_a_module_nobody_has_is_an_error_where_it_is_written() {
    let messages = refused(&["--root", "unknown", "unknown/Main.qml"]);
    assert_contains(
        &messages,
        "unknown/Main.qml:2:1: module \"No.Such.Module\" is not installed",
    );
}

#[test]
fn the_modules_of_qt_the_runtime_and_the_stand_ins_are_installed() {
    // A style of Qt's, a module the runtime has and Qt's table does not
    // (`Qt.labs.settings`), and a stand-in for C++.
    let code = compiled(&[
        "--root",
        "provided",
        "--with",
        "provided/standins",
        "provided/Main.qml",
    ]);
    assert_contains(&code, r#"from "ljos-web/QtQuick/Controls/Basic""#);
    assert_contains(
        &code,
        r#"import Backend from "./standins/Backend/Backend.qml";"#,
    );
}

/// `qmlc` on `unknown/Main.qml` with a `PATH` of only the tools written
/// here, each a script answering `QT_VERSION` with `version` and
/// `QT_INSTALL_QML` with a directory that has `No.Such.Module`.
#[cfg(unix)]
fn with_tools(name: &str, tools: &[(&str, &str)]) -> Output {
    use std::os::unix::fs::PermissionsExt;
    let place = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = std::fs::remove_dir_all(&place);
    let module = place.join("qml/No/Such/Module");
    std::fs::create_dir_all(&module).expect("a module directory");
    std::fs::write(
        module.join("qmldir"),
        "module No.Such.Module\nThing 1.0 Thing.qml\n",
    )
    .expect("a qmldir");
    std::fs::write(module.join("Thing.qml"), "import QtQuick\nItem { }\n").expect("a type");
    let bin = place.join("bin");
    std::fs::create_dir_all(&bin).expect("a bin directory");
    let qml = place.join("qml");
    for (tool, version) in tools {
        let script = bin.join(tool);
        std::fs::write(
            &script,
            format!("#!/bin/sh\ncase \"$2\" in\n  QT_VERSION) echo {version} ;;\n  QT_INSTALL_QML) echo {} ;;\n  *) exit 1 ;;\nesac\n", qml.display()),
        )
        .expect("a tool");
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755))
            .expect("an executable tool");
    }
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/modules");
    Command::new(env!("CARGO_BIN_EXE_qmlc"))
        .args(["--root", "unknown", "unknown/Main.qml"])
        .current_dir(fixtures)
        .env("PATH", &bin)
        .env_remove("QT_INSTALL_QML")
        .env_remove("QML_IMPORT_PATH")
        .output()
        .expect("qmlc runs")
}

#[cfg(unix)]
#[test]
fn a_qt_5_on_the_path_is_not_taken_for_the_installed_qt() {
    // Qt 5's tools name a QML directory too, of QML a Qt 6 does not read.
    let output = with_tools("qt5", &[("qtpaths", "5.15.2"), ("qmake", "5.15.2")]);
    assert!(!output.status.success(), "qmlc took Qt 5's modules");
    assert_contains(
        &String::from_utf8_lossy(&output.stderr),
        "module \"No.Such.Module\" is not installed",
    );
    // A Qt 6 is found past it, whichever of its tools there is.
    let output = with_tools("qt6", &[("qtpaths", "5.15.2"), ("qmake6", "6.11.2")]);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        output.status.success(),
        "qmlc did not find Qt 6's modules:\n{stderr}"
    );
}
