//! QtQuick: a QML file as a module of the runtime's components.
//!
//! This is the path a file takes when what it imports is Qt's. The types it
//! names are the ones Qt describes ([`qt_types`]) and the components of the
//! project; what comes out is a function per component that creates its
//! objects with the runtime's types (`packages/runtime`).

mod lower;
mod names;
mod paths;
mod resources;
mod scope;
pub(crate) mod script;
pub(crate) mod texts;
mod types;

use oxc_ast::ast::Program;
use qml_front::{QtTypeOracle, TypeOracle};
use qml_syntax::ast::{QmlDocument, QmlImportSource};

use self::{lower::Lower, scope::Tree, types::Types};
use crate::{Error, Options, build::B, project::Project};

pub(crate) fn lower<'a>(
    b: B<'a>,
    source: &'a str,
    document: QmlDocument<'a>,
    project: &Project,
    options: &Options,
) -> Result<Program<'a>, Vec<Error>> {
    // A file compiled by itself knows nothing of its project's modules.
    if options.project.is_some() {
        let errors = uninstalled(&document, project, options);
        if !errors.is_empty() {
            return Err(errors);
        }
    }
    lower_from(b, source, document, project, options, &mut 0, false)
}

/// What the runtime package exports: `"./Qt/labs/settings"` is the module
/// `Qt.labs.settings`, which Qt's table may not have.
const RUNTIME: &str = include_str!("../../../../packages/runtime/package.json");

/// The modules `document` imports that nobody has, as Qt says of one: the
/// project, Qt's table, the runtime and the Qt that is installed.
fn uninstalled(document: &QmlDocument<'_>, project: &Project, options: &Options) -> Vec<Error> {
    let installed = |uri: &str| {
        let path = uri.replace('.', "/");
        project.has_module(uri)
            || QtTypeOracle.has_module(uri)
            || RUNTIME.contains(&format!("\"./{path}\""))
            || options.qt_imports.iter().any(|root| root.join(&path).join("qmldir").is_file())
    };
    document
        .imports
        .iter()
        .filter_map(|import| {
            let QmlImportSource::Module(uri) = &import.source else { return None };
            let uri = uri.to_string();
            (!installed(&uri)).then(|| Error::new(format!("module \"{uri}\" is not installed"), import.span))
        })
        .collect()
}

/// The same, of a document the module of another takes in: `files` is how
/// many QML files that one names by their path so far, and counts on. With
/// `text` it is one written as a text of the other.
fn lower_from<'a>(
    b: B<'a>,
    source: &'a str,
    document: QmlDocument<'a>,
    project: &Project,
    options: &Options,
    files: &mut usize,
    text: bool,
) -> Result<Program<'a>, Vec<Error>> {
    let types = Types { project, file: &options.name };
    let mut errors = Vec::new();
    let tree = Tree::analyze(&document, types, &mut errors);

    // `Button.qml` whose root is the `Button` it imports: the function is not
    // what the name means inside it.
    // A file in a directory of the project is known by its path from it.
    let stem = options.name.rsplit('/').next().unwrap_or(&options.name);
    // `Screen.ui.qml` is the type `Screen`.
    let stem = stem.strip_suffix(".ui").unwrap_or(stem);
    // A file may name itself, for its enums or to make more of itself.
    let is_other = |origin: &Option<types::Origin>| match origin {
        Some(types::Origin::Inline) => false,
        Some(types::Origin::File(file)) => *file != options.name,
        _ => true,
    };
    let shadows = tree.objects.iter().any(|object| object.name == stem && is_other(&object.origin));
    // `pragma Singleton`: what the file exports is the one object, and the
    // function that makes it has to be called something else.
    let is_singleton = project.summary(&options.name).is_some_and(|summary| summary.is_singleton);
    let name = if shadows || is_singleton { format!("{stem}$component") } else { stem.to_string() };

    let mut lower = Lower::new(b, &tree, types, stem);
    lower.uses.paths.known.clone_from(&options.files);
    lower.uses.paths.pictures.clone_from(&options.pictures);
    lower.uses.paths.first = *files;
    if text {
        // What a text names and does not have is looked for where it is
        // written, whatever it is.
        lower.dynamic.extend(project.mentions(&options.name).cloned());
    }
    lower.assigned = options.urls_on_assignment;
    let root = document.root.type_name.to_string();
    let (component, enums) = lower.component(&name, document.root, !is_singleton);
    errors.append(&mut lower.errors);

    let mut body = b.vec();
    body.extend(std::mem::take(&mut lower.module));
    body.push(component);
    if is_singleton {
        lower.uses.kernel.insert("$singleton");
        // A singleton named like the type it is one of (`QtObject.qml`, a
        // QtObject) leaves the name to the type, as QML does: an import
        // comes before the file's own directory.
        let one = if shadows { format!("{stem}$singleton") } else { stem.to_string() };
        body.push(b.const_(&one, b.call(b.id("$singleton"), [b.id(&name), b.record(enums)])));
        // `Calendar.December`, of a `Calendar` that is the one `T.Calendar`.
        body.push(lower.extends(&one, &root));
        body.push(b.export_default(b.id(&one)));
    } else {
        body.push(lower.extends(&name, &root));
        if !enums.is_empty() {
            body.push(lower.keys(&name, enums));
        }
    }
    let mut program = b.program(source, body);
    let mut uses = lower.uses;
    names::resolve(b, &mut program, &tree, types, stem, &lower.dynamic, &mut uses, &mut errors);
    if uses.handles.iter().any(|handle| handle.starts_with("$scope")) {
        uses.kernel.insert("$context");
    }
    // The files of the program the module names, it says where they are.
    let kept = resources::named(&program, project);
    if !kept.is_empty() {
        uses.kernel.insert("$resource");
    }
    if !errors.is_empty() {
        return Err(errors);
    }

    let prefix = &options.qt_module;
    let mut imports = Vec::new();
    if !uses.kernel.is_empty() {
        imports.push(b.import_named(uses.kernel.iter().copied(), &format!("{prefix}/object")));
    }
    if !uses.globals.is_empty() {
        imports.push(b.import_named(uses.globals.iter().copied(), &format!("{prefix}/QtQml")));
    }
    for (uri, names) in &uses.modules {
        let module = format!("{prefix}/{}", uri.replace('.', "/"));
        imports.push(b.import_named(names.iter().map(String::as_str), &module));
    }
    for (name, file) in &uses.files {
        if *file == options.name {
            continue;
        }
        let path = types::relative(&options.name, file);
        imports.push(b.import_default(name, &format!("{path}{}", options.component_extension)));
    }
    for name in &uses.namespaces {
        match types.namespace(name).and_then(|source| names::namespace_source(source, prefix)) {
            Some(module) => imports.push(b.import_namespace(name, &module)),
            None => errors.push(Error::new(
                format!("`{name}` is a directory: only a module or a script can be imported as a name yet"),
                document.span,
            )),
        }
    }
    if !errors.is_empty() {
        return Err(errors);
    }
    *files += uses.paths.count();
    let (named, tables) = uses.paths.statements(b, &options.component_extension);
    imports.extend(named);
    // What makes the object of a text comes after everything it names.
    let mut made = Vec::new();
    for (index, text) in uses.texts.iter().enumerate() {
        match texts::declare(b, text, index, project, options, files, &name, &mut imports) {
            Ok(statement) => made.push(statement),
            Err(more) => errors.extend(more),
        }
    }
    if !errors.is_empty() {
        return Err(errors);
    }
    imports.extend(tables);
    for (address, path) in &kept {
        let path = types::relative(&options.name, path);
        let url = b.member(b.new_(b.id("URL"), [b.string(&path), b.import_meta_url()]), "href");
        imports.push(b.statement(b.call(b.id("$resource"), [b.string(address), url])));
    }
    imports.extend(made);
    for (index, import) in imports.into_iter().enumerate() {
        program.body.insert(index, import);
    }
    Ok(program)
}
