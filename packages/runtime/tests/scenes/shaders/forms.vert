#version 440

layout(location = 0) in vec4 qt_Vertex;
layout(location = 1) in vec2 qt_MultiTexCoord0;
layout(location = 0) out vec2 place;
layout(location = 1) out Between {
    flat int counted;
    vec2 moved, twice[2];
} sent;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float along;
    vec4 wanted;
};

out gl_PerVertex { vec4 gl_Position; };

void main() {
    place = qt_MultiTexCoord0;
    sent.counted = 3;
    sent.moved = vec2(1.0);
    sent.twice[1] = vec2(2.0);
    gl_Position = qt_Matrix * qt_Vertex;
}
