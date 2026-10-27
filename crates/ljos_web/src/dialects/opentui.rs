//! The web table for `import OpenTUI`: flexbox items measured in terminal
//! cells. A cell is `1ch` wide and `1lh` tall, so the same QML lays out on a
//! monospace grid in the browser.

use crate::registry::{Dialect, Element, Prop, Type, Unit};

pub(crate) static DIALECT: Dialect =
    Dialect { module: "OpenTUI", lookup, is_known_unsupported };

fn lookup(name: &str) -> Option<Type> {
    Some(match name {
        "Item" => Type::Element(&ITEM),
        "Rectangle" => Type::Element(&RECTANGLE),
        "Text" => Type::Element(&TEXT),
        "Span" => Type::Element(&SPAN),
        "Bold" => Type::Element(&BOLD),
        "Repeater" => Type::Repeater,
        _ => return None,
    })
}

fn is_known_unsupported(name: &str) -> bool {
    matches!(
        name,
        "Keymap"
            | "TextInput"
            | "TextArea"
            | "Loader"
            | "Slot"
            | "ScrollView"
            | "Image"
            | "Timer"
            | "Row"
            | "Column"
            | "Component"
            | "Window"
            | "Link"
            | "Diff"
            | "Code"
    )
}

static ITEM: Element = Element { tag: "div", class: Some("q-item"), props: item };
static RECTANGLE: Element = Element { tag: "div", class: Some("q-item"), props: rectangle };
static TEXT: Element = Element { tag: "span", class: Some("q-text"), props: text };
static SPAN: Element = Element { tag: "span", class: None, props: span };
static BOLD: Element = Element { tag: "b", class: None, props: span };

fn style(css: &'static [&'static str], unit: Unit) -> Option<Prop> {
    Some(Prop::Style { css, unit })
}

fn item(name: &str) -> Option<Prop> {
    match name {
        "objectName" => Some(Prop::Attribute("data-object-name")),
        "visible" => Some(Prop::Toggle { on: &[], off: &[("display", "none")] }),

        "flexDirection" => style(&["flex-direction"], Unit::None),
        "flexGrow" => style(&["flex-grow"], Unit::None),
        "flexShrink" => style(&["flex-shrink"], Unit::None),
        "flexBasis" => style(&["flex-basis"], Unit::Ch),
        "flexWrap" => style(&["flex-wrap"], Unit::None),
        "justifyContent" => style(&["justify-content"], Unit::None),
        "alignItems" => style(&["align-items"], Unit::None),
        "alignSelf" => style(&["align-self"], Unit::None),
        "overflow" => style(&["overflow"], Unit::None),
        "position" => style(&["position"], Unit::None),
        "opacity" => style(&["opacity"], Unit::None),
        "z" => style(&["z-index"], Unit::None),

        "width" => style(&["width"], Unit::Ch),
        "minWidth" => style(&["min-width"], Unit::Ch),
        "maxWidth" => style(&["max-width"], Unit::Ch),
        "left" => style(&["left"], Unit::Ch),
        "right" => style(&["right"], Unit::Ch),
        "marginLeft" => style(&["margin-left"], Unit::Ch),
        "marginRight" => style(&["margin-right"], Unit::Ch),
        "marginX" => style(&["margin-left", "margin-right"], Unit::Ch),
        "paddingLeft" => style(&["padding-left"], Unit::Ch),
        "paddingRight" => style(&["padding-right"], Unit::Ch),
        "paddingX" => style(&["padding-left", "padding-right"], Unit::Ch),

        "height" => style(&["height"], Unit::Lh),
        "minHeight" => style(&["min-height"], Unit::Lh),
        "maxHeight" => style(&["max-height"], Unit::Lh),
        "top" => style(&["top"], Unit::Lh),
        "bottom" => style(&["bottom"], Unit::Lh),
        "marginTop" => style(&["margin-top"], Unit::Lh),
        "marginBottom" => style(&["margin-bottom"], Unit::Lh),
        "marginY" => style(&["margin-top", "margin-bottom"], Unit::Lh),
        "paddingTop" => style(&["padding-top"], Unit::Lh),
        "paddingBottom" => style(&["padding-bottom"], Unit::Lh),
        "paddingY" => style(&["padding-top", "padding-bottom"], Unit::Lh),

        "backgroundColor" => style(&["background-color"], Unit::None),
        "border.width" => style(&["border-width"], Unit::Px),
        "border.color" => style(&["border-color"], Unit::None),
        "border.style" => Some(Prop::Keyword(&[
            ("single", &[("border-style", "solid")]),
            ("rounded", &[("border-style", "solid"), ("border-radius", "0.5ch")]),
            ("double", &[("border-style", "double")]),
            ("heavy", &[("border-style", "solid")]),
        ])),

        "onMouseDown" => Some(Prop::Event("onMouseDown")),
        "onMouseUp" => Some(Prop::Event("onMouseUp")),
        "onMouseMove" => Some(Prop::Event("onMouseMove")),
        "onMouseOver" => Some(Prop::Event("onMouseOver")),
        "onMouseOut" => Some(Prop::Event("onMouseOut")),
        "onMouseScroll" => Some(Prop::Event("onWheel")),
        _ => None,
    }
}

fn rectangle(name: &str) -> Option<Prop> {
    match name {
        "color" => style(&["background-color"], Unit::None),
        _ => item(name),
    }
}

fn span(name: &str) -> Option<Prop> {
    match name {
        "text" => Some(Prop::Text),
        "color" => style(&["color"], Unit::None),
        "font.bold" => Some(Prop::Toggle { on: &[("font-weight", "bold")], off: &[] }),
        "font.italic" => Some(Prop::Toggle { on: &[("font-style", "italic")], off: &[] }),
        "font.underline" => {
            Some(Prop::Toggle { on: &[("text-decoration", "underline")], off: &[] })
        }
        _ => None,
    }
}

fn text(name: &str) -> Option<Prop> {
    match name {
        "wrapMode" => Some(Prop::Keyword(&[
            ("none", &[("white-space", "pre")]),
            ("word", &[("white-space", "pre-wrap")]),
            ("char", &[("white-space", "pre-wrap"), ("word-break", "break-all")]),
        ])),
        "truncate" => Some(Prop::Toggle {
            on: &[("overflow", "hidden"), ("text-overflow", "ellipsis"), ("white-space", "pre")],
            off: &[],
        }),
        _ => span(name).or_else(|| item(name)),
    }
}
