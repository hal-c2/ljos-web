#version 440

layout(location = 0) in Named {
    vec2 first;
    float second;
} got;
layout(location = 2) in Unnamed {
    float third;
};
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
};

void main() {
    bool right = abs(got.first.x - 1.0) < 0.001 && abs(got.first.y - 2.0) < 0.001 && abs(got.second - 3.0) < 0.001 && abs(third - 4.0) < 0.001;
    fragColor = (right ? vec4(0.0, 1.0, 0.0, 1.0) : vec4(1.0, 0.0, 0.0, 1.0)) * qt_Opacity;
}
