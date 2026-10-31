import QtQuick
import QtQuick3D.Helpers.impl

// Written from Qt's documentation of the type. What brings the picture to the
// screen is the renderer's (`Helpers/impl`), and is told through
// `MainSceneEffect`. Depth of field, glow, lens flare, the lookup table and
// screen-space light and reflections are held and not yet drawn: that gap is
// the renderer's, and the same with Qt's QML of this type.
SceneEffectEnvironment {
    id: sceneEnvironment

    enum GlowBlendMode {
        Additive,
        Screen,
        SoftLight,
        Replace
    }
    enum GlowLevel {
        One = 1,
        Two = 2,
        Three = 4,
        Four = 8,
        Five = 16,
        Six = 32,
        Seven = 64
    }

    property alias exposure: sceneEffect.exposure
    property alias whitePoint: sceneEffect.white
    property alias ditheringEnabled: sceneEffect.ditheringEnabled
    property alias sharpnessAmount: sceneEffect.sharpnessAmount
    property alias fxaaEnabled: sceneEffect.applyFXAA
    property alias colorAdjustmentsEnabled: sceneEffect.colorAdjustmentsEnabled
    property alias adjustmentBrightness: sceneEffect.adjustmentBrightness
    property alias adjustmentContrast: sceneEffect.adjustmentContrast
    property alias adjustmentSaturation: sceneEffect.adjustmentSaturation
    property alias vignetteEnabled: sceneEffect.vignetteEnabled
    property alias vignetteStrength: sceneEffect.vignetteStrength
    property alias vignetteColor: sceneEffect.vignetteColor
    property alias vignetteRadius: sceneEffect.vignetteRadius

    property bool depthOfFieldEnabled: false
    property real depthOfFieldFocusDistance: 600
    property real depthOfFieldFocusRange: 100
    property real depthOfFieldBlurAmount: 4

    property bool glowEnabled: false
    property bool glowQualityHigh: false
    property bool glowUseBicubicUpscale: false
    property real glowStrength: 1
    property real glowIntensity: 1
    property real glowBloom: 0
    property real glowHDRMaximumValue: 12
    property real glowHDRMinimumValue: 1
    property real glowHDRScale: 2
    property int glowLevel: 1
    // SoftLight. The type's own enum is not yet there for its own default.
    property int glowBlendMode: 2

    property bool lutEnabled: false
    property int lutSize: 16
    property real lutFilterAlpha: 1
    property var lutTexture: null

    property bool lensFlareEnabled: false
    property real lensFlareBloomScale: 10
    property real lensFlareBloomBias: 0.95
    property real lensFlareGhostDispersal: 0.5
    property int lensFlareGhostCount: 4
    property real lensFlareHaloWidth: 0.25
    property real lensFlareStretchToAspect: 0.5
    property real lensFlareDistortion: 5
    property real lensFlareBlurAmount: 3
    property bool lensFlareApplyDirtTexture: false
    property bool lensFlareApplyStarburstTexture: false
    property vector3d lensFlareCameraDirection: Qt.vector3d(0, 0, -1)
    property var lensFlareLensColorTexture: null
    property var lensFlareLensDirtTexture: null
    property var lensFlareLensStarburstTexture: null

    property bool ssrEnabled: false
    property int ssrMaxSteps: 256
    property real ssrThickness: 20

    property bool ssgiEnabled: false
    property real ssgiBufferSizeFactor: 0.5
    property real ssgiHitThickness: 0.5
    property real ssgiIndirectLightBoost: 4
    property bool ssgiIndirectLightEnabled: true
    property int ssgiSampleCount: 4
    property real ssgiSampleRadius: 0.1
    property bool ssgiSimulatedBounceEnabled: false
    property real ssgiSimulatedBounceFactor: 0.5
    property int ssgiSliceCount: 4

    MainSceneEffect {
        id: sceneEffect
        environment: sceneEnvironment

        property int tonemapMode: sceneEnvironment.tonemapMode
        property real exposure: 1.0
        property real white: 1.0
        property bool applyFXAA: false
        property bool ditheringEnabled: false
        property real sharpnessAmount: 0.0
        property bool colorAdjustmentsEnabled: false
        property real adjustmentBrightness: 1.0
        property real adjustmentContrast: 1.0
        property real adjustmentSaturation: 1.0
        property bool vignetteEnabled: false
        property real vignetteStrength: 15
        property color vignetteColor: "gray"
        property real vignetteRadius: 0.35
    }
}
