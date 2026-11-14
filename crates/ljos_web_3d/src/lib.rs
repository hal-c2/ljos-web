//! View3D for ljos-web: the page's QtQuick3D objects, read through
//! [`ljos_3d::qml::build`], drawn by `ljos_3d`'s renderer into the view's
//! canvas. The objects stay in the page's runtime; `source` is the
//! `SceneSource` over them and `web` the wasm boundary.

pub mod answers;
pub mod names;
pub mod source;
#[cfg(target_arch = "wasm32")]
mod web;
