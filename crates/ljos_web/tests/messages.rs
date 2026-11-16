//! Translated messages compiled for the page: each call of `t`, `msg`,
//! `plural`, `select` and `selectOrdinal` becomes a call that carries its
//! ICU MessageFormat text and its catalogue key, the same text and key
//! ljos-ui reads from it (`features/i18n/messages.feature` there), and the
//! values it shows. What the runtime does with them is
//! `packages/runtime/tests/messages.spec.js`.

use std::collections::BTreeMap;

use ljos_web::given::{Compiled, Diagnostic, Request, compile};

fn project(files: &[(&str, &str)]) -> Result<Compiled, Vec<Diagnostic>> {
    let files: BTreeMap<String, String> = files
        .iter()
        .map(|(name, text)| (name.to_string(), text.to_string()))
        .collect();
    compile(&Request {
        files,
        entry: "Main.qml".into(),
        ..Request::default()
    })
}

#[track_caller]
fn code_of(files: &[(&str, &str)], file: &str) -> String {
    let compiled = project(files).unwrap_or_else(|diagnostics| panic!("{diagnostics:#?}"));
    compiled
        .modules
        .iter()
        .find(|module| module.file == file)
        .unwrap_or_else(|| panic!("{file} is compiled"))
        .code
        .clone()
}

#[track_caller]
fn refused(files: &[(&str, &str)]) -> Vec<(String, Option<String>)> {
    match project(files) {
        Ok(compiled) => panic!("expected errors, compiled:\n{}", compiled.modules[0].code),
        Err(diagnostics) => diagnostics
            .into_iter()
            .map(|diagnostic| (diagnostic.message, diagnostic.code))
            .collect(),
    }
}

fn main_with(property: &str) -> String {
    format!(
        "import Ljos.Ui\nimport Ljos.Core\nItem {{\n  property string name: \"Ada\"\n  property int count: 3\n  {property}\n}}\n"
    )
}

#[track_caller]
fn lowered(property: &str) -> String {
    code_of(&[("Main.qml", &main_with(property))], "Main.qml")
}

#[track_caller]
fn assert_contains(haystack: &str, needle: &str) {
    assert!(
        haystack.contains(needle),
        "expected to find\n  {needle}\nin\n{haystack}"
    );
}

#[test]
fn a_bare_name_is_its_own_placeholder() {
    let code = lowered("property string hello: t`Hello ${name}`");
    assert_contains(
        &code,
        r#"__ljos_message("Hello {name}", "", "Hello {name}", "name","#,
    );
    assert_contains(&code, "import { __ljos_message");
}

#[test]
fn any_other_value_is_numbered() {
    let code = lowered("property string shown: t`${count + 1} left of ${name}`");
    assert_contains(
        &code,
        r#"__ljos_message("{0} left of {name}", "", "{0} left of {name}", "0,name","#,
    );
}

#[test]
fn a_count_and_a_choice_are_written_in_the_message() {
    assert_contains(
        &lowered(r##"property string files: plural(count, { one: "# file", other: "# files" })"##),
        r#""{count, plural, one {# file} other {# files}}""#,
    );
    assert_contains(
        &lowered(
            r#"property string role: select(name, { admin: "Administrator", other: "Member" })"#,
        ),
        r#""{name, select, admin {Administrator} other {Member}}""#,
    );
    assert_contains(
        &lowered(r##"property string place: selectOrdinal(count, { one: "#st", other: "#th" })"##),
        r#""{count, selectordinal, one {#st} other {#th}}""#,
    );
}

#[test]
fn a_count_inside_a_sentence_is_one_message() {
    assert_contains(
        &lowered(
            r##"property string shown: t`${name} has ${plural(count, { one: "# file", other: "# files" })}`"##,
        ),
        r#""{name} has {count, plural, one {# file} other {# files}}""#,
    );
}

#[test]
fn literal_braces_and_apostrophes_are_quoted() {
    assert_contains(
        &lowered("property string shown: t`Use {braces}`"),
        r#"__ljos_message("Use '{braces}'""#,
    );
    assert_contains(
        &lowered("property string shown: t`Don't save`"),
        r#"__ljos_message("Don't save""#,
    );
}

#[test]
fn a_count_in_a_form_is_not_quoted_with_the_braces_around_it() {
    assert_contains(
        &lowered(r##"property string shown: plural(count, { other: "{left} # {right} '#'" })"##),
        r##""{count, plural, other {'{left}' # '{right}' '#'}}""##,
    );
}

#[test]
fn a_context_and_an_id_are_carried() {
    assert_contains(
        &lowered(r#"property string menu: t({ message: "Open", context: "menu" })"#),
        r#"__ljos_message("Open", "menu", "Open", """#,
    );
    assert_contains(
        &lowered(r#"property string home: t({ id: "nav.home", message: "Home" })"#),
        r#"__ljos_message("Home", "", "nav.home", """#,
    );
}

#[test]
fn a_message_with_only_an_id_shows_its_id_until_translated() {
    assert_contains(
        &lowered(r#"property string home: t({ id: "nav.home" })"#),
        r#"__ljos_message("nav.home", "", "nav.home", """#,
    );
}

#[test]
fn a_descriptor_is_translated_where_it_is_shown() {
    let code = lowered("property string shown: t(name)");
    assert_contains(&code, "t(");
    assert!(!code.contains("__ljos_message("), "{code}");
}

#[test]
fn a_message_that_is_not_written_out_is_an_error() {
    let errors = refused(&[(
        "Main.qml",
        &main_with(r##"property string shown: plural(count, { one: name, other: "# files" })"##),
    )]);
    assert_eq!(errors.len(), 1, "{errors:#?}");
    assert_eq!(errors[0].1.as_deref(), Some("i18n-literal"));
}

#[test]
fn a_choice_without_other_is_an_error() {
    let errors = refused(&[(
        "Main.qml",
        &main_with(r##"property string shown: plural(count, { one: "# file" })"##),
    )]);
    assert_eq!(errors.len(), 1, "{errors:#?}");
    assert_eq!(errors[0].1.as_deref(), Some("i18n-other"));
}

#[test]
fn a_name_the_file_declares_is_not_a_message() {
    let code =
        lowered("function t(s: string): string { return s }\n  property string shown: t(name)");
    assert!(!code.contains("__ljos_message("), "{code}");
}

/// What only a model's role might have in a delegate is not what a role
/// has: a model has no role a message macro could be read from, so `t`
/// there is Ljos.Core's, as it is anywhere else in the file.
#[test]
fn a_message_in_a_delegate_is_a_message() {
    let code = lowered(
        r##"ListView {
    model: ["Ada", "Grace"]
    delegate: Text {
      text: t`Hello ${modelData}`
      property string files: plural(index, { one: "# file", other: "# files" })
    }
  }"##,
    );
    assert_contains(
        &code,
        r#"__ljos_message("Hello {modelData}", "", "Hello {modelData}", "modelData","#,
    );
    assert_contains(&code, r#""{index, plural, one {# file} other {# files}}""#);
    assert!(!code.contains("$data.t"), "{code}");
    assert!(!code.contains("$data.plural"), "{code}");
}

/// `t(m)` of a message made elsewhere, in a delegate, is Ljos.Core's `t`
/// as it runs, not a role of the model.
#[test]
fn t_of_a_message_in_a_delegate_is_ljos_cores() {
    let code = lowered(
        r##"property var greeting: msg`Hello`
  Repeater {
    model: 2
    delegate: Text { text: t(greeting) }
  }"##,
    );
    // A model with a role named `t` still gives it, called on its row; any
    // other gives Ljos.Core's.
    assert_contains(
        &code,
        r#""t" in $data ? $data.t("greeting" in $data ? $data.greeting : $1.greeting) : t("greeting" in $data ? $data.greeting : $1.greeting)"#,
    );
    assert_contains(
        &code,
        r#"import { __ljos_msg, t } from "ljos-web/Ljos/Core";"#,
    );
}

/// A role named as a macro is the model's to give, as any global's name is
/// in a delegate: a model with a `select` role keeps it.
#[test]
fn a_role_named_as_a_macro_is_the_models() {
    let code = lowered(
        r##"ListView {
    model: ListModel { ListElement { label: "a"; select: true } }
    delegate: Text { property bool on: select; text: label }
  }"##,
    );
    assert_contains(&code, r#""select" in $data ? $data.select : select"#);
}

#[test]
fn qs_tr_is_unchanged() {
    let code = code_of(
        &[(
            "Main.qml",
            "import QtQuick\nItem {\n  property string open: qsTr(\"Open\")\n}\n",
        )],
        "Main.qml",
    );
    assert!(!code.contains("__ljos_message("), "{code}");
}

#[test]
fn a_module_imports_its_messages_from_ljos_core() {
    let greet = "import { t } from \"@ljos/core\"\nexport function hello(name: string): string {\n  return t`Hello ${name}`\n}\n";
    let main = "import Ljos.Ui\nimport \"greet.ts\" as Greet\nItem {\n  property string hello: Greet.hello(\"Ada\")\n}\n";
    let code = code_of(&[("Main.qml", main), ("greet.ts", greet)], "greet.ts");
    assert_contains(
        &code,
        r#"__ljos_message("Hello {name}", "", "Hello {name}", "name", name)"#,
    );
    assert_contains(&code, "Ljos/Core");
    assert!(!code.contains("@ljos/core"), "{code}");
}

#[test]
fn a_module_marks_messages_with_msg() {
    let menu = "import { msg, type MessageDescriptor } from \"@ljos/core\"\nexport const items: readonly MessageDescriptor[] = [msg`Open`]\n";
    let main = "import Ljos.Ui\nimport Ljos.Core\nimport \"menu.ts\" as Menu\nItem {\n  property string first: t(Menu.items[0])\n}\n";
    let code = code_of(&[("Main.qml", main), ("menu.ts", menu)], "menu.ts");
    assert_contains(&code, r#"__ljos_msg("Open", "", "Open", "")"#);
}

#[test]
fn ljos_core_in_a_module_gives_only_its_names() {
    let bad = "import { nothing } from \"@ljos/core\"\nexport const x = 1\n";
    let main = "import Ljos.Ui\nimport \"bad.ts\" as Bad\nItem {\n  property int x: Bad.x\n}\n";
    let errors = refused(&[("Main.qml", main), ("bad.ts", bad)]);
    assert!(
        errors
            .iter()
            .any(|(message, _)| message.contains("`@ljos/core` has no `nothing`")),
        "{errors:#?}"
    );
}
