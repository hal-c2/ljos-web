//! Writes the table of Qt's QML types that `qml_solid::qt` reads.
//!
//! Qt describes every type it registers in files next to its plugins:
//! `qmldir` names a module, the modules that come with it and the types that
//! are QML files, and `*.qmltypes` lists the types registered from C++. This
//! reads them for the modules Qt's examples import and writes one small text
//! file, so the compiler knows QtQuick without having Qt.
//!
//! ```sh
//! qmltypes [--qt /usr/lib/qt6/qml]... [--out crates/qml_solid/types.txt]
//! ```
//!
//! `--qt` may be given more than once, for modules of Qt that are kept
//! somewhere else: a module is taken from the first directory that has it.
//! Without it, the directories `QML_IMPORT_PATH` names come before Qt's own.

mod model;
mod qmldir;
mod qmlfile;
mod qmltypes;
mod write;

use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    process::ExitCode,
};

use model::{Class, ImportKind, Module, Modules, Semantics, export};
use qmldir::Qmldir;
use qmlfile::QmlFile;

/// The modules of Qt that the examples in `corpus/qtdoc` import:
///
/// ```sh
/// grep -rhoE '^import [A-Za-z0-9.]+' corpus/qtdoc/examples --include=*.qml | sort -u
/// ```
///
/// without the ones the examples define themselves, and with the ones the
/// styles of Qt Quick Controls import: a style is QML too, compiled as an
/// example is. So is what stands in for an example's C++ in
/// `corpus/standins`, which imports QtWebSockets. What these need comes
/// along; one that is not installed is reported and left out.
const MODULES: &[&str] = &[
    "Qt.labs.assetdownloader",
    "Qt.labs.folderlistmodel",
    "Qt.labs.qmlmodels",
    "Qt.labs.synchronizer",
    "QtCharts",
    "QtCore",
    "QtGraphs",
    "QtLocation",
    "QtMultimedia",
    "QtPositioning",
    "QtQml",
    "QtQml.Models",
    "QtQml.XmlListModel",
    "QtQuick",
    "QtQuick.Controls",
    "QtQuick.Controls.Basic",
    "QtQuick.Controls.Basic.impl",
    "QtQuick.Controls.Fusion",
    "QtQuick.Controls.Fusion.impl",
    "QtQuick.Controls.Imagine",
    "QtQuick.Controls.Imagine.impl",
    "QtQuick.Controls.Material",
    "QtQuick.Controls.Material.impl",
    "QtQuick.Controls.Universal",
    "QtQuick.Controls.Universal.impl",
    "QtQuick.Controls.impl",
    "QtQuick.Dialogs",
    "QtQuick.Effects",
    "QtQuick.Layouts",
    "QtQuick.LocalStorage",
    "QtQuick.Particles",
    "QtQuick.Shapes",
    "QtQuick.Studio.Application",
    "QtQuick.Studio.Components",
    "QtQuick.Studio.DesignEffects",
    "QtQuick.Templates",
    "QtQuick.Timeline",
    "QtQuick.VectorImage",
    "QtQuick.Window",
    "QtQuick3D",
    "QtQuick3D.AssetUtils",
    "QtQuick3D.Effects",
    "QtQuick3D.Helpers",
    "QtQuick3D.Particles3D",
    "QtQuick3D.Physics",
    "QtQuick3D.Xr",
    "QtSensors",
    "QtWebSockets",
];

/// The module every QML file has without importing it.
const BUILTINS: &str = "QML";

fn main() -> ExitCode {
    let mut qt: Vec<PathBuf> = Vec::new();
    let mut out =
        PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../qml_solid/types.txt"));
    let mut arguments = std::env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match (argument.as_str(), arguments.next()) {
            ("--qt", Some(path)) => qt.push(path.into()),
            ("--out", Some(path)) => out = path.into(),
            _ => {
                eprintln!("usage: qmltypes [--qt DIRECTORY]... [--out FILE]");
                return ExitCode::FAILURE;
            }
        }
    }

    // As Qt looks for them: where `QML_IMPORT_PATH` says, then Qt's own.
    if qt.is_empty() {
        if let Some(elsewhere) = std::env::var_os("QML_IMPORT_PATH") {
            qt.extend(std::env::split_paths(&elsewhere).filter(|path| !path.as_os_str().is_empty()));
        }
        qt.push(PathBuf::from("/usr/lib/qt6/qml"));
    }

    match generate(&qt) {
        Ok(text) => {
            if let Err(error) = fs::write(&out, &text) {
                eprintln!("{}: {error}", out.display());
                return ExitCode::FAILURE;
            }
            eprintln!("{}: {} bytes", out.display(), text.len());
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

/// A module as its directory has it, before the modules are put together.
struct Source {
    qmldir: Qmldir,
    classes: Vec<Class>,
    /// The types that are QML files: name, path under the Qt directory, and
    /// the file when it was there and the parser took it.
    files: Vec<(String, String, Option<QmlFile>)>,
}

fn generate(qt: &[PathBuf]) -> Result<String, String> {
    let mut directories = BTreeMap::new();
    for root in qt {
        let found =
            qmldir::find(root).map_err(|error| format!("{}: {error}", root.display()))?;
        for (uri, directory) in found {
            directories.entry(uri).or_insert((root.as_path(), directory));
        }
    }

    let mut sources = BTreeMap::new();
    let mut missing = BTreeSet::new();
    let mut wanted: Vec<String> = MODULES.iter().map(|uri| uri.to_string()).collect();
    wanted.push(BUILTINS.to_string());
    while let Some(uri) = wanted.pop() {
        if sources.contains_key(&uri) || missing.contains(&uri) {
            continue;
        }
        let Some((root, directory)) = directories.get(&uri) else {
            missing.insert(uri);
            continue;
        };
        let source = read(root, directory)?;
        wanted.extend(needs(&source));
        sources.insert(uri, source);
    }
    for uri in &missing {
        eprintln!("not installed: {uri}");
    }

    let version = newest(&sources);
    let mut modules = classes(&sources);
    files(&sources, &mut modules);
    tidy(&mut modules);
    Ok(write::write(&modules, version))
}

fn read(qt: &Path, directory: &Path) -> Result<Source, String> {
    let text = |path: &Path| {
        fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))
    };
    let relative =
        |path: &Path| path.strip_prefix(qt).unwrap_or(path).to_string_lossy().replace('\\', "/");

    let qmldir = qmldir::parse(&text(&directory.join("qmldir"))?);
    let mut classes = Vec::new();
    for typeinfo in &qmldir.typeinfo {
        let path = directory.join(typeinfo);
        // A parse error is fatal: a module without its types would silently
        // turn every one of them into an unknown component.
        classes.extend(
            qmltypes::read(&text(&path)?)
                .map_err(|error| format!("{}: {error}", path.display()))?,
        );
    }
    let mut files = Vec::new();
    for (name, file) in &qmldir.files {
        let path = directory.join(&file.file);
        let parsed = match fs::read_to_string(&path) {
            Ok(source) => qmlfile::read(&source)
                .map_err(|error| eprintln!("{}: not read: {error}", relative(&path)))
                .ok(),
            // Qt may have the file only inside the plugin.
            Err(_) => {
                eprintln!("{}: not on disk", relative(&path));
                None
            }
        };
        files.push((name.clone(), relative(&path), parsed));
    }
    Ok(Source { qmldir, classes, files })
}

/// The modules a module's descriptions refer to: the ones it imports or
/// depends on, and the ones its QML files take their root types from.
fn needs(source: &Source) -> Vec<String> {
    let qmldir = &source.qmldir;
    let imports = qmldir
        .imports
        .iter()
        .filter(|import| import.kind != ImportKind::Optional)
        .map(|import| import.module.clone());
    let roots = source.files.iter().filter_map(|(_, _, file)| file.as_ref()).flat_map(|file| {
        let alias = file.root.split_once('.').map(|(alias, _)| alias);
        file.imports
            .iter()
            .filter(move |(_, known)| known.as_deref() == alias)
            .map(|(module, _)| module.clone())
    });
    imports.chain(qmldir.depends.iter().cloned()).chain(roots).collect()
}

/// The newest version anything is exported at, which is the Qt the
/// descriptions are from.
fn newest(sources: &BTreeMap<String, Source>) -> (u32, u32) {
    let files = sources.values().flat_map(|source| source.qmldir.files.values());
    let classes = sources.values().flat_map(|source| &source.classes);
    files
        .map(|file| file.version)
        .chain(classes.flat_map(|class| class.exports.values().copied()))
        .max()
        .unwrap_or_default()
}

/// The classes of the `.qmltypes` files, each in one module, and what every
/// module exports of them.
///
/// A class registered by several modules is described by each (Templates and
/// the Basic style both have `QQuickOverlay`). The descriptions differ only in
/// what they export, so one is kept and it exports what all of them do. Kept
/// is one whose own module exports it, of those the one that says most.
///
/// Descriptions that differ in more are of classes that share a name and no
/// more: QtCharts and QtGraphs each have a `QAbstractAxis`. Each is kept,
/// named with its module (`QAbstractAxis@QtGraphs`), and what a module says
/// of the name is said of its own.
fn classes(sources: &BTreeMap<String, Source>) -> Modules {
    let mut modules: Modules = sources
        .iter()
        .map(|(uri, source)| {
            (uri.clone(), Module { imports: source.qmldir.imports.clone(), ..Module::default() })
        })
        .collect();

    let same = |one: &Class, other: &Class| {
        one.prototype == other.prototype && one.properties == other.properties
    };
    let mut described: BTreeMap<&str, Vec<Vec<(&str, &Class)>>> = BTreeMap::new();
    for (uri, source) in sources {
        for class in &source.classes {
            let kinds = described.entry(&class.name).or_default();
            match kinds.iter_mut().find(|kind| same(kind[0].1, class)) {
                Some(kind) => kind.push((uri, class)),
                None => kinds.push(vec![(uri, class)]),
            }
        }
    }

    let mut kept: Vec<(&str, Class)> = Vec::new();
    // What a module means by a name that several classes have.
    let mut own: BTreeMap<&str, BTreeMap<&str, String>> = BTreeMap::new();
    for (name, kinds) in &described {
        for descriptions in kinds {
            let rank = |(uri, class): &(&str, &Class)| {
                (class.exports.keys().any(|(module, _)| module == uri), class.members())
            };
            // `max_by_key` takes the last of equals; the first is wanted.
            let (home, described) =
                descriptions.iter().rev().max_by_key(|description| rank(description)).expect("one");
            let mut class = (*described).clone();
            if kinds.len() > 1 {
                class.name = format!("{name}@{home}");
            }
            for (uri, other) in descriptions {
                if kinds.len() > 1 {
                    own.entry(uri).or_default().insert(name, class.name.clone());
                }
                class.aliases.extend(other.aliases.iter().cloned());
                for (export, version) in &other.exports {
                    let known = class.exports.entry(export.clone()).or_default();
                    *known = (*known).max(*version);
                }
            }
            kept.push((home, class));
        }
    }

    for (home, class) in &mut kept {
        let links =
            [&mut class.prototype, &mut class.extension, &mut class.attached, &mut class.element];
        let types = class.properties.iter_mut().map(|property| &mut property.type_name);
        for link in links.into_iter().flatten().chain(types) {
            if let Some(class) = own.get(home).and_then(|own| own.get(link.as_str())) {
                link.clone_from(class);
            }
        }
    }
    // Of two classes with one name the newer is the type: `TextInput` was
    // `QQuickPre64TextInput` until 6.4.
    let mut names: BTreeMap<(&str, &str), ((u32, u32), &str)> = BTreeMap::new();
    for (_, class) in &kept {
        for ((module, exported), version) in &class.exports {
            let known = names.entry((module, exported)).or_insert((*version, &class.name));
            if *version >= known.0 {
                *known = (*version, &class.name);
            }
        }
    }
    for ((module, exported), (_, class)) in names {
        if let Some(module) = modules.get_mut(module) {
            module.exports.insert(exported.to_string(), class.to_string());
        }
    }
    for (home, class) in kept {
        modules.get_mut(home).expect("read").classes.insert(class.name.clone(), class);
    }
    modules
}

/// Adds the types that are QML files. Such a type is a class named by its
/// file; its prototype is the class of the file's root object.
fn files(sources: &BTreeMap<String, Source>, modules: &mut Modules) {
    // A file may have the name of the class it is made of (`SideBar.qml` is
    // a `DialogsQuickImpl.SideBar`): the file is the type, the class its root.
    let mut replaced = BTreeMap::new();
    for (uri, source) in sources {
        let module = modules.get_mut(uri).expect("read");
        for (name, path, _) in &source.files {
            if let Some(class) = module.exports.insert(name.clone(), path.clone()) {
                replaced.insert(path, class);
            }
        }
    }
    for (uri, source) in sources {
        for (name, path, file) in &source.files {
            let is_singleton = source.qmldir.files[name].is_singleton;
            let mut class = Class { name: path.clone(), is_singleton, ..Class::default() };
            if let Some(file) = file {
                let class_of = |written: &str| resolve(modules, uri, file, written);
                class.prototype = class_of(&file.root)
                    .filter(|prototype| prototype != path)
                    .or_else(|| replaced.get(path).cloned());
                if class.prototype.is_none() {
                    eprintln!("{path}: root type {} not found", file.root);
                }
                class.is_singleton |= file.is_singleton;
                class.default_property = file.default_property.clone();
                class.enums = file.enums.clone();
                class.properties = file.properties.clone();
                for property in &mut class.properties {
                    // Left as written when it is not a type (`alias`).
                    if let Some(class) = class_of(&property.type_name) {
                        property.type_name = class;
                    }
                }
                class.signals = file.signals.clone();
                class.methods = file.methods.clone();
            }
            modules.get_mut(uri).expect("read").classes.insert(path.clone(), class);
        }
    }
}

/// The class a QML file means by a type name: `T.Button` in the modules
/// imported as `T`, `Button` in the others, the last import first, then in
/// the file's own module and the built-ins.
fn resolve(modules: &Modules, own: &str, file: &QmlFile, written: &str) -> Option<String> {
    let (alias, name) = match written.split_once('.') {
        Some((alias, name)) => (Some(alias), name),
        None => (None, written),
    };
    let imported = file
        .imports
        .iter()
        .rev()
        .filter(|(_, known)| known.as_deref() == alias)
        .find_map(|(module, _)| export(modules, module, name));
    let implicit = || {
        alias
            .is_none()
            .then(|| export(modules, own, name).or_else(|| export(modules, BUILTINS, name)))?
    };
    imported.or_else(implicit).map(str::to_string)
}

/// Makes every reference one the reader can follow: a class by its one name,
/// a list as its element type, and nothing pointing at a class that is not
/// there. Then drops what no QML name leads to.
fn tidy(modules: &mut Modules) {
    let classes: BTreeMap<String, Class> =
        modules.values().flat_map(|module| module.classes.clone()).collect();
    let aliases: BTreeMap<&str, &str> = classes
        .values()
        .flat_map(|class| class.aliases.iter().map(|alias| (alias.as_str(), class.name.as_str())))
        .collect();
    let canonical = |name: &str| aliases.get(name).copied().unwrap_or(name).to_string();
    let known = |name: &Option<String>| {
        name.as_deref().map(canonical).filter(|name| classes.contains_key(name))
    };

    for class in modules.values_mut().flat_map(|module| module.classes.values_mut()) {
        for (what, link) in
            [("prototype", &mut class.prototype), ("attached type", &mut class.attached)]
        {
            let found = known(link);
            if let (Some(name), None) = (&link, &found) {
                eprintln!("{}: {what} {name} is not described", class.name);
            }
            *link = found;
        }
        // Mostly JavaScript prototypes, which are not read.
        class.extension = known(&class.extension);
        for property in &mut class.properties {
            property.type_name = canonical(&property.type_name);
            // `QList<QUrl>`, `QStringList`: a list of the element type.
            while let Some(Class {
                semantics: Semantics::Sequence, element: Some(element), ..
            }) = classes.get(&property.type_name)
            {
                property.type_name = canonical(element);
                property.is_list = true;
            }
        }
    }

    let mut reached = BTreeSet::new();
    let mut next: Vec<&str> =
        modules.values().flat_map(|module| module.exports.values().map(String::as_str)).collect();
    while let Some(name) = next.pop() {
        let Some(class) = modules.values().find_map(|module| module.classes.get(name)) else {
            continue;
        };
        if !reached.insert(name.to_string()) {
            continue;
        }
        let links = [&class.prototype, &class.extension, &class.attached];
        next.extend(links.into_iter().flatten().map(String::as_str));
        next.extend(class.properties.iter().map(|property| property.type_name.as_str()));

        // The reader follows prototypes without looking back.
        let mut ancestor = class;
        for _ in 0..64 {
            let Some(prototype) = ancestor.prototype.as_ref().and_then(|name| classes.get(name))
            else {
                break;
            };
            ancestor = prototype;
        }
        assert!(ancestor.prototype.is_none(), "{name} is its own prototype");
    }
    for module in modules.values_mut() {
        module
            .classes
            .retain(|name, class| reached.contains(name) && class.semantics != Semantics::Sequence);
    }
}
