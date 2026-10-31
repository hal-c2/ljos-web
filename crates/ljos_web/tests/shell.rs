//! A shell a visitor drops: what it may write compiles to data, what it may
//! not is refused where it is written (docs/LJOS_WEB.md A9).

use std::path::Path;

use ljos_ir as ir;
use ljos_web::{
    files::Memory,
    shell::{self, Contract, Diagnostic},
};

const SCENE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../packages/runtime/tests/scenes/drop"
);

fn scene() -> Memory {
    let read = |name: &str| std::fs::read_to_string(format!("{SCENE}/{name}")).unwrap();
    Memory::new([
        ("Shell.qml", read("Shell.qml")),
        ("Shop/qmldir", read("Shop/qmldir")),
        ("Shop/Basket.qml", read("Shop/Basket.qml")),
    ])
}

fn blocks() -> Vec<Contract> {
    shell::contracts(&scene(), Path::new("/"), Path::new("/Shell.qml")).unwrap()
}

fn refused(text: &str) -> Vec<Diagnostic> {
    match shell::compile(text, &blocks()) {
        Ok(_) => panic!("compiled:\n{text}"),
        Err(diagnostics) => diagnostics,
    }
}

fn shell_with(body: &str) -> String {
    format!("import QtQuick\nimport Shop\n\nColumn {{\n    Basket {{ id: basket }}\n{body}\n}}\n")
}

#[test]
fn a_block_s_contract_is_its_state_actions_and_events() {
    let blocks = blocks();
    assert_eq!(blocks.len(), 1);
    let basket = &blocks[0];
    assert_eq!(
        (
            basket.module.as_str(),
            basket.name.as_str(),
            basket.version.as_str()
        ),
        ("Shop", "Basket", "1.0")
    );
    assert_eq!(basket.file, "Shop/Basket.qml");
    assert_eq!(basket.category.as_deref(), Some("Shop"));
    assert_eq!(
        basket.summary.as_deref(),
        Some("Holds what the visitor buys")
    );
    assert_eq!(basket.base, "Rectangle");
    let state: Vec<_> = basket
        .properties
        .iter()
        .filter(|p| p.readonly)
        .map(|p| (p.name.as_str(), p.ty.as_str()))
        .collect();
    assert_eq!(
        state,
        [("count", "int"), ("cover", "url"), ("items", "var")]
    );
    assert_eq!(
        basket
            .actions
            .iter()
            .map(|a| a.name.as_str())
            .collect::<Vec<_>>(),
        ["add"]
    );
    assert_eq!(basket.events[0].name, "added");
    assert_eq!(basket.events[0].params, ["count"]);
}

#[test]
fn a_shell_compiles_to_objects_and_programs_with_no_javascript() {
    let text = shell_with(
        r#"    Text { id: label; text: "Bought " + basket.count; font.pixelSize: 14 }
    Image { source: basket.cover }
    MouseArea { width: 10; height: 10; onClicked: basket.add() }
    Rectangle { id: swatch; color: "red"; width: Math.max(10, label.width) }"#,
    );
    let file = shell::compile(&text, &blocks()).unwrap();
    assert!(file.js.source.is_empty() && file.js.functions.is_empty());
    let objects = &file.components[0].objects;
    assert_eq!(objects.len(), 6);
    assert_eq!(
        objects[1].ty,
        ir::TypeRef::Native {
            module: "Shop".into(),
            name: "Basket".into()
        }
    );
    assert_eq!(objects[1].key, ir::KeySeg::Id("basket".into()));
    assert!(
        objects[5]
            .members
            .assignments
            .iter()
            .any(|a| a.name == "color" && a.value == ir::Literal::Color("red".into()))
    );
    assert_eq!(objects[2].grouped[0].path, ["font"]);
    assert!(file.exprs.iter().all(|expr| expr.tier1.is_some()));
    let handler = file
        .exprs
        .iter()
        .find(|expr| expr.kind == ir::BindingKind::Handler)
        .unwrap();
    assert!(
        handler
            .tier1
            .as_ref()
            .unwrap()
            .code
            .iter()
            .any(|op| matches!(op, ir::Op::Invoke { .. }))
    );
}

#[test]
fn a_number_of_a_program_goes_to_the_page_as_a_decimal_string() {
    let file = shell::compile(
        &shell_with("    Text { text: 0.1 + basket.count }"),
        &blocks(),
    )
    .unwrap();
    let json = shell::to_json(&file);
    let consts = json
        .pointer("/exprs/0/tier1/consts")
        .unwrap()
        .as_array()
        .unwrap();
    assert_eq!(
        consts[0]["Number"],
        serde_json::Value::String(0.1f64.to_bits().to_string())
    );
}

fn says(diagnostics: &[Diagnostic], line: usize, needle: &str) {
    assert!(
        diagnostics
            .iter()
            .any(|d| d.line == line && d.message.contains(needle)),
        "no `{needle}` on line {line} in {diagnostics:?}"
    );
}

#[test]
fn a_global_is_not_in_a_shell_s_scope() {
    says(
        &refused(&shell_with("    Text { text: window.location.href }")),
        6,
        "`window` is not in a shell's scope",
    );
}

#[test]
fn eval_is_not_in_a_shell_s_scope() {
    says(
        &refused(&shell_with(r#"    Text { text: eval("1") }"#)),
        6,
        "`eval` is not in a shell's scope",
    );
}

#[test]
fn a_qt_function_that_reaches_out_is_refused() {
    let text =
        shell_with(r#"    MouseArea { onClicked: Qt.openUrlExternally("https://example.com") }"#);
    says(
        &refused(&text),
        6,
        "`Qt.openUrlExternally` is not in a shell's scope",
    );
}

#[test]
fn a_member_by_a_string_is_refused() {
    says(
        &refused(&shell_with(r#"    Text { text: basket["constructor"] }"#)),
        6,
        "not by a string",
    );
}

#[test]
fn a_url_a_shell_names_is_refused() {
    let text = shell_with(r#"    Image { source: "https://tracker.example/pixel.png" }"#);
    says(
        &refused(&text),
        6,
        "Image.source takes only a URL a block gives",
    );
    let text = shell_with(r#"    Image { source: "file:" + basket.cover }"#);
    says(
        &refused(&text),
        6,
        "Image.source takes only a URL a block gives",
    );
    // Added to, even one a block gave is a URL the shell names.
    for handler in [
        r#"pic.source += "https://tracker.example/pixel.png""#,
        r#"{ pic.source = basket.cover; pic.source += "x" }"#,
        "pic.source++",
    ] {
        let text = shell_with(&format!(
            "    Image {{ id: pic }}\n    MouseArea {{ onClicked: {handler} }}"
        ));
        says(
            &refused(&text),
            7,
            "Image.source takes only a URL a block gives",
        );
    }
}

#[test]
fn a_url_written_by_a_bare_name_is_the_root_s_when_the_scope_has_none() {
    for write in [
        r#"source = "https://tracker.example/pixel.png""#,
        r#"source += "https://tracker.example/pixel.png""#,
        "source++",
    ] {
        let text = format!(
            "import QtQuick\nimport Shop\n\nImage {{\n    MouseArea {{ onClicked: {write} }}\n}}\n"
        );
        says(
            &refused(&text),
            5,
            "Image.source takes only a URL a block gives",
        );
    }
}

#[test]
fn a_name_of_the_handler_s_own_is_not_the_block_of_that_id() {
    for handler in [
        "{ let basket = mine; pic.source = basket.cover }",
        "(basket) => { pic.source = basket.cover }",
    ] {
        let text = shell_with(&format!(
            "    Item {{ id: mine; property string cover: \"https://tracker.example/pixel.png\" }}\n    Image {{ id: pic }}\n    MouseArea {{ onClicked: {handler} }}"
        ));
        says(
            &refused(&text),
            8,
            "Image.source takes only a URL a block gives",
        );
    }
}

#[test]
fn a_block_s_url_is_not_declared_over() {
    let text = "import QtQuick\nimport Shop\n\nColumn {\n    Basket { id: basket; property string cover: \"https://tracker.example/pixel.png\" }\n    Image { source: basket.cover }\n}\n";
    says(
        &refused(text),
        5,
        "declares nothing over Basket's own `cover`",
    );
}

#[test]
fn a_url_property_is_not_declared_over() {
    let text =
        shell_with(r#"    Image { property string source: "https://tracker.example/pixel.png" }"#);
    says(
        &refused(&text),
        6,
        "declares nothing over Image's own `source`",
    );
}

#[test]
fn a_block_s_url_is_still_given_by_a_handler() {
    let text =
        shell_with("    Image { id: pic }\n    MouseArea { onClicked: pic.source = basket.cover }");
    assert!(shell::compile(&text, &blocks()).is_ok());
}

#[test]
fn an_import_beyond_qtquick_and_the_blocks_is_refused() {
    let text = "import QtQuick\nimport QtQuick.Controls\nimport Shop\n\nColumn {}\n";
    says(
        &refused(text),
        2,
        "a shell may import only `QtQuick`, `Shop`, not `QtQuick.Controls`",
    );
}

#[test]
fn a_block_s_state_is_written_only_by_the_block() {
    says(
        &refused(&shell_with("    Text { text: basket.count = 3 }")),
        6,
        "`count` is a state of Basket",
    );
    let text = "import QtQuick\nimport Shop\n\nColumn {\n    Basket { count: 3 }\n}\n";
    says(&refused(text), 5, "`count` is a state of Basket");
}

#[test]
fn a_shell_calls_only_its_blocks_actions() {
    let diagnostics = refused(&shell_with("    MouseArea { onClicked: basket.destroy() }"));
    says(&diagnostics, 6, "not an action");
    says(
        &refused(&shell_with("    Text { text: new Date() }")),
        6,
        "`new` is not in a shell's scope",
    );
    says(
        &refused(&shell_with("    Text { text: (() => 1)() }")),
        6,
        "a shell",
    );
}

#[test]
fn a_shell_s_text_is_plain() {
    says(
        &refused(&shell_with("    Text { textFormat: Text.RichText }")),
        6,
        "a shell's text is plain",
    );
}

#[test]
fn a_syntax_error_says_where_it_is() {
    let diagnostics = refused("import QtQuick\n\nColumn {\n    Text { text: ( }\n}\n");
    assert_eq!(diagnostics[0].line, 4);
}

#[test]
fn a_shell_declares_only_values() {
    says(
        &refused(&shell_with("    property alias total: basket.count")),
        6,
        "a shell declares no aliases",
    );
    says(
        &refused(&shell_with("    property var page")),
        6,
        "a shell declares no `var` properties",
    );
    shell::compile(
        &shell_with("    property int seen: basket.count"),
        &blocks(),
    )
    .unwrap();
}
