//! What the page's objects call things, in `ljos_3d`'s terms.

use ljos_3d::qml::enums::{alpha, antialiasing, background, cull, tiling};
use ljos_3d::qml::{Prop3d, Type3d};

/// `Type3d` has no list of its own; a type's place here is its bit in what
/// an object is.
pub const TYPES: [Type3d; 26] = [
    Type3d::View3D,
    Type3d::Object3D,
    Type3d::Node,
    Type3d::Model,
    Type3d::Camera,
    Type3d::PerspectiveCamera,
    Type3d::OrthographicCamera,
    Type3d::Light,
    Type3d::DirectionalLight,
    Type3d::PointLight,
    Type3d::SpotLight,
    Type3d::Material,
    Type3d::DefaultMaterial,
    Type3d::PrincipledMaterial,
    Type3d::CustomMaterial,
    Type3d::Texture,
    Type3d::Geometry,
    Type3d::SceneEnvironment,
    Type3d::ExtendedSceneEnvironment,
    Type3d::Effect,
    Type3d::Instancing,
    Type3d::Skin,
    Type3d::Skeleton,
    Type3d::Joint,
    Type3d::RuntimeLoader,
    Type3d::InfiniteGrid,
];

/// The bit of `ty` in [`bits`].
pub fn bit(ty: Type3d) -> u32 {
    let at = TYPES.iter().position(|t| *t == ty).unwrap_or(0);
    1 << at
}

/// What an object is, from the QML names of the types it derives through.
pub fn bits<'a>(chain: impl IntoIterator<Item = &'a str>) -> u32 {
    chain
        .into_iter()
        .filter_map(|name| TYPES.iter().find(|t| t.qml_name() == name))
        .fold(0, |all, ty| all | bit(*ty))
}

/// The number `ljos_3d` holds for the enumeration `p` where the page holds
/// Qt's. The mapping's enumerations number their own values from zero for
/// several members, so a graph giving Qt's numbers says something else;
/// `None` for a number the member does not have.
pub fn enumeration(p: Prop3d, qt: i32) -> Option<i32> {
    use Prop3d as P;
    Some(match (p, qt) {
        (P::CullMode, 1) => cull::BACK,
        (P::CullMode, 2) => cull::FRONT,
        (P::CullMode, 3) => cull::NONE,
        (P::CullMode, _) => return None,
        (P::TilingModeHorizontal | P::TilingModeVertical, 1) => tiling::CLAMP_TO_EDGE,
        (P::TilingModeHorizontal | P::TilingModeVertical, 2) => tiling::MIRRORED_REPEAT,
        (P::TilingModeHorizontal | P::TilingModeVertical, 3) => tiling::REPEAT,
        (P::TilingModeHorizontal | P::TilingModeVertical, _) => return None,
        (P::AlphaMode, 0) => alpha::DEFAULT,
        (P::AlphaMode, 1) => alpha::MASK,
        (P::AlphaMode, 2) => alpha::BLEND,
        (P::AlphaMode, 3) => alpha::OPAQUE,
        (P::AlphaMode, _) => return None,
        // Unspecified leaves the picture as it was, and each picture here
        // starts from nothing.
        (P::BackgroundMode, 0 | 1) => background::TRANSPARENT,
        (P::BackgroundMode, 2) => background::COLOR,
        (P::BackgroundMode, 3) => background::SKY_BOX,
        (P::BackgroundMode, 4) => background::SKY_BOX_CUBE_MAP,
        (P::BackgroundMode, _) => return None,
        (P::AntialiasingQuality, 2) => antialiasing::MEDIUM,
        (P::AntialiasingQuality, 4) => antialiasing::HIGH,
        (P::AntialiasingQuality, 8) => antialiasing::VERY_HIGH,
        (P::AntialiasingQuality, _) => return None,
        _ => qt,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_camera_is_what_its_chain_names() {
        let is = bits(["Object3D", "Node", "Camera", "PerspectiveCamera", "MyFile"]);
        assert_ne!(is & bit(Type3d::Camera), 0);
        assert_ne!(is & bit(Type3d::PerspectiveCamera), 0);
        assert_eq!(is & bit(Type3d::Model), 0);
    }

    #[test]
    fn every_type_has_its_own_bit() {
        let all = TYPES.iter().fold(0u32, |a, t| a | bit(*t));
        assert_eq!(all.count_ones() as usize, TYPES.len());
    }

    #[test]
    fn qt_numbers_become_the_mappings() {
        assert_eq!(enumeration(Prop3d::CullMode, 3), Some(cull::NONE));
        assert_eq!(enumeration(Prop3d::CullMode, 0), None);
        assert_eq!(
            enumeration(Prop3d::TilingModeVertical, 3),
            Some(tiling::REPEAT)
        );
        assert_eq!(enumeration(Prop3d::AlphaMode, 1), Some(alpha::MASK));
        assert_eq!(enumeration(Prop3d::BackgroundMode, 2), Some(background::COLOR));
        assert_eq!(
            enumeration(Prop3d::AntialiasingQuality, 8),
            Some(antialiasing::VERY_HIGH)
        );
        assert_eq!(enumeration(Prop3d::Lighting, 1), Some(1));
    }
}
