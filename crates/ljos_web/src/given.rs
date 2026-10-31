//! A project given as texts, compiled as `qmlc` compiles it from a
//! directory: what a page that compiles QML does.
//!
//! Each file is compiled by [`Load::compile`] over [`Memory`], with the
//! project's directory as the root, so its output is what `qmlc --root DIR`
//! prints for it. What a page needs on top of that is how the modules link:
//! which of their imports name another file of the project and which a
//! module of the page's, what each exports, and where each says
//! `import.meta`, which no address a page makes a module at can stand for.
//! Those are given as offsets in UTF-16 code units, as a page's strings
//! count them.

use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    path::{Component, Path, PathBuf},
};

use oxc_allocator::Allocator;
use oxc_span::SourceType;
use oxc_syntax::module_record::ExportExportName;
use qml_syntax::ast::QmlImportSource;

use crate::{
    Options,
    files::{Load, Memory},
};

/// `aliases`: the module `module` is the directory `dir` of the project, as
/// `ljos run --alias` imports it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Alias {
    pub module: String,
    pub dir: String,
}

#[derive(Debug, Clone, Default)]
pub struct Request {
    /// Each file of the project, by its path from the project's directory.
    pub files: BTreeMap<String, String>,
    /// The file to compile, with every file it needs.
    pub entry: String,
    pub aliases: Vec<Alias>,
    /// Directories of the project a module is looked for in before its
    /// place under the project's own, as `qmlc -I` looks.
    pub imports: Vec<String>,
    /// The modules the page can give what it compiles (`solid-js`,
    /// `ljos-web/QtQuick`): an import of any other is an error where the QML
    /// imports it. None when anything goes.
    pub modules: Option<BTreeSet<String>>,
    /// The QML modules the page has besides those of Qt's table and the
    /// runtime's: one of Qt's own QML that it was built with.
    pub installed: Vec<String>,
}

/// Where a file's import is to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    /// Another file of the project, by its path.
    File(String),
    /// A module the page has: `ljos-web/QtQuick`.
    Module(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Link {
    /// The specifier's string literal, quotes and all.
    pub start: u32,
    pub end: u32,
    pub target: Target,
}

/// One compiled file.
#[derive(Debug, Clone)]
pub struct Module {
    /// Its path in the project, as the links name it.
    pub file: String,
    /// What `qmlc` prints for it.
    pub code: String,
    pub links: Vec<Link>,
    /// Where it says `import.meta`.
    pub metas: Vec<(u32, u32)>,
    /// The names it exports, `default` among them, with those an
    /// `export *` of another file of the project brings.
    pub exports: BTreeSet<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    /// The file as it was given, when the problem is in one.
    pub file: Option<String>,
    pub line: Option<usize>,
    pub column: Option<usize>,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct Compiled {
    /// The entry first, then each file it needs, in the order found.
    pub modules: Vec<Module>,
    /// What was wrong and did not stop the compile, as `qmlc` warns of it.
    pub warnings: Vec<String>,
}

/// The project's directory, which the files are given from.
const ROOT: &str = "/";

/// Compiles the entry and every file of the project it imports, each as
/// `qmlc --root` compiles it. Nothing is compiled for the page that it
/// cannot link: all of it, or what was wrong.
pub fn compile(request: &Request) -> Result<Compiled, Vec<Diagnostic>> {
    let (files, given) = aliased(&request.files, &request.aliases);
    let named = |file: &str| given.get(file).cloned().unwrap_or_else(|| file.to_string());
    let memory = Memory::new(files.iter().map(|(path, text)| (path.as_str(), text.as_str())));
    let imports = request.imports.iter().filter_map(|dir| normal(dir)).map(|dir| Path::new(ROOT).join(dir)).collect();
    let load = Load { root: Some(PathBuf::from(ROOT)), imports, ..Load::new(&memory) };
    let entry = normal(&request.entry).filter(|entry| files.contains_key(entry)).ok_or_else(|| {
        vec![Diagnostic { file: Some(request.entry.clone()), line: None, column: None, message: "no such file".into() }]
    })?;

    let mut modules: Vec<Module> = Vec::new();
    let mut diagnostics = Vec::new();
    let mut warnings = Vec::new();
    let mut seen = BTreeSet::from([entry.clone()]);
    let mut pending = vec![entry];
    let mut index = 0;
    while index < pending.len() {
        let file = pending[index].clone();
        index += 1;
        let mut options = Options { installed: request.installed.clone(), ..Options::default() };
        let path = Path::new(ROOT).join(&file);
        let Some(compiled) = load.compile(&path, &mut options, false, false) else { continue };
        for warning in compiled.warnings {
            if !warnings.contains(&warning) {
                warnings.push(warning);
            }
        }
        let output = match compiled.result {
            Ok(output) => output,
            Err(errors) => {
                diagnostics.extend(errors.into_iter().map(|error| {
                    let (line, column) = error.position(&compiled.source);
                    Diagnostic { file: Some(named(&file)), line: Some(line), column: Some(column), message: error.message }
                }));
                continue;
            }
        };
        let module = linked(&file, output.code);
        for link in &module.links {
            match &link.target {
                Target::File(target) => {
                    if !files.contains_key(target) {
                        diagnostics.push(Diagnostic {
                            file: Some(named(&file)),
                            line: None,
                            column: None,
                            message: format!("`{target}` is not among the files given"),
                        });
                    } else if seen.insert(target.clone()) {
                        pending.push(target.clone());
                    }
                }
                Target::Module(specifier) => {
                    if request.modules.as_ref().is_some_and(|modules| !modules.contains(specifier)) {
                        diagnostics.push(absent(&named(&file), &compiled.source, specifier));
                    }
                }
            }
        }
        modules.push(module);
    }
    if !diagnostics.is_empty() {
        // A file that does not parse is left out of the project, so what
        // imports it is told its type is unknown: the syntax error is why.
        let mut broken = syntax_errors(&files, &named);
        broken.extend(diagnostics);
        broken.dedup();
        return Err(broken);
    }
    starred(&mut modules);
    Ok(Compiled { modules, warnings })
}

/// What does not parse among the QML files of the project.
fn syntax_errors(files: &BTreeMap<String, String>, named: &dyn Fn(&str) -> String) -> Vec<Diagnostic> {
    let mut found = Vec::new();
    for (file, source) in files.iter().filter(|(file, _)| file.ends_with(".qml")) {
        let allocator = Allocator::default();
        for error in qml_syntax::parse(&allocator, source).diagnostics {
            let (line, column) = error.position(source);
            found.push(Diagnostic { file: Some(named(file)), line: Some(line), column: Some(column), message: error.message });
        }
    }
    found
}

/// The files as the compiler is to see them: an aliased module's own files
/// are those of its directory, at the module's place. With them, the path
/// each was given as, where that is another.
fn aliased(files: &BTreeMap<String, String>, aliases: &[Alias]) -> (BTreeMap<String, String>, HashMap<String, String>) {
    let mut shown: BTreeMap<String, String> =
        files.iter().filter_map(|(path, text)| Some((normal(path)?, text.clone()))).collect();
    let mut given = HashMap::new();
    // Directly in `dir`, not in a directory under it: a module's own files.
    let direct = |path: &str, dir: &str| {
        path.strip_prefix(dir).and_then(|rest| rest.strip_prefix('/')).filter(|rest| !rest.contains('/')).map(str::to_string)
    };
    for alias in aliases {
        let (Some(dir), place) = (normal(&alias.dir), alias.module.replace('.', "/")) else { continue };
        shown.retain(|path, _| direct(path, &place).is_none());
        for (path, text) in files {
            let Some(path) = normal(path) else { continue };
            if let Some(name) = direct(&path, &dir) {
                let at = format!("{place}/{name}");
                given.insert(at.clone(), path.clone());
                shown.insert(at, text.clone());
            }
        }
    }
    (shown, given)
}

/// A path of the project as one: `a/b.qml`, with no `.`, `..` or leading
/// slash. None for one that leaves the project.
fn normal(path: &str) -> Option<String> {
    let mut parts = Vec::new();
    for part in Path::new(path).components() {
        match part {
            Component::Normal(name) => parts.push(name.to_str()?),
            Component::ParentDir => {
                parts.pop()?;
            }
            _ => {}
        }
    }
    (!parts.is_empty()).then(|| parts.join("/"))
}

/// What a module imports and exports, read from what was compiled.
fn linked(file: &str, code: String) -> Module {
    let allocator = Allocator::default();
    let parsed = oxc_parser::Parser::new(&allocator, &code, SourceType::mjs()).parse();
    let record = &parsed.module_record;
    let units = Units::of(&code);
    let directory = Path::new(file).parent().unwrap_or(Path::new(""));
    let mut links = Vec::new();
    for (specifier, requests) in &record.requested_modules {
        let specifier = specifier.as_str();
        let target = if specifier.starts_with("./") || specifier.starts_with("../") {
            match normal(&directory.join(specifier).to_string_lossy()) {
                Some(path) => Target::File(path),
                None => Target::File(specifier.to_string()),
            }
        } else {
            Target::Module(specifier.to_string())
        };
        for request in requests {
            links.push(Link {
                start: units.at(request.span.start),
                end: units.at(request.span.end),
                target: target.clone(),
            });
        }
    }
    links.sort_by_key(|link| link.start);
    let metas = record.import_metas.iter().map(|span| (units.at(span.start), units.at(span.end))).collect();
    let mut exports = BTreeSet::new();
    for entry in record.local_export_entries.iter().chain(&record.indirect_export_entries) {
        match &entry.export_name {
            ExportExportName::Name(name) => {
                exports.insert(name.name.to_string());
            }
            ExportExportName::Default(_) => {
                exports.insert("default".to_string());
            }
            ExportExportName::Null => {}
        }
    }
    // An `export *` of another file brings what that one exports, which is
    // known once all are compiled.
    for entry in &record.star_export_entries {
        if let Some(request) = &entry.module_request
            && let Some(path) = normal(&directory.join(request.name.as_str()).to_string_lossy())
        {
            exports.insert(format!("*{path}"));
        }
    }
    Module { file: file.to_string(), code, links, metas, exports }
}

/// Puts in place of each `*file` of a module's exports what that file
/// exports, `default` aside.
fn starred(modules: &mut [Module]) {
    let mut changed = true;
    while changed {
        changed = false;
        let known: HashMap<String, BTreeSet<String>> =
            modules.iter().map(|module| (module.file.clone(), module.exports.clone())).collect();
        for module in modules.iter_mut() {
            let stars: Vec<String> = module.exports.iter().filter(|name| name.starts_with('*')).cloned().collect();
            for star in stars {
                for name in known.get(&star[1..]).into_iter().flatten() {
                    if name != "default" && !name.starts_with('*') && module.exports.insert(name.clone()) {
                        changed = true;
                    }
                }
            }
        }
    }
    for module in modules {
        module.exports.retain(|name| !name.starts_with('*'));
    }
}

/// An import of a module the page cannot give: an error where the QML
/// imports it, as that of a module nobody has.
fn absent(file: &str, source: &str, specifier: &str) -> Diagnostic {
    let uri = specifier.strip_prefix("ljos-web/").unwrap_or(specifier).replace('/', ".");
    let allocator = Allocator::default();
    let parsed = qml_syntax::parse(&allocator, source);
    // The import of the module itself, else of the one nearest above it.
    let import = parsed
        .document
        .imports
        .iter()
        .filter_map(|import| match &import.source {
            QmlImportSource::Module(imported) => Some((imported.to_string(), import)),
            _ => None,
        })
        .filter(|(imported, _)| *imported == uri || uri.starts_with(&format!("{imported}.")))
        .max_by_key(|(imported, _)| imported.len())
        .map(|(_, import)| import);
    let (line, column) = import.map_or((1, 1), |import| crate::Error::new("", import.span).position(source));
    let message = if uri == "QtQuick.Controls" || uri.starts_with("QtQuick.Controls.") {
        format!(
            "module \"{uri}\" is not in this page: the styles of Qt Quick Controls are QML of Qt's own, which a page has only when it was built with them (ljos-web requests 13 and 36)"
        )
    } else {
        format!("module \"{uri}\" is not in this page")
    };
    Diagnostic { file: Some(file.to_string()), line: Some(line), column: Some(column), message }
}

/// Byte offsets of a text as UTF-16 code units.
struct Units<'t> {
    text: &'t str,
}

impl<'t> Units<'t> {
    fn of(text: &'t str) -> Self {
        Self { text }
    }

    fn at(&self, byte: u32) -> u32 {
        let byte = (byte as usize).min(self.text.len());
        if self.text.is_ascii() {
            return byte as u32;
        }
        self.text[..byte].encode_utf16().count() as u32
    }
}
