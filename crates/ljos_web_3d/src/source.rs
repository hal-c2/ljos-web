//! `SceneSource` over a handle-numbered graph: what the mapping asks,
//! answered by a [`Host`] that holds the real objects. Everything kept here
//! is kept by what the page says identifies it, so that a build of the same
//! objects makes a scene that compares the same and costs the GPU nothing.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::rc::Rc;
use std::sync::Arc;

use ljos_3d::custom::{
    Blend, BufferFormat, EffectBuffer, Pass, PassTexture, UniformKind, UniformValue,
};
use ljos_3d::geometry::{ComponentType, PrimitiveType, Semantic};
use ljos_3d::gltf::Asset;
use ljos_3d::math::{Mat4, Quat, Vec3};
use ljos_3d::qml::enums::{cull, depth_draw};
use ljos_3d::qml::{self, Loaded, Prop3d, SceneSource, Type3d};
use ljos_3d::texture::{
    Filter, PixelEncoding, TextureImage, TexturePixels, Tiling, fresh_pixels_id,
};
use ljos_3d::{CustomGeometry, CustomMaterial, Effect, Instance, InstanceTable, Instancing};

use crate::names;

/// The view itself, in every registry.
pub const VIEW: u32 = 0;
/// A hole in a list of handles.
pub const NO_OBJECT: u32 = u32::MAX;

/// A picture's pixels: not premultiplied, the top row first.
pub struct Picture {
    pub width: u32,
    pub height: u32,
    pub opaque: bool,
    pub pixels: Vec<u8>,
}

/// What a `Geometry` last committed, in `Geometry`'s own numbers.
pub struct Shape {
    pub vertices: Vec<u8>,
    pub indices: Vec<u8>,
    pub stride: u32,
    /// Semantic, offset, component type, for each attribute.
    pub attributes: Vec<[u32; 3]>,
    pub primitive: u32,
    pub bounds: Option<([f32; 3], [f32; 3])>,
}

/// What of an `Instancing`'s table each build reads. Its numbers, twenty an
/// entry as `instancing.js` keeps them, are [`Host::table_data`]: they cross
/// only when they are new.
pub struct Table {
    pub count: Option<usize>,
    pub transparent: bool,
    pub sorted: bool,
}

/// A uniform: what a shader declares and its value's numbers.
pub struct Uniform {
    pub name: String,
    pub kind: String,
    pub value: Vec<f32>,
}

/// A `CustomMaterial`'s snippets and what they are handed.
pub struct Snippets {
    pub vertex: String,
    pub fragment: String,
    pub shaded: bool,
    pub uniforms: Vec<Uniform>,
    /// Sampler names, with the handle of the Texture each shows.
    pub textures: Vec<(String, u32)>,
    pub source_blend: i32,
    pub destination_blend: i32,
    pub depth_draw: i32,
    pub cull_mode: i32,
}

/// A buffer an effect's passes draw into.
pub struct PassBuffer {
    pub format: i32,
    pub scale: f32,
    pub filter: i32,
    pub wrap: i32,
}

/// One pass of an `Effect`.
pub struct PassShaders {
    pub vertex: String,
    pub fragment: String,
    pub set: Vec<Uniform>,
    /// Sampler names and the buffer each reads.
    pub reads: Vec<(String, usize)>,
    pub input: Option<usize>,
    pub output: Option<usize>,
}

/// An `Effect`'s passes.
pub struct Passes {
    pub uniforms: Vec<Uniform>,
    /// Sampler names, with the handle of the Texture each shows.
    pub textures: Vec<(String, u32)>,
    pub buffers: Vec<PassBuffer>,
    pub passes: Vec<PassShaders>,
}

/// The page's side of the reads. Each read of a member is tracked by the
/// page's reactive graph, so what the mapping read is what builds it again.
/// A member left unset answers `None`: the mapping's defaults are the only
/// defaults.
pub trait Host {
    /// The QML names of the types `o` derives through.
    fn chain(&self, o: u32) -> Vec<String>;
    fn number(&self, o: u32, p: u32) -> Option<f64>;
    fn boolean(&self, o: u32, p: u32) -> Option<bool>;
    fn color(&self, o: u32, p: u32) -> Option<[f32; 4]>;
    fn vector(&self, o: u32, p: u32) -> Option<[f32; 3]>;
    fn quaternion(&self, o: u32, p: u32) -> Option<[f32; 4]>;
    fn url(&self, o: u32, p: u32) -> Option<String>;
    fn object(&self, o: u32, p: u32) -> Option<u32>;
    fn objects(&self, o: u32, p: u32) -> Vec<u32>;
    /// With [`NO_OBJECT`] where a list has a hole.
    fn slots(&self, o: u32, p: u32) -> Vec<u32>;
    fn authored(&self, o: u32, p: u32) -> bool;
    /// Sixteen numbers a matrix, column by column.
    fn matrices(&self, o: u32, p: u32) -> Vec<f32>;
    /// What names the picture a `Texture` shows; `None` while it has none.
    fn picture_id(&self, o: u32) -> Option<u32>;
    fn picture(&self, o: u32) -> Option<Picture>;
    fn geometry_id(&self, o: u32) -> Option<u32>;
    fn geometry(&self, o: u32) -> Option<Shape>;
    fn table_id(&self, o: u32) -> Option<u32>;
    fn table(&self, o: u32) -> Option<Table>;
    fn table_data(&self, o: u32) -> Vec<f32>;
    fn snippets(&self, o: u32) -> Option<Snippets>;
    fn passes(&self, o: u32) -> Option<Passes>;
    /// A tracked read of "another file arrived".
    fn arrivals(&self);
    /// Starts reading the file at `url`; [`Kept::arrive`] follows.
    fn load(&self, url: &str, kept: &Rc<Kept>);
    /// What an author should see of what could not be drawn.
    fn report(&self, about: &str, error: &str);
    /// A loader's `status` and `errorString`.
    fn loader_status(&self, loader: u32, status: LoaderStatus, error: &str);
}

/// `RuntimeLoader.Status`, in its order. A file on its way is `Empty`: Qt has
/// no word for that, as its loader reads before it returns.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum LoaderStatus {
    Empty = 0,
    Success = 1,
    Error = 2,
}

/// A file a loader names.
pub enum Asked {
    Loading,
    Failed(String),
    Ready(Arc<Asset>),
}

/// What was made of each object's current revision. An object's new revision
/// lets go of its old one, so a shape committed every frame holds one copy,
/// while two objects showing the same picture share what was made of it.
struct Revisions<T> {
    current: HashMap<u32, u32>,
    made: HashMap<u32, (T, usize)>,
}

impl<T> Default for Revisions<T> {
    fn default() -> Self {
        Self {
            current: HashMap::new(),
            made: HashMap::new(),
        }
    }
}

impl<T: Clone> Revisions<T> {
    /// What `object` at revision `id` was made into, if that was made.
    fn take_up(&mut self, object: u32, id: u32) -> Option<T> {
        if self.current.get(&object) != Some(&id) {
            let (made, holders) = self.made.get_mut(&id)?;
            let made = made.clone();
            *holders += 1;
            self.let_go(object);
            self.current.insert(object, id);
            return Some(made);
        }
        self.made.get(&id).map(|(made, _)| made.clone())
    }

    fn put(&mut self, object: u32, id: u32, made: T) {
        self.let_go(object);
        self.current.insert(object, id);
        self.made.insert(id, (made, 1));
    }

    fn let_go(&mut self, object: u32) {
        let Some(id) = self.current.remove(&object) else {
            return;
        };
        if let Some((_, holders)) = self.made.get_mut(&id) {
            *holders -= 1;
            if *holders == 0 {
                self.made.remove(&id);
            }
        }
    }
}

/// What is kept between builds, by what the page says identifies it.
///
/// Programs alone stay until the view goes: they are kept by their text, and
/// a page has as many as the shaders it wrote.
#[derive(Default)]
pub struct Kept {
    types: RefCell<HashMap<u32, u32>>,
    pictures: RefCell<Revisions<TextureImage>>,
    /// `None` where a revision could not be made: it was said why, once.
    shapes: RefCell<Revisions<Option<Arc<CustomGeometry>>>>,
    tables: RefCell<Revisions<Arc<InstanceTable>>>,
    programs: RefCell<HashMap<String, Option<Arc<ljos_3d::custom::Program>>>>,
    files: RefCell<HashMap<String, Asked>>,
    /// Which file each loader names: a file is held as long as one does, so
    /// one that failed is read again when a loader comes to name it again.
    named: RefCell<HashMap<u32, String>>,
    said: RefCell<HashSet<String>>,
}

impl Kept {
    /// A file's outcome; the host then tells the reactive graph. No loader
    /// names it any more, if it has no entry: then it is not kept.
    pub fn arrive(&self, url: &str, asked: Asked) {
        if let Some(file) = self.files.borrow_mut().get_mut(url) {
            *file = asked;
        }
    }

    /// Forgets objects the page dropped. Handles are never used again.
    pub fn forget(&self, handles: &[u32]) {
        let mut types = self.types.borrow_mut();
        for handle in handles {
            types.remove(handle);
            self.pictures.borrow_mut().let_go(*handle);
            self.shapes.borrow_mut().let_go(*handle);
            self.tables.borrow_mut().let_go(*handle);
            self.name(*handle, None);
        }
    }

    /// `loader` now names `url`.
    fn name(&self, loader: u32, url: Option<&str>) {
        let mut named = self.named.borrow_mut();
        if named.get(&loader).map(String::as_str) == url {
            return;
        }
        let was = match url {
            Some(url) => named.insert(loader, url.to_owned()),
            None => named.remove(&loader),
        };
        if let Some(was) = was
            && !named.values().any(|other| *other == was)
        {
            self.files.borrow_mut().remove(&was);
        }
    }
}

/// `pixels` once: what WebGL2's one device per canvas may ask of again.
#[derive(Debug)]
struct Pixels {
    id: u64,
    size: [u32; 2],
    opaque: bool,
    pixels: Vec<u8>,
}

impl TexturePixels for Pixels {
    fn id(&self) -> u64 {
        self.id
    }
    fn size(&self) -> [u32; 2] {
        self.size
    }
    fn encoding(&self) -> PixelEncoding {
        PixelEncoding::Srgb8Straight
    }
    fn opaque(&self) -> bool {
        self.opaque
    }
    fn with_pixels(&self, read: &mut dyn FnMut(&[u8])) {
        read(&self.pixels);
    }
}

/// The graph one build reads.
pub struct Source<'a, H> {
    pub host: &'a H,
    pub kept: &'a Rc<Kept>,
}

impl<H: Host> fmt::Debug for Source<'_, H> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Source")
    }
}

impl<H: Host> Source<'_, H> {
    fn program(
        &self,
        about: &str,
        key: String,
        make: impl FnOnce() -> Result<ljos_3d::custom::Program, ljos_3d::snippet::SnippetError>,
    ) -> Option<Arc<ljos_3d::custom::Program>> {
        if let Some(made) = self.kept.programs.borrow().get(&key) {
            return made.clone();
        }
        let made = match make() {
            Ok(made) => Some(Arc::new(made)),
            Err(error) => {
                self.host.report(about, &error.to_string());
                None
            }
        };
        self.kept.programs.borrow_mut().insert(key, made.clone());
        made
    }

    /// What a page rewrites says the same each time: once is enough.
    fn say_once(&self, about: &str, error: &str) {
        if self
            .kept
            .said
            .borrow_mut()
            .insert(format!("{about}\0{error}"))
        {
            self.host.report(about, error);
        }
    }
}

fn kind(name: &str) -> Option<UniformKind> {
    Some(match name {
        "bool" => UniformKind::Bool,
        "int" => UniformKind::Int,
        "float" => UniformKind::Float,
        "vec2" => UniformKind::Vec2,
        "vec3" => UniformKind::Vec3,
        "vec4" => UniformKind::Vec4,
        "mat4" => UniformKind::Mat4,
        _ => return None,
    })
}

fn value(u: &Uniform) -> Option<UniformValue> {
    let v = &u.value;
    let at = |i: usize| v.get(i).copied().unwrap_or(0.0);
    Some(match kind(&u.kind)? {
        UniformKind::Bool => UniformValue::Bool(at(0) != 0.0),
        UniformKind::Int => UniformValue::Int(at(0) as i32),
        UniformKind::Float => UniformValue::Float(at(0)),
        UniformKind::Vec2 => UniformValue::Vec2([at(0), at(1)]),
        UniformKind::Vec3 => UniformValue::Vec3([at(0), at(1), at(2)]),
        UniformKind::Vec4 => UniformValue::Vec4([at(0), at(1), at(2), at(3)]),
        UniformKind::Mat4 => UniformValue::Mat4(std::array::from_fn(|c| {
            std::array::from_fn(|r| at(c * 4 + r))
        })),
    })
}

fn declared(uniforms: &[Uniform]) -> Vec<(String, UniformKind)> {
    uniforms
        .iter()
        .filter_map(|u| Some((u.name.clone(), kind(&u.kind)?)))
        .collect()
}

/// Qt's `CustomMaterial.BlendMode`, in its order.
fn blend(n: i32) -> Blend {
    match n {
        1 => Blend::Zero,
        2 => Blend::One,
        3 => Blend::SrcColor,
        4 => Blend::OneMinusSrcColor,
        5 => Blend::DstColor,
        6 => Blend::OneMinusDstColor,
        7 => Blend::SrcAlpha,
        8 => Blend::OneMinusSrcAlpha,
        9 => Blend::DstAlpha,
        10 => Blend::OneMinusDstAlpha,
        _ => Blend::NoBlend,
    }
}

fn semantic(n: u32) -> Option<Semantic> {
    // Geometry.js's numbers. Morph targets are not drawn in either renderer.
    Some(match n {
        0 => Semantic::Index,
        1 => Semantic::Position,
        2 => Semantic::Normal,
        3 => Semantic::TexCoord0,
        4 => Semantic::Tangent,
        5 => Semantic::Binormal,
        6 => Semantic::Joint,
        7 => Semantic::Weight,
        8 => Semantic::Color,
        13 => Semantic::TexCoord1,
        _ => return None,
    })
}

fn component(n: u32) -> Option<ComponentType> {
    Some(match n {
        0 => ComponentType::U16,
        1 => ComponentType::U32,
        3 => ComponentType::F32,
        _ => return None,
    })
}

fn primitive(n: u32) -> PrimitiveType {
    match n {
        0 => PrimitiveType::Points,
        1 => PrimitiveType::LineStrip,
        2 => PrimitiveType::Lines,
        3 => PrimitiveType::TriangleStrip,
        4 => PrimitiveType::TriangleFan,
        _ => PrimitiveType::Triangles,
    }
}

fn shape(s: Shape) -> Result<CustomGeometry, String> {
    let mut g = CustomGeometry::new();
    g.set_vertex_data(s.vertices);
    g.set_index_data(s.indices);
    g.set_stride(s.stride as usize);
    for [sem, offset, comp] in s.attributes {
        if let Some(sem) = semantic(sem) {
            // The renderer reads no signed integers: Geometry.js's I32Type.
            let comp = component(comp)
                .ok_or_else(|| format!("an attribute's component type {comp} is not drawn"))?;
            g.add_attribute(sem, offset as usize, comp);
        }
    }
    g.set_primitive_type(primitive(s.primitive));
    if let Some((min, max)) = s.bounds {
        g.set_bounds(
            Vec3::new(min[0], min[1], min[2]),
            Vec3::new(max[0], max[1], max[2]),
        );
    }
    g.update();
    Ok(g)
}

const ENTRY: usize = 20;

/// The rows `instancing.js` keeps, with the translation in each row's last
/// place, as `ljos_3d`'s column-major matrix and its two four-number parts.
fn entry(e: &[f32]) -> Instance {
    Instance {
        transform: Mat4([
            [e[0], e[4], e[8], 0.0],
            [e[1], e[5], e[9], 0.0],
            [e[2], e[6], e[10], 0.0],
            [e[3], e[7], e[11], 1.0],
        ]),
        color: [e[12], e[13], e[14], e[15]],
        custom: [e[16], e[17], e[18], e[19]],
    }
}

impl<H: Host> SceneSource for Source<'_, H> {
    type Object = u32;

    fn is(&self, o: u32, ty: Type3d) -> bool {
        let known = self.kept.types.borrow().get(&o).copied();
        let is = known.unwrap_or_else(|| {
            let chain = self.host.chain(o);
            let is = names::bits(chain.iter().map(String::as_str));
            self.kept.types.borrow_mut().insert(o, is);
            is
        });
        is & names::bit(ty) != 0
    }

    fn number(&self, o: u32, p: Prop3d) -> Option<f64> {
        self.host.number(o, p as u32)
    }

    fn int(&self, o: u32, p: Prop3d) -> Option<i32> {
        names::enumeration(p, self.host.number(o, p as u32)? as i32)
    }

    fn boolean(&self, o: u32, p: Prop3d) -> Option<bool> {
        self.host.boolean(o, p as u32)
    }

    fn color(&self, o: u32, p: Prop3d) -> Option<[f32; 4]> {
        self.host.color(o, p as u32)
    }

    fn vector3d(&self, o: u32, p: Prop3d) -> Option<Vec3> {
        let [x, y, z] = self.host.vector(o, p as u32)?;
        Some(Vec3::new(x, y, z))
    }

    fn quaternion(&self, o: u32, p: Prop3d) -> Option<Quat> {
        let [x, y, z, w] = self.host.quaternion(o, p as u32)?;
        Some(Quat { x, y, z, w })
    }

    fn url(&self, o: u32, p: Prop3d) -> Option<String> {
        self.host.url(o, p as u32)
    }

    fn object(&self, o: u32, p: Prop3d) -> Option<u32> {
        self.host.object(o, p as u32)
    }

    fn objects(&self, o: u32, p: Prop3d) -> Vec<u32> {
        self.host.objects(o, p as u32)
    }

    fn authored(&self, o: u32, p: Prop3d) -> bool {
        self.host.authored(o, p as u32)
    }

    fn object_slots(&self, o: u32, p: Prop3d) -> Vec<Option<u32>> {
        let slots = self.host.slots(o, p as u32);
        slots
            .into_iter()
            .map(|s| (s != NO_OBJECT).then_some(s))
            .collect()
    }

    fn matrices(&self, o: u32, p: Prop3d) -> Vec<Mat4> {
        let numbers = self.host.matrices(o, p as u32);
        numbers
            .as_chunks::<16>()
            .0
            .iter()
            .map(|m| {
                Mat4(std::array::from_fn(|c| {
                    std::array::from_fn(|r| m[c * 4 + r])
                }))
            })
            .collect()
    }

    fn texture_image(&self, _view: u32, texture: u32) -> Option<TextureImage> {
        let Some(id) = self.host.picture_id(texture) else {
            self.kept.pictures.borrow_mut().let_go(texture);
            return None;
        };
        let known = self.kept.pictures.borrow_mut().take_up(texture, id);
        if known.is_some() {
            return known;
        }
        let p = self.host.picture(texture)?;
        let image = TextureImage::new(Pixels {
            id: fresh_pixels_id(),
            size: [p.width, p.height],
            opaque: p.opaque,
            pixels: p.pixels,
        });
        self.kept
            .pictures
            .borrow_mut()
            .put(texture, id, image.clone());
        Some(image)
    }

    fn geometry(&self, geometry: u32) -> Option<Arc<CustomGeometry>> {
        let Some(id) = self.host.geometry_id(geometry) else {
            self.kept.shapes.borrow_mut().let_go(geometry);
            return None;
        };
        let known = self.kept.shapes.borrow_mut().take_up(geometry, id);
        if let Some(known) = known {
            return known;
        }
        let made = match shape(self.host.geometry(geometry)?) {
            Ok(made) => Some(Arc::new(made)),
            Err(error) => {
                self.say_once("Geometry", &error);
                None
            }
        };
        self.kept
            .shapes
            .borrow_mut()
            .put(geometry, id, made.clone());
        made
    }

    fn instancing(&self, table: u32) -> Option<Instancing> {
        let Some(id) = self.host.table_id(table) else {
            self.kept.tables.borrow_mut().let_go(table);
            return None;
        };
        let t = self.host.table(table)?;
        let known = self.kept.tables.borrow_mut().take_up(table, id);
        let entries = known.unwrap_or_else(|| {
            let data = self.host.table_data(table);
            let made = Arc::new(InstanceTable::new(
                data.as_chunks::<ENTRY>()
                    .0
                    .iter()
                    .map(|e| entry(e.as_slice()))
                    .collect(),
            ));
            self.kept.tables.borrow_mut().put(table, id, made.clone());
            made
        });
        let mut instancing = Instancing::new(entries);
        instancing.count = t.count;
        instancing.transparent = t.transparent;
        instancing.depth_sort = t.sorted;
        Some(instancing)
    }

    fn custom_material(&self, view: u32, material: u32) -> Option<CustomMaterial> {
        let s = self.host.snippets(material)?;
        let uniforms = declared(&s.uniforms);
        let samplers: Vec<String> = s.textures.iter().map(|(name, _)| name.clone()).collect();
        let key = format!(
            "m{}\0{}\0{}\0{uniforms:?}\0{samplers:?}",
            s.shaded, s.vertex, s.fragment
        );
        let vertex = (!s.vertex.is_empty()).then_some(s.vertex.as_str());
        let fragment = (!s.fragment.is_empty()).then_some(s.fragment.as_str());
        let program = self.program("CustomMaterial", key, || {
            ljos_3d::snippet::material(vertex, fragment, s.shaded, &uniforms, &samplers)
        })?;
        let mut made = CustomMaterial::new(program);
        made.values = s.uniforms.iter().filter_map(value).collect();
        made.textures = s
            .textures
            .iter()
            .map(|(_, t)| {
                (*t != NO_OBJECT)
                    .then(|| qml::texture(self, view, *t))
                    .flatten()
            })
            .collect();
        made.source_blend = blend(s.source_blend);
        made.destination_blend = blend(s.destination_blend);
        made.depth_draw = match s.depth_draw {
            depth_draw::ALWAYS => ljos_3d::DepthDraw::Always,
            depth_draw::NEVER => ljos_3d::DepthDraw::Never,
            depth_draw::OPAQUE_PRE_PASS => ljos_3d::DepthDraw::OpaquePrePass,
            _ => ljos_3d::DepthDraw::OpaqueOnly,
        };
        // Material.js's numbers, as `int` translates them.
        made.cull_mode = match names::enumeration(Prop3d::CullMode, s.cull_mode) {
            Some(cull::FRONT) => ljos_3d::CullMode::Front,
            Some(cull::NONE) => ljos_3d::CullMode::None,
            _ => ljos_3d::CullMode::Back,
        };
        Some(made)
    }

    fn effect(&self, view: u32, effect: u32) -> Option<Effect> {
        let told = self.host.passes(effect)?;
        let uniforms = declared(&told.uniforms);
        let mut made = Effect {
            buffers: told
                .buffers
                .iter()
                .map(|b| EffectBuffer {
                    format: match b.format {
                        2 => BufferFormat::Rgba16F,
                        3 => BufferFormat::Rgba32F,
                        _ => BufferFormat::Rgba8,
                    },
                    size_multiplier: b.scale,
                    filter: if b.filter == 1 {
                        Filter::Nearest
                    } else {
                        Filter::Linear
                    },
                    tiling: match b.wrap {
                        2 => Tiling::MirroredRepeat,
                        3 => Tiling::Repeat,
                        _ => Tiling::ClampToEdge,
                    },
                })
                .collect(),
            passes: Vec::new(),
        };
        for pass in &told.passes {
            let mut samplers: Vec<String> = told.textures.iter().map(|(n, _)| n.clone()).collect();
            samplers.extend(pass.reads.iter().map(|(n, _)| n.clone()));
            let key = format!(
                "e\0{}\0{}\0{uniforms:?}\0{samplers:?}",
                pass.vertex, pass.fragment
            );
            let vertex = (!pass.vertex.is_empty()).then_some(pass.vertex.as_str());
            let program = self.program("Effect", key, || {
                ljos_3d::snippet::effect(vertex, &pass.fragment, &uniforms, &samplers)
            })?;
            let values = told
                .uniforms
                .iter()
                .filter(|u| kind(&u.kind).is_some())
                .map(|u| value(pass.set.iter().find(|s| s.name == u.name).unwrap_or(u)))
                .collect::<Option<Vec<_>>>()?;
            let mut textures: Vec<PassTexture> = told
                .textures
                .iter()
                .map(|(_, t)| {
                    PassTexture::Texture(
                        (*t != NO_OBJECT)
                            .then(|| qml::texture(self, view, *t))
                            .flatten(),
                    )
                })
                .collect();
            textures.extend(pass.reads.iter().map(|(_, b)| PassTexture::Buffer(*b)));
            made.passes.push(Pass {
                program,
                values,
                textures,
                input: pass.input,
                output: pass.output,
            });
        }
        Some(made)
    }

    fn loaded(&self, loader: u32) -> Option<Loaded<u32>> {
        if !self.is(loader, Type3d::RuntimeLoader) {
            return None;
        }
        self.host.arrivals();
        let url = self
            .url(loader, Prop3d::Source)
            .filter(|url| !url.is_empty());
        self.kept.name(loader, url.as_deref());
        let Some(url) = url else {
            self.host.loader_status(loader, LoaderStatus::Empty, "");
            return None;
        };
        let (asset, failed) = match self.kept.files.borrow().get(&url) {
            Some(Asked::Ready(asset)) => (Some(asset.clone()), None),
            Some(Asked::Failed(error)) => (None, Some(error.clone())),
            Some(Asked::Loading) | None => (None, None),
        };
        if let Some(error) = failed {
            self.host.loader_status(loader, LoaderStatus::Error, &error);
            return None;
        }
        let Some(asset) = asset else {
            self.host.loader_status(loader, LoaderStatus::Empty, "");
            let asked = self
                .kept
                .files
                .borrow_mut()
                .insert(url.clone(), Asked::Loading)
                .is_none();
            if asked {
                self.host.load(&url, self.kept);
            }
            return None;
        };
        self.host.loader_status(loader, LoaderStatus::Success, "");
        Some(Loaded {
            asset,
            models: Vec::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use ljos_3d::scene::NodeKind;

    use super::*;

    const CUBE: u32 = 1;
    const CAMERA: u32 = 2;
    const MATERIAL: u32 = 3;
    const LOADER: u32 = 4;
    const OTHER_LOADER: u32 = 5;
    /// Enough revisions that a count of 1 says the older ones were let go.
    const COMMITTED: u32 = 50;

    /// A view with a model and a camera, counting what is asked.
    #[derive(Default)]
    struct Fake {
        chains: Cell<u32>,
        x: Cell<Option<f64>>,
        /// Revision of the object's shape, picture and table, if it has one.
        revision: Cell<Option<u32>>,
        component: Cell<u32>,
        table_reads: Cell<u32>,
        fragment: RefCell<String>,
        source: RefCell<String>,
        loads: RefCell<Vec<String>>,
        reports: RefCell<Vec<String>>,
        status: RefCell<Option<(LoaderStatus, String)>>,
    }

    impl Host for Fake {
        fn chain(&self, o: u32) -> Vec<String> {
            self.chains.set(self.chains.get() + 1);
            let names: &[&str] = match o {
                VIEW => &["View3D"],
                CUBE => &["Object3D", "Node", "Model"],
                CAMERA => &["Object3D", "Node", "Camera", "OrthographicCamera"],
                MATERIAL => &["Object3D", "Material", "PrincipledMaterial"],
                LOADER => &["Object3D", "Node", "RuntimeLoader"],
                _ => &[],
            };
            names.iter().map(|n| (*n).to_owned()).collect()
        }
        fn number(&self, o: u32, p: u32) -> Option<f64> {
            match (o, Prop3d::ALL[p as usize]) {
                (CUBE, Prop3d::X) => self.x.get(),
                (MATERIAL, Prop3d::CullMode) => Some(3.0),
                _ => None,
            }
        }
        fn boolean(&self, _: u32, _: u32) -> Option<bool> {
            None
        }
        fn color(&self, _: u32, _: u32) -> Option<[f32; 4]> {
            None
        }
        fn vector(&self, _: u32, _: u32) -> Option<[f32; 3]> {
            None
        }
        fn quaternion(&self, _: u32, _: u32) -> Option<[f32; 4]> {
            None
        }
        fn url(&self, o: u32, p: u32) -> Option<String> {
            if Prop3d::ALL[p as usize] != Prop3d::Source {
                return None;
            }
            match o {
                CUBE => Some("#Cube".to_owned()),
                LOADER => Some(self.source.borrow().clone()),
                _ => None,
            }
        }
        fn object(&self, _: u32, _: u32) -> Option<u32> {
            None
        }
        fn objects(&self, o: u32, p: u32) -> Vec<u32> {
            match (o, Prop3d::ALL[p as usize]) {
                (VIEW, Prop3d::Data) => vec![CUBE, CAMERA],
                (CUBE, Prop3d::Materials) => vec![MATERIAL],
                _ => Vec::new(),
            }
        }
        fn slots(&self, _: u32, _: u32) -> Vec<u32> {
            Vec::new()
        }
        fn authored(&self, _: u32, _: u32) -> bool {
            false
        }
        fn matrices(&self, _: u32, _: u32) -> Vec<f32> {
            Vec::new()
        }
        fn picture_id(&self, _: u32) -> Option<u32> {
            self.revision.get()
        }
        fn picture(&self, _: u32) -> Option<Picture> {
            Some(Picture {
                width: 1,
                height: 1,
                opaque: true,
                pixels: vec![0; 4],
            })
        }
        fn geometry_id(&self, _: u32) -> Option<u32> {
            self.revision.get()
        }
        fn geometry(&self, _: u32) -> Option<Shape> {
            Some(Shape {
                vertices: vec![0; 36],
                indices: Vec::new(),
                stride: 12,
                attributes: vec![[1, 0, self.component.get()]],
                primitive: 5,
                bounds: None,
            })
        }
        fn table_id(&self, _: u32) -> Option<u32> {
            self.revision.get()
        }
        fn table(&self, _: u32) -> Option<Table> {
            Some(Table {
                count: Some(1),
                transparent: false,
                sorted: false,
            })
        }
        fn table_data(&self, _: u32) -> Vec<f32> {
            self.table_reads.set(self.table_reads.get() + 1);
            vec![0.0; ENTRY]
        }
        fn snippets(&self, _: u32) -> Option<Snippets> {
            Some(Snippets {
                vertex: String::new(),
                fragment: self.fragment.borrow().clone(),
                shaded: true,
                uniforms: Vec::new(),
                textures: Vec::new(),
                source_blend: 0,
                destination_blend: 0,
                depth_draw: 0,
                cull_mode: 0,
            })
        }
        fn passes(&self, _: u32) -> Option<Passes> {
            None
        }
        fn arrivals(&self) {}
        fn load(&self, url: &str, _: &Rc<Kept>) {
            self.loads.borrow_mut().push(url.to_owned());
        }
        fn report(&self, about: &str, error: &str) {
            self.reports.borrow_mut().push(format!("{about}: {error}"));
        }
        fn loader_status(&self, _: u32, status: LoaderStatus, error: &str) {
            *self.status.borrow_mut() = Some((status, error.to_owned()));
        }
    }

    fn cube_x(built: &qml::Built<u32>) -> f32 {
        let id = built.ids[&CUBE];
        built.scene.node(id).unwrap().transform.position.x
    }

    #[test]
    fn a_build_maps_the_objects_and_asks_each_what_it_is_once() {
        let host = Fake::default();
        let kept = Rc::new(Kept::default());
        let source = Source {
            host: &host,
            kept: &kept,
        };
        let first = qml::build(&source, VIEW);
        let asked = host.chains.get();
        assert!(matches!(
            first.scene.node(first.ids[&CUBE]).unwrap().kind,
            NodeKind::Model(_)
        ));
        qml::build(&source, VIEW);
        assert_eq!(host.chains.get(), asked);
    }

    #[test]
    fn an_unset_member_is_the_mappings_default_and_a_set_one_its_value() {
        let host = Fake::default();
        let kept = Rc::new(Kept::default());
        let source = Source {
            host: &host,
            kept: &kept,
        };
        assert_eq!(cube_x(&qml::build(&source, VIEW)), 0.0);
        host.x.set(Some(7.0));
        assert_eq!(cube_x(&qml::build(&source, VIEW)), 7.0);
    }

    #[test]
    fn the_same_objects_build_a_scene_that_draws_the_same() {
        let host = Fake::default();
        let kept = Rc::new(Kept::default());
        let source = Source {
            host: &host,
            kept: &kept,
        };
        let a = qml::build(&source, VIEW);
        let b = qml::build(&source, VIEW);
        assert!(a.scene.same_as(&b.scene));
        host.x.set(Some(1.0));
        assert!(!a.scene.same_as(&qml::build(&source, VIEW).scene));
    }

    #[test]
    fn an_instance_entrys_translation_is_the_matrixs_last_column() {
        let mut e = [0.0; 20];
        e[3] = 5.0;
        e[12] = 0.5;
        let got = entry(&e);
        assert_eq!(got.transform.0[3][0], 5.0);
        assert_eq!(got.color[0], 0.5);
    }

    #[test]
    fn a_new_revision_lets_go_of_the_old_and_forgetting_of_the_last() {
        let host = Fake::default();
        let kept = Rc::new(Kept::default());
        let source = Source {
            host: &host,
            kept: &kept,
        };
        let mut oldest = None;
        for revision in 1..=COMMITTED {
            host.revision.set(Some(revision));
            let shape = source.geometry(CUBE).unwrap();
            oldest.get_or_insert_with(|| Arc::downgrade(&shape));
            source.instancing(CUBE).unwrap();
            source.texture_image(VIEW, CUBE).unwrap();
            assert_eq!(kept.shapes.borrow().made.len(), 1);
            assert_eq!(kept.tables.borrow().made.len(), 1);
            assert_eq!(kept.pictures.borrow().made.len(), 1);
        }
        assert_eq!(oldest.unwrap().strong_count(), 0);
        kept.forget(&[CUBE]);
        assert_eq!(kept.shapes.borrow().made.len(), 0);
        assert_eq!(kept.tables.borrow().made.len(), 0);
        assert_eq!(kept.pictures.borrow().made.len(), 0);
    }

    #[test]
    fn two_objects_on_one_revision_share_it_until_both_have_left() {
        let host = Fake::default();
        let kept = Rc::new(Kept::default());
        let source = Source {
            host: &host,
            kept: &kept,
        };
        host.revision.set(Some(1));
        let a = source.geometry(CUBE).unwrap();
        let b = source.geometry(CAMERA).unwrap();
        assert!(Arc::ptr_eq(&a, &b));
        host.revision.set(Some(2));
        source.geometry(CUBE).unwrap();
        assert_eq!(kept.shapes.borrow().made.len(), 2);
        source.geometry(CAMERA).unwrap();
        assert_eq!(kept.shapes.borrow().made.len(), 1);
    }

    #[test]
    fn a_tables_numbers_cross_only_when_they_are_new() {
        let host = Fake::default();
        let kept = Rc::new(Kept::default());
        let source = Source {
            host: &host,
            kept: &kept,
        };
        host.revision.set(Some(1));
        for _ in 0..3 {
            assert_eq!(source.instancing(CUBE).unwrap().count, Some(1));
        }
        assert_eq!(host.table_reads.get(), 1);
        host.revision.set(Some(2));
        source.instancing(CUBE).unwrap();
        assert_eq!(host.table_reads.get(), 2);
    }

    #[test]
    fn a_shader_that_does_not_translate_is_said_once_and_translated_once() {
        let host = Fake::default();
        let kept = Rc::new(Kept::default());
        let source = Source {
            host: &host,
            kept: &kept,
        };
        *host.fragment.borrow_mut() = "void MAIN() { no such thing here; }".to_owned();
        assert!(source.custom_material(VIEW, MATERIAL).is_none());
        assert!(source.custom_material(VIEW, MATERIAL).is_none());
        let reports = host.reports.borrow();
        assert_eq!(reports.len(), 1, "{reports:?}");
        assert!(reports[0].starts_with("CustomMaterial: fragment shader"));
    }

    #[test]
    fn a_component_type_the_renderer_cannot_read_is_said_for_all_its_revisions_once() {
        let host = Fake::default();
        let kept = Rc::new(Kept::default());
        let source = Source {
            host: &host,
            kept: &kept,
        };
        host.component.set(3);
        host.revision.set(Some(1));
        assert!(source.geometry(CUBE).is_some());
        assert!(host.reports.borrow().is_empty());
        host.component.set(2);
        for revision in 2..5 {
            host.revision.set(Some(revision));
            assert!(source.geometry(CUBE).is_none());
            assert!(source.geometry(CUBE).is_none());
        }
        assert_eq!(
            *host.reports.borrow(),
            ["Geometry: an attribute's component type 2 is not drawn"]
        );
    }

    #[test]
    fn a_file_that_failed_is_read_again_only_when_named_again() {
        let host = Fake::default();
        let kept = Rc::new(Kept::default());
        let source = Source {
            host: &host,
            kept: &kept,
        };
        let names = |url: &str| *host.source.borrow_mut() = url.to_owned();
        let status = || host.status.borrow().clone().unwrap();
        names("bad.gltf");
        assert!(source.loaded(LOADER).is_none());
        assert_eq!(status().0, LoaderStatus::Empty);
        kept.arrive("bad.gltf", Asked::Failed("404".to_owned()));
        // The arrival builds again, and that must not ask again.
        assert!(source.loaded(LOADER).is_none());
        assert_eq!(status(), (LoaderStatus::Error, "404".to_owned()));
        assert_eq!(host.loads.borrow().len(), 1);
        // Another loader gets the same answer while the first still names it.
        assert!(source.loaded(OTHER_LOADER).is_none());
        assert_eq!(status(), (LoaderStatus::Error, "404".to_owned()));
        assert_eq!(host.loads.borrow().len(), 1);
        names("");
        assert!(source.loaded(LOADER).is_none());
        assert!(source.loaded(OTHER_LOADER).is_none());
        assert_eq!(status(), (LoaderStatus::Empty, String::new()));
        names("bad.gltf");
        assert!(source.loaded(LOADER).is_none());
        assert_eq!(*host.loads.borrow(), ["bad.gltf", "bad.gltf"]);
        // What arrives after no one names it is not kept.
        names("");
        assert!(source.loaded(LOADER).is_none());
        kept.arrive("bad.gltf", Asked::Failed("late".to_owned()));
        assert!(kept.files.borrow().is_empty());
    }

    #[test]
    fn forgetting_a_loader_lets_go_of_its_file() {
        let host = Fake::default();
        let kept = Rc::new(Kept::default());
        let source = Source {
            host: &host,
            kept: &kept,
        };
        *host.source.borrow_mut() = "a.gltf".to_owned();
        source.loaded(LOADER);
        kept.forget(&[LOADER]);
        assert!(kept.files.borrow().is_empty());
    }
}
