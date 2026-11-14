//! A TypeScript module a QML file imports by path (`import "size.ts" as
//! Size`), or another module imports (`import { width } from
//! "./width.lts"`): an ECMAScript module once its types are erased, as
//! native Ljós runs it.
//!
//! An `.lts` module may use Ljós's `match`, `is` and `|>`, which
//! `qml_syntax::desugar` writes away first, the one desugar every reader of
//! a script calls. In a `.ts` module they are an error that names the
//! rename, since stock TypeScript tools cannot read them there.
//!
//! The erasure is native Ljós's: each piece that is only a type is blanked
//! where it is, so what is wrong is said at the module's own line and
//! column, and what TypeScript writes that is not only a type (an `enum`, a
//! `namespace`, a parameter property, a default export) is refused with the
//! words `ljos check` has for it.
//!
//! ```ts
//! import { type Kind, fallback } from "./kinds.ts"
//! export function width(kind: Kind | undefined): number {
//!   return match (kind ?? fallback) { when "dot": 1; default: 3; }
//! }
//! ```
//!
//! ```js
//! import { $is } from "ljos-web/compiler/sugar";
//! import { fallback } from "./kinds.ts";
//! export function width(kind) { … }
//! ```

use std::collections::{BTreeSet, HashSet};

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    ArrowFunctionExpression, Class, ClassElement, Declaration, FormalParameter,
    ImportDeclarationSpecifier, ImportOrExportKind, MethodDefinitionType, PropertyDefinitionType,
    PropertyKey, Statement, TSAsExpression, TSNonNullExpression, TSSatisfiesExpression,
    TSThisParameter, TSTypeAnnotation, TSTypeAssertion, TSTypeParameterDeclaration,
    TSTypeParameterInstantiation,
};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::{GetSpan, SourceType, Span};

use super::names::{FETCH_GLOBALS, JS_GLOBALS, SUGAR_GLOBALS};
use crate::{Error, Options, build::B, parse_errors};

/// The module that has the helpers `match` and `is` are lowered to.
pub(crate) const SUGAR: &str = "compiler/sugar";

/// Whether `path` names a TypeScript module: a `.ts` one, or an `.lts` one,
/// which may use Ljós's syntax too. A declaration file (`.d.ts`) is types
/// alone and runs nothing.
pub(crate) fn is_module(path: &str) -> bool {
    is_lts(path) || (path.ends_with(".ts") && !path.ends_with(".d.ts"))
}

pub(crate) fn is_lts(path: &str) -> bool {
    path.ends_with(".lts")
}

/// The name a `.ts` module has as an `.lts` one.
pub(crate) fn lts_name(name: &str) -> String {
    format!("{}.lts", name.strip_suffix(".ts").unwrap_or(name))
}

/// Compiles `source`, the module named `name`. `taken`: whether a file is
/// already where renaming a `.ts` module to `.lts` would put it.
pub(crate) fn compile(
    source: &str,
    name: &str,
    taken: bool,
    options: &Options,
) -> Result<String, Vec<Error>> {
    let lts = is_lts(name);
    let desugared = qml_syntax::desugar(source);
    let mut errors = Vec::new();
    let (text, map) = if lts {
        if !desugared.diagnostics.is_empty() {
            return Err(desugared.diagnostics.into_iter().map(Error::from).collect());
        }
        (desugared.text, Some(desugared.map))
    } else if desugared.diagnostics.is_empty()
        && let Some(&keyword) = desugared.uses.first()
    {
        // Read as the TypeScript its `match` stands for, so that what else
        // is wrong with it is said too.
        let written = &source[keyword.start as usize..keyword.end as usize];
        errors.push(Error::coded(
            lts_syntax(name, written, taken),
            keyword,
            "ts-lts-syntax",
        ));
        (desugared.text, Some(desugared.map))
    } else {
        (source.to_string(), None)
    };
    let back = |span: Span| map.as_ref().map_or(span, |map| map.span(span));

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, &text, SourceType::ts().with_module(true)).parse();
    if !parsed.diagnostics.is_empty() {
        // The rename stays said: it is as true of a file that is broken
        // elsewhere.
        errors.extend(
            parse_errors(parsed.diagnostics)
                .into_iter()
                .map(|mut error| {
                    error.span = back(error.span);
                    error
                }),
        );
        return Err(errors);
    }
    let mut eraser = Eraser {
        source: &text,
        edits: Vec::new(),
        faults: Vec::new(),
        types: HashSet::new(),
    };
    // Names that are only types are not read at run time: an export of one
    // gives an importer nothing. A name that is a value too, as an
    // interface and the const of its name are, is the value's.
    let mut values = HashSet::new();
    for statement in &parsed.program.body {
        if let Statement::ImportDeclaration(import) = statement {
            for specifier in import.specifiers.iter().flatten() {
                let typed = import.import_kind == ImportOrExportKind::Type
                    || matches!(specifier, ImportDeclarationSpecifier::ImportSpecifier(it)
                        if it.import_kind == ImportOrExportKind::Type);
                let name = specifier.local().name.as_str().to_string();
                if typed {
                    eraser.types.insert(name);
                } else {
                    values.insert(name);
                }
            }
            continue;
        }
        let declaration = match statement {
            Statement::ExportDeclaration(export) => &export.declaration,
            other => match other.as_declaration() {
                Some(declaration) => declaration,
                None => continue,
            },
        };
        match declaration {
            Declaration::TSTypeAliasDeclaration(alias) => {
                eraser.types.insert(alias.id.name.as_str().to_string());
            }
            Declaration::TSInterfaceDeclaration(interface) => {
                eraser.types.insert(interface.id.name.as_str().to_string());
            }
            Declaration::VariableDeclaration(it) if !it.declare => {
                for declarator in &it.declarations {
                    for name in declarator.id.get_binding_identifiers() {
                        values.insert(name.name.as_str().to_string());
                    }
                }
            }
            Declaration::FunctionDeclaration(it) if !it.declare && it.body.is_some() => {
                values.extend(it.id.iter().map(|id| id.name.as_str().to_string()));
            }
            Declaration::ClassDeclaration(it) if !it.declare => {
                values.extend(it.id.iter().map(|id| id.name.as_str().to_string()));
            }
            _ => {}
        }
    }
    eraser.types.retain(|name| !values.contains(name));
    for statement in &parsed.program.body {
        eraser.statement(statement);
    }
    let Eraser { edits, faults, .. } = eraser;
    errors.extend(
        faults
            .into_iter()
            .map(|(span, message)| Error::coded(message, back(span), "ts-forbidden")),
    );
    if !errors.is_empty() {
        errors.sort_by_key(|error| error.span.start);
        return Err(errors);
    }
    let erased = allocator.alloc_str(&apply(&text, edits));
    javascript(&allocator, erased, &back, options)
}

/// The paths `source`, the module `name`, imports from and exports from,
/// read from the TypeScript it is once its Ljós syntax is written away.
pub(crate) fn imports(source: &str, name: &str) -> Result<crate::Imports, Vec<Error>> {
    let desugared = qml_syntax::desugar(source);
    if is_lts(name) && !desugared.diagnostics.is_empty() {
        return Err(desugared.diagnostics.into_iter().map(Error::from).collect());
    }
    let allocator = Allocator::default();
    let (text, map) = if desugared.diagnostics.is_empty() {
        (desugared.text.as_str(), Some(&desugared.map))
    } else {
        (source, None)
    };
    let parsed = Parser::new(&allocator, text, SourceType::ts().with_module(true)).parse();
    if !parsed.diagnostics.is_empty() {
        let errors = parse_errors(parsed.diagnostics);
        return Err(errors
            .into_iter()
            .map(|mut error| {
                error.span = map.map_or(error.span, |map| map.span(error.span));
                error
            })
            .collect());
    }
    let mut found = crate::Imports::default();
    for statement in &parsed.program.body {
        let path = match statement {
            Statement::ImportDeclaration(import) => import.source.value.as_str(),
            Statement::ExportFromDeclaration(export) => export.source.value.as_str(),
            Statement::ExportAllDeclaration(export) => export.source.value.as_str(),
            _ => continue,
        };
        if !found.paths.iter().any(|seen| seen == path) {
            found.paths.push(path.to_string());
        }
    }
    Ok(found)
}

/// The erased module as the page imports it: the helpers it was lowered
/// to imported, and what it imports only to name a type left out.
fn javascript<'a>(
    allocator: &'a Allocator,
    erased: &'a str,
    back: &dyn Fn(Span) -> Span,
    options: &Options,
) -> Result<String, Vec<Error>> {
    let parsed = Parser::new(allocator, erased, SourceType::mjs()).parse();
    if !parsed.diagnostics.is_empty() {
        return Err(parse_errors(parsed.diagnostics)
            .into_iter()
            .map(|mut error| {
                error.span = back(error.span);
                error
            })
            .collect());
    }
    let mut program = parsed.program;
    let mut sugar = BTreeSet::new();
    let mut unread = HashSet::new();
    {
        let semantic = SemanticBuilder::new()
            .with_build_nodes(true)
            .build(&program)
            .semantic;
        let scoping = semantic.scoping();
        let mut errors = Vec::new();
        for (name, references) in scoping.root_unresolved_references() {
            let name = name.as_str();
            if let Some(helper) = SUGAR_GLOBALS.iter().find(|helper| **helper == name) {
                sugar.insert(*helper);
            // `fetch` and its classes are the page's in a module too, as
            // `ljos check` has them (docs/DIALECT.md §4.19).
            } else if !JS_GLOBALS.contains(&name) && !FETCH_GLOBALS.contains(&name) {
                let first = references
                    .iter()
                    .map(|reference| {
                        semantic
                            .nodes()
                            .get_node(scoping.get_reference(*reference).node_id())
                            .kind()
                            .span()
                    })
                    .min_by_key(|span| span.start);
                errors.extend(first.map(|span| {
                    Error::coded(
                        format!("`{name}` has no type: it is not in scope"),
                        back(span),
                        "ts-no-any",
                    )
                }));
            }
        }
        if !errors.is_empty() {
            errors.sort_by_key(|error| error.span.start);
            return Err(errors);
        }
        // An import of a name the module reads only as a type, `type`
        // written or not, is left out, as TypeScript leaves it out.
        for statement in &program.body {
            let Statement::ImportDeclaration(import) = statement else {
                continue;
            };
            for specifier in import.specifiers.iter().flatten() {
                if let Some(symbol) = specifier.local().symbol_id.get()
                    && scoping.get_resolved_reference_ids(symbol).is_empty()
                {
                    unread.insert(specifier.local().span.start);
                }
            }
        }
    }
    for statement in program.body.iter_mut() {
        if let Statement::ImportDeclaration(import) = statement
            && let Some(specifiers) = &mut import.specifiers
        {
            // What is left is an import for the module's effects, which it
            // still has.
            specifiers.retain(|specifier| !unread.contains(&specifier.local().span.start));
            if specifiers.is_empty() {
                import.specifiers = None;
            }
        }
    }
    if !sugar.is_empty() {
        let b = B::new(allocator);
        let prefix = &options.qt_module;
        let import = b.import_named(sugar.iter().copied(), &format!("{prefix}/{SUGAR}"));
        program.body.insert(0, import);
    }
    Ok(oxc_codegen::Codegen::new().build(&program).code)
}

/// What is said of the `.ts` module `name` that has `keyword`, the syntax
/// of an `.lts` one: why it is an error, and the rename that ends it,
/// unless a file is where the rename would put it.
fn lts_syntax(name: &str, keyword: &str, taken: bool) -> String {
    let name = name.rsplit('/').next().unwrap_or(name);
    let renamed = lts_name(name);
    let why = format!(
        "`{keyword}` is Ljós syntax, which stock TypeScript tools cannot read in a `.ts` file"
    );
    if taken {
        format!("{why}; it would be renamed to `{renamed}`, but `{renamed}` is in the way")
    } else {
        format!("{why}; rename `{name}` to `{renamed}`")
    }
}

/// Replace `span` with `text`, or with blanks when `text` is None.
struct Edit {
    span: Span,
    text: Option<String>,
}

struct Eraser<'s> {
    source: &'s str,
    edits: Vec<Edit>,
    faults: Vec<(Span, String)>,
    types: HashSet<String>,
}

impl Eraser<'_> {
    fn blank(&mut self, start: u32, end: u32) {
        if start < end {
            self.edits.push(Edit {
                span: Span::new(start, end),
                text: None,
            });
        }
    }

    /// Blank a whole statement or class member, leaving a `;` where it
    /// began: without it, the line before could run on into the line
    /// after (`f` then `(1)` is `f(1)`), where TypeScript read two.
    fn blank_statement(&mut self, start: u32, end: u32) {
        if start < end {
            self.replace(Span::new(start, start + 1), ";".to_string());
            self.blank(start + 1, end);
        }
    }

    fn replace(&mut self, span: Span, text: String) {
        self.edits.push(Edit {
            span,
            text: Some(text),
        });
    }

    fn fault(&mut self, span: Span, message: impl Into<String>) {
        self.faults.push((span, message.into()));
    }

    /// Blank one name of an import or export list with the comma after it,
    /// where it is: what follows keeps its line and column, which errors
    /// are told at. A list may end in a comma.
    fn blank_listed(&mut self, span: Span) {
        let rest = &self.source[span.end as usize..];
        let comma = token_start(rest)
            .filter(|at| rest[*at..].starts_with(','))
            .map_or(0, |at| at + 1);
        self.blank(span.start, span.end + comma as u32);
    }

    /// Blank the `typed` names of a statement's list of `names`, or the
    /// whole statement when they are all of it: `export {}` would still be
    /// one, but says nothing.
    fn blank_list(&mut self, statement: Span, names: usize, typed: Vec<Span>) {
        if !typed.is_empty() && typed.len() == names {
            return self.blank_statement(statement.start, statement.end);
        }
        for span in typed {
            self.blank_listed(span);
        }
    }

    /// Whether `path`, which a module imports from, is one it can reach: a
    /// file beside it, as a QML file reaches a script.
    fn reachable(&mut self, span: Span, path: &str) -> bool {
        let relative = path.starts_with("./") || path.starts_with("../");
        let script = is_module(path) || path.ends_with(".js") || path.ends_with(".mjs");
        if relative && script {
            return true;
        }
        self.fault(
            span,
            format!(
                "`{path}` is not a file beside the module: import a `.ts`, `.lts` or `.js` file by its path from here (`./{path}`)"
            ),
        );
        false
    }

    fn statement(&mut self, statement: &Statement<'_>) {
        match statement {
            Statement::ImportDeclaration(import) => {
                if import.import_kind == ImportOrExportKind::Type {
                    return self.blank_statement(import.span.start, import.span.end);
                }
                let path = import.source.value.as_str();
                if !self.reachable(import.source.span, path) {
                    return;
                }
                let specifiers: &[ImportDeclarationSpecifier<'_>] =
                    import.specifiers.as_ref().map_or(&[], |s| s.as_slice());
                let mut typed = Vec::new();
                for specifier in specifiers {
                    match specifier {
                        ImportDeclarationSpecifier::ImportSpecifier(it) => {
                            if it.import_kind == ImportOrExportKind::Type {
                                typed.push(it.span);
                            }
                        }
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => {}
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(it) => {
                            return self.fault(
                                it.span,
                                "a module gives its names, not a default: import them by name (`import { name } from`)",
                            );
                        }
                    }
                }
                if !typed.is_empty() && typed.len() == specifiers.len() {
                    return self.blank_statement(import.span.start, import.span.end);
                }
                for span in typed {
                    self.blank_listed(span);
                }
            }
            Statement::ExportDeclaration(export) => {
                let declaration = &export.declaration;
                if self.type_only(declaration) {
                    return self.blank_statement(export.span.start, export.span.end);
                }
                self.visit_declaration(declaration);
            }
            Statement::ExportNamedDeclaration(export) => {
                if export.export_kind == ImportOrExportKind::Type {
                    return self.blank_statement(export.span.start, export.span.end);
                }
                let typed: Vec<Span> = export
                    .specifiers
                    .iter()
                    .filter(|specifier| {
                        specifier.export_kind == ImportOrExportKind::Type
                            || self.types.contains(specifier.local.name().as_str())
                    })
                    .map(|specifier| specifier.span)
                    .collect();
                self.blank_list(export.span, export.specifiers.len(), typed);
            }
            Statement::ExportFromDeclaration(export) => {
                let path = export.source.value.as_str();
                if export.export_kind == ImportOrExportKind::Type
                    || !self.reachable(export.source.span, path)
                {
                    return self.blank_statement(export.span.start, export.span.end);
                }
                let typed: Vec<Span> = export
                    .specifiers
                    .iter()
                    .filter(|specifier| specifier.export_kind == ImportOrExportKind::Type)
                    .map(|specifier| specifier.span)
                    .collect();
                self.blank_list(export.span, export.specifiers.len(), typed);
            }
            Statement::ExportAllDeclaration(export) => {
                if export.export_kind == ImportOrExportKind::Type {
                    return self.blank_statement(export.span.start, export.span.end);
                }
                self.fault(
                    export.span,
                    "`export *` gives names the importer cannot see here: export each by name (`export { name } from`)",
                );
            }
            Statement::ExportDefaultDeclaration(export) => {
                self.fault(
                    export.span,
                    "a module gives its names, not a default: export it by name (`export function name`)",
                );
            }
            Statement::TSExportAssignment(it) => {
                self.fault(
                    it.span,
                    "`export =` is CommonJS: export each name (`export const name`)",
                );
            }
            Statement::TSNamespaceExportDeclaration(it) => {
                self.blank_statement(it.span.start, it.span.end);
            }
            other => self.visit_statement(other),
        }
    }

    /// A declaration that is only types, or only says what is elsewhere
    /// (`declare`), and leaves nothing to run.
    fn type_only(&self, declaration: &Declaration<'_>) -> bool {
        match declaration {
            Declaration::TSTypeAliasDeclaration(_) | Declaration::TSInterfaceDeclaration(_) => true,
            Declaration::VariableDeclaration(it) => it.declare,
            Declaration::FunctionDeclaration(it) => it.declare || it.body.is_none(),
            Declaration::ClassDeclaration(it) => it.declare,
            Declaration::TSEnumDeclaration(it) => it.declare,
            Declaration::TSNamespaceDeclaration(it) => it.declare,
            Declaration::TSExternalModuleDeclaration(it) => it.declare,
            Declaration::TSGlobalDeclaration(it) => it.declare,
            Declaration::TSImportEqualsDeclaration(_) => false,
        }
    }

    /// Blank each TypeScript modifier word between `start` and `end`, the
    /// text before a class member's name.
    fn blank_modifiers(&mut self, start: u32, end: u32) {
        const MODIFIERS: [&str; 7] = [
            "public",
            "private",
            "protected",
            "readonly",
            "override",
            "declare",
            "abstract",
        ];
        let text = &self.source[start as usize..end as usize];
        let mut at = 0usize;
        for word in text.split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '$')) {
            if MODIFIERS.contains(&word) {
                let from = start + at as u32;
                self.blank(from, from + word.len() as u32);
            }
            at += word.len() + 1;
        }
    }

    /// Blank the first `marks` character found between `start` and `end`:
    /// the `?` of an optional name, the `!` of a definite one.
    fn blank_mark(&mut self, start: u32, end: u32, marks: &[char]) {
        let text = &self.source[start as usize..end as usize];
        if let Some(at) = text.find(|c: char| marks.contains(&c)) {
            let at = start + at as u32;
            self.blank(at, at + 1);
        }
    }
}

impl<'a> Visit<'a> for Eraser<'_> {
    fn visit_declaration(&mut self, it: &Declaration<'a>) {
        if self.type_only(it) {
            let span = it.span();
            return self.blank_statement(span.start, span.end);
        }
        match it {
            Declaration::TSEnumDeclaration(it) => self.fault(
                it.span,
                "an `enum` is not only a type, and does not erase: write a union of strings (`type Mode = \"a\" | \"b\"`)",
            ),
            Declaration::TSNamespaceDeclaration(it) => self.fault(
                it.span,
                "a `namespace` is not only a type, and does not erase: write a module of its own",
            ),
            Declaration::TSExternalModuleDeclaration(it) => self.fault(
                it.span,
                "a `module` declaration is not only a type, and does not erase: write a module of its own",
            ),
            Declaration::TSGlobalDeclaration(it) => {
                self.fault(it.span, "`global` is not only a type, and does not erase")
            }
            Declaration::TSImportEqualsDeclaration(it) => self.fault(
                it.span,
                "`import =` is CommonJS: import by name (`import { name } from`)",
            ),
            other => walk::walk_declaration(self, other),
        }
    }

    fn visit_formal_parameter(&mut self, it: &FormalParameter<'a>) {
        if it.accessibility.is_some() || it.readonly || it.r#override {
            self.fault(
                it.span,
                "a parameter property is not only a type, and does not erase: assign the field in the constructor",
            );
        }
        if it.optional {
            let end = it
                .type_annotation
                .as_ref()
                .map_or(it.span.end, |annotation| annotation.span.start);
            self.blank_mark(it.pattern.span().end, end, &['?']);
        }
        walk::walk_formal_parameter(self, it);
    }

    fn visit_ts_this_parameter(&mut self, it: &TSThisParameter<'a>) {
        // `this: T, x` loses `this: T,`.
        self.blank_listed(it.span);
    }

    fn visit_class(&mut self, it: &Class<'a>) {
        if it.r#abstract {
            let head = &self.source[it.span.start as usize..];
            if let Some(at) = head.find("abstract") {
                let at = it.span.start + at as u32;
                self.blank(at, at + "abstract".len() as u32);
            }
        }
        if let (Some(first), Some(last)) = (it.implements.first(), it.implements.last()) {
            let before = &self.source[..first.span.start as usize];
            let start = before
                .rfind("implements")
                .map_or(first.span.start, |at| at as u32);
            self.blank(start, last.span.end);
        }
        if let Some(parameters) = &it.type_parameters {
            self.visit_ts_type_parameter_declaration(parameters);
        }
        if let Some(heritage) = &it.heritage {
            self.visit_class_heritage(heritage);
        }
        self.visit_class_body(&it.body);
    }

    fn visit_class_element(&mut self, it: &ClassElement<'a>) {
        match it {
            ClassElement::MethodDefinition(method) => {
                if method.value.body.is_none()
                    || method.r#type == MethodDefinitionType::TSAbstractMethodDefinition
                {
                    return self.blank_statement(method.span.start, method.span.end);
                }
                self.blank_modifiers(method.span.start, key_start(&method.key));
                if method.optional {
                    self.blank_mark(
                        method.key.span().end,
                        method.value.params.span.start,
                        &['?'],
                    );
                }
            }
            ClassElement::PropertyDefinition(property) => {
                if property.declare
                    || property.r#type == PropertyDefinitionType::TSAbstractPropertyDefinition
                {
                    return self.blank_statement(property.span.start, property.span.end);
                }
                self.blank_modifiers(property.span.start, key_start(&property.key));
                if property.optional || property.definite {
                    let end = property
                        .type_annotation
                        .as_ref()
                        .map(|annotation| annotation.span.start)
                        .or_else(|| property.value.as_ref().map(|value| value.span().start))
                        .unwrap_or(property.span.end);
                    self.blank_mark(property.key.span().end, end, &['?', '!']);
                }
            }
            ClassElement::AccessorProperty(property) => {
                self.blank_modifiers(property.span.start, key_start(&property.key));
                if property.definite {
                    let end = property
                        .type_annotation
                        .as_ref()
                        .map_or(property.span.end, |annotation| annotation.span.start);
                    self.blank_mark(property.key.span().end, end, &['!']);
                }
            }
            ClassElement::TSIndexSignature(signature) => {
                return self.blank_statement(signature.span.start, signature.span.end);
            }
            ClassElement::StaticBlock(_) => {}
        }
        walk::walk_class_element(self, it);
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        // A return type may run over lines, but `=>` may not start one: the
        // type's lines go after the `=>`, where they are blank lines of the
        // body, and every line keeps its number.
        if let Some(returns) = &it.return_type {
            let after = self
                .source
                .get(returns.span.end as usize..it.body.span().start as usize)
                .unwrap_or_default();
            if let Some(at) = token_start(after).filter(|at| after[*at..].starts_with("=>")) {
                let end = returns.span.end + at as u32 + 2;
                let text = &self.source[returns.span.start as usize..end as usize];
                let breaks: String = text.chars().filter(|c| matches!(c, '\n' | '\r')).collect();
                // Bytes, not characters: the offsets after it are bytes.
                let spaces = " ".repeat(text.len() - breaks.len() - 2);
                self.replace(
                    Span::new(returns.span.start, end),
                    format!("{spaces}=>{breaks}"),
                );
            }
        }
        walk::walk_arrow_function_expression(self, it);
    }

    fn visit_ts_type_annotation(&mut self, it: &TSTypeAnnotation<'a>) {
        self.blank(it.span.start, it.span.end);
    }

    fn visit_ts_type_parameter_declaration(&mut self, it: &TSTypeParameterDeclaration<'a>) {
        self.blank(it.span.start, it.span.end);
    }

    fn visit_ts_type_parameter_instantiation(&mut self, it: &TSTypeParameterInstantiation<'a>) {
        self.blank(it.span.start, it.span.end);
    }

    fn visit_ts_as_expression(&mut self, it: &TSAsExpression<'a>) {
        self.blank(it.expression.span().end, it.span.end);
        self.visit_expression(&it.expression);
    }

    fn visit_ts_satisfies_expression(&mut self, it: &TSSatisfiesExpression<'a>) {
        self.blank(it.expression.span().end, it.span.end);
        self.visit_expression(&it.expression);
    }

    fn visit_ts_non_null_expression(&mut self, it: &TSNonNullExpression<'a>) {
        self.blank(it.expression.span().end, it.span.end);
        self.visit_expression(&it.expression);
    }

    fn visit_ts_type_assertion(&mut self, it: &TSTypeAssertion<'a>) {
        self.blank(it.span.start, it.expression.span().start);
        self.visit_expression(&it.expression);
    }
}

/// Where a class member's name starts, with the `[` of a computed one.
fn key_start(key: &PropertyKey<'_>) -> u32 {
    key.span().start
}

/// Where the first token of `text` starts, past blanks and comments.
fn token_start(text: &str) -> Option<usize> {
    let mut at = 0;
    loop {
        let rest = &text[at..];
        let token = rest.trim_start();
        at += rest.len() - token.len();
        if let Some(comment) = token.strip_prefix("/*") {
            at += 2 + comment.find("*/")? + 2;
        } else if token.starts_with("//") {
            at += token.find('\n')?;
        } else {
            return (!token.is_empty()).then_some(at);
        }
    }
}

/// `source` with the edits made, a blank keeping each line break and
/// putting a space for every other byte, so that every offset after it is
/// where it was. An edit inside one already made is part of it.
fn apply(source: &str, mut edits: Vec<Edit>) -> String {
    edits.sort_by_key(|edit| (edit.span.start, std::cmp::Reverse(edit.span.end)));
    let mut out = String::with_capacity(source.len());
    let mut at = 0usize;
    for edit in edits {
        let (start, end) = (edit.span.start as usize, edit.span.end as usize);
        if end <= at || end > source.len() {
            continue;
        }
        let start = start.max(at);
        out.push_str(&source[at..start]);
        match edit.text {
            Some(text) => out.push_str(&text),
            None => {
                for c in source[start..end].chars() {
                    match c {
                        '\n' | '\r' => out.push(c),
                        _ => out.extend(std::iter::repeat_n(' ', c.len_utf8())),
                    }
                }
            }
        }
        at = end;
    }
    out.push_str(&source[at..]);
    out
}
