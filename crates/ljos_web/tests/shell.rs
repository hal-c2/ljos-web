//! A shell a visitor drops: what it may write compiles to data, what it may
//! not is refused where it is written (docs/LJOS_WEB.md A9).

use std::path::Path;

use ljos_ir as ir;
use ljos_web::{
    Options,
    files::{Load, Memory},
    shell::{self, Contract, Diagnostic},
};

const SCENE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../packages/runtime/tests/scenes/drop"
);

// The runtime's specs add blocks to the scene's own qmldir for what they drive
// in a page. These tests compile against one block, whichever those are.
const QMLDIR: &str = "module Shop
# block Basket 1.0 Basket.qml Shop \"Holds what the visitor buys\"
Basket 1.0 Basket.qml
";

fn scene() -> Memory {
    let read = |name: &str| std::fs::read_to_string(format!("{SCENE}/{name}")).unwrap();
    Memory::new([
        ("Shell.qml", read("Shell.qml")),
        ("Shop/qmldir", QMLDIR.to_string()),
        ("Shop/Basket.qml", read("Shop/Basket.qml")),
    ])
}

fn blocks() -> Vec<Contract> {
    let scene = scene();
    let load = Load {
        root: Some("/".into()),
        ..Load::new(&scene)
    };
    shell::contracts(
        &load,
        &Options::default(),
        Path::new("/Shell.qml"),
        &mut Vec::new(),
    )
    .unwrap()
    .blocks
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

/// `qmlc --shell --root app -I vendor app/Main.qml` in a project of `name`,
/// with module Shop in `vendor` and, when `own`, another Shop in `app`.
fn asked_of(name: &str, own: bool, first: &[&str]) -> Vec<serde_json::Value> {
    let place = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = std::fs::remove_dir_all(&place);
    let write = |path: &str, text: &str| {
        let path = place.join(path);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    };
    write("app/Main.qml", "import QtQuick\nimport Shop\nBasket { }\n");
    let module =
        |line: &str| format!("module Shop\n# block Basket 1.0 Basket.qml Shop \"{line}\"\n");
    let basket = "import QtQuick\nItem { }\n";
    write("vendor/Shop/qmldir", &module("From the vendor"));
    write("vendor/Shop/Basket.qml", basket);
    if own {
        write("app/Shop/qmldir", &module("From the app"));
        write("app/Shop/Basket.qml", basket);
    }
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_qmlc"))
        .args(["--shell", "--root", "app"])
        .args(first)
        .arg("app/Main.qml")
        .current_dir(&place)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let told: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    told["blocks"].as_array().unwrap().clone()
}

/// What a project a `CMakeLists.txt` starts offers: module Shop as `qmldir`
/// says, and a shell in `src` that says `imports`.
fn in_a_build(qmldir: &str, imports: &str) -> (Result<shell::Blocks, String>, Vec<String>) {
    let files = Memory::new([
        ("p/CMakeLists.txt", "project(p)\n".to_string()),
        ("p/Shop/qmldir", qmldir.to_string()),
        (
            "p/Shop/Basket.qml",
            "import QtQuick\nItem { }\n".to_string(),
        ),
        (
            "p/Plain/qmldir",
            "module Plain\nThing 1.0 Thing.qml\n".to_string(),
        ),
        (
            "p/Plain/Thing.qml",
            "import QtQuick\nItem { }\n".to_string(),
        ),
        (
            "p/src/Main.qml",
            format!("import QtQuick\n{imports}\nItem {{ }}\n"),
        ),
    ]);
    let mut warnings = Vec::new();
    let found = shell::contracts(
        &Load::new(&files),
        &Options::default(),
        Path::new("/p/src/Main.qml"),
        &mut warnings,
    );
    (found, warnings)
}

const SHOP: &str = "module Shop\n# block Basket 1.0 Basket.qml Shop \"A basket\"\n";

#[test]
fn with_no_root_given_a_block_is_of_the_project_a_build_starts() {
    let found = in_a_build(SHOP, "import Shop").0.unwrap();
    assert_eq!(found.root, Path::new("/p"));
    assert_eq!(found.blocks[0].file, "Shop/Basket.qml");
}

#[test]
fn a_block_imported_by_its_directory_is_told_and_stops_nothing() {
    let (found, warnings) = in_a_build(SHOP, "import \"../Shop\"");
    assert!(found.unwrap().blocks.is_empty());
    assert!(warnings[0].contains("import Shop"), "{warnings:?}");
}

#[test]
fn a_module_with_no_block_offers_none_with_a_word_that_names_it() {
    let (found, warnings) = in_a_build(SHOP, "import Plain");
    assert!(found.unwrap().blocks.is_empty());
    assert_eq!(warnings.len(), 1, "{warnings:?}");
    assert!(warnings[0].contains("Plain"), "{warnings:?}");
}

#[test]
fn blocks_beside_a_module_with_none_are_offered_with_no_word() {
    let (found, warnings) = in_a_build(SHOP, "import Shop\nimport Plain");
    assert_eq!(found.unwrap().blocks.len(), 1);
    assert!(warnings.is_empty(), "{warnings:?}");
}

#[test]
fn a_module_imported_twice_has_each_block_once() {
    let (found, _) = in_a_build(SHOP, "import Shop\nimport Shop as Again");
    assert_eq!(found.unwrap().blocks.len(), 1);
}

#[test]
fn ljos_s_own_modules_are_no_library_of_the_site_s() {
    let (found, warnings) = in_a_build(SHOP, "import Ljos.Models\nimport Ljos.Blocks");
    assert!(found.unwrap().blocks.is_empty());
    assert!(warnings.is_empty(), "{warnings:?}");
}

#[test]
fn ljos_s_stand_in_given_with_with_is_no_library_of_the_site_s() {
    let files = Memory::new([
        (
            "design/Ljos/Design/qmldir",
            "module Ljos.Design\nTheme 1.0 Theme.qml\n",
        ),
        ("design/Ljos/Design/Theme.qml", "import QtQuick\nItem { }\n"),
        (
            "app/Main.qml",
            "import QtQuick\nimport Ljos.Design\nItem { }\n",
        ),
    ]);
    let load = Load {
        root: Some("/app".into()),
        with: vec!["/design".into()],
        ..Load::new(&files)
    };
    let mut warnings = Vec::new();
    let found = shell::contracts(
        &load,
        &Options::default(),
        Path::new("/app/Main.qml"),
        &mut warnings,
    );
    assert!(found.unwrap().blocks.is_empty());
    assert!(warnings.is_empty(), "{warnings:?}");
}

#[test]
fn a_module_that_is_not_found_is_refused_by_its_name() {
    let error = in_a_build(SHOP, "import Shop\nimport Missing")
        .0
        .unwrap_err();
    assert!(error.contains("\"Missing\" is not installed"), "{error}");
}

#[test]
fn a_qmldir_away_from_its_module_s_place_is_not_the_module() {
    // A compile takes the `qmldir` at its module's place only.
    let error = in_a_build("module Elsewhere\n", "import Shop")
        .0
        .unwrap_err();
    assert!(error.contains("\"Shop\" is not installed"), "{error}");
}

/// `qmlc --shell` in the `types` fixtures, whose module is a dump's stand-in.
fn asked_with(args: &[&str]) -> std::process::Output {
    std::process::Command::new(env!("CARGO_BIN_EXE_qmlc"))
        .arg("--shell")
        .args(args)
        .current_dir(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/types"))
        .output()
        .unwrap()
}

/// `qmlc --shell --qt qt app/Main.qml` for a shell that imports `import`,
/// and `qmlc` itself, with `qt` as `lay_out` leaves it: their words and codes.
fn asked_and_compiled(
    name: &str,
    import: &str,
    lay_out: &[&str],
) -> ((bool, String), (bool, String)) {
    let place = Path::new(env!("CARGO_TARGET_TMPDIR")).join(name);
    let _ = std::fs::remove_dir_all(&place);
    std::fs::create_dir_all(place.join("qt")).unwrap();
    std::fs::create_dir_all(place.join("app")).unwrap();
    std::fs::write(
        place.join("app/Main.qml"),
        format!("import QtQuick\nimport {import}\nItem {{ }}\n"),
    )
    .unwrap();
    for directory in lay_out {
        let directory = place.join("qt").join(directory);
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(directory.join("qmldir"), format!("module {import}\n")).unwrap();
    }
    let run = |first: &[&str]| {
        let output = std::process::Command::new(env!("CARGO_BIN_EXE_qmlc"))
            .args(first)
            .args(["--root", "app", "--qt", "qt", "app/Main.qml"])
            .current_dir(&place)
            .output()
            .unwrap();
        (
            output.status.success(),
            String::from_utf8_lossy(&output.stderr).into_owned(),
        )
    };
    (run(&["--shell"]), run(&[]))
}

#[test]
fn a_module_of_qt_s_table_is_no_library_with_no_qt_installed() {
    let (asked, compiled) = asked_and_compiled("shell-table", "QML", &[]);
    assert!(compiled.0, "{}", compiled.1);
    assert_eq!(asked, (true, String::new()));
}

#[test]
fn a_module_of_the_installed_qt_is_no_library() {
    let (asked, compiled) =
        asked_and_compiled("shell-installed", "Vendor.Thing", &["Vendor/Thing"]);
    assert!(compiled.0, "{}", compiled.1);
    assert_eq!(asked, (true, String::new()));
}

#[test]
fn a_module_nobody_has_is_refused_as_its_compile_refuses_it() {
    let (asked, compiled) = asked_and_compiled("shell-nobody", "Nobody.Has", &[]);
    assert!(!compiled.0);
    assert!(!asked.0);
    let word = "app/Main.qml:2:1: module \"Nobody.Has\" is not installed\n";
    assert!(compiled.1.contains(word), "{}", compiled.1);
    assert_eq!(asked.1, word);
}

#[test]
fn a_syntax_error_in_a_block_is_said_as_its_compile_says_it() {
    let place = Path::new(env!("CARGO_TARGET_TMPDIR")).join("shell-bad-block");
    let _ = std::fs::remove_dir_all(&place);
    std::fs::create_dir_all(place.join("app/Shop")).unwrap();
    std::fs::create_dir_all(place.join("app/src")).unwrap();
    let place = place.canonicalize().unwrap();
    let shell = "import QtQuick\nimport Shop\nItem { }\n";
    std::fs::write(place.join("app/Main.qml"), shell).unwrap();
    std::fs::write(place.join("app/src/Main.qml"), shell).unwrap();
    std::fs::write(
        place.join("app/Shop/qmldir"),
        "module Shop\n# block Bad 1.0 Bad.qml Shop \"A basket\"\n",
    )
    .unwrap();
    std::fs::write(
        place.join("app/Shop/Bad.qml"),
        "import QtQuick\nItem {\n    width: 1\n}}\n",
    )
    .unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(place.join("app/src"), place.join("link")).unwrap();
    let run = |from: &str, root: &str, words: &[&str]| {
        let output = std::process::Command::new(env!("CARGO_BIN_EXE_qmlc"))
            .args(["--root", root])
            .args(words)
            .current_dir(place.join(from))
            .output()
            .unwrap();
        assert!(!output.status.success(), "{words:?}");
        String::from_utf8_lossy(&output.stderr).into_owned()
    };
    let absolute = |path: &str| place.join(path).display().to_string();
    let (shell_at, block_at) = (absolute("app/Main.qml"), absolute("app/Shop/Bad.qml"));
    let cases: Vec<(&str, &str, &str, &str)> = vec![
        (".", "app", "app/Main.qml", "app/Shop/Bad.qml"),
        (".", "app", "./app/Main.qml", "./app/Shop/Bad.qml"),
        (".", "app", "app/src/Main.qml", "app/Shop/Bad.qml"),
        (".", "app", &shell_at, &block_at),
        ("app", ".", "Main.qml", "Shop/Bad.qml"),
        ("app", ".", "./Main.qml", "./Shop/Bad.qml"),
        ("app", ".", "src/Main.qml", "Shop/Bad.qml"),
        // From beside the block's directory, up is not a directory the name has.
        ("app/src", "..", "Main.qml", "../Shop/Bad.qml"),
        ("app/src", "..", "../Main.qml", "../Shop/Bad.qml"),
        ("app/src", "..", "./Main.qml", "./../Shop/Bad.qml"),
        // Through a symlink, `..` is not what is above in the name.
        #[cfg(unix)]
        (".", "app", "link/Main.qml", "link/../Shop/Bad.qml"),
    ];
    for (from, root, shell, block) in cases {
        let compiled = run(from, root, &[block]);
        assert!(compiled.starts_with(&format!("{block}:4:")), "{compiled}");
        assert_eq!(run(from, root, &["--shell", shell]), compiled, "{shell}");
    }
}

#[test]
fn a_block_that_cannot_be_read_is_said_as_the_build_writes_it() {
    let place = Path::new(env!("CARGO_TARGET_TMPDIR")).join("shell-gone-block");
    let _ = std::fs::remove_dir_all(&place);
    std::fs::create_dir_all(place.join("app/Shop")).unwrap();
    std::fs::create_dir_all(place.join("app/src")).unwrap();
    let shell = "import QtQuick\nimport Shop\nItem { }\n";
    std::fs::write(place.join("app/Main.qml"), shell).unwrap();
    std::fs::write(place.join("app/src/Main.qml"), shell).unwrap();
    std::fs::write(
        place.join("app/Shop/qmldir"),
        "module Shop\n# block Gone 1.0 Gone.qml Shop \"A basket\"\n",
    )
    .unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(place.join("app/src"), place.join("link")).unwrap();
    let asked = |shell: &str| {
        let output = std::process::Command::new(env!("CARGO_BIN_EXE_qmlc"))
            .args(["--shell", "--root", "app", shell])
            .current_dir(&place)
            .output()
            .unwrap();
        assert!(!output.status.success());
        String::from_utf8_lossy(&output.stderr).into_owned()
    };
    assert_eq!(asked("app/Main.qml"), "cannot read app/Shop/Gone.qml\n");
    assert_eq!(asked("app/src/Main.qml"), "cannot read app/Shop/Gone.qml\n");
    #[cfg(unix)]
    assert_eq!(
        asked("link/Main.qml"),
        "cannot read link/../Shop/Gone.qml\n"
    );
}

#[test]
fn a_module_a_dump_stands_in_for_is_found() {
    let output = asked_with(&[
        "--root",
        "app",
        "--types",
        "app/native/ljostypes.json",
        "app/Main.qml",
    ]);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "{stderr}");
    assert!(stderr.contains("App.Media"), "{stderr}");
    let told: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(told["blocks"], serde_json::json!([]));
}

#[test]
fn a_module_given_with_with_is_found() {
    let place = Path::new(env!("CARGO_TARGET_TMPDIR")).join("shell-with");
    let _ = std::fs::remove_dir_all(&place);
    for (path, text) in [
        ("helpers/Help/qmldir", "module Help\nAid 1.0 Aid.qml\n"),
        ("helpers/Help/Aid.qml", "import QtQuick\nItem { }\n"),
        ("app/Main.qml", "import QtQuick\nimport Help\nAid { }\n"),
    ] {
        let path = place.join(path);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_qmlc"))
        .args([
            "--shell",
            "--root",
            "app",
            "--with",
            "helpers",
            "app/Main.qml",
        ])
        .current_dir(&place)
        .output()
        .unwrap();
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "{stderr}");
    assert!(stderr.contains("Help"), "{stderr}");
}

#[test]
fn a_block_on_an_import_path_has_a_contract() {
    let blocks = asked_of("shell-import-path", false, &["-I", "vendor"]);
    assert_eq!(blocks.len(), 1);
    assert_eq!(blocks[0]["summary"], "From the vendor");
    // Said from the root, whichever directory the compiler is run in: what is
    // above the root on the machine that builds does not go to the page.
    assert_eq!(blocks[0]["file"], "../vendor/Shop/Basket.qml");
}

#[test]
fn a_module_is_the_first_an_import_path_has_as_a_compile_finds_it() {
    let path = asked_of("shell-import-first", true, &["-I", "vendor"]);
    assert_eq!(path[0]["summary"], "From the vendor");
    let own = asked_of("shell-import-none", true, &[]);
    assert_eq!(own[0]["summary"], "From the app");
    assert_eq!(own[0]["file"], "Shop/Basket.qml");
}
