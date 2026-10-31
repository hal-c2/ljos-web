//! The types a program registers from Rust, as its `ljostypes.json` describes
//! them (`ljos types`), standing in where there is no Rust: what `ljos run
//! --types` makes natively.
//!
//! Natively each type described becomes a type of the engine's whose
//! properties hold what they are given, whose signals can be emitted and
//! handled and whose methods do nothing. Here each becomes a QML file that
//! declares the same, in a module of stand-ins (`--with`) the compiler makes
//! itself: so the file that uses the type is checked against what the dump
//! says the type has, and the page runs it with what the runtime has of QML.
//! The files are not on the disk: [`Layered`] shows them to a compile under
//! [`DIRECTORY`] in the project's directory.

use std::{
    collections::{BTreeMap, BTreeSet},
    fmt::Write,
    path::{Path, PathBuf},
};

use serde::Deserialize;

use crate::files::Files;

/// The directory of the project the stand-ins are in. A name that starts
/// with a dot is no source of the project's, so nothing walks into it.
pub const DIRECTORY: &str = ".ljostypes";

/// The one format read, as `ljos types` writes it.
const FORMAT: u32 = 2;

/// A dump that did not read, or describes what cannot stand in, named as
/// it was given.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{file}:{line}:{column}: {message}")]
pub struct DumpError {
    pub file: String,
    pub line: usize,
    pub column: usize,
    pub message: String,
}

impl DumpError {
    fn whole(file: &str, message: String) -> Self {
        Self { file: file.to_string(), line: 1, column: 1, message }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeDump {
    pub format: u32,
    pub modules: Vec<ModuleDump>,
    #[serde(default)]
    pub unnamed: Vec<TypeEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleDump {
    pub uri: String,
    #[serde(default)]
    pub versions: Vec<String>,
    pub types: Vec<TypeEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeEntry {
    pub name: String,
    #[serde(default)]
    pub since: String,
    pub base: Option<String>,
    #[serde(default)]
    pub base_module: Option<String>,
    #[serde(default)]
    pub singleton: bool,
    #[serde(default)]
    pub enums: Vec<EnumEntry>,
    pub default_property: Option<String>,
    #[serde(default)]
    pub properties: Vec<PropertyEntry>,
    #[serde(default)]
    pub signals: Vec<SignalEntry>,
    #[serde(default)]
    pub methods: Vec<MethodEntry>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PropertyKind {
    #[default]
    Value,
    Object,
    List,
    Enum,
    Flags,
    Group,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertyEntry {
    pub name: String,
    #[serde(rename = "type")]
    pub ty: String,
    #[serde(default)]
    pub kind: PropertyKind,
    #[serde(default)]
    pub list: bool,
    #[serde(default)]
    pub readonly: bool,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub notify: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EnumEntry {
    pub name: String,
    pub keys: Vec<(String, i64)>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SignalEntry {
    pub name: String,
    #[serde(default)]
    pub parameters: Vec<ParamEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MethodEntry {
    pub name: String,
    #[serde(default)]
    pub parameters: Vec<ParamEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ParamEntry {
    pub name: String,
    #[serde(rename = "type")]
    pub ty: String,
}

/// Reads the dump `text`, named `file` in what is said of it.
pub fn read(file: &str, text: &str) -> Result<TypeDump, DumpError> {
    let dump: TypeDump = serde_json::from_str(text).map_err(|error| DumpError {
        file: file.to_string(),
        line: error.line().max(1),
        column: error.column().max(1),
        // serde's own "at line 1 column 30" is said where the file is.
        message: strip_position(&error.to_string()),
    })?;
    if dump.format != FORMAT {
        // Native Ljós's words.
        let message = format!("type dump format {} where {FORMAT} is read; write it again", dump.format);
        return Err(DumpError::whole(file, message));
    }
    Ok(dump)
}

fn strip_position(message: &str) -> String {
    match message.rfind(" at line ") {
        Some(at) => message[..at].to_string(),
        None => message.to_string(),
    }
}

/// One type to stand in: where its file goes and what the file says.
struct Planned<'d> {
    uri: Option<&'d str>,
    entry: &'d TypeEntry,
    /// The dump it is described in, for what is said of it.
    file: &'d str,
}

/// The stand-ins' files for the dumps given, read as one (several dumps of
/// one program are its modules side by side, as natively): by their path
/// under [`DIRECTORY`]. A type two dumps describe is the first's.
pub fn stand_ins(dumps: &[(String, TypeDump)]) -> Result<BTreeMap<String, String>, DumpError> {
    let mut named: Vec<Planned> = Vec::new();
    let mut unnamed: Vec<Planned> = Vec::new();
    let mut seen = BTreeSet::new();
    for (file, dump) in dumps {
        for module in &dump.modules {
            for entry in &module.types {
                if seen.insert((module.uri.as_str(), entry.name.as_str())) {
                    named.push(Planned { uri: Some(&module.uri), entry, file });
                }
            }
        }
        for entry in &dump.unnamed {
            if seen.insert(("", entry.name.as_str())) {
                unnamed.push(Planned { uri: None, entry, file });
            }
        }
    }
    let mut files = BTreeMap::new();
    let mut qmldirs: BTreeMap<&str, String> = BTreeMap::new();
    for planned in named.iter().chain(&unnamed) {
        check_bases(planned, &named, &unnamed)?;
        let text = file_of(planned, &named, &unnamed);
        let place = place(planned.uri);
        files.insert(format!("{place}/{}.qml", planned.entry.name), text);
        if let Some(uri) = planned.uri {
            let qmldir = qmldirs.entry(uri).or_insert_with(|| format!("module {uri}\n"));
            let singleton = if planned.entry.singleton { "singleton " } else { "" };
            let _ = writeln!(qmldir, "{singleton}{0} {1} {0}.qml", planned.entry.name, version(&planned.entry.since));
        }
    }
    for (uri, qmldir) in qmldirs {
        files.insert(format!("{}/qmldir", place(Some(uri))), qmldir);
    }
    Ok(files)
}

/// The directory a type's file is in: its module's place, as a `qmldir` is
/// at, or one of its own for the types no module exports.
fn place(uri: Option<&str>) -> String {
    match uri {
        Some(uri) => uri.replace('.', "/"),
        None => "+unnamed".to_string(),
    }
}

/// `1.0` of a `since` that is a version, else `1.0`: the import names no
/// version, so any is taken.
fn version(since: &str) -> &str {
    let is_version = since.split('.').count() == 2 && since.split('.').all(|part| part.parse::<u32>().is_ok());
    if is_version { since } else { "1.0" }
}

/// The type the dump describes that `base` names, from `entry`'s module.
fn dumped_base<'p, 'd>(
    entry: &TypeEntry,
    named: &'p [Planned<'d>],
    unnamed: &'p [Planned<'d>],
) -> Option<&'p Planned<'d>> {
    let base = entry.base.as_deref()?;
    named
        .iter()
        .filter(|planned| entry.base_module.as_deref().is_none_or(|module| Some(module) == planned.uri))
        .find(|planned| planned.entry.name == base)
        .or_else(|| unnamed.iter().find(|planned| planned.entry.name == base))
}

/// The module of the toolkit's that has the type `name`: `module` when the
/// dump says which, otherwise the first that has it, QML's own first.
fn toolkit_module(name: &str, module: Option<&str>) -> Option<String> {
    let has = |uri: &str| qt_types::module(uri).is_some_and(|found| found.type_named(name).is_some());
    if let Some(module) = module {
        return has(module).then(|| module.to_string());
    }
    ["QtQml", "QtQuick"]
        .into_iter()
        .map(str::to_string)
        .chain(qt_types::modules().into_iter().map(str::to_string))
        .find(|uri| has(uri))
}

fn check_bases(planned: &Planned, named: &[Planned], unnamed: &[Planned]) -> Result<(), DumpError> {
    let mut entry = planned.entry;
    let mut steps = 0;
    while let Some(base) = dumped_base(entry, named, unnamed) {
        steps += 1;
        if std::ptr::eq(base.entry, planned.entry) || steps > named.len() + unnamed.len() {
            return Err(DumpError::whole(planned.file, format!("the bases of {} loop", planned.entry.name)));
        }
        entry = base.entry;
    }
    if let Some(base) = &entry.base
        && toolkit_module(base, entry.base_module.as_deref()).is_none()
    {
        return Err(DumpError::whole(
            planned.file,
            format!(
                "{}: its base {base} is neither in the type dump nor one of the toolkit's types",
                planned.entry.name
            ),
        ));
    }
    Ok(())
}

/// The QML that stands in for one type.
fn file_of(planned: &Planned, named: &[Planned], unnamed: &[Planned]) -> String {
    let entry = planned.entry;
    let mut imports: BTreeSet<String> = BTreeSet::new();
    let root = match dumped_base(entry, named, unnamed) {
        Some(base) => {
            match base.uri {
                Some(uri) if Some(uri) != planned.uri => {
                    imports.insert(format!("import {uri}"));
                }
                None if planned.uri.is_some() => {
                    imports.insert(format!("import \"{}\"", towards(planned.uri, None)));
                }
                _ => {}
            }
            base.entry.name.clone()
        }
        None => {
            let base = entry.base.as_deref().unwrap_or("QtObject");
            let module = toolkit_module(base, entry.base_module.as_deref()).unwrap_or_else(|| "QtQml".to_string());
            imports.insert(format!("import {module}"));
            base.to_string()
        }
    };

    let mut text = String::new();
    if entry.singleton {
        text.push_str("pragma Singleton\n");
    }
    for import in &imports {
        let _ = writeln!(text, "{import}");
    }
    let _ = writeln!(text, "\n{root} {{");
    for enumeration in &entry.enums {
        let keys: Vec<String> = enumeration.keys.iter().map(|(key, value)| format!("{key} = {value}")).collect();
        let _ = writeln!(text, "    enum {} {{ {} }}", enumeration.name, keys.join(", "));
    }
    let declared: BTreeSet<&str> = entry.properties.iter().map(|property| property.name.as_str()).collect();
    for property in &entry.properties {
        let mut words = Vec::new();
        if entry.default_property.as_deref() == Some(property.name.as_str()) {
            words.push("default");
        }
        if property.required {
            words.push("required");
        }
        // A group is made, as natively, and is the same object throughout:
        // `font.size: 3` sets a property of it.
        let group = property.kind == PropertyKind::Group
            && unnamed.iter().chain(named).any(|planned| planned.entry.name == property.ty);
        if property.readonly || group {
            words.push("readonly");
        }
        let ty = if group { property.ty.clone() } else { property_type(property) };
        let value = if group { format!(": {} {{}}", property.ty) } else { String::new() };
        let _ = writeln!(text, "    {} property {ty} {}{value}", words.join(" "), property.name);
        // A change signal of another name than QML gives the property's.
        if let Some(notify) = &property.notify
            && *notify != format!("{}Changed", property.name)
            && !entry.signals.iter().any(|signal| &signal.name == notify)
        {
            let _ = writeln!(text, "    signal {notify}()");
        }
    }
    for signal in &entry.signals {
        // What QML declares with the property already.
        if signal.name.strip_suffix("Changed").is_some_and(|property| declared.contains(property))
            && signal.parameters.is_empty()
        {
            continue;
        }
        let parameters: Vec<String> =
            signal.parameters.iter().map(|parameter| format!("{} {}", value_type(&parameter.ty), parameter.name)).collect();
        let _ = writeln!(text, "    signal {}({})", signal.name, parameters.join(", "));
    }
    for method in &entry.methods {
        let parameters: Vec<&str> = method.parameters.iter().map(|parameter| parameter.name.as_str()).collect();
        let _ = writeln!(text, "    function {}({}) {{}}", method.name, parameters.join(", "));
    }
    text.push_str("}\n");
    // A group's type is a file of the unnamed ones, which a module's file
    // imports by its directory.
    if entry.properties.iter().any(|property| {
        property.kind == PropertyKind::Group && unnamed.iter().any(|planned| planned.entry.name == property.ty)
    }) && planned.uri.is_some()
    {
        let import = format!("import \"{}\"\n", towards(planned.uri, None));
        let at = text.find("\n\n").map_or(0, |at| at + 1);
        text.insert_str(at, &import);
    }
    text
}

/// The path from the place of one module to that of another.
fn towards(from: Option<&str>, to: Option<&str>) -> String {
    let depth = place(from).split('/').count();
    let mut path = vec![".."; depth].join("/");
    path.push('/');
    path.push_str(&place(to));
    path
}

/// What a property is declared as in QML, by the type the dump names.
fn property_type(property: &PropertyEntry) -> String {
    match property.kind {
        PropertyKind::Enum | PropertyKind::Flags if !property.list => "int".to_string(),
        PropertyKind::Object | PropertyKind::Group if !property.list => "QtObject".to_string(),
        PropertyKind::List | PropertyKind::Object | PropertyKind::Group => "list<QtObject>".to_string(),
        _ if property.list => "var".to_string(),
        _ => value_type(&property.ty).to_string(),
    }
}

/// A value type as QML names it; one QML has no name for holds anything.
fn value_type(name: &str) -> &'static str {
    match name {
        "int" | "qint32" | "i32" | "u32" | "i16" | "u16" | "i8" | "u8" | "uint" | "short" | "ushort" => "int",
        "real" | "double" | "float" | "qreal" | "f64" | "f32" | "i64" | "u64" | "qint64" | "quint64" => "real",
        "bool" => "bool",
        "string" | "QString" | "String" => "string",
        "url" | "QUrl" => "url",
        "color" | "QColor" => "color",
        "date" | "QDateTime" | "QDate" => "date",
        "point" | "QPointF" | "QPoint" => "point",
        "size" | "QSizeF" | "QSize" => "size",
        "rect" | "QRectF" | "QRect" => "rect",
        "font" | "QFont" => "font",
        _ => "var",
    }
}

/// The files of a compile, with the stand-ins of the dumps under
/// [`DIRECTORY`] in `root`: what [`Load`](crate::files::Load) is given when
/// the project has dumps.
pub struct Layered<'f> {
    files: &'f dyn Files,
    under: PathBuf,
    /// Where a relative path is from: a file of the stand-ins is named on
    /// the command line as the rest of the project is.
    here: PathBuf,
    texts: BTreeMap<PathBuf, String>,
}

impl<'f> Layered<'f> {
    /// `files` with `stand_ins` (as [`stand_ins`] gives them) shown under
    /// `root`, which is absolute.
    pub fn new(files: &'f dyn Files, root: &Path, stand_ins: BTreeMap<String, String>) -> Self {
        let under = root.join(DIRECTORY);
        let texts = stand_ins.into_iter().map(|(path, text)| (under.join(path), text)).collect();
        Self { files, under, texts, here: std::env::current_dir().unwrap_or_default() }
    }

    /// `path` cleaned and, when relative, taken from where qmlc runs.
    fn clean(&self, path: &Path) -> PathBuf {
        clean(&self.here.join(path))
    }

    /// The directory the stand-ins are in.
    pub fn directory(&self) -> &Path {
        &self.under
    }

    fn is_directory(&self, path: &Path) -> bool {
        path.starts_with(&self.under) && self.texts.keys().any(|file| file.starts_with(path) && file != path)
    }
}

impl Files for Layered<'_> {
    fn read(&self, path: &Path) -> Option<String> {
        let cleaned = self.clean(path);
        if cleaned.starts_with(&self.under) {
            return self.texts.get(&cleaned).cloned();
        }
        self.files.read(path)
    }

    fn entries(&self, directory: &Path) -> Vec<(String, bool)> {
        let cleaned = self.clean(directory);
        if !cleaned.starts_with(&self.under) {
            return self.files.entries(directory);
        }
        let directory = cleaned;
        let mut found: BTreeMap<String, bool> = BTreeMap::new();
        for path in self.texts.keys() {
            let Ok(rest) = path.strip_prefix(&directory) else { continue };
            let mut parts = rest.components();
            let Some(first) = parts.next() else { continue };
            *found.entry(first.as_os_str().to_string_lossy().into_owned()).or_default() |= parts.next().is_some();
        }
        found.into_iter().collect()
    }

    fn is_file(&self, path: &Path) -> bool {
        let cleaned = self.clean(path);
        if cleaned.starts_with(&self.under) {
            return self.texts.contains_key(&cleaned);
        }
        self.files.is_file(path)
    }

    fn canonicalize(&self, path: &Path) -> Option<PathBuf> {
        let cleaned = self.clean(path);
        if cleaned.starts_with(&self.under) {
            return (self.texts.contains_key(&cleaned) || self.is_directory(&cleaned)).then_some(cleaned);
        }
        self.files.canonicalize(path)
    }
}

/// The path with `.` and `..` taken out, as written: the stand-ins are no
/// links to follow.
fn clean(path: &Path) -> PathBuf {
    let mut cleaned = PathBuf::new();
    for part in path.components() {
        match part {
            std::path::Component::ParentDir => {
                cleaned.pop();
            }
            std::path::Component::CurDir => {}
            part => cleaned.push(part),
        }
    }
    cleaned
}
