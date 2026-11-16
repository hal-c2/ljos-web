#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float time;
    vec2 pointer;
    float palette;
    vec2 resolution;
} ubuf;

// Light on water, worked out per pixel: a handful of travelling waves
// interfere, one of them centred where the pointer is, and the sums
// are coloured through one of three ramps, each dark (0-2) or light
// (3-5) for the reader's colour scheme. Written for this page —
// the build turns it into what the browser draws with, with no
// shader compiler of anyone else's in the way.
vec3 ramp(float v) {
    int which = int(ubuf.palette + 0.5);
    vec3 deep = vec3(0.05, 0.07, 0.12);
    vec3 mid = vec3(0.16, 0.30, 0.50);
    vec3 crest = vec3(0.98, 0.72, 0.34);
    if (which == 1) {
        deep = vec3(0.08, 0.05, 0.10);
        mid = vec3(0.45, 0.22, 0.38);
        crest = vec3(0.99, 0.83, 0.55);
    } else if (which == 2) {
        deep = vec3(0.04, 0.09, 0.08);
        mid = vec3(0.14, 0.45, 0.38);
        crest = vec3(0.92, 0.97, 0.78);
    } else if (which == 3) {
        // The light ones keep the darkest of what a ramp shows pale, so
        // the dark words drawn over them stay readable.
        deep = vec3(0.94, 0.95, 0.97);
        mid = vec3(0.66, 0.78, 0.92);
        crest = vec3(0.99, 0.82, 0.52);
    } else if (which == 4) {
        deep = vec3(0.97, 0.94, 0.96);
        mid = vec3(0.86, 0.68, 0.80);
        crest = vec3(0.99, 0.88, 0.66);
    } else if (which == 5) {
        deep = vec3(0.94, 0.97, 0.95);
        mid = vec3(0.62, 0.85, 0.78);
        crest = vec3(0.96, 0.99, 0.84);
    }
    vec3 colour = mix(deep, mid, smoothstep(0.15, 0.62, v));
    return mix(colour, crest, smoothstep(0.62, 0.97, v));
}

void main() {
    vec2 uv = qt_TexCoord0;
    float aspect = ubuf.resolution.x / max(ubuf.resolution.y, 1.0);
    vec2 p = vec2(uv.x * aspect, uv.y);
    vec2 hand = vec2(ubuf.pointer.x * aspect, ubuf.pointer.y);
    float t = ubuf.time;

    float waves = 0.0;
    waves += sin(p.x * 6.0 + t * 1.0) * 0.5;
    waves += sin(p.y * 8.0 - t * 1.5) * 0.5;
    waves += sin((p.x + p.y) * 5.0 + t * 0.5) * 0.5;
    waves += sin(length(p - vec2(aspect * 0.72, 0.30)) * 14.0 - t * 2.0) * 0.6;
    float stirred = sin(length(p - hand) * 18.0 - t * 2.0) * exp(-length(p - hand) * 1.6);
    float v = clamp(0.5 + (waves * 0.22 + stirred * 0.55), 0.0, 1.0);

    float glow = exp(-length(p - hand) * 2.6) * 0.25;
    vec3 colour = ramp(v) + glow * vec3(1.0, 0.80, 0.45);
    fragColor = vec4(colour, 1.0) * ubuf.qt_Opacity;
}
