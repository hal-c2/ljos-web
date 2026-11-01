//! The desktop's picture of a scene. `ljos render` knows only QML's types, and
//! these are the application's, so it makes its own picture with the same
//! `ljos::render` that command uses. usage: picture <scene> <w> <h> <out.png>
//! where `scene` is the name of a file in `qml/`.

use anyhow::Context as _;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [scene, width, height, out] = args.as_slice() else {
        anyhow::bail!("usage: picture <scene> <width> <height> <out.png>");
    };
    let picture = ljos::render::Picture::new(width.parse()?, height.parse()?).settle(100);
    ljos::render::set_fonts(ljos::render::Fonts::Bundled);
    let engine = ljos::App::new("picture")
        .register(wasm_gauge::register)
        .qml_dir("qml", scene.as_str())
        .context("the scene")?
        .build_engine();
    picture.install(&engine);
    let root = engine
        .create_from_url(scene, None, Vec::new())
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    let png = picture
        .png(&engine, root)
        .map_err(|e| anyhow::anyhow!("{e}"))?;
    std::fs::write(out, png)?;
    Ok(())
}
