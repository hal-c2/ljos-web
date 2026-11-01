#version 440

// What OpenGL 4.4 lets a shader say and OpenGL ES 3.0 does not, as Qt's own
// examples say it. Each thing that is not as it should be paints red.
layout(location = 0) in vec2 place;
layout(location = 1) in Between {
    flat int counted;
    vec2 moved, twice[2];
} got;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float along;
    vec4 wanted;
};

layout(binding = 1) uniform sampler2D source;
layout(binding = 2) uniform usampler2D notRead;

#ifdef NOT_HERE
this is not read
#endif

const float half_ = 1.0 / 2;
const highp int sized = 4;
const float weights[3] = {0.25, 0.5, 0.25};
const vec2 corners[2] = {{1.0, 2.0}, vec2(3.0)};
const mat2 turned = {{0.0, 1.0}, {1.0, 0.0}};
float begun = along * 2;

float twice(float value) {
    return value * 2;
}

void main() {
    const vec4 read = texture(source, place);
    const float worked = along + half_;
    const vec2 pair = vec2(0, worked);
    float whole = 1;
    float room[sized];
    vec2 local = {0.5, 1.5};
    bool right = abs(begun - 0.5) < 0.001 && abs(worked - 0.75) < 0.001 && pair.x == 0 && whole == 1 && twice(1) == 2
        && room.length() == 4 && weights[1] == 0.5 && corners[0].y == 2.0 && corners[1].x == 3.0 && turned[0][1] == 1.0 && local.y == 1.5
        && got.counted == 3 && got.moved.x == 1.0 && got.twice[1].y == 2.0;
    fragColor = (right && read.a > 0 ? wanted : vec4(1.0, 0.0, 0.0, 1.0)) * qt_Opacity;
}
