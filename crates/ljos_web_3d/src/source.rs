//! `SceneSource` over a handle-numbered graph: what the mapping asks,
//! answered by a [`Host`] that holds the real objects. Everything kept here
//! is kept by what the page says identifies it, so that a build of the same
//! objects makes a scene that compares the same and costs the GPU nothing.

use std::cell::RefCell;
use std::collections::HashMap;
use std::fmt;
use std::rc::Rc;
use std::sync::Arc;

use ljos_3d::custom::{
    Blend, BufferFormat, EffectBuffer, Pass, PassTexture, UniformKind, UniformValue,
};
use ljos_3d::geometry::{ComponentType, PrimitiveType, Semantic, Subset};
use ljos_3d::gltf::Asset;
use ljos_3d::math::{Mat4, Quat, Vec3};
use ljos_3d::mesh_file::MeshFile;
use ljos_3d::qml::enums::{cull, depth_draw};
use ljos_3d::qml::{self, Loaded, Prop3d, SceneSource, Type3d};
use ljos_3d::texture::{
    BakedCube, Filter, PixelEncoding, TextureImage, TexturePixels, Tiling, fresh_pixels_id,
};
use ljos_3d::texture_data::TextureData;
use ljos_3d::{CustomGeometry, CustomMaterial, Effect, Instance, InstanceTable, Instancing};

use crate::names;

/// The view itself, in every registry.
pub const VIEW: u32 = 0;
/// A hole in a list of handles.
pub const NO_OBJECT: u32 = u32::MAX;

/// A picture's pixels: not premultiplied, the top row first, unless it has
/// a `format`: then what `TextureData` of that format holds.
pub struct Picture {
    pub width: u32,
    pub height: u32,
    pub opaque: bool,
    pub format: Option<i32>,
    pub pixels: Vec<u8>,
    /// Where the picture is a cube with its levels baked: its levels, each
    /// its six sides.
    pub baked: Option<Vec<Vec<u8>>>,
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
    /// What materials of their own draw, if it was said.
    pub subsets: Vec<Subset>,
}

/// An `Instancing`'s table, as `instancing.js` keeps it: twenty numbers an
/// entry.
pub struct Table {
    pub data: Vec<f32>,
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
    pub name: String,
    pub format: i32,
    pub scale: f32,
    pub filter: i32,
    pub wrap: i32,
}

fn format(told: i32) -> BufferFormat {
    match told {
        2 => BufferFormat::Rgba16F,
        3 => BufferFormat::Rgba32F,
        4 => BufferFormat::R8,
        5 => BufferFormat::R16,
        6 => BufferFormat::R16F,
        7 => BufferFormat::R32F,
        _ => BufferFormat::Rgba8,
    }
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
    /// The kind of picture the effect leaves, where the pass says one.
    pub leaves: i32,
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
    fn warn(&self, message: &str);
    fn geometry_id(&self, o: u32) -> Option<u32>;
    fn geometry(&self, o: u32) -> Option<Shape>;
    fn table_id(&self, o: u32) -> Option<u32>;
    fn table(&self, o: u32) -> Option<Table>;
    fn snippets(&self, o: u32) -> Option<Snippets>;
    fn passes(&self, o: u32) -> Option<Passes>;
    /// A tracked read of "another file arrived".
    fn arrivals(&self);
    /// Starts reading the file at `url`; [`Kept::arrive`] follows.
    fn load(&self, url: &str, kept: &Rc<Kept>);
    /// Starts reading the mesh file at `url`; [`Kept::arrive_mesh`] follows.
    fn load_mesh(&self, url: &str, kept: &Rc<Kept>);
}

/// A file the scene names.
pub enum Asked<T> {
    Loading,
    Failed,
    Ready(Arc<T>),
}

/// What is kept between builds, by what the page says identifies it.
#[derive(Default)]
pub struct Kept {
    types: RefCell<HashMap<u32, u32>>,
    pictures: RefCell<HashMap<u32, TextureImage>>,
    shapes: RefCell<HashMap<u32, Arc<CustomGeometry>>>,
    tables: RefCell<HashMap<u32, Arc<InstanceTable>>>,
    // Those that could not be made as well, so as to say so once.
    programs: RefCell<HashMap<String, Option<Arc<ljos_3d::custom::Program>>>>,
    files: RefCell<HashMap<String, Asked<Asset>>>,
    meshes: RefCell<HashMap<String, Asked<MeshFile>>>,
}

impl Kept {
    /// A file's outcome; the host then tells the reactive graph.
    pub fn arrive(&self, url: &str, asked: Asked<Asset>) {
        self.files.borrow_mut().insert(url.to_owned(), asked);
    }

    /// A mesh file's outcome; the host then tells the reactive graph.
    pub fn arrive_mesh(&self, url: &str, asked: Asked<MeshFile>) {
        self.meshes.borrow_mut().insert(url.to_owned(), asked);
    }

    /// Forgets objects the page dropped. Handles are never used again.
    pub fn forget(&self, handles: &[u32]) {
        let mut types = self.types.borrow_mut();
        for handle in handles {
            types.remove(handle);
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

/// A picture that is a cube with its levels baked, for a light probe; as a
/// material's picture it is what `first` holds.
#[derive(Debug)]
struct Baked {
    first: TextureImage,
    cube: BakedCube,
}

impl TexturePixels for Baked {
    fn id(&self) -> u64 {
        self.first.0.id()
    }
    fn size(&self) -> [u32; 2] {
        self.first.0.size()
    }
    fn encoding(&self) -> PixelEncoding {
        self.first.0.encoding()
    }
    fn opaque(&self) -> bool {
        self.first.0.opaque()
    }
    fn with_pixels(&self, read: &mut dyn FnMut(&[u8])) {
        self.first.0.with_pixels(read);
    }
    fn baked(&self) -> Option<&BakedCube> {
        Some(&self.cube)
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
        key: String,
        make: impl FnOnce() -> Result<ljos_3d::custom::Program, ljos_3d::snippet::SnippetError>,
    ) -> Option<Arc<ljos_3d::custom::Program>> {
        if let Some(made) = self.kept.programs.borrow().get(&key) {
            return made.clone();
        }
        let made = match make() {
            Ok(made) => Some(Arc::new(made)),
            // Nothing is drawn with it, so what is wrong has to be said.
            Err(error) => {
                self.host.warn(&format!("a shader cannot be used: {error}"));
                None
            }
        };
        self.kept.programs.borrow_mut().insert(key, made.clone());
        made
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

fn shape(s: Shape) -> Option<CustomGeometry> {
    let mut g = CustomGeometry::new();
    g.set_vertex_data(s.vertices);
    g.set_index_data(s.indices);
    g.set_stride(s.stride as usize);
    for [sem, offset, comp] in s.attributes {
        if let Some(sem) = semantic(sem) {
            g.add_attribute(sem, offset as usize, component(comp)?);
        }
    }
    g.set_primitive_type(primitive(s.primitive));
    if let Some((min, max)) = s.bounds {
        g.set_bounds(
            Vec3::new(min[0], min[1], min[2]),
            Vec3::new(max[0], max[1], max[2]),
        );
    }
    for subset in s.subsets {
        g.add_subset(subset);
    }
    g.update();
    Some(g)
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
        let id = self.host.picture_id(texture)?;
        if let Some(image) = self.kept.pictures.borrow().get(&id) {
            return Some(image.clone());
        }
        let p = self.host.picture(texture)?;
        let image = match p.format {
            Some(format) => TextureData {
                width: p.width,
                height: p.height,
                depth: 0,
                format,
                has_transparency: !p.opaque,
                bytes: p.pixels,
            }
            .image()
            .ok()??,
            None => TextureImage::new(Pixels {
                id: fresh_pixels_id(),
                size: [p.width, p.height],
                opaque: p.opaque,
                pixels: p.pixels,
            }),
        };
        let image = match p.baked {
            Some(levels) => TextureImage::new(Baked {
                first: image,
                cube: BakedCube {
                    across: p.width,
                    levels,
                },
            }),
            None => image,
        };
        self.kept.pictures.borrow_mut().insert(id, image.clone());
        Some(image)
    }

    fn mesh_file(&self, _view: u32, model: u32) -> Option<Arc<MeshFile>> {
        self.host.arrivals();
        let url = self.url(model, Prop3d::Source)?;
        match self.kept.meshes.borrow().get(&url) {
            Some(Asked::Ready(file)) => return Some(file.clone()),
            Some(_) => return None,
            None => {}
        }
        self.kept.arrive_mesh(&url, Asked::Loading);
        self.host.load_mesh(&url, self.kept);
        None
    }

    fn geometry(&self, geometry: u32) -> Option<Arc<CustomGeometry>> {
        let id = self.host.geometry_id(geometry)?;
        if let Some(made) = self.kept.shapes.borrow().get(&id) {
            return Some(made.clone());
        }
        let made = Arc::new(shape(self.host.geometry(geometry)?)?);
        self.kept.shapes.borrow_mut().insert(id, made.clone());
        Some(made)
    }

    fn instancing(&self, table: u32) -> Option<Instancing> {
        let id = self.host.table_id(table)?;
        let t = self.host.table(table)?;
        let known = self.kept.tables.borrow().get(&id).cloned();
        let entries = known.unwrap_or_else(|| {
            let made = Arc::new(InstanceTable::new(
                t.data
                    .as_chunks::<ENTRY>()
                    .0
                    .iter()
                    .map(|e| entry(e.as_slice()))
                    .collect(),
            ));
            self.kept.tables.borrow_mut().insert(id, made.clone());
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
        let program = self.program(key, || {
            ljos_3d::snippet::material(vertex, fragment, s.shaded, &uniforms, &samplers)
        })?;
        let mut made = CustomMaterial::new(program);
        made.values = s.uniforms.iter().filter_map(value).collect();
        // A program keeps the samplers its snippets read, and binds those.
        let kept: Vec<String> = made.program.textures().to_vec();
        made.textures = s
            .textures
            .iter()
            .filter(|(name, _)| kept.contains(name))
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
                    name: b.name.clone(),
                    format: format(b.format),
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
            // A property of the effect a pass reads a buffer through says
            // no more than that buffer's name in that pass.
            samplers.extend(
                pass.reads
                    .iter()
                    .filter(|(n, _)| !told.textures.iter().any(|(own, _)| own == n))
                    .map(|(n, _)| n.clone()),
            );
            let key = format!(
                "e\0{}\0{}\0{uniforms:?}\0{samplers:?}",
                pass.vertex, pass.fragment
            );
            let vertex = (!pass.vertex.is_empty()).then_some(pass.vertex.as_str());
            let program = self.program(key, || {
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
                .map(|(name, t)| {
                    if let Some((_, buffer)) = pass.reads.iter().find(|(n, _)| n == name) {
                        return PassTexture::Buffer(*buffer);
                    }
                    PassTexture::Texture(
                        (*t != NO_OBJECT)
                            .then(|| qml::texture(self, view, *t))
                            .flatten(),
                    )
                })
                .collect();
            textures.extend(
                pass.reads
                    .iter()
                    .filter(|(n, _)| !told.textures.iter().any(|(own, _)| own == n))
                    .map(|(_, b)| PassTexture::Buffer(*b)),
            );
            made.passes.push(Pass {
                program,
                values,
                textures,
                input: pass.input,
                output: pass.output,
                leaves: (pass.leaves != 0).then(|| format(pass.leaves)),
            });
        }
        Some(made)
    }

    fn loaded(&self, loader: u32) -> Option<Loaded<u32>> {
        if !self.is(loader, Type3d::RuntimeLoader) {
            return None;
        }
        self.host.arrivals();
        let url = self.url(loader, Prop3d::Source)?;
        if url.is_empty() {
            return None;
        }
        let ready = match self.kept.files.borrow().get(&url) {
            Some(Asked::Ready(asset)) => Some(asset.clone()),
            Some(_) => return None,
            None => None,
        };
        let Some(asset) = ready else {
            self.kept.arrive(&url, Asked::Loading);
            self.host.load(&url, self.kept);
            return None;
        };
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

    /// A view with a model and a camera, counting what is asked.
    #[derive(Default)]
    struct Fake {
        chains: Cell<u32>,
        x: Cell<Option<f64>>,
    }

    impl Host for Fake {
        fn chain(&self, o: u32) -> Vec<String> {
            self.chains.set(self.chains.get() + 1);
            let names: &[&str] = match o {
                VIEW => &["View3D"],
                CUBE => &["Object3D", "Node", "Model"],
                CAMERA => &["Object3D", "Node", "Camera", "OrthographicCamera"],
                MATERIAL => &["Object3D", "Material", "PrincipledMaterial"],
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
            (o == CUBE && Prop3d::ALL[p as usize] == Prop3d::Source).then(|| "#Cube".to_owned())
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
            None
        }
        fn picture(&self, _: u32) -> Option<Picture> {
            None
        }
        fn warn(&self, _: &str) {}
        fn geometry_id(&self, _: u32) -> Option<u32> {
            None
        }
        fn geometry(&self, _: u32) -> Option<Shape> {
            None
        }
        fn table_id(&self, _: u32) -> Option<u32> {
            None
        }
        fn table(&self, _: u32) -> Option<Table> {
            None
        }
        fn snippets(&self, _: u32) -> Option<Snippets> {
            None
        }
        fn passes(&self, _: u32) -> Option<Passes> {
            None
        }
        fn arrivals(&self) {}
        fn load(&self, _: &str, _: &Rc<Kept>) {}
        fn load_mesh(&self, _: &str, _: &Rc<Kept>) {}
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
}
