//! A script a QML file imports: `import "logic.js" as Logic`.
//!
//! To QML that is a JavaScript file whose functions and variables are what
//! `Logic` has. A module is the same thing said the other way round, so the
//! script becomes one: what it declares at the top is exported, what it
//! `.import`s is imported, and `Qt` and the like are imported from where
//! QML's globals are.
//!
//! ```js
//! .pragma library
//! .import QtQuick as QQ
//! var board = [];
//! function index(column, row) { return column + row * 10; }
//! ```
//!
//! ```js
//! import * as QQ from "ljos-web/QtQuick";
//! export var board = [];
//! export function index(column, row) { return column + row * 10; }
//! ```
//!
//! A module is evaluated once, which is what `.pragma library` asks for.
//! Without it Qt gives every object that imports the script a copy of its
//! own, with the object's properties in scope: that is not done, and a name
//! such a script takes from whoever imports it is an error here.

use std::collections::{BTreeSet, HashSet};

use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_ast_visit::{VisitMut, walk_mut};
use oxc_semantic::SemanticBuilder;
use oxc_parser::Parser;
use oxc_span::{GetSpan, SourceType, Span};

use super::{
    names::{JS_GLOBALS, QML_GLOBALS, namespace_source},
    paths::Paths,
};
use crate::{Error, Options, build::B, parse_errors, project::Source};

/// `.pragma library`, `.import QtQuick as QQ`: what is not JavaScript.
struct Directives {
    /// The script with the directives commented out, everything else where
    /// it was.
    text: String,
    library: bool,
    imports: Vec<(Source, String)>,
    errors: Vec<Error>,
}

fn directives(source: &str) -> Directives {
    let mut found = Directives { text: source.to_string(), library: false, imports: Vec::new(), errors: Vec::new() };
    let mut offset = 0;
    for line in source.split_inclusive('\n') {
        let start = offset + (line.len() - line.trim_start().len());
        offset += line.len();
        let code = line.trim_start().split("//").next().unwrap_or_default();
        let words: Vec<&str> = code.split_whitespace().collect();
        let span = Span::new(start as u32, (start + code.trim_end().len()) as u32);
        match words.as_slice() {
            [".pragma", "library"] => found.library = true,
            [".pragma", ..] => found.errors.push(Error::new("`.pragma library` is the only pragma a script has", span)),
            [".import", what, "as", name] | [".import", what, _, "as", name] => {
                let quoted = what.trim_matches(|c| c == '"' || c == '\'');
                let what = if quoted.len() < what.len() {
                    Source::Path(quoted.to_string())
                } else {
                    Source::Module((*what).to_string())
                };
                found.imports.push((what, (*name).to_string()));
            }
            [".import", ..] => {
                found.errors.push(Error::new("an import of a script is `.import Module as Name`", span));
            }
            _ => continue,
        }
        found.text.replace_range(start..start + 2, "//");
    }
    found
}

pub(crate) fn compile(source: &str, options: &Options) -> Result<String, Vec<Error>> {
    let allocator = Allocator::default();
    let Directives { text, library, imports, errors } = directives(source);
    if !errors.is_empty() {
        return Err(errors);
    }
    let text = allocator.alloc_str(&text);
    let parsed = Parser::new(&allocator, text, SourceType::script()).parse();
    if !parsed.diagnostics.is_empty() {
        return Err(parse_errors(parsed.diagnostics));
    }
    let mut program = parsed.program;
    let b = B::new(&allocator);

    // What the script does not declare: an import of its own, something of
    // QML's or JavaScript's, or nothing a module could find.
    let mut errors = Vec::new();
    let mut free = HashSet::new();
    {
        let semantic = SemanticBuilder::new().with_build_nodes(true).build(&program).semantic;
        let scoping = semantic.scoping();
        let mut unresolved: Vec<_> = scoping.root_unresolved_references().iter().collect();
        unresolved.sort_by_key(|(name, _)| name.as_str());
        for (name, references) in unresolved {
            let name = name.as_str();
            let spans = references
                .iter()
                .map(|reference| semantic.nodes().get_node(scoping.get_reference(*reference).node_id()).kind().span());
            if QML_GLOBALS.contains(&name) {
                free.extend(spans.map(|span| span.start));
            } else if !JS_GLOBALS.contains(&name) && !imports.iter().any(|(_, alias)| alias == name) {
                let message = if library {
                    format!("`{name}` is not defined")
                } else {
                    format!(
                        "`{name}` is not defined: a script that is not a library takes it from the object that imports it, which is not done yet"
                    )
                };
                errors.extend(spans.min_by_key(|span| span.start).map(|span| Error::new(message, span)));
            }
        }
    }
    if !errors.is_empty() {
        errors.sort_by_key(|error| error.span.start);
        return Err(errors);
    }

    let mut paths = Paths::default();
    paths.known.clone_from(&options.files);
    let mut kernel = BTreeSet::new();
    let mut globals = BTreeSet::new();
    Script { b, paths: &mut paths, kernel: &mut kernel, free: &free, globals: &mut globals }
        .visit_program(&mut program);

    // What is declared at the top is what the script is to whoever imports
    // it. A name declared twice is exported once.
    let mut exported = HashSet::new();
    let authored = std::mem::replace(&mut program.body, b.vec());
    let mut body = Vec::new();
    for statement in authored {
        let mut names = Vec::new();
        match &statement {
            Statement::FunctionDeclaration(function) => names.extend(function.id.as_ref().map(|id| id.name.as_str())),
            Statement::ClassDeclaration(class) => names.extend(class.id.as_ref().map(|id| id.name.as_str())),
            Statement::VariableDeclaration(declaration) => {
                for declarator in &declaration.declarations {
                    names.extend(declarator.id.get_binding_identifiers().iter().map(|id| id.name.as_str()));
                }
            }
            _ => {}
        }
        if names.is_empty() || names.iter().any(|name| exported.contains(*name)) {
            body.push(statement);
            continue;
        }
        exported.extend(names.into_iter().map(str::to_string));
        body.push(match statement {
            Statement::FunctionDeclaration(function) => b.export(Declaration::FunctionDeclaration(function)),
            Statement::ClassDeclaration(class) => b.export(Declaration::ClassDeclaration(class)),
            Statement::VariableDeclaration(declaration) => b.export(Declaration::VariableDeclaration(declaration)),
            other => other,
        });
    }

    let prefix = &options.qt_module;
    let mut head = Vec::new();
    let (files, tables) = paths.statements(b, &options.component_extension);
    if !kernel.is_empty() {
        head.push(b.import_named(kernel.iter().copied(), &format!("{prefix}/object")));
    }
    if !globals.is_empty() {
        head.push(b.import_named(globals.iter().copied(), &format!("{prefix}/QtQml")));
    }
    for (what, alias) in &imports {
        match namespace_source(what, prefix) {
            Some(module) => head.push(b.import_namespace(alias, &module)),
            None => {
                return Err(vec![Error::new(
                    format!("`{alias}` is a directory: a script imports a module or another script"),
                    Span::default(),
                )]);
            }
        }
    }
    head.extend(files);
    head.extend(tables);
    program.body.extend(head);
    program.body.extend(body);
    program.source_type = SourceType::mjs();
    Ok(oxc_codegen::Codegen::new().build(&program).code)
}

struct Script<'a, 's> {
    b: B<'a>,
    paths: &'s mut Paths,
    kernel: &'s mut BTreeSet<&'static str>,
    /// Where the script names something of QML's, by span start.
    free: &'s HashSet<u32>,
    /// The ones it still names when the paths are what they are.
    globals: &'s mut BTreeSet<&'static str>,
}

impl<'a> VisitMut<'a> for Script<'a, '_> {
    fn visit_expression(&mut self, expression: &mut Expression<'a>) {
        self.paths.rewrite(self.b, self.kernel, expression, None);
        walk_mut::walk_expression(self, expression);
    }

    fn visit_identifier_reference(&mut self, identifier: &mut IdentifierReference<'a>) {
        if !identifier.span.is_empty()
            && self.free.contains(&identifier.span.start)
            && let Some(global) = QML_GLOBALS.iter().find(|global| **global == identifier.name.as_str())
        {
            self.globals.insert(global);
        }
    }

    fn visit_property_key(&mut self, key: &mut PropertyKey<'a>) {
        if !matches!(key, PropertyKey::StringLiteral(_)) {
            walk_mut::walk_property_key(self, key);
        }
    }
}
