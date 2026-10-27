//! QML written as a text of the program.
//!
//! `Qt.createQmlObject('import QtQuick; PathArc {}', path)`: to Qt a text it
//! compiles when the program gets there. Here it is compiled with the file
//! it is written in, as the document it is, and what makes its object is in
//! the file's module:
//!
//! ```js
//! const $text1 = (() => { function Arc$text1($props) { ... } return Arc$text1; })();
//! $file($text1).createObject(path)
//! ```
//!
//! A text put together (`'FontLoader { source: "' + url + '" }'`) is one
//! as far as it is written, and what is put into it is given to what makes
//! the component, where it is put into a string of the text:
//!
//! ```js
//! const $text1 = ($hole1) => { ...source: "" + $hole1... return Font$text1; };
//! $file($text1(url)).createObject(parent)
//! ```

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::*;
use oxc_ast_visit::{VisitMut, walk_mut};
use oxc_span::Span;
use oxc_syntax::operator::BinaryOperator;

use crate::{Error, Options, build::B, project, project::Project};

/// A text some `Qt.createQmlObject` is given.
pub(crate) struct Text {
    /// What is written of it, with a [`hole`] where something is put in.
    pub source: String,
    /// Where it is written in the file.
    pub span: Span,
    /// How many things are put into it.
    pub holes: usize,
}

/// What stands in a text for the `index`th thing put into it: a character
/// nobody writes, of no more bytes than putting something in takes to write.
pub(crate) fn hole(index: usize) -> Option<char> {
    char::from_u32(0xE000 + u32::try_from(index).ok()?).filter(|hole| is_hole(*hole))
}

fn is_hole(character: char) -> bool {
    ('\u{E000}'..='\u{F8FF}').contains(&character)
}

/// What `Qt.createQmlObject(text, parent)` is given as its text, when it is
/// given a parent too: nothing else is a call this is about.
pub(crate) fn given<'c, 'a>(call: &'c CallExpression<'a>) -> Option<&'c Expression<'a>> {
    if super::paths::qt_method(call) != Some("createQmlObject")
        || call.arguments.iter().take(2).any(|argument| argument.as_expression().is_none())
    {
        return None;
    }
    call.arguments.first()?.as_expression()
}

/// What a text is written as: the text and how many things are put into
/// it, or None when nothing of it is written.
pub(crate) fn written(expression: &Expression<'_>) -> Option<(String, usize)> {
    let (mut text, mut holes) = (String::new(), 0);
    read(expression, &mut text, &mut holes)?;
    (text.chars().any(|character| !is_hole(character))).then_some((text, holes))
}

fn read(expression: &Expression<'_>, text: &mut String, holes: &mut usize) -> Option<()> {
    let mut put = |text: &mut String| {
        text.push(hole(*holes)?);
        *holes += 1;
        Some(())
    };
    match expression {
        Expression::StringLiteral(literal) => text.push_str(literal.value.as_str()),
        Expression::BinaryExpression(binary) if binary.operator == BinaryOperator::Addition => {
            read(&binary.left, text, holes)?;
            read(&binary.right, text, holes)?;
        }
        Expression::ParenthesizedExpression(inner) => read(&inner.expression, text, holes)?,
        Expression::TemplateLiteral(template) => {
            for (index, quasi) in template.quasis.iter().enumerate() {
                text.push_str(quasi.value.cooked.as_ref()?.as_str());
                if index < template.expressions.len() {
                    put(text)?;
                }
            }
        }
        _ => put(text)?,
    }
    Some(())
}

/// What is put into the text `expression` is, in the order it is put in.
pub(crate) fn put<'a>(expression: Expression<'a>, into: &mut Vec<Expression<'a>>) {
    match expression {
        Expression::StringLiteral(_) => {}
        Expression::BinaryExpression(binary) if binary.operator == BinaryOperator::Addition => {
            let binary = binary.unbox();
            put(binary.left, into);
            put(binary.right, into);
        }
        Expression::ParenthesizedExpression(inner) => put(inner.unbox().expression, into),
        Expression::TemplateLiteral(template) => into.extend(template.unbox().expressions),
        other => into.push(other),
    }
}

/// `$text1`: what makes the component the `index`th text is.
pub(crate) fn name(index: usize) -> String {
    format!("$text{}", index + 1)
}

/// The statement that declares what makes the component `text` is, the
/// `index`th of the file `options` is of, whose component is `own`. What its
/// module would import is added to `imports`, which are the file's.
pub(crate) fn declare<'a>(
    b: B<'a>,
    text: &Text,
    index: usize,
    project: &Project,
    options: &Options,
    files: &mut usize,
    own: &str,
    imports: &mut Vec<Statement<'a>>,
) -> Result<Statement<'a>, Vec<Error>> {
    // Read from where it is written, so that what is said of it is said of
    // that place in the file.
    let from = text.span.start as usize + 1;
    let source: &'a str = b.allocator().alloc_str(&format!("{}{}", " ".repeat(from), text.source));
    let parsed = qml_syntax::parse(b.allocator(), source);
    if !parsed.diagnostics.is_empty() {
        // What was put into the text where QML is read is not there to read.
        let put = |error: &Error| source[error.span.start as usize..].chars().next().is_some_and(is_hole);
        let mut errors: Vec<Error> = parsed.diagnostics.into_iter().map(Error::from).collect();
        for error in errors.iter_mut().filter(|error| put(error)) {
            error.message = UNREAD.to_string();
        }
        return Err(errors);
    }
    if parsed.document.pragmas.iter().any(|pragma| pragma.name == "Singleton") {
        return Err(vec![Error::new("a text given to `Qt.createQmlObject` is no singleton", text.span)]);
    }
    // A document of its own, next to the file: it imports what it says, and
    // the directory.
    let mut project = project.clone();
    let mut options = options.clone();
    options.name = format!("{}{}", options.name, name(index));
    project.insert(&options.name, project::summarize(&parsed.document));
    let program = super::lower_from(b, source, parsed.document, &project, &options, files, true)?;

    let mut body = b.vec();
    let mut component = None;
    for statement in program.body {
        match statement {
            Statement::ImportDeclaration(_) => import(statement, imports, own, text.span)?,
            Statement::ExportDefaultDeclaration(export) => {
                if let ExportDefaultDeclarationKind::FunctionDeclaration(function) = export.unbox().declaration {
                    component = function.id.as_ref().map(|id| id.name.to_string());
                    body.push(Statement::FunctionDeclaration(function));
                }
            }
            statement => body.push(statement),
        }
    }
    let Some(component) = component else {
        return Err(vec![Error::new("a text given to `Qt.createQmlObject` has to be an object", text.span)]);
    };
    let mut holes = Holes { b, found: HashSet::new() };
    for statement in &mut body {
        holes.visit_statement(statement);
    }
    if holes.found.len() < text.holes {
        return Err(vec![Error::new(UNREAD, text.span)]);
    }
    body.push(b.return_(b.id(&component)));
    let given: Vec<String> = (0..text.holes).map(taken).collect();
    let given: Vec<&str> = given.iter().map(String::as_str).collect();
    let made = if given.is_empty() { b.iife(body) } else { b.arrow_block(&given, body) };
    Ok(b.const_(&name(index), made))
}

const UNREAD: &str = "what is put into a text given to `Qt.createQmlObject` can only be put into a string of it yet";

/// `$hole1`: what the `index`th thing put into a text is given as.
fn taken(index: usize) -> String {
    format!("$hole{}", index + 1)
}

/// Adds what `statement` imports to `imports`, where it is not there. A
/// name the file has for something else, as `own` is its component, is one
/// too many.
fn import<'a>(
    statement: Statement<'a>,
    imports: &mut Vec<Statement<'a>>,
    own: &str,
    span: Span,
) -> Result<(), Vec<Error>> {
    let Statement::ImportDeclaration(mut declaration) = statement else { return Ok(()) };
    let mut there = HashMap::new();
    for import in imports.iter() {
        let Statement::ImportDeclaration(import) = import else { continue };
        for specifier in import.specifiers.iter().flatten() {
            there.insert(specifier.local().name.to_string(), (import.source.value.to_string(), imported(specifier)));
        }
    }
    let source = declaration.source.value.to_string();
    let mut clash = None;
    if let Some(specifiers) = &mut declaration.specifiers {
        specifiers.retain(|specifier| {
            let name = specifier.local().name.as_str();
            match there.get(name) {
                Some(same) if *same == (source.clone(), imported(specifier)) => false,
                None if name != own => true,
                // The file's own component, which the text is declared after.
                None if imported(specifier) == "default" && source == format!("./{own}.qml") => false,
                _ => {
                    clash = Some(name.to_string());
                    false
                }
            }
        });
        if let Some(name) = clash {
            return Err(clashing(&name, span));
        }
        if specifiers.is_empty() {
            return Ok(());
        }
        // The names of a module go with the ones the file has of it.
        let is_named = |specifier: &ImportDeclarationSpecifier<'_>| {
            matches!(specifier, ImportDeclarationSpecifier::ImportSpecifier(_))
        };
        let same = imports.iter_mut().find_map(|import| match import {
            Statement::ImportDeclaration(import) if import.source.value == source.as_str() => {
                import.specifiers.as_mut().filter(|specifiers| specifiers.iter().all(is_named))
            }
            _ => None,
        });
        if let Some(same) = same
            && specifiers.iter().all(is_named)
        {
            same.extend(specifiers.drain(..));
            return Ok(());
        }
    }
    imports.push(Statement::ImportDeclaration(declaration));
    Ok(())
}

fn clashing(name: &str, span: Span) -> Vec<Error> {
    vec![Error::new(
        format!("`{name}` is one thing to the file and another to the text given to `Qt.createQmlObject`"),
        span,
    )]
}

/// What of a module a specifier imports: a name, the default, or all of it.
fn imported(specifier: &ImportDeclarationSpecifier<'_>) -> String {
    match specifier {
        ImportDeclarationSpecifier::ImportSpecifier(specifier) => specifier.imported.name().to_string(),
        ImportDeclarationSpecifier::ImportDefaultSpecifier(_) => "default".to_string(),
        ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => "*".to_string(),
    }
}

/// Puts what a text is given where its holes are.
struct Holes<'a> {
    b: B<'a>,
    found: HashSet<usize>,
}

impl<'a> Holes<'a> {
    /// `"a" + $hole1 + "b"` for a string with a hole in it.
    fn joined(&mut self, value: &str) -> Option<Expression<'a>> {
        if !value.chars().any(is_hole) {
            return None;
        }
        let b = self.b;
        let mut piece = String::new();
        // A string whatever is put in first.
        let mut joined = None;
        let join = |joined: &mut Option<Expression<'a>>, part: Expression<'a>| {
            *joined = Some(match joined.take() {
                Some(left) => b.binary(left, BinaryOperator::Addition, part),
                None => part,
            });
        };
        for character in value.chars() {
            if !is_hole(character) {
                piece.push(character);
                continue;
            }
            if joined.is_none() || !piece.is_empty() {
                join(&mut joined, b.string(&piece));
                piece.clear();
            }
            let index = character as usize - 0xE000;
            self.found.insert(index);
            join(&mut joined, b.id(&taken(index)));
        }
        if !piece.is_empty() {
            join(&mut joined, b.string(&piece));
        }
        joined
    }
}

impl<'a> VisitMut<'a> for Holes<'a> {
    fn visit_expression(&mut self, expression: &mut Expression<'a>) {
        if let Expression::StringLiteral(literal) = expression
            && let Some(joined) = self.joined(literal.value.as_str())
        {
            *expression = joined;
            return;
        }
        walk_mut::walk_expression(self, expression);
    }
}
