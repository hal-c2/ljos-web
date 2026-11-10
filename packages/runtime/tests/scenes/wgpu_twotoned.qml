// One sprite system in two views at once, each with its own surroundings:
// what the first view's tone mapping does to the sprite is not the second's.
import QtQuick
import QtQuick3D
import QtQuick3D.Particles3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"

    Node {
        id: shared

        OrthographicCamera {
            id: cam
            z: 500
        }

        ParticleSystem3D {
            running: false
            time: 100

            SpriteParticle3D {
                id: sprite
                color: "#404040"
                fadeInDuration: 0
                fadeOutDuration: 0
                maxAmount: 4
                billboard: true
            }
            ParticleEmitter3D {
                particle: sprite
                particleScale: 80
                lifeSpan: 10000
                emitBursts: EmitBurst3D { amount: 1 }
            }
        }
    }

    View3D {
        width: 200
        height: 300
        importScene: shared
        camera: cam
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#000000"
            tonemapMode: SceneEnvironment.TonemapModeNone
        }
    }
    View3D {
        x: 200
        width: 200
        height: 300
        importScene: shared
        camera: cam
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#000000"
            tonemapMode: SceneEnvironment.TonemapModeLinear
        }
    }
}
