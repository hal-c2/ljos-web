//! `qmlc [--emit js|lowered] [--out-dir DIR] [--root DIR] [--with DIR]... [--qt DIR]... [--select NAME]... [--host MODULE] [--runtime MODULE] [--alone] FILE.qml...`
//! `qmlc --types|--qml-types URI...`
//!
//! Compiles each QML file to a JavaScript module, and each `.js` file as the
//! script a QML file imports. Without `--out-dir` the output goes to stdout. A file is compiled with the QML files next to it
//! and in the directories they import, which is where the components it
//! names are and where it is used, and with the modules of the project it
//! is in: what the `qmldir` and `CMakeLists.txt` files under `--root` say
//! they are. Without `--root` that is the nearest directory above the file
//! whose `CMakeLists.txt` starts a project. `--with` names a directory with
//! more of the project's modules, described by `qmldir` files likewise: the
//! QML that stands in for the types a program has in C++, where there is no
//! C++. `--select` names a file selector, as Qt has them: the style of the
//! controls, say. A file with one of the same name in the directory `+NAME`
//! next to it is read from there instead, and is still the file it was. With
//! `--alone` it is compiled by itself: it takes only what it declares, and a
//! type it does not know is taken to be a component.
//!
//! A module a file imports has to be installed: one of the project's, of
//! Qt's table, of the runtime package, or of the Qt that is installed, whose
//! modules are where `--qt` says (otherwise where `QML_IMPORT_PATH` and
//! `qtpaths` say). One that is none of these is an error where it is
//! imported, as it is to Qt.
//!
//! `--types` prints, for each module of Qt's, the types Qt has of it in C++:
//! a line of the URI and its names. That is what a runtime has to have of
//! the module, the rest of which is QML. `--qml-types` prints that rest
//! likewise: the types Qt has of the module as QML files, which are there
//! only where that module of Qt's is installed.

use std::{
    collections::HashSet,
    path::{Component, Path, PathBuf},
    process::ExitCode,
    sync::OnceLock,
};

use ljos_web::{Options, Project, compile, compile_script, discover, lowered_source, native_types, written_types};

/// The file selectors given, the first to have a file deciding.
static SELECTORS: OnceLock<Vec<String>> = OnceLock::new();

/// What `file` says: what the one a selector puts in its place says, when
/// there is one.
fn read(file: &Path) -> std::io::Result<String> {
    let chosen = SELECTORS.get().into_iter().flatten().find_map(|selector| {
        let chosen = file.parent()?.join(format!("+{selector}")).join(file.file_name()?);
        chosen.is_file().then_some(chosen)
    });
    std::fs::read_to_string(chosen.as_deref().unwrap_or(file))
}

/// The directory the project `path` is in starts at.
fn project_root(path: &Path) -> PathBuf {
    let directory = path.parent().unwrap_or(Path::new("/"));
    directory
        .ancestors()
        .find(|ancestor| {
            std::fs::read_to_string(ancestor.join("CMakeLists.txt"))
                .is_ok_and(|text| text.lines().any(|line| line.trim_start().starts_with("project(")))
        })
        .unwrap_or(directory)
        .to_path_buf()
}

/// The project the one at `root` is built as a part of, if any: the nearest
/// directory above whose build takes it in (`add_subdirectory(QtExampleStyle)`).
fn including(root: &Path) -> Option<&Path> {
    root.ancestors().skip(1).find(|above| {
        let Ok(part) = root.strip_prefix(above) else { return false };
        let part = part.to_string_lossy();
        std::fs::read_to_string(above.join("CMakeLists.txt")).is_ok_and(|text| {
            text.lines().filter_map(|line| line.trim_start().strip_prefix("add_subdirectory(")).any(|rest| {
                let named = rest.split([')', ' ']).next().unwrap_or(rest).trim_matches('"');
                named.trim_end_matches('/') == part
            })
        })
    })
}

/// The whole program the project at `root` is of: what is built with it is
/// in the same program, and the files that one keeps are there for all of it.
fn program_root(root: &Path) -> &Path {
    let mut whole = root;
    while let Some(above) = including(whole) {
        whole = above;
    }
    whole
}

/// The files under `root` that say what a module is.
fn descriptions(root: &Path, found: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if path.is_dir() {
            if is_source(&name) {
                descriptions(&path, found);
            }
        } else if name == "qmldir" || name == "CMakeLists.txt" {
            found.push(path);
        }
    }
}

/// What a build or a package manager put there is not the project, and
/// neither are the files a selector chooses from: each is another by its
/// name.
fn is_source(name: &str) -> bool {
    !name.starts_with(['.', '+']) && !name.starts_with("build") && name != "node_modules" && name != "target"
}

/// The QML files in `directory` and under it, by their path from `base`:
/// what a path put together when the program runs may name.
fn qml_files(directory: &Path, base: &Path, found: &mut Vec<String>) {
    walk(directory, base, &|name| name.ends_with(".qml"), found);
}

/// The files in `directory` and under it that `wanted` takes the name of.
fn walk(directory: &Path, base: &Path, wanted: &dyn Fn(&str) -> bool, found: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(directory) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if path.is_dir() {
            if is_source(&name) {
                walk(&path, base, wanted, found);
            }
        } else if wanted(&name) {
            found.push(relative(base, &path));
        }
    }
}

/// `to` from the directory `from`, both absolute: `../imports/Clock.qml`.
fn relative(from: &Path, to: &Path) -> String {
    let from: Vec<Component> = from.components().collect();
    let to: Vec<Component> = to.components().collect();
    let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let mut parts: Vec<String> = vec!["..".to_string(); from.len() - common];
    parts.extend(to[common..].iter().map(|part| part.as_os_str().to_string_lossy().into_owned()));
    parts.join("/")
}

/// Adds the modules of the project under `root`, their files by the path
/// from `base`: the directory of the file being compiled. With `standing`
/// they stand in for types the program has in C++.
fn modules(project: &mut Project, root: &Path, base: &Path, standing: bool) {
    let mut found = Vec::new();
    descriptions(root, &mut found);
    found.sort();
    for description in found {
        let Ok(text) = std::fs::read_to_string(&description) else { continue };
        let directory = description.parent().unwrap_or(root);
        let modules = if description.ends_with("qmldir") {
            discover::qmldir(&text).into_iter().collect()
        } else {
            discover::cmake(&text)
        };
        for module in modules {
            project.add_module(&module.uri);
            for ty in module.types {
                let Ok(file) = directory.join(&ty.path).canonicalize() else { continue };
                let path = relative(base, &file);
                let Some(key) = path.strip_suffix(".qml") else { continue };
                if !project.has(key) {
                    let Ok(source) = read(&file) else { continue };
                    if project.add(key, &source).is_err() {
                        continue;
                    }
                }
                project.add_type(&module.uri, &ty.name, key);
                if standing {
                    project.stand_in(key);
                }
            }
        }
    }
}

/// Adds the files the builds under `root` keep in the program, each by the
/// path from `base`: the ones that go with a module and the ones kept by
/// themselves.
fn kept(project: &mut Project, root: &Path, base: &Path) {
    let mut found = Vec::new();
    descriptions(root, &mut found);
    for description in found.iter().filter(|description| description.ends_with("CMakeLists.txt")) {
        let Ok(text) = std::fs::read_to_string(description) else { continue };
        let directory = description.parent().unwrap_or(root);
        let modules = discover::cmake(&text);
        let with = modules.iter().flat_map(|module| module.resources.iter().map(|resource| (module.address(resource), resource.clone())));
        let alone = discover::kept(&text).into_iter().map(|resource| (resource.address, resource.path));
        for (address, path) in with.chain(alone) {
            let Ok(file) = directory.join(&path).canonicalize() else { continue };
            project.add_resource(&address, &relative(base, &file));
        }
    }
}

/// The QML files `path` is compiled with: the ones next to it, which is
/// where the components it names are and where it is used, and the ones in
/// the directories any of them imports. One that does not parse is left out
/// here and reported when it is compiled itself.
fn project(path: &Path, project_root: Option<&Path>, with: &[PathBuf]) -> Project {
    let mut project = Project::new();
    let root = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    if let (Ok(base), Ok(path)) = (root.canonicalize(), path.canonicalize()) {
        let project_root = project_root.map_or_else(|| self::project_root(&path), Path::to_path_buf);
        if let Ok(project_root) = project_root.canonicalize() {
            modules(&mut project, &project_root, &base, false);
            // A program's files are one lot, whichever part names one.
            kept(&mut project, program_root(&project_root), &base);
        }
        for more in with.iter().filter_map(|more| more.canonicalize().ok()) {
            modules(&mut project, &more, &base, true);
        }
    }
    // A file's key is its path from the compiled file's directory, without
    // the extension: `Clock`, `content/Clock`.
    let mut loaded = HashSet::new();
    let mut pending = vec![String::new()];
    while let Some(directory) = pending.pop() {
        if !loaded.insert(directory.clone()) {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(root.join(&directory)) else { continue };
        for entry in entries.flatten() {
            let file = entry.path();
            if file.extension().is_none_or(|extension| extension != "qml") {
                continue;
            }
            let (Some(stem), Ok(source)) =
                (file.file_stem().and_then(|stem| stem.to_str()), read(&file))
            else {
                continue;
            };
            let key = if directory.is_empty() { stem.to_string() } else { format!("{directory}/{stem}") };
            if !project.has(&key) {
                let _ = project.add(&key, &source);
            }
        }
        pending.extend(project.directories());
    }
    // A file may be made by one anywhere in the program that names it by its
    // path, and finds in that one what it does not have itself: the rest of
    // the program is there for what it names.
    if let (Ok(base), Ok(path)) = (root.canonicalize(), path.canonicalize()) {
        let project_root = project_root.map_or_else(|| self::project_root(&path), Path::to_path_buf);
        let mut found = Vec::new();
        qml_files(&project_root, &base, &mut found);
        found.sort();
        for file in found {
            let Some(key) = file.strip_suffix(".qml") else { continue };
            if !project.has(key) {
                if let Ok(source) = read(&base.join(&file)) {
                    let _ = project.add(key, &source);
                }
            }
        }
    }
    project
}

/// Where the Qt that is installed keeps its QML modules, when `--qt` does not
/// say: what `QML_IMPORT_PATH` names and Qt's own directory, as Qt looks.
fn qt_imports() -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = std::env::var_os("QML_IMPORT_PATH")
        .map(|paths| std::env::split_paths(&paths).collect())
        .unwrap_or_default();
    let own = std::env::var_os("QT_INSTALL_QML").map(PathBuf::from).or_else(|| {
        ["qtpaths6", "qtpaths", "qmake6"].into_iter().find_map(|tool| {
            let query = if tool.starts_with("qmake") { "-query" } else { "--query" };
            let asked = std::process::Command::new(tool).args([query, "QT_INSTALL_QML"]).output().ok()?;
            let answer = String::from_utf8(asked.stdout).ok()?;
            let answer = answer.trim();
            (asked.status.success() && !answer.is_empty()).then(|| PathBuf::from(answer))
        })
    });
    found.extend(own);
    found
}

fn main() -> ExitCode {
    let mut options = Options::default();
    let mut lowered = false;
    let mut alone = false;
    let mut types = None;
    let mut out_dir = None;
    let mut root = None;
    let mut with = Vec::new();
    let mut qt = Vec::new();
    let mut selectors = Vec::new();
    let mut files = Vec::new();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        let mut value = |flag: &str| args.next().unwrap_or_else(|| panic!("{flag} needs a value"));
        match arg.as_str() {
            "--emit" => lowered = value("--emit") == "lowered",
            "--out-dir" => out_dir = Some(value("--out-dir")),
            "--root" => root = Some(PathBuf::from(value("--root"))),
            "--with" => with.push(PathBuf::from(value("--with"))),
            "--qt" => qt.push(PathBuf::from(value("--qt"))),
            "--select" => selectors.push(value("--select")),
            "--host" => options.host_module = value("--host"),
            "--runtime" => options.runtime_module = value("--runtime"),
            "--alone" => alone = true,
            "--urls-on-assignment" => options.urls_on_assignment = true,
            "--types" => types = Some(native_types as fn(&str) -> _),
            "--qml-types" => types = Some(written_types),
            "--component-extension" => options.component_extension = value("--component-extension"),
            _ => files.push(arg),
        }
    }

    SELECTORS.get_or_init(|| selectors);

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

    let (mut compiled, mut failed) = (0, 0);
    for file in &files {
        let path = Path::new(file);
        let source = match read(path) {
            Ok(source) => source,
            Err(error) => {
                eprintln!("{file}: {error}");
                failed += 1;
                continue;
            }
        };
        let stem = path.file_stem().and_then(|stem| stem.to_str()).unwrap_or("Component");
        let is_script = path.extension().is_some_and(|extension| extension == "js");
        options.name = stem.to_string();
        options.project = (!alone && !is_script).then(|| project(path, root.as_deref(), &with));
        let directory = match path.parent() {
            Some(parent) if !parent.as_os_str().is_empty() => parent,
            _ => Path::new("."),
        };
        options.files = (!alone).then(|| {
            let mut files = Vec::new();
            qml_files(directory, directory, &mut files);
            files.sort();
            files
        });
        options.pictures = (!alone).then(|| {
            let mut pictures = Vec::new();
            walk(directory, directory, &|name| !name.ends_with(".qml"), &mut pictures);
            pictures
        });
        let result = if is_script {
            compile_script(&source, &options).map(|output| output.code)
        } else if lowered {
            lowered_source(&source, &options)
        } else {
            compile(&source, &options).map(|output| output.code)
        };
        match result {
            Ok(code) => {
                compiled += 1;
                match &out_dir {
                    Some(dir) => {
                        let name = if is_script { format!("{stem}.js") } else { format!("{stem}.qml.js") };
                        let target = Path::new(dir).join(name);
                        std::fs::create_dir_all(dir).expect("output directory");
                        std::fs::write(&target, code).expect("writable output");
                    }
                    None => println!("{code}"),
                }
            }
            Err(errors) => {
                failed += 1;
                for error in errors {
                    let (line, column) = error.position(&source);
                    eprintln!("{file}:{line}:{column}: {}", error.message);
                }
            }
        }
    }
    if files.len() > 1 {
        eprintln!("{compiled} compiled, {failed} failed");
    }
    if failed == 0 { ExitCode::SUCCESS } else { ExitCode::FAILURE }
}
