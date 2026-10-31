//! The wasm boundary: the page's host object, its fetch, and one view's
//! canvas. Nothing here runs unless the page asked: a build when what it
//! read changed, a frame when the build drew differently or the size did.

use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::sync::Arc;

use js_sys::{Array, Float32Array, Reflect, Uint8Array};
use ljos_3d::fetch::{Fetch, Reply};
use ljos_3d::qml::{self, Prop3d};
use ljos_3d::{Gpu, SceneSlot, SurfaceView};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::{JsFuture, spawn_local};
use web_sys::HtmlCanvasElement;

use crate::source::{
    Asked, Host, Kept, PassBuffer, PassShaders, Passes, Picture, Shape, Snippets, Source, Table, Uniform,
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
    fn arrivals(this: &JsHost);
    #[wasm_bindgen(method)]
    fn arrived(this: &JsHost);
    #[wasm_bindgen(method)]
    fn fetched(this: &JsHost, url: &str) -> js_sys::Promise;
    #[wasm_bindgen(method)]
    fn report(this: &JsHost, url: &str, error: &str);
    /// Asks for one frame; many asks in one frame are one frame.
    #[wasm_bindgen(method)]
    fn request(this: &JsHost);
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
        .map(|t| (string(t, "name"), get(t, "texture").as_f64().map_or(u32::MAX, |h| h as u32)))
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
            opaque: yes(&p, "opaque"),
            pixels: bytes(&p, "pixels"),
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
        })
    }
    fn table_id(&self, o: u32) -> Option<u32> {
        JsHost::table_id(self, o)
    }
    fn table(&self, o: u32) -> Option<Table> {
        let t = given(JsHost::table(self, o))?;
        Some(Table {
            data: reals(&t, "data"),
            count: index(&t, "count"),
            transparent: yes(&t, "sheer"),
            sorted: yes(&t, "sorted"),
        })
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
                })
                .collect(),
        })
    }
    fn arrivals(&self) {
        JsHost::arrivals(self);
    }
    fn load(&self, url: &str, kept: &Rc<Kept>) {
        let (kept, host, owned) = (kept.clone(), self.clone(), url.to_owned());
        ljos_3d::obj::load_any(&BrowserFetch(self.clone()), &(), url, move |_: &(), read| {
            match read {
                Ok(asset) => kept.arrive(&owned, Asked::Ready(Arc::new(asset))),
                Err(error) => {
                    host.report(&owned, &error.to_string());
                    kept.arrive(&owned, Asked::Failed);
                }
            }
            host.arrived();
        });
    }
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
                .map_err(|e| e.as_string().unwrap_or_else(|| "cannot be read".to_owned()));
            reply(&(), got);
        });
    }
}

thread_local! {
    // A page has one device, where a device can draw on any canvas.
    static GPU: RefCell<Option<Gpu>> = const { RefCell::new(None) };
}

/// The members' names, in the order reads number them, so that the page
/// holds no list of its own and a read crosses as a number.
#[wasm_bindgen(js_name = propNames)]
pub fn prop_names() -> Vec<String> {
    Prop3d::ALL.iter().map(|p| p.qml_name().to_owned()).collect()
}

/// One View3D's canvas.
#[wasm_bindgen]
pub struct View3d {
    host: JsHost,
    kept: Rc<Kept>,
    view: RefCell<SurfaceView<'static>>,
    slot: RefCell<SceneSlot>,
    resized: Cell<bool>,
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
        let shared = GPU.with(|gpu| gpu.borrow().clone());
        let view = match shared {
            Some(gpu) => SurfaceView::with_gpu(&gpu, target, w, h),
            None => SurfaceView::new(target, w, h).await,
        }
        .map_err(|e| JsError::new(&e.to_string()))?;
        if view.backend() == wgpu::Backend::BrowserWebGpu {
            GPU.with(|gpu| *gpu.borrow_mut() = Some(view.gpu().clone()));
        }
        let mut slot = SceneSlot::new();
        let told = host.clone();
        slot.on_change(move || told.request());
        Ok(View3d {
            host,
            kept: Rc::new(Kept::default()),
            view: RefCell::new(view),
            slot: RefCell::new(slot),
            resized: Cell::new(false),
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

    /// Reads the scene from the page. The page calls this in the effect
    /// that tracks what it reads, so that it runs again when any of that
    /// changes and at no other time.
    pub fn build(&self) {
        let source = Source {
            host: &self.host,
            kept: &self.kept,
        };
        let built = qml::build(&source, crate::source::VIEW);
        self.slot.borrow_mut().offer(built.scene);
    }

    pub fn forget(&self, handles: Vec<u32>) {
        self.kept.forget(&handles);
    }

    pub fn resize(&self, width: u32, height: u32) {
        self.view.borrow_mut().resize(width, height);
        self.resized.set(true);
        self.host.request();
    }

    /// Draws what changed; returns whether it presented.
    pub fn frame(&self) -> bool {
        let slot = self.slot.borrow();
        let scene = if self.resized.replace(false) {
            slot.current()
        } else {
            slot.take()
        };
        scene.is_some_and(|scene| self.view.borrow_mut().draw(&scene))
    }
}
