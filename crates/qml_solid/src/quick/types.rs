//! What a type name is in a file, and what an object of that type has.
//!
//! A name is looked up the way QML does: the file's inline components, then
//! its imports from the last to the first, then the files next to it. That
//! reading is the front end's ([`qml_front::types`]). What Qt's own types
//! have comes from Qt's description of them ([`qt_types`]) through an
//! oracle that differs from Ljós's in one thing: no module stands in as an
//! empty `Item` here, because the web runtime has the modules Ljós does
//! not build (QtQuick3D, Graphs, …) and a name it lacks is an error.

use qml_front::{
    QtType, QtTypeOracle, TypeOracle,
    oracle::Special,
};

use crate::project::Project;

pub(crate) use qml_front::project::relative;
pub(crate) use qml_front::scope::handled;

/// One type of Qt's table, as this compiler holds it.
pub(crate) type Qt = QtType;

pub(crate) type Kind = qml_front::types::Kind<Qt>;
pub(crate) type Origin = qml_front::types::Origin;
pub(crate) type Found = qml_front::types::Found<Qt>;
pub(crate) type Member = qml_front::types::Member<Qt>;
pub(crate) type Property = qml_front::Property<Qt>;

/// The types of one file.
#[derive(Clone, Copy)]
pub(crate) struct Types<'p> {
    pub project: &'p Project,
    /// The file's key in the project.
    pub file: &'p str,
}

static ORACLE: WebOracle = WebOracle;

impl<'p> Types<'p> {
    pub(crate) fn front(&self) -> qml_front::types::Types<'p, WebOracle> {
        qml_front::types::Types::new(self.project.front(), &ORACLE, self.file)
    }

    /// What the dotted name `parts` is as a type: `Item`, `C.Button`.
    pub(crate) fn find(&self, parts: &[&str]) -> Option<Found> {
        self.front().find(parts)
    }

    /// `pragma Singleton`: the type is one object, there before it is named,
    /// and reached by calling the function its file compiles to. A singleton
    /// of Qt's own is not: the runtime module exports the object itself.
    pub(crate) fn is_singleton(&self, kind: &Kind) -> bool {
        match kind {
            Kind::Component(qml_front::project::Key { file, inline: None }) => {
                self.project.summary(file).is_some_and(|summary| summary.is_singleton)
            }
            _ => false,
        }
    }

    pub(crate) fn declared_enum(&self, kind: &Kind, member: &str) -> Option<bool> {
        self.front().declared_enum(kind, member)
    }

    /// Whether `Type.key`, or `Type.scope.key`, is a key of an enum of the
    /// type: one a component in its chain declares, or one of the Qt type
    /// the chain ends in.
    pub(crate) fn is_key(&self, kind: &Kind, scope: Option<&str>, key: &str) -> bool {
        self.front().is_key(kind, scope, key)
    }

    /// Whether `name` is what the file imports something `as`.
    pub(crate) fn namespace(&self, name: &str) -> Option<&'p qml_front::project::Source> {
        self.front().namespace(name)
    }

    pub(crate) fn base(&self, kind: &Kind) -> Option<Qt> {
        self.front().base(kind)
    }

    /// The file a path given to the property `name` of an object of the type
    /// is taken from, where that is not the file the object is written in.
    pub(crate) fn home(&self, kind: &Kind, name: &str) -> Option<String> {
        self.front().home(kind, name)
    }

    /// The property whose value the signal `name` carries to its handlers,
    /// when it is one of a Qt type's.
    pub(crate) fn carried<'n>(&self, kind: &Kind, name: &'n str) -> Option<&'n str> {
        self.front().carried(kind, name)
    }

    /// The properties whoever makes an object of the type has to set.
    pub(crate) fn required(&self, kind: &Kind) -> Vec<String> {
        self.front().required(kind)
    }

    /// The property objects written inside one of the type go to, when it is
    /// a template: a Repeater's `delegate`.
    pub(crate) fn default_component(&self, kind: &Kind) -> Option<String> {
        self.front().default_component(kind)
    }
}

pub(crate) fn qt_property(property: &'static qt_types::Property) -> Property {
    Property {
        is_component: property.is_component,
        is_url: property.type_name == "QUrl" && !property.is_list,
        is_text: property.type_name == "QString" && !property.is_list,
        is_script: property.type_name == "QQmlScriptString" && property.name == "script",
        takes_key: !property.is_list
            && (property.type_name == "int"
                || qt_types::is_enum_name(property.type_name.rsplit("::").next().unwrap_or(property.type_name))),
        is_list: property.is_list,
        is_readonly: property.is_readonly,
        value: property.value_type().map(QtType),
    }
}

/// A property that is none of the things a binding is read by: what a name
/// nothing has is compiled as, the error having been said where it is.
pub(crate) fn no_property() -> Property {
    Property {
        is_component: false,
        is_url: false,
        is_text: false,
        is_script: false,
        takes_key: false,
        is_list: false,
        is_readonly: false,
        value: None,
    }
}

/// A declared property, by the type it was declared with.
pub(crate) fn declared_property(type_name: &str, is_list: bool) -> Property {
    Property::declared(type_name, is_list, false)
}

/// The property whose new value Qt's signal `name` carries: `text`, of the
/// `textChanged(text)` of a Text. Qt says it signal by signal, and most carry
/// nothing: `widthChanged()`, and the change of any property QML declares.
pub(crate) fn carried<'n>(ty: Qt, name: &'n str) -> Option<&'n str> {
    let property = name.strip_suffix("Changed")?;
    let [parameter] = ty.0.signal(name)?.parameters.as_slice() else { return None };
    // Not the value, by the name Qt gives it: by how much a handler moved
    // (`scaleChanged(delta)`), the event (`mouseXChanged(mouse)`).
    if matches!(*parameter, "delta" | "mouse") {
        return None;
    }
    ty.0.property(property).map(|_| property)
}

/// Qt's types as the front end asks of them, held as entries of the table.
/// Every answer is [`QtTypeOracle`]'s but the stand-ins: the web runtime
/// implements the modules Ljós does not build, so a type of one of them is
/// the type, and a name none of them has is unknown.
#[derive(Debug, Clone, Copy)]
pub(crate) struct WebOracle;

fn qt(ty: Qt) -> QtType {
    ty
}

impl TypeOracle for WebOracle {
    type Type = Qt;

    fn has_module(&self, uri: &str) -> bool {
        QtTypeOracle.has_module(uri)
    }

    fn module_type(&self, uri: &str, name: &str) -> Option<Qt> {
        QtTypeOracle.module_type(uri, name)
    }

    fn name(&self, ty: Qt) -> &str {
        QtTypeOracle.name(qt(ty))
    }

    fn special(&self, ty: Qt) -> Option<Special> {
        QtTypeOracle.special(qt(ty))
    }

    fn is_singleton(&self, ty: Qt) -> bool {
        QtTypeOracle.is_singleton(qt(ty))
    }

    fn property(&self, ty: Qt, name: &str) -> Option<Property> {
        QtTypeOracle.property(qt(ty), name)
    }

    fn signal(&self, ty: Qt, name: &str) -> Option<Vec<String>> {
        QtTypeOracle.signal(qt(ty), name)
    }

    fn has_method(&self, ty: Qt, name: &str) -> bool {
        QtTypeOracle.has_method(qt(ty), name)
    }

    fn default_property(&self, ty: Qt) -> Option<&str> {
        QtTypeOracle.default_property(qt(ty))
    }

    fn attached(&self, ty: Qt) -> Option<Qt> {
        QtTypeOracle.attached(qt(ty))
    }

    fn has_enum_key(&self, ty: Qt, scope: Option<&str>, key: &str) -> bool {
        QtTypeOracle.has_enum_key(qt(ty), scope, key)
    }

    fn has_enum(&self, ty: Qt, name: &str) -> bool {
        QtTypeOracle.has_enum(qt(ty), name)
    }

    fn enum_is_flags(&self, ty: Qt, name: &str) -> bool {
        QtTypeOracle.enum_is_flags(qt(ty), name)
    }

    fn required(&self, ty: Qt) -> Vec<String> {
        QtTypeOracle.required(qt(ty))
    }

    fn is_member_name(&self, name: &str) -> bool {
        QtTypeOracle.is_member_name(name)
    }

    fn property_type(&self, ty: Qt, name: &str) -> Option<String> {
        QtTypeOracle.property_type(qt(ty), name)
    }

    fn enum_value(&self, ty: Qt, scope: Option<&str>, key: &str) -> Option<i64> {
        QtTypeOracle.enum_value(qt(ty), scope, key)
    }

    fn module(&self, ty: Qt) -> Option<String> {
        QtTypeOracle.module(qt(ty))
    }

    fn members_known(&self, ty: Qt) -> bool {
        QtTypeOracle.members_known(qt(ty))
    }

    fn members_checked(&self, ty: Qt) -> bool {
        QtTypeOracle.members_checked(qt(ty))
    }

    fn reads_checked(&self, ty: Qt) -> bool {
        QtTypeOracle.reads_checked(qt(ty))
    }

    fn members_warned(&self, ty: Qt) -> bool {
        QtTypeOracle.members_warned(qt(ty))
    }

    fn is_unlisted(&self, ty: Qt) -> bool {
        QtTypeOracle.is_unlisted(qt(ty))
    }

    fn adds_member(&self, ty: Qt, name: &str) -> bool {
        QtTypeOracle.adds_member(qt(ty), name)
    }

    fn unknown_type_note(&self, name: &str) -> Option<&'static str> {
        QtTypeOracle.unknown_type_note(name)
    }

    fn holds_object(&self, ty: Qt, name: &str) -> bool {
        QtTypeOracle.holds_object(qt(ty), name)
    }

    fn class_name(&self, ty: Qt) -> Option<&str> {
        QtTypeOracle.class_name(qt(ty))
    }
}
