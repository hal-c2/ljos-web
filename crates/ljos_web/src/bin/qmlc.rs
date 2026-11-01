//! `qmlc [--emit js|lowered] [--out-dir DIR] [--root DIR] [-I DIR]... [--with DIR]... [--qt DIR]... [--select NAME]... [--host MODULE] [--runtime MODULE] [--alone] FILE.qml...`
//! `qmlc [--types FILE.json]... FILE.qml...`
//! `qmlc --types|--qml-types URI...`
//!
//! Compiles each QML file to a JavaScript module, and each `.js` file as the
//! script a QML file imports. Without `--out-dir` the output goes to stdout. A file is compiled with the QML files next to it
//! and in the directories they import, which is where the components it
//! names are and where it is used, and with the modules of the project it
//! is in: what the `qmldir` and `CMakeLists.txt` files under `--root` say
//! they are. Without `--root` that is the nearest directory above the file
//! whose `CMakeLists.txt` starts a project. `-I` (`--import-path`) names a
//! directory looked in for a module before the root, as Qt's import path:
//! module `App.Media` is the `qmldir` at `App/Media` under the first that
//! has one, so that `-I mocks` makes it `mocks/App/Media`. `--with` names a directory with
//! more of the project's modules, described by `qmldir` files likewise: the
//! QML that stands in for the types a program has in C++, where there is no
//! C++. `--select` names a file selector, as Qt has them: the style of the
//! controls, say. A file with one of the same name in the directory `+NAME`
//! next to it is read from there instead, and is still the file it was. With
//! `--alone` it is compiled by itself: it takes only what it declares, and a
//! type it does not know is taken to be a component.
//!
//! `--types FILE.json` names a type dump (`ljostypes.json`, as `ljos types`
//! writes it) of the types the program registers from Rust: each type it
//! describes stands in, with the properties, signals, methods and enums it
//! says, where the project has no QML of its own for it, as `ljos run
//! --types` makes them. Several are read as one. A dump that does not read
//! is an error naming it, and nothing is compiled. The stand-ins are shown
//! to the compile in `.ljostypes` under `--root` (else the first dump's
//! directory), where the output imports them from.
//!
//! A module a file imports has to be installed: one of the project's, of
//! Qt's table, of the runtime package, or of the Qt that is installed, whose
//! modules are where `--qt` says (otherwise where `QML_IMPORT_PATH` and
//! `qtpaths` say). One that is none of these is an error where it is
//! imported, as it is to Qt.
//!
//! `--types` followed by no `.json` file prints, for each module of Qt's, the types Qt has of it in C++:
//! a line of the URI and its names. That is what a runtime has to have of
//! the module, the rest of which is QML. `--qml-types` prints that rest
//! likewise: the types Qt has of the module as QML files, which are there
//! only where that module of Qt's is installed.

use std::{
    path::{Path, PathBuf},
    process::ExitCode,
};

use ljos_web::{
    Options,
    dump::Layered,
    files::{Files, Load},
    native_types, written_types,
};

/// The files of the machine: what `qmlc` compiles from.
struct Disk;

impl Files for Disk {
    fn read(&self, path: &Path) -> Option<String> {
        std::fs::read_to_string(path).ok()
    }

    fn entries(&self, directory: &Path) -> Vec<(String, bool)> {
        let Ok(entries) = std::fs::read_dir(directory) else {
            return Vec::new();
        };
        entries
            .flatten()
            .map(|entry| {
                (
                    entry.file_name().to_string_lossy().into_owned(),
                    entry.path().is_dir(),
                )
            })
            .collect()
    }

    fn is_file(&self, path: &Path) -> bool {
        path.is_file()
    }

    fn canonicalize(&self, path: &Path) -> Option<PathBuf> {
        path.canonicalize().ok()
    }
}

/// Where the Qt that is installed keeps its QML modules, when `--qt` does not
/// say: what `QML_IMPORT_PATH` names and Qt's own directory, as Qt looks.
fn qt_imports() -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = std::env::var_os("QML_IMPORT_PATH")
        .map(|paths| std::env::split_paths(&paths).collect())
        .unwrap_or_default();
    let own = std::env::var_os("QT_INSTALL_QML")
        .map(PathBuf::from)
        .or_else(|| {
            // Only a Qt 6 is one: Qt 5's `qtpaths` and `qmake`, which a machine
            // may have on its path beside Qt 6's tools, name a QML directory of
            // Qt 5's, which this compiler does not read.
            ["qtpaths6", "qtpaths", "qmake6", "qmake"]
                .into_iter()
                .find_map(|tool| {
                    let query = if tool.starts_with("qmake") {
                        "-query"
                    } else {
                        "--query"
                    };
                    let ask = |what: &str| {
                        let asked = std::process::Command::new(tool)
                            .args([query, what])
                            .output()
                            .ok()?;
                        let answer = String::from_utf8(asked.stdout).ok()?;
                        let answer = answer.trim();
                        (asked.status.success() && !answer.is_empty()).then(|| answer.to_owned())
                    };
                    let major: u32 = ask("QT_VERSION")?.split('.').next()?.parse().ok()?;
                    (major >= 6)
                        .then(|| ask("QT_INSTALL_QML"))
                        .flatten()
                        .map(PathBuf::from)
                })
        });
    found.extend(own);
    found
}

/// `--theme FILE` or `--theme-for ENTRY [--root DIR]`: the theme's overrides
/// as JSON on stdout (`null` when the entry has none), or its mistakes on
/// stderr. A named file wins; otherwise the nearest `theme.json` from the
/// entry's directory up to the root, the entry's directory when none is given.
fn checked_theme(
    named: Option<PathBuf>,
    entry: Option<PathBuf>,
    root: Option<&Path>,
    seed_hue: Option<f64>,
) -> ExitCode {
    let file = match (named, entry) {
        (Some(named), _) => named,
        (None, Some(entry)) => {
            let absolute =
                |path: &Path| std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf());
            let entry = absolute(&entry);
            let dir = entry.parent().unwrap_or(Path::new("/")).to_path_buf();
            let project = root.map_or_else(|| dir.clone(), absolute);
            let Some(found) = ljos_design::theme::find(&dir, &project) else {
                println!("null");
                return ExitCode::SUCCESS;
            };
            // Told as the caller names it, so a mistake points at a path it
            // knows.
            let here = std::env::current_dir().ok().map(|dir| absolute(&dir));
            here.and_then(|here| found.strip_prefix(here).ok().map(Path::to_path_buf))
                .unwrap_or(found)
        }
        (None, None) => unreachable!("asked only with one of the two"),
    };
    let name = file.to_string_lossy().replace('\\', "/");
    let text = match std::fs::read_to_string(&file) {
        Ok(text) => text,
        Err(error) => {
            eprintln!("{name}:1:1: {error}");
            return ExitCode::FAILURE;
        }
    };
    match ljos_web::theme::check(&name, &text, seed_hue) {
        Ok(theme) => {
            println!("{}", ljos_web::theme::json(&theme));
            ExitCode::SUCCESS
        }
        Err(errors) => {
            for error in errors {
                eprintln!("{error}");
            }
            ExitCode::FAILURE
        }
    }
}

/// `--imports FILE…`: what each file imports, as JSON, with what stops it
/// being read. Nothing is resolved: a file's imports are said as written.
fn listed_imports(files: &[String]) -> ExitCode {
    let mut said = Vec::new();
    for file in files {
        let text = match std::fs::read_to_string(file) {
            Ok(text) => text,
            Err(error) => {
                eprintln!("{file}: {error}");
                return ExitCode::FAILURE;
            }
        };
        let read = if file.ends_with(".js") {
            ljos_web::script_imports(&text)
        } else {
            ljos_web::imports(&text)
        };
        said.push(match read {
            Ok(found) => {
                serde_json::json!({ "file": file, "modules": found.modules, "paths": found.paths })
            }
            Err(errors) => {
                let errors: Vec<String> = errors
                    .iter()
                    .map(|error| {
                        let (line, column) = error.position(&text);
                        format!("{file}:{line}:{column}: {}", error.message)
                    })
                    .collect();
                serde_json::json!({ "file": file, "errors": errors })
            }
        });
    }
    println!("{}", serde_json::Value::Array(said));
    ExitCode::SUCCESS
}

fn main() -> ExitCode {
    let mut options = Options::default();
    let mut lowered = false;
    let mut alone = false;
    let mut shell = false;
    let mut types = None;
    let mut listing = false;
    let mut out_dir = None;
    let mut root = None;
    let mut imports = Vec::new();
    let mut with = Vec::new();
    let mut qt = Vec::new();
    let mut selectors = Vec::new();
    let mut files = Vec::new();
    let (mut theme, mut theme_for, mut seed_hue) = (None, None, None);
    let mut dumps = Vec::new();
    let mut args = std::env::args().skip(1).peekable();
    while let Some(arg) = args.next() {
        if arg == "--types" && args.peek().is_some_and(|next| next.ends_with(".json")) {
            dumps.extend(args.next());
            continue;
        }
        let mut value = |flag: &str| {
            args.next()
                .unwrap_or_else(|| panic!("{flag} needs a value"))
        };
        match arg.as_str() {
            "--emit" => lowered = value("--emit") == "lowered",
            "--out-dir" => out_dir = Some(value("--out-dir")),
            "--root" => root = Some(PathBuf::from(value("--root"))),
            "-I" | "--import-path" => imports.push(PathBuf::from(value(&arg))),
            "--with" => with.push(PathBuf::from(value("--with"))),
            "--qt" => qt.push(PathBuf::from(value("--qt"))),
            "--select" => selectors.push(value("--select")),
            "--host" => options.host_module = value("--host"),
            "--runtime" => options.runtime_module = value("--runtime"),
            "--alone" => alone = true,
            "--shell" => shell = true,
            "--urls-on-assignment" => options.urls_on_assignment = true,
            // What the file is called where an inspector says where things
            // are written: its path from the project, as the page has it.
            "--inspect" => options.inspect = Some(value("--inspect")),
            "--types" => types = Some(native_types as fn(&str) -> _),
            "--qml-types" => types = Some(written_types),
            "--imports" => listing = true,
            "--component-extension" => options.component_extension = value("--component-extension"),
            "--theme" => theme = Some(PathBuf::from(value("--theme"))),
            "--theme-for" => theme_for = Some(PathBuf::from(value("--theme-for"))),
            "--seed-hue" => {
                let hue = value("--seed-hue");
                seed_hue = Some(
                    hue.parse::<f64>()
                        .unwrap_or_else(|_| panic!("--seed-hue takes a number, not {hue}")),
                );
            }
            _ => files.push(arg),
        }
    }

    if theme.is_some() || theme_for.is_some() {
        return checked_theme(theme, theme_for, root.as_deref(), seed_hue);
    }

    if listing {
        return listed_imports(&files);
    }

    if let Some(types) = types {
        for uri in &files {
            // A module the table does not have is one with no line.
            if let Some(names) = types(uri) {
                println!("{uri} {}", names.join(" "));
            }
        }
        return ExitCode::SUCCESS;
    }

    // Asked only of a file compiled with its project, which is the one whose
    // imports have to be installed.
    if !alone {
        options.qt_imports = if qt.is_empty() { qt_imports() } else { qt };
    }

    let mut read = Vec::new();
    for dump in &dumps {
        let text = match std::fs::read_to_string(dump) {
            Ok(text) => text,
            Err(error) => {
                eprintln!("{dump}:1:1: {error}");
                return ExitCode::FAILURE;
            }
        };
        match ljos_web::dump::read(dump, &text) {
            Ok(types) => read.push((dump.clone(), types)),
            Err(error) => {
                eprintln!("{error}");
                return ExitCode::FAILURE;
            }
        }
    }
    let stand_ins = match ljos_web::dump::stand_ins(&read) {
        Ok(stand_ins) => stand_ins,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::FAILURE;
        }
    };
    // Where the stand-ins are shown: the project's directory, which a tool
    // that compiles each file on its own names every time.
    let shown = root.clone().or_else(|| {
        dumps
            .first()
            .and_then(|dump| Path::new(dump).parent().map(Path::to_path_buf))
    });
    let shown = shown.map(|shown| {
        if shown.as_os_str().is_empty() {
            PathBuf::from(".")
        } else {
            shown
        }
    });
    let shown = shown.and_then(|shown| Disk.canonicalize(&shown));
    let layered = shown
        .filter(|_| !read.is_empty())
        .map(|shown| Layered::new(&Disk, &shown, stand_ins));
    let dumped = layered
        .as_ref()
        .map(|layered| layered.directory().to_path_buf());
    let files_of: &dyn Files = match &layered {
        Some(layered) => layered,
        None => &Disk,
    };
    let load = Load {
        files: files_of,
        root,
        imports,
        with,
        selectors,
        dumped,
    };
    // The contracts of the blocks a shell uses: what a page with a live
    // shell compiles a dropped one against. With the `Load` its compile has,
    // so the modules are the ones that compile finds.
    if shell {
        let mut failed = false;
        for file in &files {
            let mut warnings = Vec::new();
            let asked = ljos_web::shell::contracts(
                &load,
                &options.qt_imports,
                Path::new(file),
                &mut warnings,
            );
            for warning in &warnings {
                eprintln!("warning: {warning}");
            }
            match asked {
                Ok(blocks) => println!(
                    "{}",
                    serde_json::to_string(&blocks).expect("contracts are JSON")
                ),
                Err(error) => {
                    eprintln!("{file}: {error}");
                    failed = true;
                }
            }
        }
        return if failed {
            ExitCode::FAILURE
        } else {
            ExitCode::SUCCESS
        };
    }

    let (mut compiled, mut failed) = (0, 0);
    for file in &files {
        let path = Path::new(file);
        let Some(done) = load.compile(path, &mut options, alone, lowered) else {
            let error = std::fs::read_to_string(path).err().map_or_else(
                || "could not be read".to_string(),
                |error| error.to_string(),
            );
            eprintln!("{file}: {error}");
            failed += 1;
            continue;
        };
        for warning in &done.warnings {
            eprintln!("warning: {warning}");
        }
        let stem = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("Component");
        let is_script = path.extension().is_some_and(|extension| extension == "js");
        match done.result {
            Ok(output) => {
                compiled += 1;
                match &out_dir {
                    Some(dir) => {
                        let name = if is_script {
                            format!("{stem}.js")
                        } else {
                            format!("{stem}.qml.js")
                        };
                        let target = Path::new(dir).join(name);
                        std::fs::create_dir_all(dir).expect("output directory");
                        std::fs::write(&target, output.code).expect("writable output");
                    }
                    None => println!("{}", output.code),
                }
            }
            Err(errors) => {
                failed += 1;
                for error in errors {
                    let (line, column) = error.position(&done.source);
                    eprintln!("{file}:{line}:{column}: {}", error.message);
                }
            }
        }
    }
    if files.len() > 1 {
        eprintln!("{compiled} compiled, {failed} failed");
    }
    if failed == 0 {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
