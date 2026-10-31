//! Where a file is compiled from: the files of its project, and what they
//! say its modules are.
//!
//! `qmlc` reads them from the disk, and a page that compiles is given them
//! as texts. Both go through [`Files`], so the rules of what a module is
//! (the `qmldir` at its place under the first import path that has one, a
//! `# block` line, a build's `CMakeLists.txt`) are one piece of code, not a
//! copy for each.

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    path::{Component, Path, PathBuf},
};

use qml_front::discover;

use crate::{Error, Options, Output, Project, compile, compile_script, lowered_source};

/// What a compile may read. Paths are absolute; one that is not there reads
/// as nothing.
pub trait Files {
    fn read(&self, path: &Path) -> Option<String>;
    /// The names in a directory, each with whether it is a directory.
    fn entries(&self, directory: &Path) -> Vec<(String, bool)>;
    fn is_file(&self, path: &Path) -> bool;
    /// The path with `.` and `..` taken out and links followed, when it is
    /// there.
    fn canonicalize(&self, path: &Path) -> Option<PathBuf>;
}

/// Files given as texts, by their paths from the project's directory, which
/// is `/`: what a page that compiles has.
#[derive(Debug, Clone, Default)]
pub struct Memory {
    files: BTreeMap<PathBuf, String>,
    directories: HashSet<PathBuf>,
}

impl Memory {
    pub fn new<P: AsRef<str>, T: Into<String>>(files: impl IntoIterator<Item = (P, T)>) -> Self {
        let mut memory = Self::default();
        memory.directories.insert(PathBuf::from("/"));
        for (path, text) in files {
            let Some(path) = normalized(&Path::new("/").join(path.as_ref())) else { continue };
            memory.directories.extend(path.ancestors().skip(1).map(Path::to_path_buf));
            memory.files.insert(path, text.into());
        }
        memory
    }
}

impl Files for Memory {
    fn read(&self, path: &Path) -> Option<String> {
        self.files.get(&normalized(path)?).cloned()
    }

    fn entries(&self, directory: &Path) -> Vec<(String, bool)> {
        let Some(directory) = normalized(directory) else { return Vec::new() };
        let mut found: BTreeMap<String, bool> = BTreeMap::new();
        for path in self.files.keys() {
            let Ok(rest) = path.strip_prefix(&directory) else { continue };
            let mut parts = rest.components();
            let Some(Component::Normal(first)) = parts.next() else { continue };
            *found.entry(first.to_string_lossy().into_owned()).or_default() |= parts.next().is_some();
        }
        found.into_iter().collect()
    }

    fn is_file(&self, path: &Path) -> bool {
        normalized(path).is_some_and(|path| self.files.contains_key(&path))
    }

    fn canonicalize(&self, path: &Path) -> Option<PathBuf> {
        let path = normalized(path)?;
        (self.files.contains_key(&path) || self.directories.contains(&path)).then_some(path)
    }
}

/// An absolute path with `.` and `..` taken out; none for one that leaves
/// the root.
fn normalized(path: &Path) -> Option<PathBuf> {
    // Not `is_absolute`: on a target with no OS (wasm32-unknown-unknown) no
    // path is, as there `/` alone is no prefix.
    if !path.has_root() {
        return None;
    }
    let mut parts: Vec<&std::ffi::OsStr> = Vec::new();
    for part in path.components() {
        match part {
            Component::Normal(name) => parts.push(name),
            Component::ParentDir => {
                parts.pop()?;
            }
            Component::CurDir | Component::RootDir | Component::Prefix(_) => {}
        }
    }
    let mut normal = PathBuf::from("/");
    normal.extend(parts);
    Some(normal)
}

/// How the files of a project are looked through: what `qmlc`'s options say.
pub struct Load<'f> {
    pub files: &'f dyn Files,
    /// The project's directory (`--root`): otherwise the nearest directory
    /// above the file whose `CMakeLists.txt` starts a project.
    pub root: Option<PathBuf>,
    /// Looked in for a module before the root, in order (`-I`).
    pub imports: Vec<PathBuf>,
    /// Modules that stand in for types a program has in C++ (`--with`).
    pub with: Vec<PathBuf>,
    /// File selectors, the first to have a file deciding (`--select`).
    pub selectors: Vec<String>,
}

/// What compiling one file gave, and what was found wrong on the way that
/// did not stop it.
pub struct Compiled {
    pub result: Result<Output, Vec<Error>>,
    pub source: String,
    pub warnings: Vec<String>,
}

impl<'f> Load<'f> {
    pub fn new(files: &'f dyn Files) -> Self {
        Self { files, root: None, imports: Vec::new(), with: Vec::new(), selectors: Vec::new() }
    }

    /// What `file` says: what the one a selector puts in its place says,
    /// when there is one.
    pub fn read(&self, file: &Path) -> Option<String> {
        let chosen = self.selectors.iter().find_map(|selector| {
            let chosen = file.parent()?.join(format!("+{selector}")).join(file.file_name()?);
            self.files.is_file(&chosen).then_some(chosen)
        });
        self.files.read(chosen.as_deref().unwrap_or(file))
    }

    /// Compiles `path` as `qmlc` does: a `.js` file as the script a QML file
    /// imports, a QML file with its project unless `alone`. `lowered` gives
    /// the tree handed to Solid instead of Solid's output.
    pub fn compile(&self, path: &Path, options: &mut Options, alone: bool, lowered: bool) -> Option<Compiled> {
        let source = self.read(path)?;
        let mut warnings = Vec::new();
        let stem = path.file_stem().and_then(|stem| stem.to_str()).unwrap_or("Component");
        let is_script = path.extension().is_some_and(|extension| extension == "js");
        options.name = stem.to_string();
        options.project = (!alone && !is_script).then(|| self.project(path, &options.qt_imports, &mut warnings));
        let directory = directory(path);
        options.files = (!alone).then(|| {
            let mut files = Vec::new();
            self.walk(directory, directory, &|name| name.ends_with(".qml"), &mut files);
            files.sort();
            files
        });
        options.pictures = (!alone).then(|| {
            let mut pictures = Vec::new();
            self.walk(directory, directory, &|name| !name.ends_with(".qml"), &mut pictures);
            pictures
        });
        let result = if is_script {
            compile_script(&source, options)
        } else if lowered {
            lowered_source(&source, options).map(|code| Output { code, map: None })
        } else {
            compile(&source, options)
        };
        Some(Compiled { result, source, warnings })
    }

    /// The directory the project `path` is in starts at.
    fn project_root(&self, path: &Path) -> PathBuf {
        let directory = path.parent().unwrap_or(Path::new("/"));
        directory
            .ancestors()
            .find(|ancestor| {
                self.files
                    .read(&ancestor.join("CMakeLists.txt"))
                    .is_some_and(|text| text.lines().any(|line| line.trim_start().starts_with("project(")))
            })
            .unwrap_or(directory)
            .to_path_buf()
    }

    /// The project the one at `root` is built as a part of, if any: the
    /// nearest directory above whose build takes it in
    /// (`add_subdirectory(QtExampleStyle)`).
    fn including<'p>(&self, root: &'p Path) -> Option<&'p Path> {
        root.ancestors().skip(1).find(|above| {
            let Ok(part) = root.strip_prefix(above) else { return false };
            let part = part.to_string_lossy();
            self.files.read(&above.join("CMakeLists.txt")).is_some_and(|text| {
                text.lines().filter_map(|line| line.trim_start().strip_prefix("add_subdirectory(")).any(|rest| {
                    let named = rest.split([')', ' ']).next().unwrap_or(rest).trim_matches('"');
                    named.trim_end_matches('/') == part
                })
            })
        })
    }

    /// The whole program the project at `root` is of: what is built with it
    /// is in the same program, and the files that one keeps are there for
    /// all of it.
    fn program_root<'p>(&self, root: &'p Path) -> &'p Path {
        let mut whole = root;
        while let Some(above) = self.including(whole) {
            whole = above;
        }
        whole
    }

    /// The files under `root` that say what a module is.
    fn descriptions(&self, root: &Path, found: &mut Vec<PathBuf>) {
        for (name, is_directory) in self.files.entries(root) {
            let path = root.join(&name);
            if is_directory {
                if is_source(&name) {
                    self.descriptions(&path, found);
                }
            } else if name == "qmldir" || name == "CMakeLists.txt" {
                found.push(path);
            }
        }
    }

    /// The files in `directory` and under it that `wanted` takes the name
    /// of, by their path from `base`.
    fn walk(&self, directory: &Path, base: &Path, wanted: &dyn Fn(&str) -> bool, found: &mut Vec<String>) {
        let (Some(directory), Some(base)) = (self.files.canonicalize(directory), self.files.canonicalize(base)) else {
            return;
        };
        self.walk_in(&directory, &base, wanted, found);
    }

    fn walk_in(&self, directory: &Path, base: &Path, wanted: &dyn Fn(&str) -> bool, found: &mut Vec<String>) {
        for (name, is_directory) in self.files.entries(directory) {
            let path = directory.join(&name);
            if is_directory {
                if is_source(&name) {
                    self.walk_in(&path, base, wanted, found);
                }
            } else if wanted(&name) {
                found.push(relative(base, &path));
            }
        }
    }

    /// Adds the modules of the project, their files by the path from
    /// `base`: the directory of the file being compiled. The modules are
    /// what the `qmldir` and `CMakeLists.txt` files under the import `paths`
    /// and the stand-ins' directories `with` say; a stand-in's types stand
    /// in for ones the program has in C++. A `qmldir` is its module's only
    /// at the module's place under one of those directories or the installed
    /// Qt's `qt` (`App/Media/qmldir` for `App.Media`), and of two under
    /// import paths the one under the earlier is, as Qt looks in its import
    /// path: the import paths in order, then Qt's. A stand-in's adds to the
    /// module what it has in C++, wherever the rest of it is. A build's file
    /// says what its modules are wherever it is.
    fn modules(
        &self,
        project: &mut Project,
        paths: &[PathBuf],
        with: &[PathBuf],
        qt: &[PathBuf],
        base: &Path,
        warnings: &mut Vec<String>,
    ) {
        let lots: Vec<(&Path, bool)> = paths
            .iter()
            .map(|path| (path.as_path(), false))
            .chain(with.iter().map(|path| (path.as_path(), true)))
            .collect();
        // Qt's are places but not looked through: a file of one of its
        // modules is compiled with the module it is in, not with all of Qt.
        let places: Vec<(&Path, bool)> =
            lots.iter().copied().chain(qt.iter().map(|path| (path.as_path(), false))).collect();
        // Each module described, with the directory its files are named
        // from, whether it stands in, and the rank of the place its `qmldir`
        // is at.
        let mut described = Vec::new();
        let mut misplaced = Vec::new();
        let mut read_qmldirs = HashSet::new();
        for &(lot, standing) in &lots {
            let mut found = Vec::new();
            self.descriptions(lot, &mut found);
            found.sort();
            for description in found {
                let directory = description.parent().unwrap_or(lot).to_path_buf();
                if description.ends_with("CMakeLists.txt") {
                    let Some(text) = self.files.read(&description) else { continue };
                    described.extend(
                        discover::cmake(&text).into_iter().map(|module| (module, directory.clone(), standing, None)),
                    );
                    continue;
                }
                // A directory under two import paths has one place.
                if !read_qmldirs.insert(description.clone()) {
                    continue;
                }
                let Some(text) = self.files.read(&description) else { continue };
                let Some(module) = qmldir(&text) else { continue };
                let place = module.uri.replace('.', "/");
                match places.iter().position(|(place_root, _)| place_root.join(&place) == directory) {
                    Some(rank) => {
                        let standing = places[rank].1;
                        described.push((module, directory, standing, (!standing).then_some(rank)));
                    }
                    None => misplaced.push((description, module.uri)),
                }
            }
        }
        let mut first = HashMap::new();
        for (module, _, _, rank) in &described {
            if let Some(rank) = rank {
                let best = first.entry(module.uri.clone()).or_insert(*rank);
                *best = (*best).min(*rank);
            }
        }
        // One out of its place whose module is found elsewhere is another
        // import path's (`mocks/App/Media` when `mocks` is not one): only one
        // whose module is nowhere is worth a word.
        for (description, uri) in misplaced {
            if !described.iter().any(|(module, ..)| module.uri == uri) {
                let place = uri.replace('.', "/");
                warnings.push(format!(
                    "{} says it is module `{uri}`, but is not `{place}/qmldir` under an import path, so it is not that module",
                    description.display()
                ));
            }
        }
        for (module, directory, standing, rank) in described {
            if rank.is_some_and(|rank| first.get(&module.uri) != Some(&rank)) {
                continue;
            }
            project.add_module(&module.uri);
            for ty in module.types {
                let Some(file) = self.files.canonicalize(&directory.join(&ty.path)) else { continue };
                let path = relative(base, &file);
                let Some(key) = path.strip_suffix(".qml") else { continue };
                if !project.has(key) {
                    let Some(source) = self.read(&file) else { continue };
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

    /// Adds the files the builds under `root` keep in the program, each by
    /// the path from `base`: the ones that go with a module and the ones
    /// kept by themselves.
    fn kept(&self, project: &mut Project, root: &Path, base: &Path) {
        let mut found = Vec::new();
        self.descriptions(root, &mut found);
        for description in found.iter().filter(|description| description.ends_with("CMakeLists.txt")) {
            let Some(text) = self.files.read(description) else { continue };
            let directory = description.parent().unwrap_or(root);
            let modules = discover::cmake(&text);
            let with = modules
                .iter()
                .flat_map(|module| module.resources.iter().map(|resource| (module.address(resource), resource.clone())));
            let alone = discover::kept(&text).into_iter().map(|resource| (resource.address, resource.path));
            for (address, path) in with.chain(alone) {
                let Some(file) = self.files.canonicalize(&directory.join(&path)) else { continue };
                project.add_resource(&address, &relative(base, &file));
            }
        }
    }

    /// The QML files `path` is compiled with: the ones next to it, which is
    /// where the components it names are and where it is used, and the ones
    /// in the directories any of them imports. One that does not parse is
    /// left out here and reported when it is compiled itself.
    pub fn project(&self, path: &Path, qt: &[PathBuf], warnings: &mut Vec<String>) -> Project {
        let mut project = Project::new();
        let root = directory(path);
        let canonical = (self.files.canonicalize(root), self.files.canonicalize(path));
        if let (Some(base), Some(path)) = &canonical {
            let project_root = self.root.clone().unwrap_or_else(|| self.project_root(path));
            // The import paths given come before the project's root.
            let project_root = self.files.canonicalize(&project_root);
            let paths: Vec<PathBuf> = self
                .imports
                .iter()
                .filter_map(|path| self.files.canonicalize(path))
                .chain(project_root.clone())
                .collect();
            let with: Vec<PathBuf> = self.with.iter().filter_map(|more| self.files.canonicalize(more)).collect();
            let qt: Vec<PathBuf> = qt.iter().filter_map(|path| self.files.canonicalize(path)).collect();
            self.modules(&mut project, &paths, &with, &qt, base, warnings);
            if let Some(project_root) = project_root {
                // A program's files are one lot, whichever part names one.
                self.kept(&mut project, self.program_root(&project_root), base);
            }
        }
        // A file's key is its path from the compiled file's directory,
        // without the extension: `Clock`, `content/Clock`.
        let mut loaded = HashSet::new();
        let mut pending = vec![String::new()];
        while let Some(directory) = pending.pop() {
            if !loaded.insert(directory.clone()) {
                continue;
            }
            let Some(here) = self.files.canonicalize(&root.join(&directory)) else { continue };
            for (name, is_directory) in self.files.entries(&here) {
                let Some(stem) = name.strip_suffix(".qml").filter(|_| !is_directory) else { continue };
                let Some(source) = self.read(&here.join(&name)) else { continue };
                let key = if directory.is_empty() { stem.to_string() } else { format!("{directory}/{stem}") };
                if !project.has(&key) {
                    let _ = project.add(&key, &source);
                }
            }
            pending.extend(project.directories());
        }
        // A file may be made by one anywhere in the program that names it by
        // its path, and finds in that one what it does not have itself: the
        // rest of the program is there for what it names.
        if let (Some(base), Some(path)) = canonical {
            let project_root = self.root.clone().unwrap_or_else(|| self.project_root(&path));
            let mut found = Vec::new();
            self.walk(&project_root, &base, &|name| name.ends_with(".qml"), &mut found);
            found.sort();
            for file in found {
                let Some(key) = file.strip_suffix(".qml") else { continue };
                if !project.has(key)
                    && let Some(source) = self.read(&base.join(&file))
                {
                    let _ = project.add(key, &source);
                }
            }
        }
        project
    }
}

/// The directory a file named by `path` is in.
fn directory(path: &Path) -> &Path {
    match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    }
}

/// What a build or a package manager put there is not the project, and
/// neither are the files a selector chooses from: each is another by its
/// name.
fn is_source(name: &str) -> bool {
    !name.starts_with(['.', '+']) && !name.starts_with("build") && name != "node_modules" && name != "target"
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

/// What a `qmldir` says its module is, with the types its Ljós `# block Name
/// 1.0 File.qml ...` comments declare (ADR 0003): a comment to Qt, which
/// fails an import on a line it does not know, and a type of the module to
/// Ljós. The `qml_front` pinned here reads past them as Qt does; ljos-ui's
/// commit acab2643 ("qml_front: a # block qmldir comment declares its
/// type") reads them in `discover::qmldir` itself, and with `qml_front`,
/// `qml_syntax` and `qt_types` at a rev that has it this goes.
fn qmldir(text: &str) -> Option<discover::Module> {
    let mut module = discover::qmldir(text)?;
    for line in text.lines() {
        let Some(rest) = line.trim_start().strip_prefix('#').map(str::trim_start) else { continue };
        let Some(rest) = rest.strip_prefix("block").filter(|rest| rest.starts_with(char::is_whitespace)) else {
            continue;
        };
        let mut words = rest.split_whitespace();
        let (Some(name), Some(_version), Some(path)) = (words.next(), words.next(), words.next()) else { continue };
        let is_type_name = name.starts_with(|first: char| first.is_ascii_uppercase());
        // A plain line may say so too, for Qt, and is the same type.
        if is_type_name && path.ends_with(".qml") && !module.types.iter().any(|ty| ty.name == name && ty.path == path)
        {
            module.types.push(discover::Type { name: name.to_string(), path: path.to_string() });
        }
    }
    Some(module)
}
