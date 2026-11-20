//! The wasm boundary: the page's host object, its fetch, and one view's
//! canvas. Nothing here runs unless the page asked: a build when what it
//! read changed, a frame when the build drew differently or the size did.

use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::sync::Arc;

use js_sys::{Array, Float32Array, Reflect, Uint8Array};
use ljos_3d::fetch::{Fetch, Reply};
use ljos_3d::geometry::Subset;
use ljos_3d::math::Vec3;
use ljos_3d::mesh_file::MeshFile;
use ljos_3d::qml::Prop3d;
use ljos_3d::{Gpu, SceneSlot, SurfaceView};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::{JsFuture, spawn_local};
use web_sys::HtmlCanvasElement;

use crate::source::{
    Asked, Host, Kept, LoaderStatus, PassBuffer, PassShaders, Passes, Picture, Shape, Snippets,
    Table, Uniform,
};

#[wasm_bindgen]
extern "C" {
    /// `QtQuick3D/wgpu.js`'s registry of one view's objects.
    #[derive(Clone)]
    pub type JsHost;
    #[wasm_bindgen(method)]
    fn chain(this: &JsHost, o: u32) -> Vec<String>;
    #[wasm_bindgen(method)]
    fn number(this: &JsHost, o: u32, p: u32) -> Option<f64>;
    #[wasm_bindgen(method)]
    fn boolean(this: &JsHost, o: u32, p: u32) -> Option<bool>;
    #[wasm_bindgen(method)]
    fn color(this: &JsHost, o: u32, p: u32) -> Option<Vec<f32>>;
    #[wasm_bindgen(method)]
    fn vector(this: &JsHost, o: u32, p: u32) -> Option<Vec<f32>>;
    #[wasm_bindgen(method)]
    fn quaternion(this: &JsHost, o: u32, p: u32) -> Option<Vec<f32>>;
    #[wasm_bindgen(method)]
    fn url(this: &JsHost, o: u32, p: u32) -> Option<String>;
    #[wasm_bindgen(method)]
    fn object(this: &JsHost, o: u32, p: u32) -> Option<u32>;
    #[wasm_bindgen(method)]
    fn objects(this: &JsHost, o: u32, p: u32) -> Vec<u32>;
    #[wasm_bindgen(method)]
    fn slots(this: &JsHost, o: u32, p: u32) -> Vec<u32>;
    #[wasm_bindgen(method)]
    fn authored(this: &JsHost, o: u32, p: u32) -> bool;
    #[wasm_bindgen(method)]
    fn matrices(this: &JsHost, o: u32, p: u32) -> Vec<f32>;
    #[wasm_bindgen(method, js_name = pictureId)]
    fn picture_id(this: &JsHost, o: u32) -> Option<u32>;
    #[wasm_bindgen(method)]
    fn picture(this: &JsHost, o: u32) -> JsValue;
    #[wasm_bindgen(method, js_name = geometryId)]
    fn geometry_id(this: &JsHost, o: u32) -> Option<u32>;
    #[wasm_bindgen(method)]
    fn geometry(this: &JsHost, o: u32) -> JsValue;
    #[wasm_bindgen(method, js_name = tableId)]
    fn table_id(this: &JsHost, o: u32) -> Option<u32>;
    #[wasm_bindgen(method)]
    fn table(this: &JsHost, o: u32) -> JsValue;
    #[wasm_bindgen(method)]
    fn snippets(this: &JsHost, o: u32) -> JsValue;
    #[wasm_bindgen(method)]
    fn passes(this: &JsHost, o: u32) -> JsValue;
    #[wasm_bindgen(method)]
    fn arrivals(this: &JsHost, o: u32);
    #[wasm_bindgen(method)]
    fn arrived(this: &JsHost);
    #[wasm_bindgen(method)]
    fn fetched(this: &JsHost, url: &str) -> js_sys::Promise;
    #[wasm_bindgen(method)]
    fn report(this: &JsHost, url: &str, error: &str);
    #[wasm_bindgen(method, js_name = loaderStatus)]
    fn loader_status(this: &JsHost, o: u32, status: u32, error: &str);
    /// Asks for one frame; many asks in one frame are one frame.
    #[wasm_bindgen(method)]
    fn request(this: &JsHost);
    /// The view's device was lost: the view draws nothing more, and is made
    /// again if the page wants it.
    #[wasm_bindgen(method)]
    fn lost(this: &JsHost, message: &str);
}

fn get(from: &JsValue, name: &str) -> JsValue {
    Reflect::get(from, &JsValue::from_str(name)).unwrap_or(JsValue::UNDEFINED)
}
fn string(from: &JsValue, name: &str) -> String {
    get(from, name).as_string().unwrap_or_default()
}
fn int(from: &JsValue, name: &str) -> i32 {
    get(from, name).as_f64().unwrap_or(0.0) as i32
}
fn real(from: &JsValue, name: &str) -> f32 {
    get(from, name).as_f64().unwrap_or(0.0) as f32
}
fn index(from: &JsValue, name: &str) -> Option<usize> {
    get(from, name).as_f64().map(|n| n as usize)
}
fn yes(from: &JsValue, name: &str) -> bool {
    get(from, name).as_bool().unwrap_or(false)
}
fn bytes(from: &JsValue, name: &str) -> Vec<u8> {
    let got = get(from, name);
    if got.is_undefined() || got.is_null() {
        return Vec::new();
    }
    Uint8Array::new(&got).to_vec()
}
fn reals(from: &JsValue, name: &str) -> Vec<f32> {
    let got = get(from, name);
    if got.is_undefined() || got.is_null() {
        return Vec::new();
    }
    Float32Array::new(&got).to_vec()
}
fn list(from: &JsValue, name: &str) -> Vec<JsValue> {
    Array::from(&get(from, name)).iter().collect()
}
fn fixed<const N: usize>(v: Vec<f32>) -> Option<[f32; N]> {
    v.try_into().ok()
}
fn given(v: JsValue) -> Option<JsValue> {
    (!v.is_undefined() && !v.is_null()).then_some(v)
}
fn uniforms(from: &JsValue, name: &str) -> Vec<Uniform> {
    list(from, name)
        .iter()
        .map(|u| Uniform {
            name: string(u, "name"),
            kind: string(u, "type"),
            value: reals(u, "value"),
        })
        .collect()
}
fn textures(from: &JsValue) -> Vec<(String, u32)> {
    list(from, "textures")
        .iter()
        .map(|t| {
            (
                string(t, "name"),
                get(t, "texture").as_f64().map_or(u32::MAX, |h| h as u32),
            )
        })
        .collect()
}

impl Host for JsHost {
    fn chain(&self, o: u32) -> Vec<String> {
        JsHost::chain(self, o)
    }
    fn number(&self, o: u32, p: u32) -> Option<f64> {
        JsHost::number(self, o, p)
    }
    fn boolean(&self, o: u32, p: u32) -> Option<bool> {
        JsHost::boolean(self, o, p)
    }
    fn color(&self, o: u32, p: u32) -> Option<[f32; 4]> {
        fixed(JsHost::color(self, o, p)?)
    }
    fn vector(&self, o: u32, p: u32) -> Option<[f32; 3]> {
        fixed(JsHost::vector(self, o, p)?)
    }
    fn quaternion(&self, o: u32, p: u32) -> Option<[f32; 4]> {
        fixed(JsHost::quaternion(self, o, p)?)
    }
    fn url(&self, o: u32, p: u32) -> Option<String> {
        JsHost::url(self, o, p)
    }
    fn object(&self, o: u32, p: u32) -> Option<u32> {
        JsHost::object(self, o, p)
    }
    fn objects(&self, o: u32, p: u32) -> Vec<u32> {
        JsHost::objects(self, o, p)
    }
    fn slots(&self, o: u32, p: u32) -> Vec<u32> {
        JsHost::slots(self, o, p)
    }
    fn authored(&self, o: u32, p: u32) -> bool {
        JsHost::authored(self, o, p)
    }
    fn matrices(&self, o: u32, p: u32) -> Vec<f32> {
        JsHost::matrices(self, o, p)
    }
    fn picture_id(&self, o: u32) -> Option<u32> {
        JsHost::picture_id(self, o)
    }
    fn picture(&self, o: u32) -> Option<Picture> {
        let p = given(JsHost::picture(self, o))?;
        Some(Picture {
            width: int(&p, "width") as u32,
            height: int(&p, "height") as u32,
            depth: int(&p, "depth") as u32,
            opaque: yes(&p, "opaque"),
            format: get(&p, "format").as_f64().map(|f| f as i32),
            pixels: bytes(&p, "pixels"),
            baked: given(get(&p, "baked")).map(|levels| {
                js_sys::Array::from(&levels)
                    .iter()
                    .map(|level| js_sys::Uint8Array::new(&level).to_vec())
                    .collect()
            }),
        })
    }
    fn geometry_id(&self, o: u32) -> Option<u32> {
        JsHost::geometry_id(self, o)
    }
    fn geometry(&self, o: u32) -> Option<Shape> {
        let g = given(JsHost::geometry(self, o))?;
        let (min, max) = (reals(&g, "min"), reals(&g, "max"));
        Some(Shape {
            vertices: bytes(&g, "vertices"),
            indices: bytes(&g, "indices"),
            stride: int(&g, "stride") as u32,
            attributes: list(&g, "attributes")
                .iter()
                .map(|a| {
                    [
                        int(a, "semantic") as u32,
                        int(a, "offset") as u32,
                        int(a, "componentType") as u32,
                    ]
                })
                .collect(),
            primitive: int(&g, "primitive") as u32,
            bounds: fixed::<3>(min).zip(fixed::<3>(max)),
            subsets: list(&g, "subsets")
                .iter()
                .map(|p| {
                    let corner = |name| {
                        let [x, y, z] = fixed::<3>(reals(p, name))?;
                        Some(Vec3::new(x, y, z))
                    };
                    Subset {
                        offset: index(p, "offset").unwrap_or(0),
                        count: index(p, "count").unwrap_or(0),
                        // A box of no size says nothing of where it is.
                        bounds: corner("min").zip(corner("max")).filter(|(a, b)| a != b),
                    }
                })
                .collect(),
        })
    }
    fn table_id(&self, o: u32) -> Option<u32> {
        JsHost::table_id(self, o)
    }
    fn table(&self, o: u32) -> Option<Table> {
        let t = given(JsHost::table(self, o))?;
        Some(Table {
            count: index(&t, "count"),
            transparent: yes(&t, "sheer"),
            sorted: yes(&t, "sorted"),
        })
    }
    fn table_data(&self, o: u32) -> Vec<f32> {
        // `data` is a Float32Array: a copy into wasm's memory is all it takes.
        get(&JsHost::table(self, o), "data")
            .unchecked_into::<Float32Array>()
            .to_vec()
    }
    fn snippets(&self, o: u32) -> Option<Snippets> {
        let s = given(JsHost::snippets(self, o))?;
        Some(Snippets {
            vertex: string(&s, "vertex"),
            fragment: string(&s, "fragment"),
            shaded: yes(&s, "shaded"),
            uniforms: uniforms(&s, "uniforms"),
            textures: textures(&s),
            source_blend: int(&s, "sourceBlend"),
            destination_blend: int(&s, "destinationBlend"),
            source_alpha_blend: int(&s, "sourceAlphaBlend"),
            destination_alpha_blend: int(&s, "destinationAlphaBlend"),
            depth_draw: int(&s, "depthDraw"),
            cull_mode: int(&s, "cullMode"),
        })
    }
    fn passes(&self, o: u32) -> Option<Passes> {
        let e = given(JsHost::passes(self, o))?;
        Some(Passes {
            uniforms: uniforms(&e, "uniforms"),
            textures: textures(&e),
            buffers: list(&e, "buffers")
                .iter()
                .map(|b| PassBuffer {
                    name: string(b, "name"),
                    format: int(b, "format"),
                    scale: real(b, "scale"),
                    filter: int(b, "filter"),
                    wrap: int(b, "wrap"),
                })
                .collect(),
            passes: list(&e, "passes")
                .iter()
                .map(|p| PassShaders {
                    vertex: string(p, "vertex"),
                    fragment: string(p, "fragment"),
                    set: uniforms(p, "set"),
                    reads: list(p, "reads")
                        .iter()
                        .map(|r| (string(r, "sampler"), int(r, "buffer") as usize))
                        .collect(),
                    input: index(p, "input"),
                    output: index(p, "output"),
                    leaves: int(p, "leaves"),
                })
                .collect(),
        })
    }
    fn arrivals(&self, o: u32) {
        JsHost::arrivals(self, o);
    }
    fn load(&self, url: &str, kept: &Rc<Kept>) {
        let (kept, host, owned) = (kept.clone(), self.clone(), url.to_owned());
        ljos_3d::obj::load_any(
            &BrowserFetch(self.clone()),
            &(),
            url,
            move |_: &(), read| {
                match read {
                    Ok(asset) => kept.arrive(&owned, Asked::Ready(Arc::new(asset))),
                    Err(error) => {
                        let error = error.to_string();
                        JsHost::report(&host, &owned, &error);
                        kept.arrive(&owned, Asked::Failed(error));
                    }
                }
                host.arrived();
            },
        );
    }
    fn load_mesh(&self, url: &str, kept: &Rc<Kept>) {
        let (kept, host, owned) = (kept.clone(), self.clone(), url.to_owned());
        BrowserFetch(self.clone()).fetch(
            &(),
            url,
            Box::new(move |_: &(), got| {
                let read = got.and_then(|bytes| MeshFile::read(&bytes).map_err(|e| e.to_string()));
                match read {
                    Ok(file) => kept.arrive_mesh(&owned, Asked::Ready(Arc::new(file))),
                    Err(error) => {
                        JsHost::report(&host, &owned, &error);
                        kept.arrive_mesh(&owned, Asked::Failed(error));
                    }
                }
                host.arrived();
            }),
        );
    }

    fn report(&self, about: &str, error: &str) {
        JsHost::report(self, about, error);
    }
    fn loader_status(&self, loader: u32, status: LoaderStatus, error: &str) {
        JsHost::loader_status(self, loader, status as u32, error);
    }
}

/// What a rejection says: a guard's refusal and a network's failure are
/// `Error`s, an HTTP error is its status line.
fn rejection(e: &JsValue) -> String {
    e.as_string()
        .or_else(|| get(e, "message").as_string())
        .unwrap_or_else(|| "cannot be read".to_owned())
}

/// `ljos_3d`'s fetch over the browser's.
#[derive(Clone)]
struct BrowserFetch(JsHost);

impl Fetch for BrowserFetch {
    type Cx = ();
    fn fetch(&self, _cx: &(), url: &str, reply: Reply<()>) {
        let asked = self.0.fetched(url);
        spawn_local(async move {
            let got = JsFuture::from(asked)
                .await
                .map(|v| Uint8Array::new(&v).to_vec())
                .map_err(|e| rejection(&e));
            reply(&(), got);
        });
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error(message: &str);
}

/// The workspace builds with `panic = "abort"`, so without a hook a panic
/// reaches the page as a bare `unreachable` that names nothing.
#[wasm_bindgen(start)]
fn start() {
    std::panic::set_hook(Box::new(|info| console_error(&format!("View3D: {info}"))));
}

/// A device and the views that draw with it. A browser may lose a device at
/// any time (its GPU process or driver gave up); what is asked of one lost
/// fails, in Chrome with an exception thrown through the wasm that leaves
/// what it held borrowed, so a view on it asks nothing more of it.
struct Device {
    gpu: Gpu,
    lost: Cell<bool>,
    views: RefCell<Vec<(u32, JsHost)>>,
}

thread_local! {
    // A page has one device, where a device can draw on any canvas: until
    // it is lost, when the next view makes another.
    static GPU: RefCell<Option<Rc<Device>>> = const { RefCell::new(None) };
    // Each device by its number, which is what wgpu's callbacks may hold.
    static DEVICES: RefCell<Vec<(u32, std::rc::Weak<Device>)>> = const { RefCell::new(Vec::new()) };
    static NEXT: Cell<u32> = const { Cell::new(0) };
}

fn next() -> u32 {
    NEXT.with(|next| {
        let number = next.get();
        next.set(number.wrapping_add(1));
        number
    })
}

impl Device {
    fn new(gpu: Gpu) -> Rc<Device> {
        let device = Rc::new(Device {
            gpu,
            lost: Cell::new(false),
            views: RefCell::new(Vec::new()),
        });
        let number = next();
        DEVICES.with(|all| {
            let mut all = all.borrow_mut();
            all.retain(|(_, device)| device.strong_count() > 0);
            all.push((number, Rc::downgrade(&device)));
        });
        // Called where wgpu learns of it, which may be inside a call of the
        // view's own: the views are told after it returns.
        device
            .gpu
            .device()
            .set_device_lost_callback(move |_, message| lose(number, message));
        // wgpu's own handler on WebGL 2 panics, which aborts every view of
        // the page for one call it refused. Said instead, as on WebGPU.
        device
            .gpu
            .device()
            .on_uncaptured_error(Arc::new(|error: wgpu::Error| {
                console_error(&format!("View3D: {error}"))
            }));
        device
    }
}

fn lose(number: u32, message: String) {
    let Some(device) = DEVICES.with(|all| {
        all.borrow()
            .iter()
            .find(|(each, _)| *each == number)
            .and_then(|(_, device)| device.upgrade())
    }) else {
        return;
    };
    if device.lost.replace(true) {
        return;
    }
    GPU.with(|gpu| {
        let mut gpu = gpu.borrow_mut();
        if gpu
            .as_ref()
            .is_some_and(|shared| Rc::ptr_eq(shared, &device))
        {
            *gpu = None;
        }
    });
    spawn_local(async move {
        let views: Vec<JsHost> = device
            .views
            .borrow()
            .iter()
            .map(|(_, host)| host.clone())
            .collect();
        for host in views {
            host.lost(&message);
        }
    });
}

/// The members' names, in the order reads number them, so that the page
/// holds no list of its own and a read crosses as a number.
#[wasm_bindgen(js_name = propNames)]
pub fn prop_names() -> Vec<String> {
    Prop3d::ALL
        .iter()
        .map(|p| p.qml_name().to_owned())
        .collect()
}

/// One View3D's canvas.
#[wasm_bindgen]
pub struct View3d {
    host: JsHost,
    device: Rc<Device>,
    number: u32,
    kept: Rc<Kept>,
    view: RefCell<SurfaceView<'static>>,
    slot: RefCell<SceneSlot>,
    // The scene it has is drawn again at the next frame, though nothing in
    // it changed: its size did, or its picture is first wanted after it drew.
    again: Cell<bool>,
    pieces: Cell<u32>,
}

#[wasm_bindgen]
impl View3d {
    /// A view over `canvas`, at the canvas's size.
    ///
    /// WebGPU shares one device among the page's canvases. WebGL2's context
    /// belongs to one canvas, so there each has a device of its own.
    pub async fn create(canvas: HtmlCanvasElement, host: JsHost) -> Result<View3d, JsError> {
        let (w, h) = (canvas.width(), canvas.height());
        let target = wgpu::SurfaceTarget::Canvas(canvas);
        let shared = GPU
            .with(|gpu| gpu.borrow().clone())
            .filter(|device| !device.lost.get());
        let (view, device) = match shared {
            Some(device) => (
                SurfaceView::with_gpu(&device.gpu, target, w, h),
                Some(device),
            ),
            None => (SurfaceView::new(target, w, h).await, None),
        };
        let view = view.map_err(|e| JsError::new(&e.to_string()))?;
        let device = device.unwrap_or_else(|| {
            let device = Device::new(view.gpu().clone());
            if view.backend() == wgpu::Backend::BrowserWebGpu {
                GPU.with(|gpu| *gpu.borrow_mut() = Some(device.clone()));
            }
            device
        });
        let number = next();
        device.views.borrow_mut().push((number, host.clone()));
        let mut slot = SceneSlot::new();
        let told = host.clone();
        slot.on_change(move || told.request());
        Ok(View3d {
            host,
            device,
            number,
            kept: Rc::new(Kept::default()),
            view: RefCell::new(view),
            slot: RefCell::new(slot),
            again: Cell::new(false),
            pieces: Cell::new(0),
        })
    }

    /// "webgpu", "webgl2", or the backend's name elsewhere.
    pub fn backend(&self) -> String {
        match self.view.borrow().backend() {
            wgpu::Backend::BrowserWebGpu => "webgpu".into(),
            wgpu::Backend::Gl => "webgl2".into(),
            other => format!("{other:?}"),
        }
    }

    /// Reads the scene from the page, asking again only of the objects in
    /// `changed` and of the members in `members`, and reading again only the
    /// pieces of the view that read them: the page follows each object's
    /// reads on its own and says which changed. `members` are triples of an
    /// object, a kind (in the order of [`crate::answers::Kind`]) and a member;
    /// one of a kind not known is taken as its whole object changed.
    /// Returns the handles no longer in the scene, which the page lets go of.
    pub fn build(&self, changed: Vec<u32>, members: Vec<u32>) -> Vec<u32> {
        let mut whole = changed;
        let mut said = Vec::with_capacity(members.len() / 3);
        for triple in members.chunks_exact(3) {
            match crate::answers::said_key(triple[1], triple[2]) {
                Some(key) => said.push((triple[0], key)),
                None => whole.push(triple[0]),
            }
        }
        let built = crate::source::build_changed(&self.host, &self.kept, &whole, &said);
        self.pieces
            .set(u32::try_from(built.read).unwrap_or(u32::MAX));
        // The scene is patched, and knows whether it changed: no compare.
        self.slot.borrow_mut().offer_shared(built.scene);
        built.gone
    }

    /// How many pieces of the view the last build read.
    pub fn pieces(&self) -> u32 {
        self.pieces.get()
    }

    pub fn resize(&self, width: u32, height: u32) {
        if self.device.lost.get() {
            return;
        }
        self.view.borrow_mut().resize(width, height);
        self.again.set(true);
        self.host.request();
    }

    /// Draws the scene it has again at the next frame: a picture first
    /// asked for after the view was drawn is drawn again to be kept, as the
    /// surface gave the last one to the page.
    pub fn again(&self) {
        if self.device.lost.get() {
            return;
        }
        self.view.borrow_mut().draw_again();
        self.again.set(true);
        self.host.request();
    }

    /// Draws what changed; returns whether it presented.
    pub fn frame(&self) -> bool {
        if self.device.lost.get() {
            return false;
        }
        let slot = self.slot.borrow();
        let scene = if self.again.replace(false) {
            slot.current()
        } else {
            slot.take()
        };
        scene.is_some_and(|scene| self.view.borrow_mut().draw(&scene))
    }
}

impl Drop for View3d {
    fn drop(&mut self) {
        self.device
            .views
            .borrow_mut()
            .retain(|(number, _)| *number != self.number);
    }
}
