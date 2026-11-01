#version 440

// Beside a `.qsb` that is not one: its zlib stream is cut short. Lime.
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
};

void main() {
    fragColor = vec4(0.0, 1.0, 0.0, 1.0) * qt_Opacity;
}
