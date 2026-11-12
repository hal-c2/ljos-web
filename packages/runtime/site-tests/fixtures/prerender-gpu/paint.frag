#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec4 tint;
} ubuf;

// The tint, everywhere: enough shader for the effect to paint with.
void main() {
    fragColor = ubuf.tint * ubuf.qt_Opacity;
}
