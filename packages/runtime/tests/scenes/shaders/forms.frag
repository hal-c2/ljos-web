#version 440

// What OpenGL 4.4 lets a shader say and OpenGL ES 3.0 does not, as Qt's own
// examples say it. Each thing that is not as it should be paints red.
layout(location = 0) in vec2 place;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float along;
    vec4 wanted;
};

layout(binding = 1) uniform sampler2D source;

#ifdef NOT_HERE
this is not read
#endif

const float half_ = 1.0 / 2;
float begun = along * 2;

float twice(float value) {
    return value * 2;
}

void main() {
    const vec4 read = texture(source, place);
    const float worked = along + half_;
    const vec2 pair = vec2(0, worked);
    float whole = 1;
    bool right = abs(begun - 0.5) < 0.001 && abs(worked - 0.75) < 0.001 && pair.x == 0 && whole == 1 && twice(1) == 2;
    fragColor = (right && read.a > 0 ? wanted : vec4(1.0, 0.0, 0.0, 1.0)) * qt_Opacity;
}
