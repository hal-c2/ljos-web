//! A shell a visitor drops on a page (docs/LJOS_WEB.md A9): QML written by
//! someone the site does not know, compiled in the page to data the page
//! runs, never to code.
//!
//! A shell composes the site's blocks (ljos-ui ADR 0003): types its modules
//! mark with `# block` lines, each with its state (its read-only
//! properties), its actions (its functions) and its events (its signals). The compiler resolves every name
//! a shell writes against a closed scope, the shell's own ids and
//! properties, its blocks' contracts, a list of QtQuick types and the pure
//! builtins, and refuses the rest with where it is written. What comes out is
//! [`ljos_ir::CompiledFile`]: the objects as written and every expression as
//! a tier-1 program, which the page's evaluator runs with a step budget. There
//! is no JavaScript in it.
//!
//! What a shell may not do it cannot write: a global (`window`, `eval`,
//! `fetch`), a member by a computed string (`x["constructor"]`), a function,
//! an object literal, `new`, a Qt function that is not pure
//! (`Qt.openUrlExternally`), a URL of its own (only one a block gives), and
//! an import beyond QtQuick and the block modules.

use std::{
    collections::{HashMap, HashSet},
    path::{Component, Path, PathBuf},
};

use ljos_ir as ir;
use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Argument, ArrayExpressionElement, ArrowFunctionBody, AssignmentTarget, BindingPattern,
    Expression, ForStatementInit, SimpleAssignmentTarget, Statement, VariableDeclaration,
};
use oxc_span::{GetSpan, Span};
use oxc_syntax::operator::{
    AssignmentOperator, BinaryOperator, LogicalOperator, UnaryOperator, UpdateOperator,
};
use qml_syntax::ast::{QmlBindingValue, QmlDocument, QmlImportSource, QmlMember, QmlObject};
use serde::{Deserialize, Serialize};

use crate::{
    Error, Options,
    files::Load,
    quick::{provided, uninstalled},
};

/// The types of the properties a shell may declare.
const DECLARED: &[&str] = &["int", "real", "double", "bool", "string", "color"];

/// The QtQuick types a shell may make: what lays blocks out and says
/// something about them. Anything that loads, runs or reaches out (Loader,
/// WebSocket, a XMLHttpRequest of a script, Qt.openUrlExternally) is not
/// among them.
pub const QUICK: &[&str] = &[
    "Item",
    "Rectangle",
    "Text",
    "Row",
    "Column",
    "Grid",
    "Flow",
    "MouseArea",
    "Image",
];

/// What a shell gets of a block: its type, where it is, and what it
/// publishes, takes and tells.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Contract {
    /// The module, `App.Media`.
    pub module: String,
    pub name: String,
    pub version: String,
    /// The file, from the project's root: `App/Media/Player.qml`.
    pub file: String,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
    /// The QtQuick type its root is; members a block does not declare are
    /// that type's. `Item` when its root is not one of [`QUICK`].
    pub base: String,
    /// Its declared properties: state when read-only.
    pub properties: Vec<Property>,
    pub actions: Vec<Callable>,
    pub events: Vec<Callable>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Property {
    pub name: String,
    /// As written: `int`, `url`, `var`.
    pub ty: String,
    pub readonly: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Callable {
    pub name: String,
    pub params: Vec<String>,
}

impl Contract {
    fn property(&self, name: &str) -> Option<&Property> {
        self.properties
            .iter()
            .find(|property| property.name == name)
    }

    fn action(&self, name: &str) -> Option<&Callable> {
        self.actions.iter().find(|action| action.name == name)
    }

    fn event(&self, name: &str) -> Option<&Callable> {
        self.events.iter().find(|event| event.name == name)
    }
}

/// Why a shell does not compile, and where.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Diagnostic {
    pub line: usize,
    pub column: usize,
    pub message: String,
}

impl Diagnostic {
    fn at(source: &str, span: Span, message: impl Into<String>) -> Self {
        let (line, column) = qml_syntax::position(source, span.start);
        Self {
            line,
            column,
            message: message.into(),
        }
    }
}

/// The blocks a shell is compiled against, and the project's directory their
/// files are said from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Blocks {
    pub root: PathBuf,
    pub blocks: Vec<Contract>,
}

/// The contracts of the blocks of the modules `shell` imports, a shell of
/// the project `load` looks through: the site's own shell, whose blocks a
/// visitor's may use. A module is what the compile of `shell` takes, by the
/// same lookup, so there is no second answer to what a module is.
///
/// A module nobody has is refused, by the compile's own test
/// ([`uninstalled`]), so the two cannot differ. One the project has and with no
/// block is an ordinary library: a word in `warnings`, naming them, only when
/// the whole shell offers no block. What Qt or the runtime provides is not the
/// site's, and gets no word.
pub fn contracts(
    load: &Load,
    options: &Options,
    shell: &Path,
    warnings: &mut Vec<String>,
) -> Result<Blocks, String> {
    let text = load
        .read(shell)
        .ok_or_else(|| format!("cannot read {}", shell.display()))?;
    let allocator = Allocator::default();
    let parsed = qml_syntax::parse(&allocator, &text);
    if !parsed.diagnostics.is_empty() {
        let error = Error::from(parsed.diagnostics[0].clone());
        return Err(said_at(&shell.display().to_string(), &text, &error));
    }
    let project = load.project(shell, &options.qt_imports, warnings);
    if let Some(error) = uninstalled(&parsed.document, &project, options).first() {
        return Err(said_at(&shell.display().to_string(), &text, error));
    }
    let (root, modules) = load
        .found_modules(shell, &options.qt_imports, &mut Vec::new())
        .ok_or_else(|| format!("cannot read {}", shell.display()))?;
    let mut blocks = Vec::new();
    let mut looked = HashSet::new();
    let mut libraries = Vec::new();
    for import in &parsed.document.imports {
        let name = match &import.source {
            QmlImportSource::Module(name) => name,
            QmlImportSource::Path(path) => {
                let qmldir = shell
                    .parent()
                    .unwrap_or(Path::new("/"))
                    .join(path)
                    .join("qmldir");
                // A shell names a block's module, and this import has none.
                if let Some(text) = load.files.read(&qmldir)
                    && text.lines().any(|line| block_line(line).is_some())
                {
                    let name = text
                        .lines()
                        .find_map(|line| line.trim().strip_prefix("module "))
                        .unwrap_or("its module");
                    warnings.push(format!(
                        "{} imports the blocks of \"{path}\" by their directory, so they are not offered: write `import {}`",
                        shell.display(),
                        name.trim(),
                    ));
                }
                continue;
            }
        };
        let module = name.to_string();
        // Imported twice, as `import Shop` and `import Shop as S`, a module
        // still has each block once.
        if !looked.insert(module.clone()) {
            continue;
        }
        let of_module = modules.iter().filter(|found| found.module.uri == module);
        for found in of_module {
            let Some(qmldir) = found.qmldir.as_ref().and_then(|at| load.files.read(at)) else {
                continue;
            };
            for line in qmldir.lines() {
                let Some(block) = block_line(line) else {
                    continue;
                };
                let path = found.directory.join(&block.file);
                let source = load
                    .read(&path)
                    .ok_or_else(|| format!("cannot read {}", path.display()))?;
                let file = from_root(&root, &path).to_string_lossy().replace('\\', "/");
                let named = as_written(load, shell, &path);
                blocks.push(contract_of(&module, block, file, &named, &source)?);
            }
        }
        // `Ljos.Design` is Ljós's own though a project gives its stand-in, as
        // `--with`: no export of the runtime says so.
        let own = module == "Ljos" || module.starts_with("Ljos.");
        if !own && !provided(&module, options) {
            libraries.push(module);
        }
    }
    if blocks.is_empty() && !libraries.is_empty() {
        warnings.push(format!(
            "{} offers no block to a live shell: {} has no `# block` line in its `qmldir`",
            shell.display(),
            libraries.join(", "),
        ));
    }
    Ok(Blocks { root, blocks })
}

/// An error as a compile says it, so that a build's log reads the same whichever asked.
fn said_at(file: &str, source: &str, error: &Error) -> String {
    let (line, column) = error.position(source);
    format!("{file}:{line}:{column}: {}", error.message)
}

/// `path`, which is canonical, as the build writes it: from where `shell` is
/// written, so that it is the name a compile of that file goes by.
fn as_written(load: &Load, shell: &Path, path: &Path) -> PathBuf {
    let directory = shell.parent().unwrap_or(Path::new(""));
    let Some(canonical) = load.files.canonicalize(directory) else {
        return path.to_path_buf();
    };
    let mut named = directory.to_path_buf();
    for part in from_root(&canonical, path).components() {
        if part == Component::ParentDir && named.file_name().is_some() {
            named.pop();
        } else {
            named.push(part);
        }
    }
    named
}

/// `path` as it is from `root`, going above it when it has to: a contract
/// goes to the page, and where the site was built is not the page's to know.
fn from_root(root: &Path, path: &Path) -> PathBuf {
    let shared = root
        .components()
        .zip(path.components())
        .take_while(|(a, b)| a == b)
        .count();
    let mut relative = PathBuf::new();
    for _ in shared..root.components().count() {
        relative.push("..");
    }
    relative.extend(path.components().skip(shared));
    relative
}

struct BlockLine {
    name: String,
    version: String,
    file: String,
    category: Option<String>,
    summary: Option<String>,
}

/// `# block Player 1.0 Player.qml Media "Plays one source"`.
fn block_line(line: &str) -> Option<BlockLine> {
    let rest = line
        .trim_start()
        .strip_prefix('#')?
        .trim_start()
        .strip_prefix("block")?;
    if !rest.starts_with(char::is_whitespace) {
        return None;
    }
    let (words, summary) = match rest.split_once('"') {
        Some((words, quoted)) => (
            words,
            quoted
                .rsplit_once('"')
                .map(|(summary, _)| summary.to_string()),
        ),
        None => (rest, None),
    };
    let mut words = words.split_whitespace();
    let (name, version, file) = (words.next()?, words.next()?, words.next()?);
    (name.starts_with(|first: char| first.is_ascii_uppercase()) && file.ends_with(".qml")).then(
        || BlockLine {
            name: name.to_string(),
            version: version.to_string(),
            file: file.to_string(),
            category: words.next().map(str::to_string),
            summary,
        },
    )
}

fn contract_of(
    module: &str,
    block: BlockLine,
    file: String,
    named: &Path,
    source: &str,
) -> Result<Contract, String> {
    let allocator = Allocator::default();
    let parsed = qml_syntax::parse(&allocator, source);
    if !parsed.diagnostics.is_empty() {
        let error = Error::from(parsed.diagnostics[0].clone());
        return Err(said_at(&named.display().to_string(), source, &error));
    }
    let root = &parsed.document.root;
    let base = root.type_name.last();
    let mut contract = Contract {
        module: module.to_string(),
        name: block.name,
        version: block.version,
        file,
        category: block.category,
        summary: block.summary,
        base: if QUICK.contains(&base) {
            base.to_string()
        } else {
            "Item".to_string()
        },
        properties: Vec::new(),
        actions: Vec::new(),
        events: Vec::new(),
    };
    for member in &root.members {
        match member {
            QmlMember::Property(property) => contract.properties.push(Property {
                name: property.name.name.to_string(),
                ty: property
                    .type_name
                    .as_ref()
                    .map_or_else(|| "var".to_string(), |ty| ty.name.to_string()),
                readonly: property.is_readonly,
            }),
            QmlMember::Function(function) => {
                let Some(name) = &function.id else { continue };
                contract.actions.push(Callable {
                    name: name.name.to_string(),
                    params: function
                        .params
                        .items
                        .iter()
                        .filter_map(|param| bound_name(&param.pattern))
                        .collect(),
                });
            }
            QmlMember::Signal(signal) => contract.events.push(Callable {
                name: signal.name.name.to_string(),
                params: signal
                    .params
                    .iter()
                    .map(|param| param.name.name.to_string())
                    .collect(),
            }),
            _ => {}
        }
    }
    Ok(contract)
}

fn bound_name(pattern: &BindingPattern) -> Option<String> {
    match pattern {
        BindingPattern::BindingIdentifier(identifier) => Some(identifier.name.to_string()),
        _ => None,
    }
}

/// Compiles a shell, `Shell.qml`, against the blocks it may use.
pub fn compile(source: &str, blocks: &[Contract]) -> Result<ir::CompiledFile, Vec<Diagnostic>> {
    let allocator = Allocator::default();
    let parsed = qml_syntax::parse(&allocator, source);
    if !parsed.diagnostics.is_empty() {
        return Err(parsed
            .diagnostics
            .iter()
            .map(|diagnostic| Diagnostic::at(source, diagnostic.span, diagnostic.message.clone()))
            .collect());
    }
    let mut shell = Shell {
        source,
        blocks,
        imported: Vec::new(),
        objects: Vec::new(),
        ids: HashMap::new(),
        errors: Vec::new(),
    };
    let imports = shell.imports(&parsed.document);
    shell.collect(&parsed.document.root, None);
    if !shell.errors.is_empty() {
        return Err(shell.errors);
    }
    let mut file = shell.lower(&parsed.document.root, imports);
    if !shell.errors.is_empty() {
        return Err(shell.errors);
    }
    file.note_facts();
    Ok(file)
}

/// The compiled shell as JSON for the page: a number of a program is a
/// double's bits, which a JavaScript number cannot hold, so it is written
/// as a decimal string.
pub fn to_json(file: &ir::CompiledFile) -> serde_json::Value {
    let mut value = serde_json::to_value(file).unwrap_or(serde_json::Value::Null);
    if let Some(exprs) = value
        .get_mut("exprs")
        .and_then(serde_json::Value::as_array_mut)
    {
        for expr in exprs {
            let Some(consts) = expr
                .pointer_mut("/tier1/consts")
                .and_then(serde_json::Value::as_array_mut)
            else {
                continue;
            };
            for constant in consts {
                if let Some(bits) = constant.get_mut("Number")
                    && let Some(number) = bits.as_u64()
                {
                    *bits = serde_json::Value::String(number.to_string());
                }
            }
        }
    }
    value
}

/// What an object of the shell is: one of QtQuick's or a block.
#[derive(Clone, Copy)]
enum Kind<'s> {
    Quick(&'static qt_types::Type),
    Block(&'s Contract),
}

struct Object<'s> {
    kind: Kind<'s>,
    /// `property int n` written in the shell.
    declared: Vec<(String, String)>,
}

struct Shell<'s> {
    source: &'s str,
    blocks: &'s [Contract],
    /// The block modules it imports.
    imported: Vec<String>,
    objects: Vec<Object<'s>>,
    ids: HashMap<String, usize>,
    errors: Vec<Diagnostic>,
}

/// What a name on an object is.
enum Member {
    Property {
        ty: String,
        readonly: bool,
        group: bool,
    },
    Signal(Vec<String>),
    Action,
    Method,
}

const FORBIDDEN: &[&str] = &[
    "constructor",
    "__proto__",
    "prototype",
    "caller",
    "callee",
    "arguments",
];

fn forbidden(name: &str) -> bool {
    FORBIDDEN.contains(&name) || name.starts_with('$') || name.starts_with("__")
}

fn quick(name: &str) -> Option<&'static qt_types::Type> {
    QUICK
        .contains(&name)
        .then(|| qt_types::module("QtQuick")?.type_named(name))
        .flatten()
}

impl<'s> Shell<'s> {
    fn refuse(&mut self, span: Span, message: impl Into<String>) {
        self.errors.push(Diagnostic::at(self.source, span, message));
    }

    fn imports(&mut self, document: &QmlDocument) -> Vec<ir::Import> {
        let mut imports = Vec::new();
        for import in &document.imports {
            let QmlImportSource::Module(name) = &import.source else {
                self.refuse(
                    import.span,
                    "a shell imports only QtQuick and the site's block modules, not a path",
                );
                continue;
            };
            let module = name.to_string();
            if import.alias.is_some() {
                self.refuse(
                    import.span,
                    format!(
                        "a shell imports `{module}` without `as`: its blocks are named as they are"
                    ),
                );
                continue;
            }
            let is_blocks = self.blocks.iter().any(|block| block.module == module);
            if module != "QtQuick" && !is_blocks {
                let modules: Vec<&str> = self
                    .blocks
                    .iter()
                    .map(|block| block.module.as_str())
                    .collect();
                let mut known = vec!["QtQuick"];
                known.extend(
                    modules
                        .iter()
                        .copied()
                        .filter(|module| *module != "QtQuick"),
                );
                known.dedup();
                self.refuse(
                    import.span,
                    format!(
                        "a shell may import only {}, not `{module}`",
                        known
                            .iter()
                            .map(|m| format!("`{m}`"))
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                );
                continue;
            }
            if is_blocks && !self.imported.contains(&module) {
                self.imported.push(module.clone());
            }
            imports.push(ir::Import {
                source: ir::ImportSource::Module(module),
                version: import.version.map(str::to_string),
                alias: None,
                in_project: is_blocks,
                stands_in: false,
            });
        }
        imports
    }

    fn kind(&self, name: &str) -> Option<Kind<'s>> {
        if let Some(block) = self
            .blocks
            .iter()
            .find(|block| block.name == name && self.imported.contains(&block.module))
        {
            return Some(Kind::Block(block));
        }
        quick(name).map(Kind::Quick)
    }

    /// Every object and id first: an expression may name an id written
    /// after it.
    fn collect(&mut self, object: &QmlObject, _parent: Option<usize>) {
        let index = self.objects.len();
        let name = object.type_name.to_string();
        let kind = match self.kind(&name) {
            Some(kind) => kind,
            None => {
                let blocks: Vec<&str> = self
                    .blocks
                    .iter()
                    .filter(|block| self.imported.contains(&block.module))
                    .map(|block| block.name.as_str())
                    .collect();
                let mut allowed: Vec<&str> = QUICK.to_vec();
                allowed.extend(blocks);
                self.refuse(
                    object.type_name.span,
                    format!(
                        "`{name}` is not a type a shell may make: it makes {}",
                        allowed.join(", ")
                    ),
                );
                Kind::Quick(quick("Item").expect("QtQuick has Item"))
            }
        };
        if object.on.is_some() {
            self.refuse(
                object.span,
                "a shell has no value sources: `on` is not in its scope",
            );
        }
        let mut declared = Vec::new();
        for member in &object.members {
            match member {
                QmlMember::Binding(binding) if binding.name.as_simple() == Some("id") => {
                    let QmlBindingValue::Expression(Expression::Identifier(id)) = &binding.value
                    else {
                        self.refuse(binding.span, "an id is a name");
                        continue;
                    };
                    let id = id.name.to_string();
                    if self.ids.insert(id.clone(), index).is_some() {
                        self.refuse(binding.span, format!("`{id}` is the id of another object"));
                    }
                }
                QmlMember::Property(property) => {
                    let ty = property
                        .type_name
                        .as_ref()
                        .map_or_else(|| "var".to_string(), |ty| ty.name.to_string());
                    declared.push((property.name.name.to_string(), ty));
                }
                _ => {}
            }
        }
        self.objects.push(Object { kind, declared });
        for member in &object.members {
            if let QmlMember::Object(child) = member {
                self.collect(child, Some(index));
            }
        }
    }

    fn member(&self, object: usize, name: &str) -> Option<Member> {
        let at = &self.objects[object];
        if let Some((_, ty)) = at.declared.iter().find(|(declared, _)| declared == name) {
            return Some(Member::Property {
                ty: ty.clone(),
                readonly: false,
                group: false,
            });
        }
        self.own_member(object, name)
    }

    /// A member its type has, whatever the shell declares on the object.
    fn own_member(&self, object: usize, name: &str) -> Option<Member> {
        let ty = match self.objects[object].kind {
            Kind::Block(block) => {
                if let Some(property) = block.property(name) {
                    return Some(Member::Property {
                        ty: property.ty.clone(),
                        readonly: property.readonly,
                        group: false,
                    });
                }
                if block.action(name).is_some() {
                    return Some(Member::Action);
                }
                if let Some(event) = block.event(name) {
                    return Some(Member::Signal(event.params.clone()));
                }
                quick(&block.base)?
            }
            Kind::Quick(ty) => ty,
        };
        quick_member(ty, name)
    }

    fn type_name(&self, object: usize) -> &str {
        match self.objects[object].kind {
            Kind::Block(block) => &block.name,
            Kind::Quick(ty) => ty.name,
        }
    }

    fn lower(&mut self, root: &QmlObject, imports: Vec<ir::Import>) -> ir::CompiledFile {
        let mut lowering = Lowering {
            objects: Vec::new(),
            exprs: Vec::new(),
            next: 0,
        };
        self.object(&mut lowering, root, None);
        let root_def = lowering.objects.first().cloned().unwrap_or_default();
        let component = ir::ComponentDef {
            name: "Shell".to_string(),
            id: "Shell".to_string(),
            kind: ir::ComponentKind::File,
            signature: ir::ComponentSignature::of(&root_def, &[]),
            objects: lowering.objects,
            ids: Vec::new(),
        };
        ir::CompiledFile {
            version: ir::IR_VERSION,
            file: "Shell".to_string(),
            source_hash: *blake3::hash(self.source.as_bytes()).as_bytes(),
            imports,
            pragmas: Vec::new(),
            components: vec![component],
            exprs: lowering.exprs,
            translations: Vec::new(),
            js: ir::JsModule::default(),
            invocable: Vec::new(),
            scripts: Vec::new(),
        }
    }

    fn span(&self, span: Span) -> ir::SourceSpan {
        let (line, column) = qml_syntax::position(self.source, span.start);
        ir::SourceSpan {
            start: span.start,
            end: span.end,
            line: line as u32,
            column: column as u32,
        }
    }

    fn object(
        &mut self,
        lowering: &mut Lowering,
        object: &QmlObject,
        parent: Option<ir::ObjIdx>,
    ) -> ir::ObjIdx {
        let index = lowering.next;
        lowering.next += 1;
        let at = ir::ObjIdx(index as u32);
        let kind = self.objects[index].kind;
        let ty = match kind {
            Kind::Block(block) => ir::TypeRef::Native {
                module: block.module.clone(),
                name: block.name.clone(),
            },
            Kind::Quick(ty) => ir::TypeRef::Native {
                module: "QtQuick".to_string(),
                name: ty.name.to_string(),
            },
        };
        let mut def = ir::ObjectDef {
            ty,
            parent,
            span: self.span(object.span),
            ..Default::default()
        };
        lowering.objects.push(ir::ObjectDef::default());
        let mut named = None;
        let mut groups: Vec<ir::Group> = Vec::new();
        for member in &object.members {
            match member {
                QmlMember::Object(child) => {
                    let child = self.object(lowering, child, Some(at));
                    def.children.push(ir::ObjectValue::Object(child));
                }
                QmlMember::Binding(binding) => {
                    let parts: Vec<&str> = binding.name.parts.iter().copied().collect();
                    if parts == ["id"] {
                        if let QmlBindingValue::Expression(Expression::Identifier(id)) =
                            &binding.value
                        {
                            def.id = Some(id.name.to_string());
                        }
                        continue;
                    }
                    let (QmlBindingValue::Expression(_) | QmlBindingValue::Statement(_)) =
                        &binding.value
                    else {
                        self.refuse(
                            binding.span,
                            format!("`{}` takes no object in a shell", binding.name),
                        );
                        continue;
                    };
                    if parts.len() == 1 {
                        let name = parts[0];
                        if name == "objectName"
                            && let QmlBindingValue::Expression(Expression::StringLiteral(literal)) =
                                &binding.value
                        {
                            named = Some(literal.value.to_string());
                        }
                        self.member_binding(
                            lowering,
                            index,
                            &mut def.members,
                            &[],
                            name,
                            &binding.value,
                            binding.name.span,
                        );
                    } else if parts.len() == 2
                        && parts[0].starts_with(|first: char| first.is_ascii_lowercase())
                    {
                        let group = parts[0];
                        let Some(Member::Property { group: true, .. }) = self.member(index, group)
                        else {
                            self.refuse(
                                binding.name.span,
                                format!("{} has no group `{group}`", self.type_name(index)),
                            );
                            continue;
                        };
                        let at = match groups.iter().position(|existing| existing.path == [group]) {
                            Some(at) => at,
                            None => {
                                groups.push(ir::Group {
                                    path: vec![group.to_string()],
                                    members: ir::Members::default(),
                                });
                                groups.len() - 1
                            }
                        };
                        let mut members = std::mem::take(&mut groups[at].members);
                        self.member_binding(
                            lowering,
                            index,
                            &mut members,
                            &[group],
                            parts[1],
                            &binding.value,
                            binding.name.span,
                        );
                        groups[at].members = members;
                    } else {
                        self.refuse(
                            binding.name.span,
                            format!("`{}` is not in a shell's scope: a shell sets an object's own properties and groups", binding.name),
                        );
                    }
                }
                QmlMember::Property(property) => {
                    let ty = property
                        .type_name
                        .as_ref()
                        .map_or_else(|| "var".to_string(), |ty| ty.name.to_string());
                    let name = property.name.name.to_string();
                    if ty == "url" {
                        self.refuse(
                            property.span,
                            "a shell declares no url property: only a block gives a URL",
                        );
                        continue;
                    }
                    // Declared over, a block's state would be the shell's to
                    // write, and an Image's `source` no url to check.
                    if self.own_member(index, &name).is_some() {
                        self.refuse(
                            property.span,
                            format!(
                                "a shell declares nothing over {}'s own `{name}`",
                                self.type_name(index)
                            ),
                        );
                        continue;
                    }
                    // What the page's evaluator holds: values, not objects of
                    // the page's, nor another object's property under a new name.
                    if !DECLARED.contains(&ty.as_str())
                        || property.type_name.as_ref().is_some_and(|ty| ty.is_list)
                    {
                        let given = if ty == "alias" {
                            "aliases".to_string()
                        } else {
                            format!("`{ty}` properties")
                        };
                        self.refuse(
                            property.span,
                            format!(
                                "a shell declares no {given}: it declares {}",
                                DECLARED.join(", ")
                            ),
                        );
                        continue;
                    }
                    def.properties.push(ir::PropertyDecl {
                        name: name.clone(),
                        ty,
                        is_list: property.type_name.as_ref().is_some_and(|ty| ty.is_list),
                        is_default: false,
                        is_readonly: property.is_readonly,
                        is_required: false,
                        alias: None,
                        span: self.span(property.span),
                    });
                    match &property.value {
                        Some(
                            value
                            @ (QmlBindingValue::Expression(_) | QmlBindingValue::Statement(_)),
                        ) => {
                            self.member_binding(
                                lowering,
                                index,
                                &mut def.members,
                                &[],
                                &name,
                                value,
                                property.name.span,
                            );
                        }
                        Some(_) => self.refuse(
                            property.span,
                            format!("`{name}` takes no object in a shell"),
                        ),
                        None => {}
                    }
                }
                QmlMember::Signal(signal) => self.refuse(
                    signal.span,
                    "a shell declares no signals: what it tells is its blocks' events",
                ),
                QmlMember::Function(function) => self.refuse(
                    function.span,
                    "a shell declares no functions: what it does is its blocks' actions",
                ),
                QmlMember::InlineComponent(inline) => {
                    self.refuse(inline.span, "a shell declares no components")
                }
                QmlMember::Enum(declared) => {
                    self.refuse(declared.span, "a shell declares no enums")
                }
            }
        }
        def.grouped = groups;
        def.key = match (&def.id, named) {
            (Some(id), _) => ir::KeySeg::Id(id.clone()),
            (None, Some(name)) => ir::KeySeg::Named(name),
            (None, None) => {
                let ty = object.type_name.to_string();
                let nth = parent.map_or(0, |parent| {
                    lowering.objects[parent.index()]
                        .children
                        .iter()
                        .filter(|child| {
                            let ir::ObjectValue::Object(child) = child else { return false };
                            let child = &lowering.objects[child.index()];
                            child.id.is_none()
                                && !matches!(child.key, ir::KeySeg::Named(_))
                                && matches!(&child.ty, ir::TypeRef::Native { name, .. } if *name == ty)
                        })
                        .count() as u32
                });
                ir::KeySeg::Typed { ty, nth }
            }
        };
        lowering.objects[index] = def;
        at
    }

    /// `name: value` on the object `index`, in the group `group` when it
    /// has one.
    #[allow(clippy::too_many_arguments)]
    fn member_binding(
        &mut self,
        lowering: &mut Lowering,
        index: usize,
        members: &mut ir::Members,
        group: &[&str],
        name: &str,
        value: &QmlBindingValue,
        name_span: Span,
    ) {
        let type_name = self.type_name(index).to_string();
        // `onClicked`, `onCountChanged`: a handler.
        if group.is_empty()
            && let Some(signal) = handler_signal(name)
        {
            let params = match self.signal_params(index, &signal) {
                Some(params) => params,
                None => {
                    self.refuse(name_span, format!("{type_name} has no signal `{signal}`"));
                    return;
                }
            };
            let Some(program) = self.program(index, value, Some(params.clone())) else {
                return;
            };
            let expr = lowering.push(
                self,
                index,
                ir::BindingKind::Handler,
                params,
                program,
                value_span(value),
            );
            members.handlers.push(ir::Handler {
                signal,
                expr,
                name_span: self.span(name_span),
            });
            return;
        }
        let ty = if let [group] = group {
            let Some(member) = self.member(index, group).and_then(|_| {
                let ty = match self.objects[index].kind {
                    Kind::Quick(ty) => ty,
                    Kind::Block(block) => quick(&block.base)?,
                };
                ty.property(group)?.value_type()?.property(name)
            }) else {
                self.refuse(
                    name_span,
                    format!("{type_name}'s `{group}` has no `{name}`"),
                );
                return;
            };
            if member.is_readonly {
                self.refuse(
                    name_span,
                    format!("{type_name}'s `{group}.{name}` is read-only"),
                );
                return;
            }
            qt_ty(member.type_name)
        } else {
            match self.member(index, name) {
                Some(Member::Property { readonly: true, .. })
                    if self.objects[index].declared.iter().all(|(n, _)| n != name) =>
                {
                    let message = if matches!(self.objects[index].kind, Kind::Block(_)) {
                        format!("`{name}` is a state of {type_name}: only the block writes it")
                    } else {
                        format!("{type_name}'s `{name}` is read-only")
                    };
                    self.refuse(name_span, message);
                    return;
                }
                Some(Member::Property { ty, .. }) => ty,
                Some(_) => {
                    self.refuse(
                        name_span,
                        format!("{type_name}'s `{name}` is not a property"),
                    );
                    return;
                }
                None => {
                    self.refuse(name_span, format!("{type_name} has no property `{name}`"));
                    return;
                }
            }
        };
        if name == "textFormat" && group.is_empty() {
            // Rich text loads what its `<img>` names: a shell's text is plain.
            self.refuse(
                name_span,
                "a shell's text is plain: `textFormat` is not in its scope",
            );
            return;
        }
        let span = value_span(value);
        if ty == "url" {
            let QmlBindingValue::Expression(expression) = value else {
                self.refuse(
                    span,
                    format!("{type_name}.{name} takes only a URL a block gives"),
                );
                return;
            };
            if !self.is_block_url(expression) {
                self.refuse(span, format!("{type_name}.{name} takes only a URL a block gives (a block's url state): a shell may not name one"));
                return;
            }
        }
        if let QmlBindingValue::Expression(expression) = value
            && let Some(literal) = literal(expression, &ty)
        {
            members.assignments.push(ir::Assignment {
                name: name.to_string(),
                value: literal,
                span: self.span(span),
            });
            return;
        }
        let Some(program) = self.program(index, value, None) else {
            return;
        };
        let expr = lowering.push(
            self,
            index,
            ir::BindingKind::Property,
            Vec::new(),
            program,
            span,
        );
        members.bindings.push(ir::PropertyBinding {
            name: name.to_string(),
            expr,
            name_span: self.span(name_span),
        });
    }

    fn signal_params(&self, index: usize, signal: &str) -> Option<Vec<String>> {
        if let Some(Member::Signal(params)) = self.member(index, signal) {
            return Some(params);
        }
        // `countChanged`: every property tells of its changes.
        let property = signal.strip_suffix("Changed")?;
        matches!(self.member(index, property), Some(Member::Property { .. })).then(Vec::new)
    }

    /// `basket.cover`: a URL a block publishes. A binding has no names of
    /// its own, so an id is the object it says.
    fn is_block_url(&self, expression: &Expression) -> bool {
        let Expression::StaticMemberExpression(member) = unparenthesized(expression) else {
            return false;
        };
        let Expression::Identifier(id) = &member.object else {
            return false;
        };
        self.ids
            .get(id.name.as_str())
            .is_some_and(|&object| self.block_url(object, member.property.name.as_str()))
    }

    fn block_url(&self, object: usize, name: &str) -> bool {
        let Kind::Block(block) = self.objects[object].kind else {
            return false;
        };
        block
            .property(name)
            .is_some_and(|property| property.ty == "url")
    }

    fn program(
        &mut self,
        scope: usize,
        value: &QmlBindingValue,
        args: Option<Vec<String>>,
    ) -> Option<(ir::Tier1, Vec<ir::Param>)> {
        let is_handler = args.is_some();
        let mut program = Program::new(self, scope, args.unwrap_or_default(), is_handler);
        let result = match value {
            QmlBindingValue::Expression(expression) => {
                if program.handler()
                    && let Expression::ArrowFunctionExpression(arrow) = unparenthesized(expression)
                {
                    // `onAdded: (count) => ...`: its parameters are the
                    // signal's arguments, by position.
                    program.rename(
                        arrow
                            .params
                            .items
                            .iter()
                            .map(|param| bound_name(&param.pattern))
                            .collect(),
                    );
                    match &arrow.body {
                        ArrowFunctionBody::FunctionBody(body) => program
                            .statements(&body.statements)
                            .and_then(|_| program.ret(None)),
                        body => match body.as_expression() {
                            Some(expression) => program
                                .expression(expression)
                                .and_then(|_| program.ret(None)),
                            None => program.ret(None),
                        },
                    }
                } else {
                    program
                        .expression(expression)
                        .and_then(|reg| program.ret(Some(reg)))
                }
            }
            QmlBindingValue::Statement(statement) => {
                program.statement(statement).and_then(|_| program.ret(None))
            }
            _ => Err(Refusal(
                value_span(value),
                "an object is not an expression".to_string(),
            )),
        };
        match result {
            Ok(()) => Some(program.finish()),
            Err(Refusal(span, message)) => {
                self.refuse(span, message);
                None
            }
        }
    }
}

fn quick_member(ty: &'static qt_types::Type, name: &str) -> Option<Member> {
    if let Some(property) = ty.property(name) {
        return Some(Member::Property {
            ty: qt_ty(property.type_name),
            readonly: property.is_readonly,
            group: property.value_type().is_some(),
        });
    }
    if let Some(signal) = ty.signal(name) {
        return Some(Member::Signal(
            signal
                .parameters
                .iter()
                .map(|param| param.to_string())
                .collect(),
        ));
    }
    ty.has_method(name).then_some(Member::Method)
}

/// A Qt C++ type name as QML writes it, where that decides something.
fn qt_ty(name: &str) -> String {
    match name {
        "QUrl" => "url",
        "QColor" => "color",
        "QString" => "string",
        "double" | "qreal" => "real",
        other => other,
    }
    .to_string()
}

fn handler_signal(name: &str) -> Option<String> {
    let rest = name.strip_prefix("on")?;
    let first = rest.chars().next()?;
    first
        .is_ascii_uppercase()
        .then(|| format!("{}{}", first.to_ascii_lowercase(), &rest[1..]))
}

fn value_span(value: &QmlBindingValue) -> Span {
    match value {
        QmlBindingValue::Expression(expression) => expression.span(),
        QmlBindingValue::Statement(statement) => statement.span(),
        QmlBindingValue::Object(object) => object.span,
        QmlBindingValue::Objects(objects) => objects
            .first()
            .map_or_else(Span::default, |object| object.span),
    }
}

fn unparenthesized<'e, 'a>(expression: &'e Expression<'a>) -> &'e Expression<'a> {
    match expression {
        Expression::ParenthesizedExpression(inner) => unparenthesized(&inner.expression),
        other => other,
    }
}

/// A value that never changes, as the property `ty` takes it.
fn literal(expression: &Expression, ty: &str) -> Option<ir::Literal> {
    Some(match unparenthesized(expression) {
        Expression::NumericLiteral(number) => ir::Literal::Number(number.value),
        Expression::UnaryExpression(unary) if unary.operator == UnaryOperator::UnaryNegation => {
            let Expression::NumericLiteral(number) = &unary.argument else {
                return None;
            };
            ir::Literal::Number(-number.value)
        }
        Expression::StringLiteral(string) if ty == "color" => {
            ir::Literal::Color(string.value.to_string())
        }
        Expression::StringLiteral(string) => ir::Literal::String(string.value.to_string()),
        Expression::BooleanLiteral(boolean) => ir::Literal::Bool(boolean.value),
        Expression::NullLiteral(_) => ir::Literal::Null,
        _ => return None,
    })
}

/// What the expressions of a shell are put in, in order.
struct Lowering {
    objects: Vec<ir::ObjectDef>,
    exprs: Vec<ir::Binding>,
    next: usize,
}

impl Lowering {
    fn push(
        &mut self,
        shell: &Shell,
        scope: usize,
        kind: ir::BindingKind,
        args: Vec<String>,
        (tier1, params): (ir::Tier1, Vec<ir::Param>),
        span: Span,
    ) -> ir::ExprId {
        let index = self.exprs.len() as u32;
        let text = &shell.source[span.start as usize..(span.end as usize).min(shell.source.len())];
        self.exprs.push(ir::Binding {
            kind,
            scope: ir::ObjRef {
                component: ir::CompIdx(0),
                object: ir::ObjIdx(scope as u32),
            },
            js_fn: ir::FnIndex(index),
            params,
            args,
            refs: Vec::new(),
            span: shell.span(span),
            hash: fnv(text),
            tier1: Some(tier1),
        });
        ir::ExprId(index)
    }
}

/// FNV-1a: what two equal expressions are known by, the same on every
/// machine.
fn fnv(text: &str) -> u64 {
    text.bytes().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
    })
}

struct Refusal(Span, String);

type Lowered<T> = Result<T, Refusal>;

struct Loop {
    breaks: Vec<usize>,
    continues: Vec<usize>,
}

/// One expression as a tier-1 program.
struct Program<'p, 's> {
    shell: &'p Shell<'s>,
    scope: usize,
    /// The signal's arguments, by the names the handler gives them.
    args: Vec<String>,
    is_handler: bool,
    code: Vec<ir::Op>,
    consts: Vec<ir::Const>,
    names: Vec<String>,
    params: Vec<ir::Param>,
    next: u16,
    /// `let` and `const` of the body, innermost last.
    locals: Vec<(String, ir::Reg)>,
    loops: Vec<Loop>,
}

/// Math's functions a shell may call, as the builtins they are.
fn math(name: &str) -> Option<ir::Builtin> {
    use ir::Builtin::*;
    Some(match name {
        "abs" => MathAbs,
        "acos" => MathAcos,
        "asin" => MathAsin,
        "atan" => MathAtan,
        "atan2" => MathAtan2,
        "cbrt" => MathCbrt,
        "ceil" => MathCeil,
        "cos" => MathCos,
        "exp" => MathExp,
        "floor" => MathFloor,
        "log" => MathLog,
        "log10" => MathLog10,
        "log2" => MathLog2,
        "max" => MathMax,
        "min" => MathMin,
        "pow" => MathPow,
        "round" => MathRound,
        "sign" => MathSign,
        "sin" => MathSin,
        "sqrt" => MathSqrt,
        "tan" => MathTan,
        "trunc" => MathTrunc,
        _ => return None,
    })
}

fn math_constant(name: &str) -> Option<f64> {
    use std::f64::consts;
    Some(match name {
        "PI" => consts::PI,
        "E" => consts::E,
        "LN2" => consts::LN_2,
        "LN10" => consts::LN_10,
        "LOG2E" => consts::LOG2_E,
        "LOG10E" => consts::LOG10_E,
        "SQRT2" => consts::SQRT_2,
        "SQRT1_2" => consts::FRAC_1_SQRT_2,
        _ => return None,
    })
}

/// `Qt`'s pure functions.
fn qt_function(name: &str) -> Option<ir::Builtin> {
    use ir::Builtin::*;
    Some(match name {
        "rgba" => QtRgba,
        "hsla" => QtHsla,
        "hsva" => QtHsva,
        "point" => QtPoint,
        "size" => QtSize,
        "rect" => QtRect,
        "vector2d" => QtVector2d,
        "vector3d" => QtVector3d,
        "vector4d" => QtVector4d,
        "quaternion" => QtQuaternion,
        "lighter" => QtLighter,
        "darker" => QtDarker,
        _ => return None,
    })
}

fn global_function(name: &str) -> Option<ir::Builtin> {
    use ir::Builtin::*;
    Some(match name {
        "Number" => Number,
        "String" => String,
        "Boolean" => Boolean,
        "isNaN" => IsNaN,
        "isFinite" => IsFinite,
        "qsTr" => QsTr,
        "qsTrId" => QsTrId,
        "qsTranslate" => QsTranslate,
        "QT_TR_NOOP" | "QT_TRID_NOOP" => TrNoop,
        "QT_TRANSLATE_NOOP" => TranslateNoop,
        _ => return None,
    })
}

/// A primitive's methods a shell may call.
fn method(name: &str) -> Option<ir::Builtin> {
    use ir::Builtin::*;
    Some(match name {
        "arg" => Arg,
        "toFixed" => ToFixed,
        "toString" => ToString,
        "toUpperCase" => ToUpperCase,
        "toLowerCase" => ToLowerCase,
        "trim" => Trim,
        _ => return None,
    })
}

fn binary(operator: BinaryOperator) -> Option<ir::BinaryOp> {
    use ir::BinaryOp::*;
    Some(match operator {
        BinaryOperator::Equality => Eq,
        BinaryOperator::Inequality => Ne,
        BinaryOperator::StrictEquality => StrictEq,
        BinaryOperator::StrictInequality => StrictNe,
        BinaryOperator::LessThan => Lt,
        BinaryOperator::LessEqualThan => Le,
        BinaryOperator::GreaterThan => Gt,
        BinaryOperator::GreaterEqualThan => Ge,
        BinaryOperator::Addition => Add,
        BinaryOperator::Subtraction => Sub,
        BinaryOperator::Multiplication => Mul,
        BinaryOperator::Division => Div,
        BinaryOperator::Remainder => Rem,
        BinaryOperator::Exponential => Exp,
        BinaryOperator::ShiftLeft => Shl,
        BinaryOperator::ShiftRight => Shr,
        BinaryOperator::ShiftRightZeroFill => UShr,
        BinaryOperator::BitwiseOR => BitOr,
        BinaryOperator::BitwiseXOR => BitXor,
        BinaryOperator::BitwiseAnd => BitAnd,
        BinaryOperator::In | BinaryOperator::Instanceof => return None,
    })
}

fn not_in_scope(name: &str) -> String {
    format!(
        "`{name}` is not in a shell's scope: a shell names its own ids and properties, its blocks, QtQuick's types and pure builtins"
    )
}

impl<'p, 's> Program<'p, 's> {
    fn new(shell: &'p Shell<'s>, scope: usize, args: Vec<String>, is_handler: bool) -> Self {
        Self {
            shell,
            scope,
            is_handler,
            args,
            code: Vec::new(),
            consts: Vec::new(),
            names: Vec::new(),
            params: Vec::new(),
            next: 0,
            locals: Vec::new(),
            loops: Vec::new(),
        }
    }

    fn handler(&self) -> bool {
        self.is_handler
    }

    /// The handler's own names for its signal's arguments.
    fn rename(&mut self, names: Vec<Option<String>>) {
        for (index, name) in names.into_iter().enumerate() {
            let name = name.unwrap_or_default();
            if index < self.args.len() {
                self.args[index] = name;
            } else {
                self.args.push(name);
            }
        }
    }

    fn finish(self) -> (ir::Tier1, Vec<ir::Param>) {
        (
            ir::Tier1 {
                registers: self.next,
                consts: self.consts,
                names: self.names,
                args: Vec::new(),
                code: self.code,
            },
            self.params,
        )
    }

    fn reg(&mut self) -> ir::Reg {
        let reg = self.next;
        self.next += 1;
        reg
    }

    fn regs(&mut self, count: usize) -> ir::Reg {
        let base = self.next;
        self.next += count as u16;
        base
    }

    fn emit(&mut self, op: ir::Op) -> usize {
        self.code.push(op);
        self.code.len() - 1
    }

    fn here(&self) -> u32 {
        self.code.len() as u32
    }

    fn patch(&mut self, at: usize, to: u32) {
        match &mut self.code[at] {
            ir::Op::Jump { to: target }
            | ir::Op::JumpIf { to: target, .. }
            | ir::Op::JumpIfNot { to: target, .. } => *target = to,
            ir::Op::JumpIfNullish { to: target, .. } => *target = to,
            _ => {}
        }
    }

    fn constant(&mut self, constant: ir::Const) -> ir::Reg {
        let k = match self
            .consts
            .iter()
            .position(|existing| *existing == constant)
        {
            Some(k) => k,
            None => {
                self.consts.push(constant);
                self.consts.len() - 1
            }
        } as u16;
        let dst = self.reg();
        self.emit(ir::Op::Const { dst, k });
        dst
    }

    fn name(&mut self, name: &str) -> u16 {
        (match self.names.iter().position(|existing| existing == name) {
            Some(at) => at,
            None => {
                self.names.push(name.to_string());
                self.names.len() - 1
            }
        }) as u16
    }

    fn param(&mut self, name: &str, arg: ir::Arg) -> ir::Reg {
        let param = match self
            .params
            .iter()
            .position(|existing| existing.name == name)
        {
            Some(at) => at,
            None => {
                self.params.push(ir::Param {
                    name: name.to_string(),
                    arg,
                });
                self.params.len() - 1
            }
        } as u16;
        let dst = self.reg();
        self.emit(ir::Op::Param { dst, param });
        dst
    }

    fn object(&mut self, name: &str, object: usize) -> ir::Reg {
        let arg = ir::Arg::Object(ir::ObjRef {
            component: ir::CompIdx(0),
            object: ir::ObjIdx(object as u32),
        });
        self.param(name, arg)
    }

    fn this(&mut self) -> ir::Reg {
        let dst = self.reg();
        self.emit(ir::Op::This { dst });
        dst
    }

    fn get(&mut self, obj: ir::Reg, path: &[&str]) -> ir::Reg {
        let first = self.names.len() as u16;
        // A path is consecutive names of the pool: put it there whole.
        for name in path {
            self.names.push((*name).to_string());
        }
        let dst = self.reg();
        self.emit(ir::Op::Get {
            dst,
            obj,
            path: first,
            len: path.len() as u8,
        });
        dst
    }

    fn ret(&mut self, reg: Option<ir::Reg>) -> Lowered<()> {
        let src = match reg {
            Some(reg) => reg,
            None => self.constant(ir::Const::Undefined),
        };
        self.emit(ir::Op::Return { src });
        Ok(())
    }

    fn local(&self, name: &str) -> Option<ir::Reg> {
        self.locals
            .iter()
            .rev()
            .find(|(local, _)| local == name)
            .map(|(_, reg)| *reg)
    }

    /// Where a plain name is found, as QML looks: the body's own, the
    /// signal's arguments, the ids, the scope object, the root.
    fn identifier(&mut self, name: &str, span: Span) -> Lowered<ir::Reg> {
        if let Some(reg) = self.local(name) {
            let dst = self.reg();
            self.emit(ir::Op::Move { dst, src: reg });
            return Ok(dst);
        }
        if let Some(index) = self.args.iter().position(|arg| arg == name) {
            let dst = self.reg();
            self.emit(ir::Op::Local {
                dst,
                index: index as u16,
            });
            return Ok(dst);
        }
        if let Some(&object) = self.shell.ids.get(name) {
            return Ok(self.object(name, object));
        }
        match name {
            "undefined" => return Ok(self.constant(ir::Const::Undefined)),
            "NaN" => return Ok(self.constant(ir::Const::number(f64::NAN))),
            "Infinity" => return Ok(self.constant(ir::Const::number(f64::INFINITY))),
            _ => {}
        }
        if let Some(member) = self.shell.member(self.scope, name) {
            self.readable(&member, name, self.scope, span)?;
            let this = self.this();
            return Ok(self.get(this, &[name]));
        }
        if self.scope != 0
            && let Some(member) = self.shell.member(0, name)
        {
            self.readable(&member, name, 0, span)?;
            let root = self.object("$root", 0);
            return Ok(self.get(root, &[name]));
        }
        Err(Refusal(span, not_in_scope(name)))
    }

    fn readable(&self, member: &Member, name: &str, object: usize, span: Span) -> Lowered<()> {
        let ty = self.shell.type_name(object);
        match member {
            Member::Property { .. } => Ok(()),
            Member::Action => Err(Refusal(
                span,
                format!("`{name}` is an action of {ty}: a shell calls it"),
            )),
            Member::Signal(_) => Err(Refusal(
                span,
                format!("`{name}` is an event of {ty}: a shell handles it with `on…`"),
            )),
            Member::Method => Err(Refusal(
                span,
                format!("{ty}'s `{name}` is a method, which a shell does not call"),
            )),
        }
    }

    /// The object an expression is, when the compiler knows: an id.
    fn known_object(&self, expression: &Expression) -> Option<usize> {
        match unparenthesized(expression) {
            Expression::Identifier(id)
                if self.local(&id.name).is_none()
                    && !self.args.iter().any(|arg| arg == id.name.as_str()) =>
            {
                self.shell.ids.get(id.name.as_str()).copied()
            }
            _ => None,
        }
    }

    fn expression(&mut self, expression: &Expression) -> Lowered<ir::Reg> {
        let span = expression.span();
        match expression {
            Expression::NumericLiteral(number) => {
                Ok(self.constant(ir::Const::number(number.value)))
            }
            Expression::StringLiteral(string) => {
                Ok(self.constant(ir::Const::String(string.value.to_string())))
            }
            Expression::BooleanLiteral(boolean) => {
                Ok(self.constant(ir::Const::Bool(boolean.value)))
            }
            Expression::NullLiteral(_) => Ok(self.constant(ir::Const::Null)),
            Expression::ParenthesizedExpression(inner) => self.expression(&inner.expression),
            Expression::Identifier(id) => self.identifier(&id.name, span),
            Expression::TemplateLiteral(template) => {
                let count = template.quasis.len() + template.expressions.len();
                let parts: Vec<ir::Reg> = {
                    let mut parts = Vec::new();
                    for (index, quasi) in template.quasis.iter().enumerate() {
                        let text = quasi
                            .value
                            .cooked
                            .as_ref()
                            .map_or_else(|| quasi.value.raw.to_string(), |c| c.to_string());
                        parts.push(self.constant(ir::Const::String(text)));
                        if let Some(expression) = template.expressions.get(index) {
                            parts.push(self.expression(expression)?);
                        }
                    }
                    parts
                };
                let base = self.regs(count);
                for (index, part) in parts.into_iter().enumerate() {
                    self.emit(ir::Op::Move {
                        dst: base + index as u16,
                        src: part,
                    });
                }
                let dst = self.reg();
                self.emit(ir::Op::Concat {
                    dst,
                    base,
                    count: count as u16,
                });
                Ok(dst)
            }
            Expression::ArrayExpression(array) => {
                let mut parts = Vec::new();
                for element in &array.elements {
                    match element {
                        ArrayExpressionElement::SpreadElement(spread) => {
                            return Err(Refusal(
                                spread.span,
                                "a shell's arrays have no spread".to_string(),
                            ));
                        }
                        ArrayExpressionElement::Elision(elision) => {
                            return Err(Refusal(
                                elision.span,
                                "a shell's arrays have no holes".to_string(),
                            ));
                        }
                        element => parts.push(self.expression(element.to_expression())?),
                    }
                }
                let base = self.regs(parts.len());
                for (index, part) in parts.iter().enumerate() {
                    self.emit(ir::Op::Move {
                        dst: base + index as u16,
                        src: *part,
                    });
                }
                let dst = self.reg();
                self.emit(ir::Op::Array {
                    dst,
                    base,
                    count: parts.len() as u16,
                });
                Ok(dst)
            }
            Expression::StaticMemberExpression(_) => self.member(expression),
            Expression::ComputedMemberExpression(member) => {
                if let Expression::StringLiteral(key) = unparenthesized(&member.expression) {
                    return Err(Refusal(
                        member.span,
                        format!(
                            "a shell reads a member by its name, not by a string: `[\"{}\"]` is not in its scope",
                            key.value
                        ),
                    ));
                }
                if let Expression::TemplateLiteral(_) = unparenthesized(&member.expression) {
                    return Err(Refusal(
                        member.span,
                        "a shell reads a member by its name, not by a string".to_string(),
                    ));
                }
                let obj = self.expression(&member.object)?;
                let index = self.expression(&member.expression)?;
                let dst = self.reg();
                self.emit(ir::Op::Index { dst, obj, index });
                Ok(dst)
            }
            Expression::CallExpression(call) => self.call(call),
            Expression::BinaryExpression(binary_expression) => {
                let Some(op) = binary(binary_expression.operator) else {
                    return Err(Refusal(
                        span,
                        format!(
                            "`{}` is not in a shell's scope",
                            binary_expression.operator.as_str()
                        ),
                    ));
                };
                let a = self.expression(&binary_expression.left)?;
                let b = self.expression(&binary_expression.right)?;
                let dst = self.reg();
                self.emit(ir::Op::Binary { op, dst, a, b });
                Ok(dst)
            }
            Expression::LogicalExpression(logical) => {
                let dst = self.reg();
                let left = self.expression(&logical.left)?;
                self.emit(ir::Op::Move { dst, src: left });
                let jump = match logical.operator {
                    LogicalOperator::And => self.emit(ir::Op::JumpIfNot { cond: dst, to: 0 }),
                    LogicalOperator::Or => self.emit(ir::Op::JumpIf { cond: dst, to: 0 }),
                    LogicalOperator::Coalesce => {
                        let nullish = self.emit(ir::Op::JumpIfNullish { src: dst, to: 0 });
                        let skip = self.emit(ir::Op::Jump { to: 0 });
                        let here = self.here();
                        self.patch(nullish, here);
                        let right = self.expression(&logical.right)?;
                        self.emit(ir::Op::Move { dst, src: right });
                        let end = self.here();
                        self.patch(skip, end);
                        return Ok(dst);
                    }
                };
                let right = self.expression(&logical.right)?;
                self.emit(ir::Op::Move { dst, src: right });
                let end = self.here();
                self.patch(jump, end);
                Ok(dst)
            }
            Expression::ConditionalExpression(conditional) => {
                let dst = self.reg();
                let test = self.expression(&conditional.test)?;
                let otherwise = self.emit(ir::Op::JumpIfNot { cond: test, to: 0 });
                let consequent = self.expression(&conditional.consequent)?;
                self.emit(ir::Op::Move {
                    dst,
                    src: consequent,
                });
                let skip = self.emit(ir::Op::Jump { to: 0 });
                let here = self.here();
                self.patch(otherwise, here);
                let alternate = self.expression(&conditional.alternate)?;
                self.emit(ir::Op::Move {
                    dst,
                    src: alternate,
                });
                let end = self.here();
                self.patch(skip, end);
                Ok(dst)
            }
            Expression::UnaryExpression(unary) => {
                let op = match unary.operator {
                    UnaryOperator::UnaryNegation => ir::UnaryOp::Neg,
                    UnaryOperator::UnaryPlus => ir::UnaryOp::Plus,
                    UnaryOperator::LogicalNot => ir::UnaryOp::Not,
                    UnaryOperator::BitwiseNot => ir::UnaryOp::BitNot,
                    UnaryOperator::Typeof => ir::UnaryOp::Typeof,
                    UnaryOperator::Void | UnaryOperator::Delete => {
                        return Err(Refusal(
                            span,
                            format!("`{}` is not in a shell's scope", unary.operator.as_str()),
                        ));
                    }
                };
                let src = self.expression(&unary.argument)?;
                let dst = self.reg();
                self.emit(ir::Op::Unary { op, dst, src });
                Ok(dst)
            }
            Expression::AssignmentExpression(assignment) => self.assignment(assignment),
            Expression::UpdateExpression(update) => {
                let target = simple_target(&update.argument);
                self.check_url_whole(&target, span)?;
                let old = self.read_target(&target, span)?;
                let number = self.reg();
                self.emit(ir::Op::Unary {
                    op: ir::UnaryOp::Plus,
                    dst: number,
                    src: old,
                });
                let one = self.constant(ir::Const::number(1.0));
                let new = self.reg();
                let op = if update.operator == UpdateOperator::Increment {
                    ir::BinaryOp::Add
                } else {
                    ir::BinaryOp::Sub
                };
                self.emit(ir::Op::Binary {
                    op,
                    dst: new,
                    a: number,
                    b: one,
                });
                self.write_target(&target, new, span)?;
                Ok(if update.prefix { new } else { number })
            }
            Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => {
                Err(Refusal(
                    span,
                    "a shell writes no functions: what it does is its blocks' actions".to_string(),
                ))
            }
            Expression::ObjectExpression(_) => Err(Refusal(
                span,
                "a shell writes no object literals".to_string(),
            )),
            Expression::NewExpression(_) => {
                Err(Refusal(span, "`new` is not in a shell's scope".to_string()))
            }
            Expression::ThisExpression(_) => Err(Refusal(
                span,
                "`this` is not in a shell's scope: name the object by its id".to_string(),
            )),
            Expression::SequenceExpression(_) => Err(Refusal(
                span,
                "a shell writes one expression at a time".to_string(),
            )),
            Expression::RegExpLiteral(_) => Err(Refusal(
                span,
                "a shell writes no regular expressions".to_string(),
            )),
            Expression::ChainExpression(_) => {
                Err(Refusal(span, "`?.` is not in a shell's scope".to_string()))
            }
            _ => Err(Refusal(span, "this is not in a shell's scope".to_string())),
        }
    }

    /// `a.b.c`.
    fn member(&mut self, expression: &Expression) -> Lowered<ir::Reg> {
        let mut path: Vec<(&str, Span)> = Vec::new();
        let mut base = expression;
        while let Expression::StaticMemberExpression(member) = unparenthesized(base) {
            path.push((member.property.name.as_str(), member.property.span));
            base = &member.object;
        }
        path.reverse();
        for (name, span) in &path {
            if forbidden(name) {
                return Err(Refusal(
                    *span,
                    format!("`{name}` is not in a shell's scope"),
                ));
            }
        }
        let (first, first_span) = path[0];
        if let Expression::Identifier(id) = unparenthesized(base)
            && self.local(&id.name).is_none()
            && !self.args.iter().any(|arg| arg == id.name.as_str())
            && !self.shell.ids.contains_key(id.name.as_str())
        {
            let name = id.name.as_str();
            let whole = || format!("{name}.{first}");
            if name == "Math" {
                return match math_constant(first) {
                    Some(value) if path.len() == 1 => Ok(self.constant(ir::Const::number(value))),
                    _ => Err(Refusal(expression.span(), not_in_scope(&whole()))),
                };
            }
            if name == "Qt" {
                if path.len() == 1
                    && first.starts_with(|c: char| c.is_ascii_uppercase())
                    && qt_enum(first)
                {
                    let key = self.name(first);
                    let dst = self.reg();
                    self.emit(ir::Op::QtKey { dst, key });
                    return Ok(dst);
                }
                return Err(Refusal(expression.span(), not_in_scope(&whole())));
            }
            if let Some(ty) = quick(name) {
                if path.len() == 1 && ty.enum_value(first).is_some() {
                    let ty_ref = ir::TypeRef::Native {
                        module: "QtQuick".to_string(),
                        name: name.to_string(),
                    };
                    let param = self.param_index(name, ir::Arg::Type(ty_ref));
                    let key = self.name(first);
                    let dst = self.reg();
                    self.emit(ir::Op::EnumKey { dst, param, key });
                    return Ok(dst);
                }
                return Err(Refusal(
                    expression.span(),
                    format!("{name} has no enum key `{first}`"),
                ));
            }
        }
        if let Some(object) = self.known_object(base) {
            match self.shell.member(object, first) {
                Some(member) => self.readable(&member, first, object, first_span)?,
                None => {
                    return Err(Refusal(
                        first_span,
                        format!("{} has no member `{first}`", self.shell.type_name(object)),
                    ));
                }
            }
        }
        let obj = self.expression(base)?;
        let names: Vec<&str> = path.iter().map(|(name, _)| *name).collect();
        Ok(self.get(obj, &names))
    }

    fn param_index(&mut self, name: &str, arg: ir::Arg) -> u16 {
        (match self
            .params
            .iter()
            .position(|existing| existing.name == name)
        {
            Some(at) => at,
            None => {
                self.params.push(ir::Param {
                    name: name.to_string(),
                    arg,
                });
                self.params.len() - 1
            }
        }) as u16
    }

    fn arguments(
        &mut self,
        receiver: Option<ir::Reg>,
        arguments: &[Argument],
    ) -> Lowered<(ir::Reg, usize)> {
        let mut parts: Vec<ir::Reg> = receiver.into_iter().collect();
        for argument in arguments {
            let Some(expression) = argument.as_expression() else {
                return Err(Refusal(
                    argument.span(),
                    "a shell's calls have no spread".to_string(),
                ));
            };
            parts.push(self.expression(expression)?);
        }
        let base = self.regs(parts.len());
        for (index, part) in parts.iter().enumerate() {
            self.emit(ir::Op::Move {
                dst: base + index as u16,
                src: *part,
            });
        }
        Ok((base, parts.len()))
    }

    fn builtin(
        &mut self,
        f: ir::Builtin,
        receiver: Option<ir::Reg>,
        arguments: &[Argument],
    ) -> Lowered<ir::Reg> {
        let receiver = if f == ir::Builtin::QsTr {
            Some(self.constant(ir::Const::String("Shell".to_string())))
        } else {
            receiver
        };
        let (base, count) = self.arguments(receiver, arguments)?;
        let dst = self.reg();
        self.emit(ir::Op::Call {
            dst,
            f,
            base,
            count: count as u8,
        });
        Ok(dst)
    }

    fn call(&mut self, call: &oxc_ast::ast::CallExpression) -> Lowered<ir::Reg> {
        let span = call.span;
        if call.optional {
            return Err(Refusal(span, "`?.` is not in a shell's scope".to_string()));
        }
        match unparenthesized(&call.callee) {
            Expression::Identifier(id) => {
                let name = id.name.as_str();
                if let Some(f) = global_function(name)
                    && self.local(name).is_none()
                    && !self.shell.ids.contains_key(name)
                {
                    return self.builtin(f, None, &call.arguments);
                }
                if self.shell.ids.contains_key(name) || self.local(name).is_some() {
                    return Err(Refusal(
                        id.span,
                        format!("`{name}` is not a function a shell may call"),
                    ));
                }
                if let Some(Member::Action) = self.shell.member(self.scope, name) {
                    return Err(Refusal(
                        id.span,
                        format!("a shell calls `{name}` on its block: `id.{name}()`"),
                    ));
                }
                Err(Refusal(id.span, not_in_scope(name)))
            }
            Expression::StaticMemberExpression(member) => {
                let name = member.property.name.as_str();
                if forbidden(name) {
                    return Err(Refusal(
                        member.property.span,
                        format!("`{name}` is not in a shell's scope"),
                    ));
                }
                if let Expression::Identifier(id) = unparenthesized(&member.object)
                    && self.local(&id.name).is_none()
                    && !self.args.iter().any(|arg| arg == id.name.as_str())
                    && !self.shell.ids.contains_key(id.name.as_str())
                {
                    match id.name.as_str() {
                        "Math" => {
                            let Some(f) = math(name) else {
                                return Err(Refusal(
                                    member.span,
                                    not_in_scope(&format!("Math.{name}")),
                                ));
                            };
                            return self.builtin(f, None, &call.arguments);
                        }
                        "Qt" => {
                            let Some(f) = qt_function(name) else {
                                return Err(Refusal(
                                    member.span,
                                    format!(
                                        "`Qt.{name}` is not in a shell's scope: a shell calls only Qt's pure functions (Qt.rgba, Qt.point, Qt.lighter, …)"
                                    ),
                                ));
                            };
                            return self.builtin(f, None, &call.arguments);
                        }
                        _ => {}
                    }
                }
                if let Some(object) = self.known_object(&member.object) {
                    let ty = self.shell.type_name(object).to_string();
                    return match self.shell.member(object, name) {
                        Some(Member::Action) => {
                            let Kind::Block(_) = self.shell.objects[object].kind else {
                                unreachable!()
                            };
                            let obj = self.expression(&member.object)?;
                            let name = self.name(name);
                            let (base, count) = self.arguments(None, &call.arguments)?;
                            let dst = self.reg();
                            self.emit(ir::Op::Invoke {
                                dst,
                                obj,
                                name,
                                base,
                                count: count as u8,
                            });
                            Ok(dst)
                        }
                        Some(Member::Signal(_)) => Err(Refusal(
                            member.property.span,
                            format!("`{name}` is an event of {ty}: only the block tells it"),
                        )),
                        Some(_) => Err(Refusal(
                            member.property.span,
                            format!(
                                "{ty}'s `{name}` is not an action: a shell calls only its blocks' actions"
                            ),
                        )),
                        None => Err(Refusal(
                            member.property.span,
                            format!("{ty} has no action `{name}`"),
                        )),
                    };
                }
                let Some(f) = method(name) else {
                    return Err(Refusal(
                        member.property.span,
                        format!("`{name}` is not a method a shell may call"),
                    ));
                };
                let receiver = self.expression(&member.object)?;
                self.emit(ir::Op::Check { src: receiver, f });
                self.builtin(f, Some(receiver), &call.arguments)
            }
            other => Err(Refusal(
                other.span(),
                "a shell calls only builtins and its blocks' actions".to_string(),
            )),
        }
    }

    fn assignment(&mut self, assignment: &oxc_ast::ast::AssignmentExpression) -> Lowered<ir::Reg> {
        let span = assignment.span;
        let target = match &assignment.left {
            AssignmentTarget::AssignmentTargetIdentifier(id) => {
                Target::Name(id.name.as_str(), id.span)
            }
            AssignmentTarget::StaticMemberExpression(member) => Target::Member(
                &member.object,
                member.property.name.as_str(),
                member.property.span,
            ),
            AssignmentTarget::ComputedMemberExpression(member) => {
                return Err(Refusal(
                    member.span,
                    "a shell writes a member by its name".to_string(),
                ));
            }
            other => {
                return Err(Refusal(
                    other.span(),
                    "a shell assigns to a name or a property".to_string(),
                ));
            }
        };
        let value = match assignment.operator {
            AssignmentOperator::Assign => {
                self.check_url(&target, &assignment.right, span)?;
                self.expression(&assignment.right)?
            }
            operator => {
                if let Some(logical) = operator.to_logical_operator() {
                    return Err(Refusal(
                        span,
                        format!("`{}` is not in a shell's scope", logical.as_str()),
                    ));
                }
                let op = operator
                    .to_binary_operator()
                    .and_then(binary)
                    .ok_or_else(|| Refusal(span, "not in a shell's scope".to_string()))?;
                self.check_url_whole(&target, span)?;
                let old = self.read_target(&target, span)?;
                let right = self.expression(&assignment.right)?;
                let dst = self.reg();
                self.emit(ir::Op::Binary {
                    op,
                    dst,
                    a: old,
                    b: right,
                });
                dst
            }
        };
        self.write_target(&target, value, span)?;
        Ok(value)
    }

    /// A URL is given only by a block.
    fn check_url(&self, target: &Target, value: &Expression, span: Span) -> Lowered<()> {
        match self.url_property(target) {
            Some(object) if !self.gives_block_url(value) => {
                Err(self.url_refused(object, target, span))
            }
            _ => Ok(()),
        }
    }

    /// A handler's locals and arguments may be named as a block's id is, and
    /// are not that block.
    fn gives_block_url(&self, value: &Expression) -> bool {
        let Expression::StaticMemberExpression(member) = unparenthesized(value) else {
            return false;
        };
        self.known_object(&member.object)
            .is_some_and(|object| self.shell.block_url(object, member.property.name.as_str()))
    }

    /// Added to or counted on, even a URL a block gave is one the shell
    /// names, so a `url` is written only whole.
    fn check_url_whole(&self, target: &Target, span: Span) -> Lowered<()> {
        match self.url_property(target) {
            Some(object) => Err(self.url_refused(object, target, span)),
            None => Ok(()),
        }
    }

    /// The object whose `url` property `target` is, if it is one.
    fn url_property(&self, target: &Target) -> Option<usize> {
        let (object, name) = match target {
            Target::Name(name, _) if self.local(name).is_none() => (self.named_object(name), *name),
            Target::Member(object, name, _) => (self.known_object(object), *name),
            _ => return None,
        };
        let object = object?;
        match self.shell.member(object, name) {
            Some(Member::Property { ty, .. }) if ty == "url" => Some(object),
            _ => None,
        }
    }

    /// The object a plain name is written to: the scope's, or else the root's.
    fn named_object(&self, name: &str) -> Option<usize> {
        [self.scope, 0]
            .into_iter()
            .find(|&object| self.shell.member(object, name).is_some())
    }

    fn url_refused(&self, object: usize, target: &Target, span: Span) -> Refusal {
        let name = match target {
            Target::Name(name, _) | Target::Member(_, name, _) => *name,
        };
        Refusal(
            span,
            format!(
                "{}.{name} takes only a URL a block gives (a block's url state): a shell may not name one",
                self.shell.type_name(object)
            ),
        )
    }

    fn read_target(&mut self, target: &Target, span: Span) -> Lowered<ir::Reg> {
        match target {
            Target::Name(name, span) => self.identifier(name, *span),
            Target::Member(object, name, name_span) => {
                if let Some(index) = self.known_object(object) {
                    match self.shell.member(index, name) {
                        Some(member) => self.readable(&member, name, index, *name_span)?,
                        None => {
                            return Err(Refusal(
                                *name_span,
                                format!("{} has no member `{name}`", self.shell.type_name(index)),
                            ));
                        }
                    }
                }
                let obj = self.expression(object)?;
                let _ = span;
                Ok(self.get(obj, &[name]))
            }
        }
    }

    fn writable(&self, object: usize, name: &str, span: Span) -> Lowered<()> {
        let ty = self.shell.type_name(object);
        match self.shell.member(object, name) {
            Some(Member::Property { readonly: true, .. })
                if self.shell.objects[object]
                    .declared
                    .iter()
                    .all(|(n, _)| n != name) =>
            {
                if matches!(self.shell.objects[object].kind, Kind::Block(_)) {
                    Err(Refusal(
                        span,
                        format!("`{name}` is a state of {ty}: only the block writes it"),
                    ))
                } else {
                    Err(Refusal(span, format!("{ty}'s `{name}` is read-only")))
                }
            }
            Some(Member::Property { .. }) if name == "textFormat" => Err(Refusal(
                span,
                "a shell's text is plain: `textFormat` is not in its scope".to_string(),
            )),
            Some(Member::Property { .. }) => Ok(()),
            Some(_) => Err(Refusal(span, format!("{ty}'s `{name}` is not a property"))),
            None => Err(Refusal(span, format!("{ty} has no property `{name}`"))),
        }
    }

    fn write_target(&mut self, target: &Target, val: ir::Reg, span: Span) -> Lowered<()> {
        match target {
            Target::Name(name, name_span) => {
                if let Some(reg) = self.local(name) {
                    self.emit(ir::Op::Move { dst: reg, src: val });
                    return Ok(());
                }
                if self.shell.ids.contains_key(*name) || self.args.iter().any(|arg| arg == name) {
                    return Err(Refusal(
                        *name_span,
                        format!("`{name}` is not something a shell assigns to"),
                    ));
                }
                let Some(object) = self.named_object(name) else {
                    return Err(Refusal(*name_span, not_in_scope(name)));
                };
                let obj = if object == self.scope {
                    self.this()
                } else {
                    self.object("$root", 0)
                };
                self.writable(object, name, *name_span)?;
                let name = self.name(name);
                self.emit(ir::Op::Set {
                    obj,
                    name,
                    val,
                    group: None,
                });
                Ok(())
            }
            Target::Member(object, name, name_span) => {
                if forbidden(name) {
                    return Err(Refusal(
                        *name_span,
                        format!("`{name}` is not in a shell's scope"),
                    ));
                }
                if let Some(index) = self.known_object(object) {
                    self.writable(index, name, *name_span)?;
                    let obj = self.expression(object)?;
                    let name = self.name(name);
                    self.emit(ir::Op::Set {
                        obj,
                        name,
                        val,
                        group: None,
                    });
                    return Ok(());
                }
                // `rect.border.width = 2`: the write is to the group.
                if let Expression::StaticMemberExpression(group) = unparenthesized(object)
                    && let Some(index) = self.known_object(&group.object)
                {
                    let group_name = group.property.name.as_str();
                    if !matches!(
                        self.shell.member(index, group_name),
                        Some(Member::Property { group: true, .. })
                    ) {
                        return Err(Refusal(
                            group.property.span,
                            format!(
                                "{} has no group `{group_name}`",
                                self.shell.type_name(index)
                            ),
                        ));
                    }
                    let owner = self.expression(&group.object)?;
                    let grouped = self.reg();
                    let dst = self.reg();
                    let group_at = self.name(group_name);
                    self.emit(ir::Op::Target {
                        dst,
                        grouped,
                        obj: owner,
                        name: group_at,
                    });
                    let name = self.name(name);
                    self.emit(ir::Op::Set {
                        obj: dst,
                        name,
                        val,
                        group: Some((grouped, group_at)),
                    });
                    return Ok(());
                }
                let _ = span;
                Err(Refusal(
                    *name_span,
                    "a shell writes the properties of objects it names by id".to_string(),
                ))
            }
        }
    }

    fn statements(&mut self, statements: &[Statement]) -> Lowered<()> {
        let depth = self.locals.len();
        for statement in statements {
            self.statement(statement)?;
        }
        self.locals.truncate(depth);
        Ok(())
    }

    fn declaration(&mut self, declaration: &VariableDeclaration) -> Lowered<()> {
        for declarator in &declaration.declarations {
            let Some(name) = bound_name(&declarator.id) else {
                return Err(Refusal(
                    declarator.span,
                    "a shell declares one name at a time".to_string(),
                ));
            };
            let reg = self.reg();
            let value = match &declarator.init {
                Some(init) => self.expression(init)?,
                None => self.constant(ir::Const::Undefined),
            };
            self.emit(ir::Op::Move {
                dst: reg,
                src: value,
            });
            self.locals.push((name, reg));
        }
        Ok(())
    }

    fn statement(&mut self, statement: &Statement) -> Lowered<()> {
        let span = statement.span();
        match statement {
            Statement::ExpressionStatement(expression) => {
                self.expression(&expression.expression).map(|_| ())
            }
            Statement::BlockStatement(block) => self.statements(&block.body),
            Statement::EmptyStatement(_) => Ok(()),
            Statement::VariableDeclaration(declaration) => self.declaration(declaration),
            Statement::ReturnStatement(statement) => {
                let reg = match &statement.argument {
                    Some(argument) => Some(self.expression(argument)?),
                    None => None,
                };
                self.ret(reg)
            }
            Statement::IfStatement(branch) => {
                let test = self.expression(&branch.test)?;
                let otherwise = self.emit(ir::Op::JumpIfNot { cond: test, to: 0 });
                self.scoped(&branch.consequent)?;
                match &branch.alternate {
                    Some(alternate) => {
                        let skip = self.emit(ir::Op::Jump { to: 0 });
                        let here = self.here();
                        self.patch(otherwise, here);
                        self.scoped(alternate)?;
                        let end = self.here();
                        self.patch(skip, end);
                    }
                    None => {
                        let end = self.here();
                        self.patch(otherwise, end);
                    }
                }
                Ok(())
            }
            Statement::WhileStatement(looped) => {
                let start = self.here();
                let test = self.expression(&looped.test)?;
                let exit = self.emit(ir::Op::JumpIfNot { cond: test, to: 0 });
                self.loops.push(Loop {
                    breaks: vec![exit],
                    continues: Vec::new(),
                });
                self.scoped(&looped.body)?;
                self.emit(ir::Op::Jump { to: start });
                self.close_loop(start);
                Ok(())
            }
            Statement::DoWhileStatement(looped) => {
                let start = self.here();
                self.loops.push(Loop {
                    breaks: Vec::new(),
                    continues: Vec::new(),
                });
                self.scoped(&looped.body)?;
                let next = self.here();
                let test = self.expression(&looped.test)?;
                self.emit(ir::Op::JumpIf {
                    cond: test,
                    to: start,
                });
                self.close_loop(next);
                Ok(())
            }
            Statement::ForStatement(looped) => {
                let depth = self.locals.len();
                match &looped.init {
                    Some(ForStatementInit::VariableDeclaration(declaration)) => {
                        self.declaration(declaration)?
                    }
                    Some(init) => {
                        self.expression(init.to_expression())?;
                    }
                    None => {}
                }
                let start = self.here();
                let mut breaks = Vec::new();
                if let Some(test) = &looped.test {
                    let test = self.expression(test)?;
                    breaks.push(self.emit(ir::Op::JumpIfNot { cond: test, to: 0 }));
                }
                self.loops.push(Loop {
                    breaks,
                    continues: Vec::new(),
                });
                self.scoped(&looped.body)?;
                let next = self.here();
                if let Some(update) = &looped.update {
                    self.expression(update)?;
                }
                self.emit(ir::Op::Jump { to: start });
                self.close_loop(next);
                self.locals.truncate(depth);
                Ok(())
            }
            Statement::BreakStatement(statement) if statement.label.is_none() => {
                let jump = self.emit(ir::Op::Jump { to: 0 });
                let Some(current) = self.loops.last_mut() else {
                    return Err(Refusal(span, "`break` is outside a loop".to_string()));
                };
                current.breaks.push(jump);
                Ok(())
            }
            Statement::ContinueStatement(statement) if statement.label.is_none() => {
                let jump = self.emit(ir::Op::Jump { to: 0 });
                let Some(current) = self.loops.last_mut() else {
                    return Err(Refusal(span, "`continue` is outside a loop".to_string()));
                };
                current.continues.push(jump);
                Ok(())
            }
            Statement::FunctionDeclaration(_) => Err(Refusal(
                span,
                "a shell writes no functions: what it does is its blocks' actions".to_string(),
            )),
            _ => Err(Refusal(
                span,
                "this statement is not in a shell's scope".to_string(),
            )),
        }
    }

    fn scoped(&mut self, statement: &Statement) -> Lowered<()> {
        let depth = self.locals.len();
        self.statement(statement)?;
        self.locals.truncate(depth);
        Ok(())
    }

    fn close_loop(&mut self, next: u32) {
        let Some(done) = self.loops.pop() else { return };
        let end = self.here();
        for at in done.breaks {
            self.patch(at, end);
        }
        for at in done.continues {
            self.patch(at, next);
        }
    }
}

enum Target<'e, 'a> {
    Name(&'e str, Span),
    Member(&'e Expression<'a>, &'e str, Span),
}

fn simple_target<'e, 'a>(target: &'e SimpleAssignmentTarget<'a>) -> Target<'e, 'a> {
    match target {
        SimpleAssignmentTarget::AssignmentTargetIdentifier(id) => {
            Target::Name(id.name.as_str(), id.span)
        }
        SimpleAssignmentTarget::StaticMemberExpression(member) => Target::Member(
            &member.object,
            member.property.name.as_str(),
            member.property.span,
        ),
        other => Target::Name("", other.span()),
    }
}

/// Whether `Qt.Key` is a key of an enum of Qt's namespace.
fn qt_enum(key: &str) -> bool {
    ["QtQml", "QtQuick"].iter().any(|module| {
        qt_types::module(module)
            .and_then(|module| module.type_named("Qt"))
            .is_some_and(|qt| qt.enum_value(key).is_some())
    }) || matches!(
        key,
        "AlignLeft"
            | "AlignRight"
            | "AlignHCenter"
            | "AlignTop"
            | "AlignBottom"
            | "AlignVCenter"
            | "AlignCenter"
    )
}
