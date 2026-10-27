//! The files a program keeps inside itself.
//!
//! A build that makes a module says which files go into the program with it
//! (`RESOURCES`), and the program names each by where it is in there:
//! `qrc:/qt/qml/Thermostat/images/icon.png`. On the web they are files a
//! browser fetches, so a module that writes such a name says where the file
//! is: `$resource(name, new URL("./images/icon.png", import.meta.url).href)`,
//! which is how what bundles the program knows to take the file along. What
//! the program sees stays the name it wrote.

use std::collections::BTreeMap;

use oxc_ast::ast::{Program, StringLiteral, TemplateLiteral};
use oxc_ast_visit::{Visit, walk};

use crate::project::Project;

/// The files `program` names, by their names: where each is, from the
/// directory the project's files are known from.
pub(crate) fn named(program: &Program<'_>, project: &Project) -> BTreeMap<String, String> {
    let mut named = Named { project, found: BTreeMap::new() };
    named.visit_program(program);
    named.found
}

struct Named<'p> {
    project: &'p Project,
    found: BTreeMap<String, String>,
}

impl Named<'_> {
    /// `written` is the name of a file, or how the name of one starts: what
    /// is put together when the program runs
    /// (`"qrc:/qt/qml/Thermostat/images/" + name + ".png"`) may be any of
    /// the files that start so. `end` is how it ends, where that is known.
    fn name(&mut self, written: &str, end: &str) {
        // `:/images/icon.png` and `qrc:///images/icon.png` are the same.
        let Some(rest) = written.strip_prefix("qrc:").or_else(|| written.strip_prefix(':')) else { return };
        if !rest.starts_with('/') {
            return;
        }
        let address = format!("qrc:/{}", rest.trim_start_matches('/'));
        for (address, path) in self.project.resources(&address) {
            if address.ends_with(end) {
                self.found.insert(address.clone(), path.clone());
            }
        }
    }
}

impl<'a> Visit<'a> for Named<'_> {
    fn visit_string_literal(&mut self, literal: &StringLiteral<'a>) {
        self.name(literal.value.as_str(), "");
    }

    fn visit_template_literal(&mut self, literal: &TemplateLiteral<'a>) {
        // `qrc:/qt/qml/Thermostat/images/${name}.png`
        if let [first, .., last] = literal.quasis.as_slice() {
            self.name(first.value.raw.as_str(), last.value.raw.as_str());
        } else if let Some(only) = literal.quasis.first() {
            self.name(only.value.raw.as_str(), "");
        }
        walk::walk_template_literal(self, literal);
    }
}
