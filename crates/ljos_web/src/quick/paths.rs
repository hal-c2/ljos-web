//! QML files named by their path.
//!
//! `Qt.createComponent("mobs/MobBase.qml")`, `source: "Page.qml"`,
//! `stack.push("Details.qml")`: to Qt a path it compiles the file of when the
//! program gets there. Here the file is compiled already, and a module has to
//! import it to have it. So a path that names a QML file becomes the
//! component the file is, there when it is asked for as it is in Qt:
//!
//! ```js
//! import $file1 from "./mobs/MobBase.qml";
//! $file($file1)
//! ```
//!
//! A path put together as the program runs (`"towers/" + name + ".qml"`) is
//! looked up among the files it could be, which are the ones in the
//! directory that end and start as it does:
//!
//! ```js
//! const $files1 = $files({ "towers/Melee.qml": () => $file2, ... }, import.meta.url);
//! $files1("towers/" + name + ".qml", true)
//! ```
//!
//! What such a component makes finds names where the path was written, as
//! what Qt makes from a path does: in a project that looks names up as it
//! runs, the component is given the context of the object that named it
//! (`$file($file1, $scope)`).

use std::collections::BTreeSet;

use oxc_ast::ast::*;
use oxc_span::{GetSpan, SPAN};
use oxc_syntax::operator::BinaryOperator;

use crate::build::B;

/// The QML files a module names by path, and the ones it could.
#[derive(Default)]
pub(crate) struct Paths {
    /// The QML files in the module's directory and under it, by their path
    /// from it. None when nobody looked: then a path is taken at its word.
    pub known: Option<Vec<String>>,
    /// The other files there, likewise.
    pub pictures: Option<Vec<String>>,
    /// The files imported: `$file1` is the first, after `first` of them
    /// that a module this one is taken into has already.
    pub first: usize,
    named: Vec<String>,
    /// The paths each table has: `$files1` is the first.
    tables: Vec<Vec<String>>,
}

/// What `Qt.createComponent` and `Qt.resolvedUrl` are called on.
const QT: &str = "Qt";

/// The formats Qt reads a picture in, in the order it tries them for a
/// source with no suffix.
const FORMATS: [&str; 24] = [
    "bmp", "cur", "gif", "icns", "ico", "jfif", "jp2", "jpeg", "jpg", "mng", "pbm", "pdf", "pgm", "png", "ppm", "svg",
    "svgz", "tga", "tif", "tiff", "wbmp", "webp", "xbm", "xpm",
];

impl Paths {
    fn exists(&self, path: &str) -> bool {
        self.known.as_ref().is_some_and(|known| known.iter().any(|file| file == path))
    }

    /// `images/logo` where there is no such file but `images/logo.png`: the
    /// picture Qt finds for it, which is the first there is of the formats it
    /// reads.
    pub(crate) fn picture(&self, path: &str) -> Option<String> {
        let pictures = self.pictures.as_ref()?;
        let plain = path.strip_prefix("./").unwrap_or(path);
        let has = |file: &str| pictures.iter().any(|picture| picture == file);
        if plain.starts_with("../") || plain.rsplit('/').next()?.contains('.') || has(plain) {
            return None;
        }
        FORMATS.iter().find(|format| has(&format!("{plain}.{format}"))).map(|format| format!("{path}.{format}"))
    }

    /// `$file1`: the default export of the file at `path`.
    fn import(&mut self, path: &str) -> String {
        let index = self.named.iter().position(|named| named == path).unwrap_or_else(|| {
            self.named.push(path.to_string());
            self.named.len() - 1
        });
        format!("$file{}", self.first + index + 1)
    }

    /// How many files are imported.
    pub(crate) fn count(&self) -> usize {
        self.named.len()
    }

    /// `$file($file1)`: the file at `path` as a component, made in `scope`.
    fn component<'a>(
        &mut self,
        b: B<'a>,
        kernel: &mut BTreeSet<&'static str>,
        path: &str,
        scope: Option<&str>,
    ) -> Expression<'a> {
        kernel.insert("$file");
        let name = self.import(path);
        b.call(b.id("$file"), std::iter::once(b.id(&name)).chain(scope.map(|scope| b.id(scope))))
    }

    /// The files that start with `prefix` and end with `suffix`.
    fn among(&self, prefix: &str, suffix: &str) -> Vec<String> {
        let prefix = prefix.strip_prefix("./").unwrap_or(prefix);
        let fits = |path: &&String| path.starts_with(prefix) && path.ends_with(suffix);
        self.known.iter().flatten().filter(fits).cloned().collect()
    }

    /// `$files1`: where a path is looked up among `paths`.
    fn table(&mut self, kernel: &mut BTreeSet<&'static str>, paths: Vec<String>) -> String {
        kernel.insert("$files");
        let index = self.tables.iter().position(|table| *table == paths).unwrap_or_else(|| {
            self.tables.push(paths);
            self.tables.len() - 1
        });
        format!("$files{}", index + 1)
    }

    /// A URL written as a literal, when it is that of a QML file. `scope`
    /// is the context of the object it is written in, when what the
    /// component makes may look for names there.
    pub(crate) fn literal<'a>(
        &mut self,
        b: B<'a>,
        kernel: &mut BTreeSet<&'static str>,
        value: &str,
        scope: Option<&str>,
    ) -> Option<Expression<'a>> {
        let path = relative(value)?;
        // Outside the directory nobody looked.
        (path.starts_with("../") || self.known.is_none() || self.exists(path))
            .then(|| self.component(b, kernel, path, scope))
    }

    /// What `expression` is, when it names a QML file or asks Qt for one.
    /// What it is made of is still as it was written. True when it became
    /// a component, which is then made in `scope`.
    pub(crate) fn rewrite<'a>(
        &mut self,
        b: B<'a>,
        kernel: &mut BTreeSet<&'static str>,
        expression: &mut Expression<'a>,
        scope: Option<&str>,
    ) -> bool {
        let context = || scope.map(|scope| b.id(scope));
        let mut made = true;
        let replacement = match expression {
            // Only what was written: a path the compiler built is not one.
            Expression::StringLiteral(literal) if !literal.span.is_empty() => {
                let Some(path) = relative(literal.value.as_str()) else { return false };
                if !self.exists(path) {
                    return false;
                }
                self.component(b, kernel, path, scope)
            }
            Expression::CallExpression(call) => {
                let Some(method) = qt_method(call) else { return false };
                let first = call.arguments.first().and_then(Argument::as_expression);
                match (method, first) {
                    ("createComponent", Some(first)) => {
                        // `Qt.createComponent("QtQuick", "Rectangle")`: a
                        // type of a module, which is not a file.
                        if let Some(Argument::StringLiteral(_)) = call.arguments.get(1) {
                            return false;
                        }
                        let literal = match first {
                            Expression::StringLiteral(literal) => {
                                self.literal(b, kernel, literal.value.as_str(), scope)
                            }
                            _ => None,
                        };
                        match literal {
                            Some(component) => component,
                            None => {
                                let (prefix, suffix) = ends(first);
                                let table = self.table(kernel, self.among(&prefix, &suffix));
                                let mut path = call.arguments.remove(0).into_expression();
                                claim(&mut path);
                                // Whatever it turns out to be, a component:
                                // one that says the file is not there.
                                b.call(b.id(&table), [path, b.boolean(true)].into_iter().chain(context()))
                            }
                        }
                    }
                    ("resolvedUrl", Some(first)) => {
                        let literal = match first {
                            Expression::StringLiteral(literal) => {
                                let value = literal.value.as_str();
                                if value.is_empty() || is_absolute(value) {
                                    return false;
                                }
                                Some(self.literal(b, kernel, value, scope).unwrap_or_else(|| {
                                    made = false;
                                    // A directory is no asset: a bundler
                                    // that takes `new URL` for one gives it
                                    // back without the slash it ends with.
                                    if value.ends_with('/') {
                                        kernel.insert("$url");
                                        return b.call(b.id("$url"), [b.string(value), b.import_meta_url()]);
                                    }
                                    b.member(b.new_(b.id("URL"), [b.string(value), b.import_meta_url()]), "href")
                                }))
                            }
                            _ => None,
                        };
                        match literal {
                            Some(url) => url,
                            None => {
                                made = false;
                                kernel.insert("$url");
                                let path = call.arguments.remove(0).into_expression();
                                b.call(b.id("$url"), [path, b.import_meta_url()])
                            }
                        }
                    }
                    _ => return false,
                }
            }
            // `view + ".qml"`: the component, if there is such a file, and
            // the path as it is if there is not.
            Expression::BinaryExpression(_) | Expression::TemplateLiteral(_) if !expression.span().is_empty() => {
                let (prefix, suffix) = ends(expression);
                if !suffix.ends_with(".qml") {
                    return false;
                }
                let among = self.among(&prefix, &suffix);
                if among.is_empty() {
                    return false;
                }
                let table = self.table(kernel, among);
                let mut path = std::mem::replace(expression, b.null());
                claim(&mut path);
                match context() {
                    Some(context) => b.call(b.id(&table), [path, b.boolean(false), context]),
                    None => b.call(b.id(&table), [path]),
                }
            }
            _ => return false,
        };
        *expression = replacement;
        made
    }

    /// What the module imports and declares for the paths it names: the
    /// imports, then the tables. `extension` is what a QML file is imported
    /// with.
    pub(crate) fn statements<'a>(&mut self, b: B<'a>, extension: &str) -> (Vec<Statement<'a>>, Vec<Statement<'a>>) {
        let tables: Vec<Statement<'a>> = std::mem::take(&mut self.tables)
            .into_iter()
            .enumerate()
            .map(|(index, paths)| {
                let entries: Vec<_> = paths
                    .iter()
                    .map(|path| {
                        // Read when it is asked for: a file that imports this
                        // one may not have run yet.
                        let file = b.arrow(&[], b.id(&self.import(path)));
                        (b.str(path).as_str(), file)
                    })
                    .collect();
                let table = b.call(b.id("$files"), [b.object(entries), b.import_meta_url()]);
                b.const_(&format!("$files{}", index + 1), table)
            })
            .collect();
        let imports = self
            .named
            .iter()
            .enumerate()
            .map(|(index, path)| {
                let stem = path.strip_suffix(".qml").unwrap_or(path);
                let source = if stem.starts_with("../") { stem.to_string() } else { format!("./{stem}") };
                b.import_default(&format!("$file{}", self.first + index + 1), &format!("{source}{extension}"))
            })
            .collect();
        (imports, tables)
    }
}

/// Whether `expression` asks Qt for a URL, which is one when it has it.
pub(crate) fn is_resolved(expression: &Expression<'_>) -> bool {
    matches!(expression, Expression::CallExpression(call) if qt_method(call) == Some("resolvedUrl"))
}

/// `Qt.name(...)`: the name.
pub(crate) fn qt_method<'a>(call: &CallExpression<'a>) -> Option<&'a str> {
    let Expression::StaticMemberExpression(member) = &call.callee else { return None };
    let Expression::Identifier(object) = &member.object else { return None };
    // Written, and not something of the script's own called `Qt`: the
    // resolver has not been here, but a script does not declare one.
    (object.name == QT && !object.span.is_empty()).then(|| member.property.name.as_str())
}

/// The path of a QML file next to the module or under its directory, as the
/// table has it; None for anything else.
fn relative(value: &str) -> Option<&str> {
    if !value.ends_with(".qml") || is_absolute(value) {
        return None;
    }
    let mut path = value;
    while let Some(rest) = path.strip_prefix("./") {
        path = rest;
    }
    (!path.is_empty()).then_some(path)
}

/// What a path put together starts and ends with, as far as it is written:
/// `"towers/" + name + ".qml"` starts with `towers/` and ends with `.qml`.
fn ends(expression: &Expression<'_>) -> (String, String) {
    match expression {
        Expression::StringLiteral(literal) => (literal.value.to_string(), literal.value.to_string()),
        Expression::BinaryExpression(binary) if binary.operator == BinaryOperator::Addition => {
            (ends(&binary.left).0, ends(&binary.right).1)
        }
        Expression::ParenthesizedExpression(inner) => ends(&inner.expression),
        Expression::TemplateLiteral(template) => {
            let text = |quasi: Option<&TemplateElement<'_>>| {
                quasi.and_then(|quasi| quasi.value.cooked.as_ref()).map(ToString::to_string).unwrap_or_default()
            };
            (text(template.quasis.first()), text(template.quasis.last()))
        }
        _ => (String::new(), String::new()),
    }
}

/// Marks a path as looked up already: what it is made of is read as it is.
fn claim(path: &mut Expression<'_>) {
    match path {
        Expression::BinaryExpression(binary) => binary.span = SPAN,
        Expression::TemplateLiteral(template) => template.span = SPAN,
        Expression::StringLiteral(literal) => literal.span = SPAN,
        _ => {}
    }
}

/// `scheme:...` or `/...`: a URL that is not relative to the file.
pub(crate) fn is_absolute(url: &str) -> bool {
    if url.starts_with('/') {
        return true;
    }
    let Some((scheme, _)) = url.split_once(':') else { return false };
    scheme.starts_with(|c: char| c.is_ascii_alphabetic())
        && scheme.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
}
