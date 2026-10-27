//! A type that is a QML file (Controls' `Button.qml`): what its root object
//! is and what the root declares, which is all an instance of it can reach.

use oxc_allocator::Allocator;
use qml_syntax::ast::*;

use crate::model::{Enum, Property, Signal};

#[derive(Debug, Default)]
pub struct QmlFile {
    /// Module imports, with the name each is imported as.
    pub imports: Vec<(String, Option<String>)>,
    /// The root object's type as written: `T.Button`.
    pub root: String,
    pub is_singleton: bool,
    pub default_property: Option<String>,
    /// The enums the root declares, whose keys are on the type's name.
    pub enums: Vec<Enum>,
    /// With the type names as written, to be looked up in `imports`.
    pub properties: Vec<Property>,
    pub signals: Vec<Signal>,
    pub methods: Vec<String>,
}

pub fn read(source: &str) -> Result<QmlFile, String> {
    let allocator = Allocator::default();
    let parsed = qml_syntax::parse(&allocator, source);
    if let Some(diagnostic) = parsed.diagnostics.first() {
        let offset = diagnostic.span.start as usize;
        let line = source[..offset.min(source.len())].matches('\n').count() + 1;
        return Err(format!("line {line}: {}", diagnostic.message));
    }
    let document = &parsed.document;

    let mut file = QmlFile {
        root: document.root.type_name.to_string(),
        is_singleton: document.pragmas.iter().any(|pragma| pragma.name == "Singleton"),
        ..QmlFile::default()
    };
    for import in &document.imports {
        if let QmlImportSource::Module(module) = &import.source {
            let alias = import.alias.as_ref().map(|alias| alias.name.to_string());
            file.imports.push((module.to_string(), alias));
        }
    }
    for member in &document.root.members {
        match member {
            // `required name` marks an inherited property, it declares none.
            QmlMember::Property(QmlPropertyDeclaration { type_name: None, .. }) => {}
            QmlMember::Property(declaration) => {
                let name = declaration.name.name.to_string();
                let type_name = declaration.type_name.as_ref().expect("checked above");
                if declaration.is_default {
                    file.default_property = Some(name.clone());
                }
                // Every property declared in QML has a change signal.
                file.signals
                    .push(Signal { name: format!("{name}Changed"), parameters: Vec::new() });
                file.properties.push(Property {
                    name,
                    type_name: type_name.name.to_string(),
                    is_list: type_name.is_list,
                    is_readonly: declaration.is_readonly,
                    is_pointer: false,
                    is_required: declaration.is_required,
                });
            }
            QmlMember::Signal(declaration) => file.signals.push(Signal {
                name: declaration.name.name.to_string(),
                parameters: declaration
                    .params
                    .iter()
                    .map(|param| param.name.name.to_string())
                    .collect(),
            }),
            QmlMember::Enum(declaration) => file.enums.push(Enum {
                name: declaration.name.name.to_string(),
                alias: None,
                is_flag: false,
                // The file says what number each is, to whatever compiles it.
                keys: declaration.members.iter().map(|member| (member.name.name.to_string(), None)).collect(),
            }),
            QmlMember::Function(function) => {
                file.methods.extend(function.id.as_ref().map(|id| id.name.to_string()));
            }
            _ => {}
        }
    }
    Ok(file)
}
