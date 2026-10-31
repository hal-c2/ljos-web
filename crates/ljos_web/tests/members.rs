//! What a file may say of a type's members (ljos-web request 9): a name the
//! type does not have is refused as Qt refuses it, where it is written, in
//! native Ljós's words. The fixtures are in `fixtures/types/members`.

use std::{
    path::Path,
    process::{Command, Output},
};

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
fn a_property_the_type_does_not_have_is_an_error_where_it_is_written() {
    let said = refused(&["members/Unknown.qml"]);
    assert_contains(&said, "members/Unknown.qml:4:5: `colour` is not a property of `Rectangle`");
}

#[test]
fn a_handler_of_a_signal_the_type_does_not_have_is_an_error() {
    let said = refused(&["members/Handler.qml"]);
    assert_contains(&said, "members/Handler.qml:4:5: `onClickd` handles the signal `clickd`, which `MouseArea` does not have");
}

#[test]
fn a_member_of_a_group_the_group_does_not_have_is_an_error() {
    let said = refused(&["members/Grouped.qml"]);
    assert_contains(&said, "members/Grouped.qml:4:5: `border.widht`: `border` has no property `widht`");
}

#[test]
fn the_members_a_type_has_compile() {
    compiled(&["members/Known.qml"]);
    // What the object declares itself is its own to set and handle.
    compiled(&["members/Declared.qml"]);
}

#[test]
fn a_state_that_changes_what_its_target_lacks_is_left_for_qt_to_warn_of() {
    // Qt loads it and warns only as the state is entered.
    compiled(&["members/States.qml"]);
}
