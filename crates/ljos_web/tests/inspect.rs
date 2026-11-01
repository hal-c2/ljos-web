//! `--inspect`: a file that says where its objects, its bindings and its
//! `console` calls are written, for an inspector to answer with. Without it a
//! file says none of that, so that a page built for use pays nothing.

use ljos_web::{Options, Project, compile, lowered_source};

const SOURCE: &str = r#"import QtQuick
import QtQuick.Templates as T
Item {
    id: root
    width: height
    property int n: width
    T.Button { id: go; onClicked: console.log("hi", root.n) }
    Rectangle { color: parent ? "red" : "blue"; border.width: 1 }
    function quiet() { const console = { log() {} }; console.log("no") }
}"#;

fn lowered(source: &str, inspect: Option<&str>) -> String {
    let mut project = Project::new();
    project
        .add("Sample", source)
        .unwrap_or_else(|errors| panic!("{errors:?}"));
    let options = Options {
        name: "Sample".to_string(),
        project: Some(project),
        inspect: inspect.map(str::to_string),
        ..Options::default()
    };
    // What lowers is what Solid takes.
    let lowered = lowered_source(source, &options).unwrap_or_else(|errors| panic!("{errors:?}"));
    compile(source, &options).unwrap_or_else(|errors| panic!("{errors:?}"));
    lowered
}

/// Whatever the printer breaks across lines.
fn flat(code: &str) -> String {
    code.chars().filter(|c| !c.is_whitespace()).collect()
}

#[track_caller]
fn assert_contains(haystack: &str, needle: &str) {
    assert!(
        flat(haystack).contains(&flat(needle)),
        "expected to find\n  {needle}\nin\n{haystack}"
    );
}

#[test]
fn a_file_compiled_for_use_says_nothing_of_where_it_is_written() {
    let code = lowered(SOURCE, None);
    for said in [
        "$at",
        "$id=",
        "$ids",
        "$bound",
        "$console",
        "ljos-web/inspect",
    ] {
        assert!(!code.contains(said), "{said} in\n{code}");
    }
}

#[test]
fn an_object_says_where_it_is_written_as_what_and_its_id() {
    let code = lowered(SOURCE, Some("app/Sample.qml"));
    assert_contains(&code, r#"$at={["app/Sample.qml", 3, 1, "Item"]}"#);
    assert_contains(&code, r#"$id="root""#);
    // A type is its own name, whatever its module is imported as.
    assert_contains(&code, r#"$at={["app/Sample.qml", 7, 5, "Button"]}"#);
    assert_contains(&code, r#"$id="go""#);
    assert_contains(&code, r#"$at={["app/Sample.qml", 8, 5, "Rectangle"]}"#);
    // The root says the ids of its file, for them to be found by.
    assert_contains(&code, "$ids={() => ({ root, go })}");
}

#[test]
fn a_binding_says_the_line_and_column_of_its_name() {
    let code = lowered(SOURCE, Some("app/Sample.qml"));
    assert_contains(
        &code,
        r#"width={$bound(["app/Sample.qml", 5, 5], () => root.height)}"#,
    );
    assert_contains(
        &code,
        r#"n={$bound(["app/Sample.qml", 6, 18], () => root.width)}"#,
    );
    assert_contains(&code, r#"color={$bound(["app/Sample.qml", 8, 17],"#);
    // A constant cannot fail: it is left as it is.
    assert_contains(&code, "border$width={1}");
}

#[test]
fn console_says_where_it_is_called_and_a_local_one_is_left_alone() {
    let code = lowered(SOURCE, Some("app/Sample.qml"));
    assert_contains(
        &code,
        r#"import { $bound, $console } from "ljos-web/inspect";"#,
    );
    assert_contains(
        &code,
        r#"$console(["app/Sample.qml", 7, 35]).log("hi", root.n)"#,
    );
    assert_contains(&code, r#"console.log("no")"#);
}

#[test]
fn a_file_with_places_brings_the_inspector_in_though_it_logs_nothing() {
    let code = lowered("import QtQuick\nItem { width: 3 }", Some("Quiet.qml"));
    assert_contains(&code, r#"import "ljos-web/inspect";"#);
}
