#version 440

// A block's instance is the business of the stage that names one: this stage
// names none, what it writes is the members, and the other stage names it.
layout(location = 0) in vec4 qt_Vertex;
layout(location = 0) out Named {
    vec2 first;
    float second;
};
layout(location = 2) out Unnamed {
    float third;
} here;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
};

struct Holding { float first; };

out gl_PerVertex { vec4 gl_Position; };

float kept(float first) {
    return first;
}

void main() {
    Holding holding = Holding(1.0);
    first = vec2(holding.first, kept(2.0));
    second = 3.0;
    here.third = 4.0;
    gl_Position = qt_Matrix * qt_Vertex;
}
