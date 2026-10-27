//! What the QML types and properties of a dialect mean on a render target.
//!
//! The compiler knows the QML language, not a set of types. The types a file
//! may use come from the modules it imports, and each such module is a table
//! here: a dialect. Another target (or another look for the same app) is
//! another table, not another compiler.

use qml_syntax::ast::{QmlImport, QmlImportSource};

use crate::dialects;

/// How a number is turned into a CSS length.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Unit {
    /// Used as written: keywords, colors and unitless numbers.
    None,
    /// Cell columns.
    Ch,
    /// Cell rows.
    Lh,
    Px,
}

impl Unit {
    pub(crate) fn suffix(self) -> &'static str {
        match self {
            Unit::None => "",
            Unit::Ch => "ch",
            Unit::Lh => "lh",
            Unit::Px => "px",
        }
    }
}

pub(crate) type Declarations = &'static [(&'static str, &'static str)];

#[derive(Clone, Copy, Debug)]
pub(crate) enum Prop {
    /// The value becomes one or more CSS properties.
    Style { css: &'static [&'static str], unit: Unit },
    /// A boolean that switches CSS declarations on or off. The property is
    /// on by default when being on declares nothing.
    Toggle { on: Declarations, off: Declarations },
    /// A string enumeration, each value standing for CSS declarations.
    Keyword(&'static [(&'static str, Declarations)]),
    /// A DOM attribute.
    Attribute(&'static str),
    /// The element's text content.
    Text,
    /// A DOM event, by its JSX handler name.
    Event(&'static str),
}

pub(crate) struct Element {
    pub tag: &'static str,
    pub class: Option<&'static str>,
    pub props: fn(&str) -> Option<Prop>,
}

impl std::fmt::Debug for Element {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "<{}>", self.tag)
    }
}

impl Element {
    pub(crate) fn prop(&self, name: &str) -> Option<Prop> {
        (self.props)(name)
    }
}

pub(crate) enum Type {
    Element(&'static Element),
    /// `Repeater { model; delegate }`.
    Repeater,
}

/// The types of one importable module.
pub(crate) struct Dialect {
    /// The module URI that brings the types in (`import OpenTUI`).
    pub module: &'static str,
    pub lookup: fn(&str) -> Option<Type>,
    /// Types the dialect has that this target does not render yet. Naming
    /// them gives a precise diagnostic instead of a missing component.
    pub is_known_unsupported: fn(&str) -> bool,
}

static DIALECTS: &[&Dialect] = &[&dialects::opentui::DIALECT];

/// The types a file's imports bring into scope.
#[derive(Clone, Copy, Default)]
pub(crate) struct Types {
    dialect: Option<&'static Dialect>,
}

impl Types {
    pub(crate) fn of(imports: &[QmlImport<'_>]) -> Self {
        let dialect = imports.iter().find_map(|import| {
            let QmlImportSource::Module(module) = &import.source else { return None };
            let module = module.to_string();
            DIALECTS.iter().copied().find(|dialect| dialect.module == module)
        });
        Self { dialect }
    }

    /// Whether the file imports a dialect: if not, its types are Qt's.
    pub(crate) fn has_dialect(&self) -> bool {
        self.dialect.is_some()
    }

    pub(crate) fn lookup(&self, name: &str) -> Option<Type> {
        (self.dialect?.lookup)(name)
    }

    pub(crate) fn element(&self, name: &str) -> Option<&'static Element> {
        match self.lookup(name)? {
            Type::Element(element) => Some(element),
            Type::Repeater => None,
        }
    }

    pub(crate) fn is_known_unsupported(&self, name: &str) -> bool {
        self.dialect.is_some_and(|dialect| (dialect.is_known_unsupported)(name))
    }
}
