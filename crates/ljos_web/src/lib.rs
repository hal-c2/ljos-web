//! QML in, Solid out.
//!
//! ```text
//! .qml ──oxc (QML mode)──▶ QML tree with Oxc expression leaves
//!      ──lower──────────▶ Oxc Program: component function + JSX nodes
//!      ──resolve────────▶ QML names bound to JavaScript bindings
//!      ──solidjs-compiler▶ templates, grouped effects, delegated events
//! ```
//!
//! One parser, one arena, one AST. The QML grammar is a mode of Oxc's own
//! parser, the lowering builds the nodes Solid's JSX transform takes as input,
//! and Solid's transform runs on them unchanged.

mod build;
mod dialects;
pub use qml_front::discover;
mod lower;
mod project;
mod quick;
mod registry;
mod resolve;
mod scope;
pub mod theme;

use oxc_allocator::Allocator;
use oxc_ast::ast::Program;
use oxc_diagnostics::Diagnostics;
use oxc_span::Span;

pub use project::Project;
pub use qt_types::{native_types, written_types};
pub use solidjs_compiler::CompileOptions as SolidOptions;

use crate::{build::B, lower::Lower, registry::Types, scope::Scopes};

#[derive(Debug, Clone)]
pub struct Options {
    /// The component's name, normally the file's stem.
    pub name: String,
    /// Module that exports the dialect's singletons (`Shell`, `Theme`, ...).
    pub host_module: String,
    /// Module that exports the unit helpers and `Qt`.
    pub runtime_module: String,
    /// What Qt's modules are imported under: `QtQuick.Controls` is
    /// `ljos-web/QtQuick/Controls`, and the object model `ljos-web/object`.
    pub qt_module: String,
    /// Extension put on the import of a sibling component (`./Name.qml`).
    pub component_extension: String,
    /// The files the component is compiled with: what their instances of it
    /// set decides what it takes from outside, and a type none of them is, is
    /// an error. Without a project the file is compiled alone: it takes only
    /// what it declares, and a type it does not know is taken to be a
    /// component next to it.
    pub project: Option<Project>,
    /// The QML files in the file's directory and under it, by their path
    /// from it (`towers/Melee.qml`): what a path may name that is only put
    /// together when the program runs. None when nobody looked.
    pub files: Option<Vec<String>>,
    /// The other files there, likewise (`images/logo.png`): what a source
    /// written with no suffix (`images/logo`) may be the picture of.
    pub pictures: Option<Vec<String>>,
    /// A path is taken from the file it is written in, whatever it is given
    /// to: what Qt 5 did, and Qt 6 does for a program that sets
    /// `QML_COMPAT_RESOLVE_URLS_ON_ASSIGNMENT`. Otherwise one given to a
    /// property a component declares is taken from the component's file.
    pub urls_on_assignment: bool,
    /// Where the Qt that is installed keeps its QML modules: a module whose
    /// `qmldir` is in its place under one of them is Qt's, which the runtime
    /// puts together from there (`Qt5Compat.GraphicalEffects`). A module
    /// imported that is neither this, nor in Qt's table, nor the runtime's,
    /// nor the project's, is not installed: an error, when the file is
    /// compiled with its project.
    pub qt_imports: Vec<std::path::PathBuf>,
    pub solid: SolidOptions,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            name: "Component".to_string(),
            host_module: "ljos-web/host".to_string(),
            runtime_module: "ljos-web/runtime".to_string(),
            qt_module: "ljos-web".to_string(),
            component_extension: ".qml".to_string(),
            project: None,
            files: None,
            pictures: None,
            urls_on_assignment: false,
            qt_imports: Vec::new(),
            solid: SolidOptions::default(),
        }
    }
}

#[derive(Debug)]
pub struct Output {
    pub code: String,
    pub map: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
    pub message: String,
    /// Offsets into the QML source.
    pub span: Span,
}

impl Error {
    pub(crate) fn new(message: impl Into<String>, span: Span) -> Self {
        Self { message: message.into(), span }
    }

    /// One-based line and column of the error in `source`.
    pub fn position(&self, source: &str) -> (usize, usize) {
        let before = &source[..(self.span.start as usize).min(source.len())];
        let line = before.matches('\n').count() + 1;
        let column = before.chars().rev().take_while(|c| *c != '\n').count() + 1;
        (line, column)
    }
}

impl From<qml_syntax::Diagnostic> for Error {
    fn from(diagnostic: qml_syntax::Diagnostic) -> Self {
        Self::new(diagnostic.message, diagnostic.span)
    }
}

/// Compiles a QML file to a JavaScript module whose default export is a Solid
/// component.
pub fn compile(source: &str, options: &Options) -> Result<Output, Vec<Error>> {
    let allocator = Allocator::default();
    let (program, target) = lower(&allocator, source, options)?;
    let mut solid = options.solid.clone();
    if target == Target::Quick {
        // A binding is a getter the object's slot memoizes itself, and a
        // conditional in one is just an expression.
        solid.wrap_conditionals = false;
        solid.memo_wrapper = solidjs_compiler::Wrapper::Disabled;
        // Nothing of the DOM is in the output: what makes an object is
        // Solid's own `createComponent`.
        if solid.module_name == SolidOptions::default().module_name {
            solid.module_name = "solid-js".into();
        }
    }
    solidjs_compiler::compile_program(&allocator, program, source, &solid)
        .map(|output| Output { code: output.code, map: output.source_map })
        .map_err(|error| vec![Error::new(error.to_string(), Span::default())])
}

/// Compiles a script a QML file imports (`import "logic.js" as Logic`) to
/// the module that import is: what the script declares, exported.
pub fn compile_script(source: &str, options: &Options) -> Result<Output, Vec<Error>> {
    quick::script::compile(source, options).map(|code| Output { code, map: None })
}

/// The tree handed to Solid's compiler, printed. Solid never sees this text;
/// it is here to look at what the lowering built.
pub fn lowered_source(source: &str, options: &Options) -> Result<String, Vec<Error>> {
    let allocator = Allocator::default();
    let (program, _) = lower(&allocator, source, options)?;
    Ok(oxc_codegen::Codegen::new().build(&program).code)
}

pub(crate) fn parse_errors(diagnostics: Diagnostics) -> Vec<Error> {
    diagnostics
        .into_iter()
        .map(|diagnostic| {
            let span = diagnostic.labels.first().map_or_else(Span::default, |label| {
                let start = label.offset() as u32;
                Span::new(start, start + label.len() as u32)
            });
            Error::new(diagnostic.message.to_string(), span)
        })
        .collect()
}

/// What the file's types are, which decides everything about the output.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Target {
    /// A dialect of the registry: its elements are the target's own.
    Dialect,
    /// Qt's modules: objects of the QtQuick runtime.
    Quick,
}

fn lower<'a>(
    allocator: &'a Allocator,
    source: &'a str,
    options: &Options,
) -> Result<(Program<'a>, Target), Vec<Error>> {
    let parsed = qml_syntax::parse(allocator, source);
    if !parsed.diagnostics.is_empty() {
        return Err(parsed.diagnostics.into_iter().map(Error::from).collect());
    }

    // The file is part of its own project: it may use itself, and its inline
    // components are used nowhere else.
    let open = options.project.is_none();
    let mut project = options.project.clone().unwrap_or_default();
    project.insert_document(&options.name, &parsed.document);
    let types = Types::of(&parsed.document.imports);
    let b = B::new(allocator);
    if !types.has_dialect() {
        let program = quick::lower(b, source, parsed.document, &project, options)?;
        return Ok((program, Target::Quick));
    }
    let usages = project.usages();

    let mut errors = Vec::new();
    let scopes = Scopes::analyze(&parsed.document, &mut errors);
    let mut lower = Lower::new(b, &scopes, types, &project, &usages, &options.name, open);
    let component = lower.component(&options.name, parsed.document.root);
    errors.append(&mut lower.errors);
    let Some(component) = component else { return Err(errors) };

    let mut body = b.vec();
    body.extend(std::mem::take(&mut lower.inline));
    body.push(component);
    let mut program = b.program(source, body);
    let resolved = resolve::resolve(b, &mut program, &scopes, types, &mut errors);
    if !errors.is_empty() {
        return Err(errors);
    }

    let mut imports = Vec::new();
    if !lower.solid.is_empty() {
        imports.push(b.import_named(lower.solid.iter().copied(), "solid-js"));
    }
    let mut runtime = lower.runtime.clone();
    runtime.extend(resolved.runtime);
    if !runtime.is_empty() {
        imports.push(b.import_named(runtime.iter().copied(), &options.runtime_module));
    }
    if !resolved.host.is_empty() {
        imports.push(b.import_named(resolved.host.iter().map(String::as_str), &options.host_module));
    }
    for component in &lower.components {
        let source = format!("./{component}{}", options.component_extension);
        imports.push(b.import_default(component, &source));
    }
    for (index, import) in imports.into_iter().enumerate() {
        program.body.insert(index, import);
    }
    Ok((program, Target::Dialect))
}
