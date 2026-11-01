# Native pictures

`lit.png` is `tests/scenes/wgpu_reference.qml` drawn by Ljós on the desktop, with
the same `ljos_3d` renderer the wgpu path of View3D builds to wasm. To make it
again, at the ljos-ui rev `Cargo.toml` pins, with the scene as `Main.qml` of an
empty directory:

    ljos render . --size 400x300 --out lit.png

A difference here means the wasm build or its mapping differs from the desktop,
so the picture is only remade when the renderer at the pin changes what it draws.
