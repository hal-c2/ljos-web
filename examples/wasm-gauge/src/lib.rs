//! Native visual types with nothing in them about the browser. `Gauge` is
//! `docs/MIGRATION.md` §6 of ljos-ui as written there; `Dial` has the rest of
//! what a hook does: rounded rectangles, a path, text, an image, and pointer,
//! wheel and key hooks.

use std::rc::Rc;

use ljos::item::{self, DisplayListBuilder, ItemPaint, Rgba, TextEngine, kurbo};
use ljos::prelude::*;

/// A bar that shows how full something is.
#[derive(Debug, Default, QmlObject)]
#[qml(module = "Example", name = "Gauge", extends = Item)]
pub struct Gauge {
    #[qml(base)]
    pub item: Item,
    /// How full, 0 to 1.
    #[qml(notify)]
    pub value: f64,
}

#[derive(Debug)]
struct Bar(f64);

impl ItemPaint for Bar {
    fn paint(&self, size: kurbo::Size, _: &mut TextEngine, out: &mut DisplayListBuilder) {
        let filled = kurbo::Rect::new(0.0, 0.0, size.width * self.0, size.height);
        out.fill_rect(filled, Rgba::BLACK);
    }
}

fn read(engine: &Engine, gauge: ObjectId) -> Rc<dyn ItemPaint> {
    Rc::new(Bar(item::prop(engine, gauge, Gauge::VALUE)))
}

/// All a hook can do. What it was told shows in its properties, for QML.
#[derive(Debug, Default, QmlObject)]
#[qml(module = "Example.Dials", name = "Dial", extends = Item)]
pub struct Dial {
    #[qml(base)]
    pub item: Item,
    #[qml(notify)]
    pub turns: f64,
    #[qml(notify)]
    pub label: String,
    #[qml(notify)]
    pub presses: i32,
    #[qml(notify)]
    pub releases: i32,
    #[qml(notify)]
    pub hovered: bool,
    #[qml(notify)]
    pub keys: i32,
    /// Where the press was, in the item.
    #[qml(notify)]
    pub press_x: f64,
    /// A picture's address; shown at the corner once it has come.
    #[qml(notify)]
    pub loaded: bool,
    #[qml(skip)]
    pub picture: Option<item::ImageHandle>,
}

#[qml_impl]
impl Dial {
    #[qml(signal)]
    fn pressed_at(x: f64);

    /// Fetches a picture and shows it.
    #[qml(invokable)]
    fn load(cx: &Cx, url: String) {
        let dial = cx.this;
        item::load_image(cx.engine, &url, move |engine, got| {
            let Ok(image) = got else { return };
            let _ = engine.with_mut(dial, |this: &mut Dial| this.picture = Some(image));
            let _ = engine.set(dial, Dial::LOADED, true);
            item::repaint(engine, dial);
        });
    }
}

#[derive(Debug)]
struct Face {
    turns: f64,
    label: String,
    picture: Option<item::ImageHandle>,
}

impl ItemPaint for Face {
    fn paint(&self, size: kurbo::Size, text: &mut TextEngine, out: &mut DisplayListBuilder) {
        let all = kurbo::Rect::new(0.0, 0.0, size.width, size.height);
        out.rounded_rect(
            all,
            [8.0; 4],
            item::Paint::Solid(Rgba::from_straight_u8(40, 80, 160, 255)),
            None,
        );
        let mut needle = kurbo::BezPath::new();
        let centre = all.center();
        let reach = size.height.min(size.width) / 2.0 - 4.0;
        let (sin, cos) = (self.turns * std::f64::consts::TAU).sin_cos();
        needle.move_to(centre + kurbo::Vec2::new(-cos * 6.0, -sin * 6.0));
        needle.line_to(centre + kurbo::Vec2::new(sin * reach, -cos * reach));
        needle.line_to(centre + kurbo::Vec2::new(cos * 6.0, sin * 6.0));
        needle.close_path();
        out.path(
            needle,
            item::PathStyle::Fill,
            item::Paint::Solid(Rgba::WHITE),
        );
        out.image(
            item::ImageHandle::filled(4, 4, [255, 0, 0, 255]).unwrap(),
            kurbo::Rect::new(4.0, 4.0, 20.0, 20.0),
        );
        if let Some(picture) = &self.picture {
            out.image(picture.clone(), kurbo::Rect::new(24.0, 4.0, 40.0, 20.0));
        }
        if !self.label.is_empty() {
            let layout = text.layout(
                &self.label,
                &item::TextStyle::sized(14.0),
                &item::LayoutParams::default(),
            );
            for line in &layout.lines {
                for run in &line.runs {
                    out.glyphs(
                        std::sync::Arc::clone(&run.glyphs),
                        kurbo::Vec2::new(8.0, size.height - 24.0),
                        Rgba::WHITE,
                        item::Decorations::default(),
                    );
                }
            }
        }
    }
}

fn read_dial(engine: &Engine, dial: ObjectId) -> Rc<dyn ItemPaint> {
    Rc::new(Face {
        turns: item::prop(engine, dial, Dial::TURNS),
        label: item::prop(engine, dial, Dial::LABEL),
        picture: engine
            .with(dial, |this: &Dial| this.picture.clone())
            .ok()
            .flatten(),
    })
}

fn bump(engine: &Engine, dial: ObjectId, p: Prop<i32>) {
    let now = item::prop(engine, dial, p);
    let _ = engine.set(dial, p, now + 1);
}

fn shelf_enums() -> Vec<(&'static str, Vec<(&'static str, i64)>)> {
    vec![("Side", vec![("Left", 0), ("Right", 1)])]
}

/// What a non-visual type can say of itself: a setter, a read-only property,
/// a group, an enum, an attached type, and a method that can fail.
#[derive(Debug, Default, QmlObject)]
#[qml(module = "Example.Facets", name = "Shelf", enums = shelf_enums, attached = Tag)]
pub struct Shelf {
    #[qml(notify, write = Self::not_below_zero)]
    pub level: i32,
    #[qml(readonly, notify)]
    pub total: i32,
    #[qml(group)]
    pub limits: Limits,
}

impl Shelf {
    fn not_below_zero(&self, v: i32) -> Option<i32> {
        Some(v.max(0))
    }
}

#[qml_impl]
impl Shelf {
    #[qml(invokable)]
    fn add(cx: &Cx, n: i32) -> Result<i32, EngineError> {
        let total = cx.get(Shelf::TOTAL)? + n;
        cx.set(Shelf::TOTAL, total)?;
        Ok(total)
    }

    #[qml(invokable)]
    fn raise(cx: &Cx) -> Result<(), EngineError> {
        let level = cx.get(Shelf::LEVEL)?;
        cx.set(Shelf::LEVEL, level + 1)
    }

    #[qml(invokable)]
    fn max_of_limits(&self) -> i32 {
        self.limits.max
    }
}

/// `Shelf`'s `limits` group.
#[derive(Debug, Default, QmlObject)]
#[qml(name = "ShelfLimits", uncreatable)]
pub struct Limits {
    #[qml(notify)]
    pub max: i32,
}

/// What `Shelf.` attaches to an object.
#[derive(Debug, Default, QmlObject)]
#[qml(name = "ShelfTag", uncreatable)]
pub struct Tag {
    #[qml(notify)]
    pub weight: i32,
}

#[qml_impl]
impl Tag {
    #[qml(signal)]
    fn tallied();

    #[qml(invokable)]
    fn tally(cx: &Cx) -> Result<(), EngineError> {
        Tag::emit_tallied(cx)
    }
}

/// One object the page shares, which QML reads and doesn't make.
#[derive(Debug, QmlObject)]
#[qml(module = "Example.Facets", name = "Store", uncreatable)]
#[qml_singleton]
pub struct Store {
    #[qml(notify)]
    pub start: i32,
}

impl Default for Store {
    fn default() -> Self {
        Self { start: 7 }
    }
}

pub fn register(engine: &Engine) {
    engine.register_module(ljos::module!("Example" 1.0 => [Gauge]));
    engine.register_module(ljos::module!("Example.Dials" 1.0 => [Dial]));
    engine.register_module(ljos::module!("Example.Facets" 1.0 => [Shelf]));
    engine.register_singleton::<Store>("Example.Facets", Version::new(1, 0));
    item::register_paint_item::<Gauge>(engine, read);
    item::register_paint_item::<Dial>(engine, read_dial);
    item::register_pointer_item::<Dial>(
        engine,
        item::PointerItem {
            press: |engine, dial, _, at| {
                bump(engine, dial, Dial::PRESSES);
                let _ = engine.set(dial, Dial::PRESS_X, at.x);
                let _ = Dial::emit_pressed_at(&Cx::new(engine, dial), at.x);
                item::force_active_focus(engine, dial, item::FocusReason::Mouse);
                true
            },
            moved: |_, _, _, _| {},
            release: |engine, dial, _, _| bump(engine, dial, Dial::RELEASES),
            cancel: |_, _| {},
            hover: |engine, dial, inside| {
                let _ = engine.set(dial, Dial::HOVERED, inside);
            },
        },
    );
    item::register_wheel_item::<Dial>(
        engine,
        item::WheelItem {
            wheel: |engine, dial, event, _| {
                let notches = event.angle_delta.y / item::WheelEvent::NOTCH;
                let now = item::prop(engine, dial, Dial::TURNS);
                let _ = engine.set(dial, Dial::TURNS, now + notches / 8.0);
                true
            },
        },
    );
    item::register_key_item::<Dial>(
        engine,
        item::KeyItem {
            shortcut_override: |_, _, _| false,
            press: |engine, dial, event| {
                if event.key != item::key::SPACE {
                    return false;
                }
                bump(engine, dial, Dial::KEYS);
                true
            },
            release: |_, _, _| false,
        },
    );
}
