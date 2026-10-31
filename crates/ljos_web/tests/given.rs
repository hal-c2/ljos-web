//! A project given as texts, as a page that compiles QML has it: each file
//! compiles to what `qmlc --root DIR` prints for it from the directory, and
//! what was wrong is said of the file it was given as.

use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    process::Command,
};

use ljos_web::given::{Alias, Diagnostic, Request, Target, compile};

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/modules")
}

/// Every file under `dir`, by its path from it.
fn read(dir: &Path) -> BTreeMap<String, String> {
    fn walk(dir: &Path, from: &Path, files: &mut BTreeMap<String, String>) {
        for entry in std::fs::read_dir(dir).expect("fixture directory") {
            let path = entry.expect("entry").path();
            if path.is_dir() {
                walk(&path, from, files);
            } else {
                let name = path.strip_prefix(from).expect("under it").to_string_lossy().replace('\\', "/");
                files.insert(name, std::fs::read_to_string(&path).expect("fixture text"));
            }
        }
    }
    let mut files = BTreeMap::new();
    walk(dir, dir, &mut files);
    files
}

/// What `qmlc --root DIR` prints for `file`, with no Qt installed.
fn qmlc(dir: &Path, args: &[&str], file: &str) -> String {
    let output = Command::new(env!("CARGO_BIN_EXE_qmlc"))
        .arg("--root")
        .arg(dir)
        .args(args)
        .arg(dir.join(file))
        .env_remove("QML_IMPORT_PATH")
        .env("QT_INSTALL_QML", dir.join("no-qt-here"))
        .output()
        .expect("qmlc runs");
    assert!(output.status.success(), "qmlc failed: {}", String::from_utf8_lossy(&output.stderr));
    // It prints the module with a line of its own after it.
    let printed = String::from_utf8(output.stdout).expect("UTF-8 output");
    printed.strip_suffix('\n').unwrap_or(&printed).to_string()
}

fn request(files: BTreeMap<String, String>, entry: &str) -> Request {
    Request { files, entry: entry.into(), ..Request::default() }
}

#[test]
fn a_project_given_as_texts_compiles_as_qmlc_compiles_it_from_its_directory() {
    for (fixture, args, imports) in
        [("twice", &[][..], vec![]), ("twice", &["-I", "stubs"][..], vec!["stubs".to_string()]), ("blocks", &[][..], vec![])]
    {
        let dir = fixtures().join(fixture);
        // qmlc's `-I` is from where it runs; the page's from the project.
        let args: Vec<String> =
            args.iter().map(|arg| if arg.starts_with('-') { arg.to_string() } else { dir.join(arg).display().to_string() }).collect();
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let compiled = compile(&Request { imports, ..request(read(&dir), "Main.qml") }).expect("compiles");
        assert_eq!(compiled.modules[0].file, "Main.qml");
        assert!(compiled.modules.len() > 1, "{fixture}: the files Main.qml imports are compiled with it");
        for module in &compiled.modules {
            assert_eq!(module.code, qmlc(&dir, &args, &module.file), "{fixture} {args:?}: {}", module.file);
        }
    }
}

#[test]
fn a_module_nobody_has_is_an_error_at_its_import() {
    let files = read(&fixtures().join("unknown"));
    let diagnostics = compile(&request(files, "Main.qml")).expect_err("refused");
    assert_eq!(
        diagnostics,
        [Diagnostic {
            file: Some("Main.qml".into()),
            line: Some(2),
            column: Some(1),
            message: "module \"No.Such.Module\" is not installed".into()
        }]
    );
}

#[test]
fn a_syntax_error_is_said_of_its_file_line_and_column() {
    let files = BTreeMap::from([
        ("Main.qml".to_string(), "import QtQuick\nItem { Panel { } }\n".to_string()),
        ("Panel.qml".to_string(), "import QtQuick\nRectangle {\n    width: 10 +\n}\n".to_string()),
    ]);
    let diagnostics = compile(&request(files, "Main.qml")).expect_err("refused");
    // The first is why Main.qml does not know Panel.
    let diagnostic = &diagnostics[0];
    assert_eq!(diagnostic.file.as_deref(), Some("Panel.qml"));
    assert_eq!(diagnostic.line, Some(4), "{diagnostic:?}");
    assert!(diagnostic.column.is_some());
}

#[test]
fn an_aliased_module_is_the_directory_it_names() {
    let files = BTreeMap::from([
        ("Main.qml".to_string(), "import QtQuick\nimport App.Media\nItem { Player { } }\n".to_string()),
        ("src/media/qmldir".to_string(), "module App.Media\nPlayer 1.0 Player.qml\n".to_string()),
        ("src/media/Player.qml".to_string(), "import QtQuick\nRectangle { color: \"red\" }\n".to_string()),
    ]);
    let aliases = vec![Alias { module: "App.Media".into(), dir: "src/media".into() }];
    let compiled = compile(&Request { aliases, ..request(files, "Main.qml") }).expect("compiles");
    let main = &compiled.modules[0];
    assert!(main.code.contains(r#"from "./App/Media/Player.qml""#), "{}", main.code);
    assert!(main.links.iter().any(|link| link.target == Target::File("App/Media/Player.qml".into())));
    assert_eq!(compiled.modules[1].file, "App/Media/Player.qml");
}

#[test]
fn an_error_in_an_aliased_file_names_the_file_as_it_was_given() {
    let files = BTreeMap::from([
        ("Main.qml".to_string(), "import QtQuick\nimport App.Media\nItem { Player { } }\n".to_string()),
        ("src/media/qmldir".to_string(), "module App.Media\nPlayer 1.0 Player.qml\n".to_string()),
        ("src/media/Player.qml".to_string(), "import QtQuick\nRectangle { color: }\n".to_string()),
    ]);
    let aliases = vec![Alias { module: "App.Media".into(), dir: "src/media".into() }];
    let diagnostics = compile(&Request { aliases, ..request(files, "Main.qml") }).expect_err("refused");
    assert_eq!(diagnostics[0].file.as_deref(), Some("src/media/Player.qml"), "{diagnostics:?}");
}

#[test]
fn a_module_the_page_does_not_have_is_an_error_naming_what_it_would_take() {
    let files = BTreeMap::from([(
        "Main.qml".to_string(),
        "import QtQuick\nimport QtQuick.Controls\nItem { Button { } }\n".to_string(),
    )]);
    let modules = ["solid-js", "ljos-web/object", "ljos-web/QtQuick"].map(String::from).into();
    let diagnostics = compile(&Request { modules: Some(modules), ..request(files.clone(), "Main.qml") }).expect_err("refused");
    assert_eq!(diagnostics.len(), 1, "{diagnostics:?}");
    assert_eq!((diagnostics[0].line, diagnostics[0].column), (Some(2), Some(1)), "{diagnostics:?}");
    assert!(diagnostics[0].message.contains("requests 13 and 36"), "{}", diagnostics[0].message);
    // A page built with the controls gives them to what it compiles.
    let modules = ["solid-js", "ljos-web/object", "ljos-web/QtQuick", "ljos-web/QtQuick/Controls"].map(String::from).into();
    compile(&Request { modules: Some(modules), ..request(files, "Main.qml") }).expect("compiles");
}

#[test]
fn links_are_where_the_specifiers_are_in_utf16_units() {
    let files = BTreeMap::from([
        ("Main.qml".to_string(), "import QtQuick\nItem { property string s: \"ð é ✓\"; Panel { } }\n".to_string()),
        ("Panel.qml".to_string(), "import QtQuick\nImage { source: \"logo.png\" }\n".to_string()),
    ]);
    let compiled = compile(&request(files, "Main.qml")).expect("compiles");
    for module in &compiled.modules {
        let units: Vec<u16> = module.code.encode_utf16().collect();
        let at = |start: u32, end: u32| String::from_utf16(&units[start as usize..end as usize]).expect("text");
        for link in &module.links {
            let quoted = at(link.start, link.end);
            let name = match &link.target {
                Target::File(file) => Path::new(file).file_name().unwrap().to_string_lossy().to_string(),
                Target::Module(module) => module.clone(),
            };
            assert!(quoted.starts_with('"') && quoted.contains(&name), "{quoted} for {name}");
        }
        for (start, end) in &module.metas {
            assert_eq!(at(*start, *end), "import.meta");
        }
        assert!(module.exports.contains("default"), "{}", module.file);
    }
}
