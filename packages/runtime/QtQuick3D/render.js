// Draws a scene in space, as a View3D found it, with WebGL.
//
// Every view is drawn by one context, of which a page may have few, and what
// was drawn is handed to the view's own canvas, as a ShaderEffect's is.
//
// What is drawn is lit as Qt lights it: each light's share of a surface's
// colour by how far the surface faces it, the shine of it by Qt's own sums,
// and the whole brought from linear light to the screen's by Qt's tone
// mapping. What nothing is seen through is drawn first, nearest first; what
// something is, after, farthest first; and between them what reads the
// picture of what is behind it.
//
// A scene may be lit by its surroundings besides its lights: a picture of
// everything round it (a light probe), which is folded into a cube and that
// blurred as Qt blurs it, once for each step of roughness and once for what
// a rough surface takes from all round. The same cube is what is behind the
// scene where its background is a sky box.
//
// Under an ExtendedSceneEnvironment a scene is drawn in linear light, into
// a picture whose numbers are fractions, and brought to the screen after:
// which a browser that cannot draw into such a picture does not do, and
// there the scene is drawn as under a SceneEnvironment.
//
// A surface that is lit is in the scene's fog, where it has one. One that
// is not lit, and what is behind the scene, are not, as in Qt.
//
// A shape drawn by a table of instances is drawn once for each entry, by
// one call: where each is and what colour it is times are the entry's.
//
// What a CustomMaterial draws is drawn by a program of its own, made of its
// shaders and this file's (`shaders.js`), and put over what is there as the
// material says. One that reads what is behind it has that drawn for it
// first: the scene without what something is seen through, in linear light,
// and how far each place of it is.
//
// A model that takes reflections and is in the box of a reflection probe
// mirrors the scene as it is seen from the probe: which is drawn for it
// first, through each side of a cube, as it is lit and in linear light, and
// the cube blurred for what is rough, as that of a light probe is but over
// fewer ways. Such a model takes of the cube what it would have taken of
// the light probe, and of that nothing.
//
// An environment's effects are run over the picture once the scene is
// drawn, one after another: the scene is drawn in linear light for them, as
// under an ExtendedSceneEnvironment, each pass of each draws a rectangle
// over the whole of what it draws into with the effect's shaders, and what
// the last leaves is brought to the screen. Where a browser cannot draw
// into a picture of fractions they are not run.
//
// Not here: a probe that is a canvas is folded once, as it is when first
// drawn, and a material's own probe is not looked at. What nodes draw by
// themselves is not in what a reflection probe sees. Of what an effect may
// read besides the picture, only how far each place of it is: which is how
// far what nothing is seen through is. Nothing says how far it is before
// all else is drawn: a material that is to (`OpaquePrePassDepthDraw`) says
// it as one that is not, and an environment's `depthPrePassEnabled` does
// nothing.
import * as math from "./math.js";
import { Triangles } from "./mesh.js";
import { customised, effected } from "./shaders.js";

// As many lights as Qt lets a surface have.
const LIGHTS = 15;
const NONE = [0, 0, 0, 0];

// Linear light and the screen's, by Qt's own sums, and Qt's ways of bringing
// the one to the other.
const TONES = `
uniform int u_tonemap;

vec3 toLinear(vec3 c) {
    return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878);
}

vec3 toScreen(vec3 c) {
    vec3 s1 = sqrt(c);
    vec3 s2 = sqrt(s1);
    vec3 s3 = sqrt(s2);
    return 0.585122381 * s1 + 0.783140355 * s2 - 0.368262736 * s3;
}

vec3 filmic(vec3 c) {
    return ((c * (0.15 * c + 0.05) + 0.004) / (c * (0.15 * c + 0.5) + 0.06)) - 0.02 / 0.3;
}

vec3 tonemap(vec3 c) {
    if (u_tonemap == 1) return toScreen(c);
    if (u_tonemap == 2) return toScreen(clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0));
    if (u_tonemap == 3) {
        c = max(vec3(0.0), c - vec3(0.004));
        return (c * (6.2 * c + 0.5)) / (c * (6.2 * c + 1.7) + 0.06);
    }
    if (u_tonemap == 4) return toScreen(filmic(c * 2.0) / filmic(vec3(11.2)));
    return c;
}
`;

const VERTEX = `#version 300 es
layout(location = 0) in vec3 attr_pos;
layout(location = 1) in vec3 attr_norm;
layout(location = 2) in vec2 attr_uv0;
layout(location = 3) in vec4 attr_color;
layout(location = 4) in vec4 attr_joints;
layout(location = 5) in vec4 attr_weights;
layout(location = 6) in vec2 attr_uv1;
layout(location = 7) in vec3 attr_textan;
layout(location = 8) in vec3 attr_binormal;
layout(location = 9) in vec4 inst_row0;
layout(location = 10) in vec4 inst_row1;
layout(location = 11) in vec4 inst_row2;
layout(location = 12) in vec4 inst_color;
uniform mat4 u_all;
uniform mat4 u_world;
uniform mat3 u_facing;
uniform bool u_instanced;
uniform mat4 u_above;
uniform float u_point;
uniform bool u_skinned;
uniform highp sampler2D u_bones;
uniform int u_morphs;
uniform ivec4 u_morphAt;
uniform float u_morphBy[8];
uniform highp sampler2DArray u_morphed;
out vec3 v_position;
out vec3 v_normal;
out vec2 v_uv;
out vec2 v_uv1;
out vec3 v_tangent;
out vec3 v_binormal;
out vec4 v_color;

// One of the matrices of the joints: the one that moves a corner at an even
// place, the one that turns the way it faces at the odd one after it.
mat4 bone(int index) {
    int width = textureSize(u_bones, 0).x;
    int at = index * 4;
    mat4 m;
    for (int column = 0; column < 4; column++) {
        int x = (at + column) % width;
        m[column] = texelFetch(u_bones, ivec2(x, (at + column - x) / width), 0);
    }
    return m;
}

// What a layer of the targets has for this corner: the layers are as wide
// as high, a corner after a corner along the rows.
vec3 target(int layer) {
    int width = textureSize(u_morphed, 0).x;
    int x = gl_VertexID % width;
    return texelFetch(u_morphed, ivec3(x, (gl_VertexID - x) / width, layer), 0).xyz;
}

// Something of a corner, gone towards what each target has for it by as
// much as the target weighs: a target is the whole of what it has, not how
// far that is from the mesh's own, and each is gone towards from the mesh's
// own. The layer is that of the first target, and none below zero.
vec3 morphed(vec3 from, int first) {
    if (first < 0) return from;
    vec3 to = from;
    for (int index = 0; index < u_morphs; index++) to += u_morphBy[index] * (target(first + index) - from);
    return to;
}

void main() {
    vec4 position = vec4(attr_pos, 1.0);
    vec3 facing = attr_norm;
    vec3 tangent = attr_textan;
    vec3 binormal = attr_binormal;
    // A shape goes towards its targets before its joints bend it.
    if (u_morphs > 0) {
        position.xyz = morphed(position.xyz, u_morphAt.x);
        facing = morphed(facing, u_morphAt.y);
        tangent = morphed(tangent, u_morphAt.z);
        binormal = morphed(binormal, u_morphAt.w);
    }
    // A corner no joint has a hold of stays where the mesh has it.
    if (u_skinned && attr_weights != vec4(0.0)) {
        ivec4 joints = ivec4(attr_joints);
        vec4 w = attr_weights;
        mat4 moved = bone(joints.x * 2) * w.x + bone(joints.y * 2) * w.y + bone(joints.z * 2) * w.z + bone(joints.w * 2) * w.w;
        position = moved * position;
        facing = (mat3(bone(joints.x * 2 + 1)) * w.x + mat3(bone(joints.y * 2 + 1)) * w.y + mat3(bone(joints.z * 2 + 1)) * w.z + mat3(bone(joints.w * 2 + 1)) * w.w) * facing;
        tangent = mat3(moved) * tangent;
        binormal = mat3(moved) * binormal;
    }
    mat4 world = u_world;
    mat3 turn = u_facing;
    mat4 all = u_all;
    v_color = attr_color;
    // One of many drawn by a table is where its entry puts it, within
    // where the table is, and its colour is times the entry's.
    if (u_instanced) {
        world = u_above * transpose(mat4(inst_row0, inst_row1, inst_row2, vec4(0.0, 0.0, 0.0, 1.0))) * u_world;
        turn = transpose(inverse(mat3(world)));
        all = u_all * world;
        v_color *= inst_color;
    }
    v_position = (world * position).xyz;
    // The way a corner faces is made one long here, before it is spread
    // over the triangle, as Qt makes it.
    v_normal = normalize(turn * facing);
    v_tangent = mat3(world) * tangent;
    v_binormal = mat3(world) * binormal;
    v_uv = attr_uv0;
    v_uv1 = attr_uv1;
    gl_Position = all * position;
    gl_PointSize = u_point;
}
`;

const FRAGMENT = `#version 300 es
precision highp float;
const int LIGHTS = ${LIGHTS};
const float PI = 3.14159265359;
in vec3 v_position;
in vec3 v_normal;
in vec2 v_uv;
in vec2 v_uv1;
in vec3 v_tangent;
in vec3 v_binormal;
in vec4 v_color;
uniform vec4 u_color;
uniform float u_opacity;
uniform vec3 u_emissive;
uniform bool u_lit;
uniform bool u_framed;
uniform bool u_inverted;
uniform float u_bump;
uniform float u_occlusion;
uniform bool u_colors;
uniform bool u_sided;
uniform bool u_principled;
uniform bool u_solid;
uniform float u_cutoff;
// The pictures a material reads: its colour's, the way it faces, how rough
// and how much a metal it is, how much of the light reaches it, what it
// gives off, how much of it is there, and how much of a clear coat is over
// it and how rough that is. Of each: whether there is one (and with two,
// that it is in linear light), which channel of it is read and which of a
// corner's two places in a picture it is read at, and how that place is
// moved.
const int BASE = 0;
const int NORMAL = 1;
const int ROUGHNESS = 2;
const int METALNESS = 3;
const int OCCLUSION = 4;
const int EMISSIVE = 5;
const int OPACITY = 6;
const int BUMP = 7;
const int COAT = 8;
const int COAT_ROUGHNESS = 9;
const int COAT_NORMAL = 10;
const int MAPS = 11;
uniform sampler2D u_map;
uniform sampler2D u_normalMap;
uniform sampler2D u_roughnessMap;
uniform sampler2D u_metalnessMap;
uniform sampler2D u_occlusionMap;
uniform sampler2D u_emissiveMap;
uniform sampler2D u_opacityMap;
uniform sampler2D u_coatMap;
uniform sampler2D u_coatRoughnessMap;
uniform sampler2D u_coatNormalMap;
uniform float u_coat;
uniform float u_coatRoughness;
// How far a picture turns the coat, and how what the coat gives back grows
// as it is turned from the eye: the power of it, and a scale and a bias.
uniform float u_coatBump;
uniform vec3 u_coatEdge;
uniform vec3 u_tint;
uniform bool u_shiny;
uniform bool u_glint;
uniform vec3 u_reads[MAPS];
uniform mat3 u_places[MAPS];
uniform float u_specular;
uniform float u_shine;
uniform float u_roughness;
uniform float u_metalness;
uniform float u_ior;
uniform float u_fresnel;
uniform vec3 u_eye;
uniform vec3 u_ambient;
uniform int u_count;
uniform vec3 u_lightColor[LIGHTS];
uniform vec4 u_lightPlace[LIGHTS];
uniform vec3 u_lightWay[LIGHTS];
uniform vec3 u_lightFade[LIGHTS];
uniform vec2 u_lightCone[LIGHTS];
// The surroundings, folded and blurred: whether there are any, the last of
// the cube's levels, how far below the horizon they are dimmed (-1 is not
// at all) and how bright they are; and how they are turned.
uniform samplerCube u_probe;
uniform vec4 u_probing;
uniform mat3 u_probeTurn;
// What is round a reflection probe, as a cube like that of the
// surroundings: whether there is one, and whether what is read of it is
// put right for where the surface is; where the probe looked from, and the
// corners of its box.
uniform samplerCube u_mirror;
uniform vec2 u_mirroring;
uniform vec3 u_mirrorAt;
uniform vec3 u_mirrorMin;
uniform vec3 u_mirrorMax;
// How what a surface gives back of its surroundings as it is turned from
// the eye is scaled and shifted.
uniform vec2 u_edge;
uniform vec4 u_fog;
uniform vec4 u_fogDepth;
uniform vec4 u_fogHeight;
uniform vec2 u_fogLet;
uniform float u_far;
out vec4 fragColor;
${TONES}
// What is read of the surroundings is brought under one before the tone
// mapping, where there is any.
vec3 exposed(vec3 c) {
    return u_tonemap == 0 ? c : vec3(1.0) - exp(-c * u_probing.w);
}

float horizon(vec3 way) {
    float low = u_probing.z;
    if (low <= -1.0) return 1.0;
    float middle = 0.5 + 0.5 * low;
    return mix(1.0, smoothstep(middle * 0.25, middle + 0.25, way.y), low + 1.0);
}

// What the surroundings light a surface with from all round: the last
// level of the cube.
vec3 around(vec3 N) {
    vec3 way = u_probeTurn * N;
    return exposed(textureLod(u_probe, way, u_probing.y).rgb * horizon(way));
}

// What a DefaultMaterial gives back of them, the rougher from the further
// down the levels.
vec3 glossy(vec3 N, vec3 V, float rough) {
    float sigma = smoothstep(0.0, 1.0, clamp(rough, 0.0001, 1.0));
    vec3 way = u_probeTurn * reflect(-V, N);
    float NdotL = clamp(dot(way, N), 0.0, 0.999995);
    float k = sigma * 0.31830988618;
    float seen = clamp((NdotL / (NdotL * (1.0 - k) + k) + (1.0 - k * k)) * 0.5, 0.0, 1.0);
    return seen * exposed(textureLod(u_probe, way, sigma * (u_probing.y - 1.0)).rgb * horizon(way));
}

// And what a PrincipledMaterial does, which gives back F of them.
vec3 mirrored(vec3 N, vec3 V, vec3 F, float roughness) {
    float level = clamp(roughness * 5.0, 0.0, u_probing.y - 1.0);
    vec3 way = u_probeTurn * normalize(reflect(-V, N));
    vec3 read = textureLod(u_probe, way, level).rgb * horizon(way);
    vec4 r = roughness * vec4(-1.0, -0.0275, -0.572, 0.022) + vec4(1.0, 0.0425, 1.04, -0.04);
    float a004 = min(r.x * r.x, exp2(-9.28 * clamp(dot(N, V), 0.0, 1.0))) * r.x + r.y;
    vec2 brdf = vec2(-1.04, 1.04) * a004 + r.zw;
    return exposed(read * (F * brdf.x + brdf.y));
}

// The way the cube of a reflection probe is read for what lies a way from
// a surface: that way, or, put right, the way from where the probe looked
// to where a line that way from the surface leaves the probe's box.
vec3 righted(vec3 way) {
    if (u_mirroring.y < 0.5) return way;
    vec3 furthest = max((u_mirrorMax - v_position) / way, (u_mirrorMin - v_position) / way);
    return v_position + way * min(min(furthest.x, furthest.y), furthest.z) - u_mirrorAt;
}

// What a surface takes of that cube, as it would of the surroundings': from
// all round, and what each of the two kinds of material gives back. It is
// neither dimmed below a horizon nor brought under one.
vec3 aroundHere(vec3 N) {
    return textureLod(u_mirror, righted(N), 5.0).rgb;
}

vec3 glossyHere(vec3 N, vec3 V, float rough) {
    float sigma = smoothstep(0.0, 1.0, clamp(rough, 0.0001, 1.0));
    vec3 way = reflect(-V, N);
    float NdotL = clamp(dot(way, N), 0.0, 0.999995);
    float k = sigma * 0.31830988618;
    float seen = clamp((NdotL / (NdotL * (1.0 - k) + k) + (1.0 - k * k)) * 0.5, 0.0, 1.0);
    return seen * textureLod(u_mirror, righted(way), sigma * 4.0).rgb;
}

vec3 mirroredHere(vec3 N, vec3 V, vec3 F, float roughness) {
    vec3 read = textureLod(u_mirror, righted(normalize(reflect(-V, N))), clamp(roughness * 5.0, 0.0, 4.0)).rgb;
    vec4 r = roughness * vec4(-1.0, -0.0275, -0.572, 0.022) + vec4(1.0, 0.0425, 1.04, -0.04);
    float a004 = min(r.x * r.x, exp2(-9.28 * clamp(dot(N, V), 0.0, 1.0))) * r.x + r.y;
    vec2 brdf = vec2(-1.04, 1.04) * a004 + r.zw;
    return read * (F * brdf.x + brdf.y);
}

bool has(int which) {
    return u_reads[which].x > 0.5;
}

// Whether a picture is in linear light already, as one of fractions is.
// Qt takes it so where it is a PrincipledMaterial's colour, and nowhere
// else: a DefaultMaterial's colour and any material's glow are read as a
// screen shows them whatever they are.
bool plain(int which) {
    return u_principled && u_reads[which].x > 1.5;
}

vec2 placed(int which) {
    return (u_places[which] * vec3(u_reads[which].z > 0.5 ? v_uv1 : v_uv, 1.0)).xy;
}

float channel(sampler2D map, int which) {
    return texture(map, placed(which))[int(u_reads[which].y)];
}

float average(vec4 read) {
    return (read.r + read.g + read.b) / 3.0;
}

float schlick(float value) {
    float n = 1.0 - value;
    float n2 = n * n;
    return n2 * n2 * n;
}

float ggx2cos(float cosine, float alpha) {
    float k = 0.5 * alpha;
    return 0.5 / (cosine * (1.0 - k) + k);
}

// How much of a light a rough surface gives back all round.
float burley(vec3 N, vec3 L, vec3 V, float roughness) {
    vec3 H = normalize(V + L);
    float LdotH = max(0.0, dot(L, H));
    float NdotV = max(0.0, dot(N, V));
    float NdotL = max(0.0, dot(N, L));
    float at90 = 0.5 + 2.0 * LdotH * LdotH * roughness;
    return mix(1.0, at90, schlick(NdotL)) * mix(1.0, at90, schlick(NdotV)) * NdotL;
}

// And how much it gives back as the light's own shine.
vec3 ggx(vec3 N, vec3 L, vec3 V, vec3 f0, float roughness) {
    float NdotL = max(0.0, dot(N, L));
    float NdotV = max(0.0, dot(N, V));
    vec3 H = normalize(V + L);
    float LdotH = max(0.0, dot(L, H));
    float NdotH = max(0.001, dot(N, H));
    float alpha = clamp(roughness * roughness, 0.001, 1.0);
    float alpha2 = alpha * alpha;
    float d = 1.0 + (alpha2 - 1.0) * NdotH * NdotH;
    float spread = alpha2 / (PI * d * d);
    float seen = ggx2cos(NdotL, alpha) * ggx2cos(NdotV, alpha);
    vec3 F = mix(vec3(schlick(LdotH)), vec3(1.0), f0);
    return NdotL * spread * F * seen;
}

// From nothing at one end to all at the other, slowly at both, whichever of
// the ends is the greater.
float eased(float from, float to, float at) {
    float t = clamp((at - from) / (to - from), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

// Fog, by Qt's own sums: more of it the further a surface is from the eye,
// and the lower it lies, in place of what the surface gives back. Where it
// lets light through, what is brighter than the fog shows in it, the less
// the further off. How thick the fog is and the curve of the height are not
// heeded for the height, as Qt does not heed them.
void fogged(inout vec3 given, inout vec3 shine, inout vec3 diffuse) {
    float amount = 0.0;
    vec3 colour = u_fog.rgb;
    if (u_fogDepth.w > 0.5) {
        float far = eased(u_fogDepth.x, u_fogDepth.y > 0.0 ? u_fogDepth.y : u_far, length(u_eye - v_position));
        amount = pow(far, u_fogDepth.z) * u_fog.a;
        if (u_fogLet.y > 0.5) colour = mix(max(given + shine + diffuse, colour), colour, pow(far, u_fogLet.x));
    }
    if (u_fogHeight.w > 0.5) amount = max(amount, eased(u_fogHeight.x, u_fogHeight.y, v_position.y));
    given = given * (1.0 - amount) + colour * amount;
    shine *= 1.0 - amount;
    diffuse *= 1.0 - amount;
}

void main() {
    vec4 base = u_color;
    if (u_colors) base *= v_color;
    if (has(BASE)) {
        vec4 picture = texture(u_map, placed(BASE));
        base *= vec4(plain(BASE) ? picture.rgb : toLinear(picture.rgb), picture.a);
    }
    // How much of the colour is there is all of it where the material says
    // nothing is seen through it; how much of the material is, is its own.
    if (u_cutoff >= 0.0 && base.a < u_cutoff) discard;
    if (u_solid) base.a = 1.0;
    float alpha = base.a * u_opacity;
    if (has(OPACITY)) {
        float there = channel(u_opacityMap, OPACITY);
        alpha *= u_inverted ? 1.0 - there : there;
    }
    vec3 sum = base.rgb;
    if (u_lit) {
        vec3 N = normalize(v_normal);
        float side = u_sided && !gl_FrontFacing ? -1.0 : 1.0;
        // The frame a way of facing read from a picture is in: the mesh's
        // own, or where it has none, the way the first of the pictures
        // lies across the surface.
        int turned = has(BUMP) ? BUMP : has(NORMAL) ? NORMAL : has(COAT_NORMAL) ? COAT_NORMAL : -1;
        vec3 T = vec3(0.0);
        vec3 B = vec3(0.0);
        if (turned >= 0) {
            if (u_framed) {
                T = normalize(v_tangent);
                B = normalize(v_binormal);
            } else {
                vec2 at = placed(turned);
                vec2 across = dFdx(at);
                vec2 down = dFdy(at);
                T = (down.y * dFdx(v_position) - across.y * dFdy(v_position)) / (across.x * down.y - across.y * down.x);
                T = normalize(T - dot(N, T) * N);
                B = cross(N, T);
            }
            T *= side;
            B *= side;
        }
        N *= side;
        // A clear coat faces as the shape does, or as its own picture says,
        // whatever a picture says of what is under it.
        vec3 coated = N;
        if (has(COAT_NORMAL)) {
            vec3 way = texture(u_coatNormalMap, placed(COAT_NORMAL)).xyz * 2.0 - vec3(1.0);
            coated = normalize(mat3(T, B, N) * (way * vec3(u_coatBump, u_coatBump, 1.0)));
        }
        if (has(BUMP)) {
            // A picture of heights: how it rises to the right and upward
            // is how far the surface leans from them.
            vec2 at = placed(BUMP);
            vec2 unit = 1.0 / vec2(textureSize(u_normalMap, 0));
            float here = average(texture(u_normalMap, at));
            float du = average(texture(u_normalMap, vec2(at.x + unit.x, at.y))) - here;
            float dv = average(texture(u_normalMap, vec2(at.x, at.y + unit.y))) - here;
            vec3 n = normalize(vec3(-u_bump * du, -u_bump * dv, 1.0));
            N = normalize(N + n.x * T + n.y * B + n.z * N);
        } else if (has(NORMAL)) {
            vec3 way = texture(u_normalMap, placed(NORMAL)).xyz * 2.0 - vec3(1.0);
            N = normalize(mat3(T, B, N) * (way * vec3(u_bump, u_bump, 1.0)));
        }
        float roughness = u_roughness;
        if (has(ROUGHNESS)) roughness *= channel(u_roughnessMap, ROUGHNESS);
        float metalness = u_metalness;
        if (has(METALNESS)) metalness = clamp(metalness * channel(u_metalnessMap, METALNESS), 0.0, 1.0);
        float reached = 1.0;
        if (has(OCCLUSION)) reached = channel(u_occlusionMap, OCCLUSION) * u_occlusion;
        vec3 given = u_emissive;
        if (has(EMISSIVE)) {
            vec3 picture = texture(u_emissiveMap, placed(EMISSIVE)).rgb;
            given *= toLinear(picture);
        }
        float coat = u_coat;
        if (has(COAT)) coat *= channel(u_coatMap, COAT);
        float coatRoughness = u_coatRoughness;
        if (has(COAT_ROUGHNESS)) coatRoughness = clamp(coatRoughness * channel(u_coatRoughnessMap, COAT_ROUGHNESS), 0.0, 1.0);
        vec3 coating = vec3(0.0);
        vec3 V = normalize(u_eye - v_position);
        vec3 diffuse = u_ambient * (1.0 - metalness) * base.rgb;
        vec3 shine = vec3(0.0);
        float bent = ((u_ior - 1.0) * (u_ior - 1.0)) / ((u_ior + 1.0) * (u_ior + 1.0));
        vec3 f0 = vec3(bent) * (1.0 - metalness) + base.rgb * metalness;
        bool coats = u_principled && u_coat > 0.0;
        // What a surface that is no metal gives back of a light can take
        // the surface's own colour.
        vec3 tint = mix(vec3(1.0), u_tint, 1.0 - metalness);
        float NdotV = clamp(dot(N, V), 0.0, 1.0);
        float edge = u_fresnel == 0.0 ? 1.0 : pow(1.0 - NdotV, u_fresnel);
        vec3 turning = f0 + (max(vec3(1.0 - roughness), f0) - f0) * edge;
        // How much a surface gives back as shine: a DefaultMaterial in its
        // own colour, a PrincipledMaterial all of it where it is metal. The
        // lights heed the first, and of the second only whether there is
        // any; the surroundings heed both. What a graph draws gives a light
        // back in the light's colour.
        vec3 amount = u_principled ? vec3(metalness + u_specular * (1.0 - metalness)) * clamp(u_edge.y + u_edge.x * turning, 0.0, 1.0) : (u_glint ? vec3(1.0) : base.rgb) * u_specular * turning;
        for (int index = 0; index < u_count; index++) {
            vec3 L = -u_lightWay[index];
            float fade = 1.0;
            float kind = u_lightPlace[index].w;
            if (kind > 0.5) {
                vec3 to = u_lightPlace[index].xyz - v_position;
                float far = max(length(to), 0.000001);
                L = to / far;
                vec3 by = u_lightFade[index];
                fade = 1.0 / (by.x + by.y * far + by.z * far * far);
                if (kind > 1.5) {
                    vec2 cone = u_lightCone[index];
                    fade *= smoothstep(cone.x, max(cone.y, cone.x + 0.0001), dot(-L, u_lightWay[index]));
                }
            }
            vec3 light = u_lightColor[index] * fade;
            if (u_principled) {
                // Qt takes what is metal out of the light here, and out of
                // the sum of them once more below.
                diffuse += base.rgb * light * (1.0 - metalness) * burley(N, L, V, roughness);
                if (u_shiny) {
                    shine += light * tint * ggx(N, L, V, f0, roughness);
                    if (coats) coating += light * ggx(coated, L, V, vec3(bent), coatRoughness);
                }
            } else {
                diffuse += base.rgb * light * max(0.0, dot(N, L));
                if (u_specular > 0.0) shine += light * amount * pow(max(0.0, dot(normalize(V + L), N)), u_shine);
            }
        }
        // What a light gives a surface all round is less where less of the
        // light reaches it.
        diffuse *= reached;
        if (u_mirroring.x > 0.5) {
            // What is round a reflection probe is in place of the
            // surroundings, and is not less where less light reaches.
            if (u_principled) {
                diffuse += base.rgb * (1.0 - amount) * aroundHere(N);
                shine += tint * mirroredHere(N, V, amount, roughness);
                if (coats) coating += mirroredHere(coated, V, vec3(bent), coatRoughness);
            } else {
                diffuse += base.rgb * aroundHere(N);
                shine += amount * u_tint * glossyHere(N, V, roughness);
            }
        } else if (u_probing.x > 0.5 && u_probing.w >= 0.005) {
            if (u_principled) {
                diffuse += base.rgb * (1.0 - amount) * around(N) * reached;
                shine += tint * mirrored(N, V, amount, roughness) * reached;
                if (coats) coating += mirrored(coated, V, vec3(bent), coatRoughness) * reached;
            } else {
                diffuse += base.rgb * around(N) * reached;
                shine += amount * u_tint * glossy(N, V, roughness) * reached;
            }
        }
        if (u_principled) diffuse *= 1.0 - metalness;
        if (u_fogDepth.w + u_fogHeight.w > 0.5) fogged(given, shine, diffuse);
        sum = diffuse + shine + given;
        // What is under a clear coat shows less the more the coat itself
        // gives back, which is more the further it is turned from the eye.
        if (coats) {
            float turn = clamp(pow(clamp(dot(coated, V), 0.0, 1.0), u_coatEdge.x), 0.0, 1.0);
            vec3 back = vec3(bent) + (vec3(1.0) - vec3(bent)) * (1.0 - turn);
            back = clamp(vec3(u_coatEdge.z) + u_coatEdge.y * back, 0.0, 1.0);
            sum = sum * (1.0 - coat * back) + coating * coat;
        }
    }
    fragColor = vec4(tonemap(sum) * alpha, alpha);
}
`;

const UNIFORMS = [
  "u_all",
  "u_world",
  "u_facing",
  "u_point",
  "u_skinned",
  "u_bones",
  "u_morphs",
  "u_morphAt",
  "u_morphBy",
  "u_morphed",
  "u_instanced",
  "u_above",
  "u_color",
  "u_opacity",
  "u_emissive",
  "u_lit",
  "u_framed",
  "u_inverted",
  "u_bump",
  "u_occlusion",
  "u_normalMap",
  "u_roughnessMap",
  "u_metalnessMap",
  "u_occlusionMap",
  "u_emissiveMap",
  "u_opacityMap",
  "u_coatMap",
  "u_coatRoughnessMap",
  "u_coatNormalMap",
  "u_coat",
  "u_coatRoughness",
  "u_coatBump",
  "u_coatEdge",
  "u_tint",
  "u_shiny",
  "u_glint",
  "u_reads",
  "u_places",
  "u_colors",
  "u_sided",
  "u_principled",
  "u_solid",
  "u_cutoff",
  "u_map",
  "u_specular",
  "u_shine",
  "u_roughness",
  "u_metalness",
  "u_ior",
  "u_fresnel",
  "u_eye",
  "u_ambient",
  "u_count",
  "u_lightColor",
  "u_lightPlace",
  "u_lightWay",
  "u_lightFade",
  "u_lightCone",
  "u_tonemap",
  "u_probe",
  "u_probing",
  "u_probeTurn",
  "u_mirror",
  "u_mirroring",
  "u_mirrorAt",
  "u_mirrorMin",
  "u_mirrorMax",
  "u_edge",
  "u_fog",
  "u_fogDepth",
  "u_fogHeight",
  "u_fogLet",
  "u_far",
];

// The three corners of a triangle that covers everything, which is all the
// passes that draw no shape draw.
const COVER = `#version 300 es
out vec2 v_at;
void main() {
    v_at = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
    gl_Position = vec4(v_at, 0.0, 1.0);
}
`;

// The way a place on one side of a cube lies from its middle, the sides in
// OpenGL's order.
const SIDE = `
uniform int u_side;
in vec2 v_at;

vec3 outward() {
    if (u_side == 0) return vec3(1.0, -v_at.y, -v_at.x);
    if (u_side == 1) return vec3(-1.0, -v_at.y, v_at.x);
    if (u_side == 2) return vec3(v_at.x, 1.0, v_at.y);
    if (u_side == 3) return vec3(v_at.x, -1.0, -v_at.y);
    if (u_side == 4) return vec3(v_at.x, -v_at.y, 1.0);
    return vec3(-v_at.x, -v_at.y, -1.0);
}
`;

// A picture of everything round a place, laid out as a map of the world is,
// onto one side of a cube: Qt's `environmentmap.frag`.
const FOLD = `#version 300 es
precision highp float;
uniform sampler2D u_from;
uniform bool u_screen;
out vec4 fragColor;
${SIDE}
void main() {
    vec3 v = normalize(outward());
    vec2 uv = vec2(atan(v.z, v.x), asin(v.y)) * vec2(0.1591, 0.3183) + 0.5;
    vec4 read = texture(u_from, uv);
    if (u_screen) read.rgb = read.rgb * (read.rgb * (read.rgb * 0.305306011 + 0.682171111) + 0.012522878);
    fragColor = read;
}
`;

// One side of one level of the blurred cube: what a surface of one
// roughness facing this way gives back of the surroundings, or what a rough
// one takes from all round, summed over as many ways as Qt sums it over.
// Qt's `environmentmapprefilter.frag`. A light probe is summed over a
// thousand ways and more at each level.
const WAYS = 1024;
const BLUR = `#version 300 es
precision highp float;
const float PI = 3.14159265359;
uniform samplerCube u_from;
uniform int u_ways;
uniform float u_roughness;
uniform float u_resolution;
uniform bool u_round;
out vec4 fragColor;
${SIDE}
float radicalInverse(uint bits) {
    bits = (bits << 16u) | (bits >> 16u);
    bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
    bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
    bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
    bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
    return float(bits) * 2.3283064365386963e-10;
}

mat3 frame(vec3 normal) {
    vec3 bitangent = vec3(0.0, 1.0, 0.0);
    float up = dot(normal, vec3(0.0, 1.0, 0.0));
    if (1.0 - abs(up) <= 0.0000001) bitangent = up > 0.0 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 0.0, -1.0);
    vec3 tangent = normalize(cross(bitangent, normal));
    return mat3(tangent, cross(normal, tangent), normal);
}

float spread(float NdotH, float roughness) {
    float a = NdotH * roughness;
    float k = roughness / (1.0 - NdotH * NdotH + a * a);
    return k * k * (1.0 / PI);
}

void main() {
    vec3 N = normalize(outward());
    // A surface that is not rough at all gives back what is the way it faces.
    if (!u_round && u_roughness == 0.0) {
        fragColor = vec4(textureLod(u_from, N, 0.0).rgb, 1.0);
        return;
    }
    mat3 about = frame(N);
    vec3 color = vec3(0.0);
    float weight = 0.0;
    for (int index = 0; index < u_ways; index++) {
        vec2 xi = vec2(float(index) / float(u_ways), radicalInverse(uint(index)));
        float cosine;
        float sine;
        float chance;
        if (u_round) {
            cosine = sqrt(1.0 - xi.y);
            sine = sqrt(xi.y);
            chance = cosine / PI;
        } else {
            float alpha = u_roughness * u_roughness;
            cosine = clamp(sqrt((1.0 - xi.y) / (1.0 + (alpha * alpha - 1.0) * xi.y)), 0.0, 1.0);
            sine = sqrt(1.0 - cosine * cosine);
            chance = spread(cosine, alpha) / 4.0;
        }
        float phi = 2.0 * PI * xi.x;
        vec3 H = about * normalize(vec3(sine * cos(phi), sine * sin(phi), cosine));
        float level = 0.5 * log2(6.0 * u_resolution * u_resolution / (float(u_ways) * chance));
        if (u_round) color += textureLod(u_from, H, level).rgb;
        else {
            vec3 L = normalize(reflect(-N, H));
            float NdotL = dot(N, L);
            if (NdotL > 0.0) {
                color += textureLod(u_from, L, level).rgb * NdotL;
                weight += NdotL;
            }
        }
    }
    fragColor = vec4(weight != 0.0 ? color / weight : color / float(u_ways), 1.0);
}
`;

// The same of what is round a reflection probe, which is made over while
// the scene moves, and so summed over few ways, the same ones for every
// place of a level (`few` finds them). Qt's `reflectionprobeprefilter.frag`.
const FEW = 16;
const GLOSS = `#version 300 es
precision highp float;
uniform samplerCube u_from;
uniform vec4 u_few[${FEW}];
uniform int u_count;
out vec4 fragColor;
${SIDE}
void main() {
    vec3 N = normalize(outward());
    vec3 tangent = normalize(cross(abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0), N));
    mat3 about = mat3(tangent, cross(N, tangent), N);
    vec3 color = vec3(0.0);
    float weight = 0.0;
    for (int index = 0; index < u_count; index++) {
        vec4 way = u_few[index];
        color += textureLod(u_from, about * way.xyz, way.w).rgb * way.z;
        weight += way.z;
    }
    fragColor = vec4(color / weight, 1.0);
}
`;

// The surroundings behind the scene: for each place in the view, what lies
// the way the eye looks through it. Qt's `skybox.vert` and `skybox.frag`.
const BEHIND = `#version 300 es
uniform mat4 u_back;
uniform mat3 u_eye;
uniform mat3 u_turn;
out vec3 v_way;
void main() {
    vec2 at = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
    gl_Position = vec4(at, 0.0, 1.0);
    v_way = u_turn * (u_eye * (u_back * gl_Position).xyz);
}
`;

const SKY = `#version 300 es
precision highp float;
uniform samplerCube u_from;
uniform float u_level;
uniform float u_exposure;
in vec3 v_way;
out vec4 fragColor;
${TONES}
void main() {
    vec3 read = textureLod(u_from, normalize(v_way), u_level).rgb;
    if (u_tonemap != 0) read = vec3(1.0) - exp(-read * u_exposure);
    fragColor = vec4(tonemap(read), 1.0);
}
`;

// What an ExtendedSceneEnvironment does to the picture of a scene drawn in
// linear light, as Qt's own shader for it does: how exposed it is, edges
// smoothed and the whole sharpened, dithering, the tone mapping with its
// white point, brightness, contrast and saturation, and the vignette.
const OVER = `#version 300 es
out vec2 v_at;
void main() {
    v_at = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(v_at * 2.0 - 1.0, 0.0, 1.0);
}
`;

const GRADE = `#version 300 es
precision highp float;
uniform sampler2D u_from;
uniform int u_tonemap;
uniform vec4 u_grade;
uniform bvec2 u_fine;
uniform vec4 u_adjust;
uniform vec4 u_vignette;
uniform vec2 u_vignetting;
in vec2 v_at;
out vec4 fragColor;

vec3 filmic(vec3 c, float white) {
    const float A = 0.22 * 2.0 * 2.0;
    const float B = 0.30 * 2.0;
    const float C = 0.10;
    const float D = 0.20;
    const float E = 0.01;
    const float F = 0.30;
    vec3 toned = ((c * (A * c + C * B) + D * E) / (c * (A * c + B) + D * F)) - E / F;
    float most = ((white * (A * white + C * B) + D * E) / (white * (A * white + B) + D * F)) - E / F;
    return clamp(toned / most, vec3(0.0), vec3(1.0));
}

vec3 aces(vec3 c, float white) {
    const float A = 2.51 * 0.85 * 0.85;
    const float B = 0.03 * 0.85;
    const float C = 2.43 * 0.85 * 0.85;
    const float D = 0.59 * 0.85;
    const float E = 0.14;
    vec3 toned = (c * (A * c + B)) / (c * (C * c + D) + E);
    float most = (white * (A * white + B)) / (white * (C * white + D) + E);
    return clamp(toned / most, vec3(0.0), vec3(1.0));
}

vec3 reinhard(vec3 c, float white) {
    return clamp((white * c + c) / (c * white + white), vec3(0.0), vec3(1.0));
}

vec3 toScreen(vec3 c) {
    return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, 12.92 * c, lessThan(c, vec3(0.0031308)));
}

vec3 tonemap(vec3 c, float white) {
    if (u_tonemap == 0) return c;
    if (u_tonemap == 1) return toScreen(clamp(c, vec3(0.0), vec3(1.0)));
    c = max(vec3(0.0), c);
    if (u_tonemap == 2) return toScreen(aces(c, white));
    if (u_tonemap == 3) return toScreen(reinhard(c, white));
    return toScreen(filmic(c, white));
}

vec3 smoothed(vec3 color, float exposure, vec2 pixel) {
    vec3 nw = textureLod(u_from, v_at + vec2(-1.0, -1.0) * pixel, 0.0).xyz * exposure;
    vec3 ne = textureLod(u_from, v_at + vec2(1.0, -1.0) * pixel, 0.0).xyz * exposure;
    vec3 sw = textureLod(u_from, v_at + vec2(-1.0, 1.0) * pixel, 0.0).xyz * exposure;
    vec3 se = textureLod(u_from, v_at + vec2(1.0, 1.0) * pixel, 0.0).xyz * exposure;
    vec3 luma = vec3(0.299, 0.587, 0.114);
    float lumaNW = dot(nw, luma);
    float lumaNE = dot(ne, luma);
    float lumaSW = dot(sw, luma);
    float lumaSE = dot(se, luma);
    float lumaM = dot(color, luma);
    float least = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
    float most = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
    vec2 way = vec2(-((lumaNW + lumaNE) - (lumaSW + lumaSE)), (lumaNW + lumaSW) - (lumaNE + lumaSE));
    float less = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 / 8.0), 1.0 / 128.0);
    way = min(vec2(8.0), max(vec2(-8.0), way / (min(abs(way.x), abs(way.y)) + less))) * pixel;
    vec3 near = 0.5 * exposure * (textureLod(u_from, v_at + way * (1.0 / 3.0 - 0.5), 0.0).xyz + textureLod(u_from, v_at + way * (2.0 / 3.0 - 0.5), 0.0).xyz);
    vec3 far = near * 0.5 + 0.25 * exposure * (textureLod(u_from, v_at + way * -0.5, 0.0).xyz + textureLod(u_from, v_at + way * 0.5, 0.0).xyz);
    float lumaFar = dot(far, luma);
    return lumaFar < least || lumaFar > most ? near : far;
}

vec3 sharpened(vec3 e, float exposure, float amount) {
    ivec2 here = ivec2(gl_FragCoord.xy);
    vec3 a = texelFetch(u_from, here + ivec2(-1, -1), 0).rgb * exposure;
    vec3 b = texelFetch(u_from, here + ivec2(0, -1), 0).rgb * exposure;
    vec3 c = texelFetch(u_from, here + ivec2(1, -1), 0).rgb * exposure;
    vec3 d = texelFetch(u_from, here + ivec2(-1, 0), 0).rgb * exposure;
    vec3 f = texelFetch(u_from, here + ivec2(1, 0), 0).rgb * exposure;
    vec3 g = texelFetch(u_from, here + ivec2(-1, 1), 0).rgb * exposure;
    vec3 h = texelFetch(u_from, here + ivec2(0, 1), 0).rgb * exposure;
    vec3 i = texelFetch(u_from, here + ivec2(1, 1), 0).rgb * exposure;
    vec3 least = min(min(min(d, e), min(f, b)), h);
    least += min(min(min(least, a), min(g, c)), i);
    vec3 most = max(max(max(d, e), max(f, b)), h);
    most += max(max(max(most, a), max(g, c)), i);
    vec3 room = inversesqrt(clamp(min(least, 2.0 - most) / most, 0.0, 1.0));
    vec3 weight = -vec3(1.0) / (room * (8.0 - 3.0 * amount));
    return max(vec3(0.0), ((b + d + f + h) * weight + e) / (1.0 + 4.0 * weight));
}

void main() {
    vec4 source = textureLod(u_from, v_at, 0.0);
    float exposure = u_grade.x;
    vec3 color = source.rgb * exposure;
    if (u_fine.x) color = smoothed(color, exposure, 1.0 / vec2(textureSize(u_from, 0)));
    if (u_grade.z >= 0.001) color = sharpened(color, exposure, u_grade.z);
    if (u_fine.y) color += (fract(vec3(dot(vec2(171.0, 231.0), gl_FragCoord.xy)) / vec3(103.0, 71.0, 97.0)) - 0.5) / 255.0;
    color = tonemap(color, u_grade.y);
    if (u_adjust.x > 0.5) {
        color = mix(vec3(0.0), color, u_adjust.y);
        color = mix(vec3(0.5), color, u_adjust.z);
        color = mix(vec3(dot(vec3(1.0), color) * 0.33333), color, u_adjust.w);
    }
    if (u_vignette.w > 0.5) {
        vec2 uv = v_at * (1.0 - v_at.yx);
        float edge = pow(uv.x * uv.y * u_vignetting.x, u_vignetting.y);
        color = mix(u_vignette.rgb * edge, color, edge);
    }
    fragColor = vec4(color, source.a);
}
`;

let surface;
let gl;
let at;
let shaded;
// Whether a picture of fractions can be drawn into, which the cube of a
// light probe is where it can.
let fractions = false;

// A program keeps what each of its uniforms was last given, and a place
// of a uniform belongs to one program: so what is the same as last time is
// not handed over again. Every uniform of this file's programs is given
// through these, or what they remember would be wrong. What was given is
// kept on the place itself, which is quicker to look up for each part of a
// scene of many than a map of places is.
function one(where, value) {
  if (where == null || where.given === value) return false;
  where.given = value;
  return true;
}
function many(where, values) {
  if (where == null) return false;
  const was = where.given;
  if (was?.length === values.length) {
    // A list and a run of numbers are each read in a loop of their own,
    // which then reads one kind of thing quickly.
    const index = Array.isArray(values) ? same(was, values) : run(was, values);
    if (index === values.length) return false;
    for (let at = index; at < values.length; at++) was[at] = values[at];
    return true;
  }
  where.given = Float64Array.from(values);
  return true;
}
// How many of `values` are what `was` holds, from the first.
function same(was, values) {
  let index = 0;
  while (index < values.length && was[index] === values[index]) index++;
  return index;
}
function run(was, values) {
  let index = 0;
  while (index < values.length && was[index] === values[index]) index++;
  return index;
}
const uniform = {
  f: (where, value) => one(where, value) && gl.uniform1f(where, value),
  i: (where, value) => one(where, value) && gl.uniform1i(where, value),
  fv: (where, values) => many(where, values) && gl.uniform1fv(where, values),
  f2: (where, values) => many(where, values) && gl.uniform2fv(where, values),
  f3: (where, values) => many(where, values) && gl.uniform3fv(where, values),
  f4: (where, values) => many(where, values) && gl.uniform4fv(where, values),
  i2: (where, values) => many(where, values) && gl.uniform2iv(where, values),
  i4: (where, values) => many(where, values) && gl.uniform4iv(where, values),
  m3: (where, values) => many(where, values) && gl.uniformMatrix3fv(where, false, values),
  m4: (where, values) => many(where, values) && gl.uniformMatrix4fv(where, false, values),
};

// A program, and where each of its uniforms is. Null when it does not link.
function program(vertex, fragment, names) {
  const made = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.warn(`View3D: ${gl.getShaderInfoLog(shader)}`);
    gl.attachShader(made, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(made);
  if (!gl.getProgramParameter(made, gl.LINK_STATUS)) {
    console.warn(`View3D: ${gl.getProgramInfoLog(made)}`);
    return null;
  }
  return { program: made, at: Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(made, name)])) };
}

// The context, and the program every shape is drawn with. Null when the
// browser has none to give.
function context() {
  if (gl !== undefined) return gl;
  surface = new OffscreenCanvas(1, 1);
  gl = surface.getContext("webgl2", { antialias: false, depth: true }) ?? null;
  if (!gl) return gl;
  shaded = program(VERTEX, FRAGMENT, UNIFORMS);
  if (!shaded) return (gl = null);
  fractions = Boolean(gl.getExtension("EXT_color_buffer_float"));
  gl.useProgram(shaded.program);
  at = shaded.at;
  uniform.i(at.u_map, 0);
  uniform.i(at.u_bones, 1);
  uniform.i(at.u_morphed, MORPHS);
  uniform.i(at.u_probe, PROBE);
  uniform.i(at.u_mirror, MIRROR);
  SAMPLERS.forEach((name, index) => name && uniform.i(at[name], UNITS[index]));
  // A cube there is always, for a program that could read one: of nothing,
  // where the scene has no surroundings, or nothing mirrors by a probe.
  nothing = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + PROBE);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, nothing);
  for (let side = 0; side < 6; side++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + side, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.activeTexture(gl.TEXTURE0 + MIRROR);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, nothing);
  gl.activeTexture(gl.TEXTURE0);
  // A picture's first row is its bottom one to a mesh, as it is to Qt.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  // What a mesh says nothing of: it faces the eye, and is white.
  gl.vertexAttrib3f(1, 0, 0, 1);
  gl.vertexAttrib2f(2, 0, 0);
  gl.vertexAttrib4f(3, 1, 1, 1, 1);
  gl.vertexAttrib4f(4, 0, 0, 0, 0);
  gl.vertexAttrib4f(5, 0, 0, 0, 0);
  gl.vertexAttrib2f(6, 0, 0);
  gl.vertexAttrib3f(7, 1, 0, 0);
  gl.vertexAttrib3f(8, 0, 1, 0);
  gl.vertexAttrib4f(13, 0, 0, 0, 0);
  return gl;
}

// What a number of a mesh is to OpenGL, by Qt's number for its kind.
const KINDS = { 1: 0x1401, 2: 0x1400, 3: 0x1403, 4: 0x1402, 5: 0x1405, 6: 0x1404, 9: 0x140b, 10: 0x1406 };
const MODES = { 1: 0, 2: 3, 3: 2, 4: 1, 5: 5, 6: 6, [Triangles]: 4 };
const ATTRIBUTES = ["attr_pos", "attr_norm", "attr_uv0", "attr_color", "attr_joints", "attr_weights", "attr_uv1", "attr_textan", "attr_binormal"];

// The pictures of a material besides its colour's, in the order the shader
// has them, and what each is read through. A picture of heights is read
// where the way of facing would be: a material has one or the other.
const MAPS = ["map", "normal", "roughness", "metalness", "occlusion", "emissive", "opacity", "bump", "coat", "coatRoughness", "coatNormal"];
const SAMPLERS = [null, "u_normalMap", "u_roughnessMap", "u_metalnessMap", "u_occlusionMap", "u_emissiveMap", "u_opacityMap", "u_normalMap", "u_coatMap", "u_coatRoughnessMap", "u_coatNormalMap"];
const UNITS = [0, 2, 3, 4, 5, 6, 7, 2, 8, 9, 10];
// Where the cube of the surroundings is read, and where what it is made
// from is while it is made.
const PROBE = 11;
const MAKING = 12;
// Where the targets of a shape are read: where no program that draws a
// shape reads anything else, and they are layers, which nothing else there
// is.
const MORPHS = 12;
// And where the cube of a reflection probe is read.
const MIRROR = 16;
let nothing;

// The targets of a shape as OpenGL holds them, layer on layer, and at which
// layer those of where a corner is begin, of which way it faces, and of the
// two ways along it: -1 where the mesh has none. No more than eight targets
// are gone towards, as in Qt.
const MOST = 8;
function targeted(targets) {
  if (!targets) return null;
  const { count, width, names, data } = targets;
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + MORPHS);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA32F, width, width, names.length * count, 0, gl.RGBA, gl.FLOAT, data);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  gl.activeTexture(gl.TEXTURE0);
  const first = (name) => (names.includes(name) ? names.indexOf(name) * count : -1);
  return { texture, count: Math.min(MOST, count), at: [first("attr_pos"), first("attr_norm"), first("attr_textan"), first("attr_binormal")] };
}

// A shape as OpenGL holds it: its corners as the mesh file has them, each
// part of a corner said where it is in the row.
const shapes = new WeakMap();
function held(shape) {
  let made = shapes.get(shape);
  if (made) return made;
  const array = gl.createVertexArray();
  gl.bindVertexArray(array);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, shape.vertices, gl.STATIC_DRAW);
  ATTRIBUTES.forEach((name, location) => {
    const entry = shape.entries[name];
    if (!entry || !KINDS[entry.type]) return;
    gl.enableVertexAttribArray(location);
    // A colour kept as whole numbers is out of 255; which joint a corner
    // goes with is the number itself.
    gl.vertexAttribPointer(location, Math.min(4, entry.count), KINDS[entry.type], entry.type < 9 && name !== "attr_joints", shape.stride, entry.offset);
  });
  let kind = 0;
  let size = 0;
  if (shape.indices) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, shape.indices, gl.STATIC_DRAW);
    size = shape.indices.BYTES_PER_ELEMENT;
    kind = size === 4 ? gl.UNSIGNED_INT : size === 2 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE;
  }
  gl.bindVertexArray(null);
  const jointed = Boolean(shape.entries.attr_joints && shape.entries.attr_weights);
  const framed = Boolean(shape.entries.attr_textan && shape.entries.attr_binormal);
  shapes.set(shape, (made = { array, kind, size, mode: MODES[shape.drawMode] ?? gl.TRIANGLES, colors: Boolean(shape.entries.attr_color), jointed, framed, morphs: targeted(shape.targets) }));
  return made;
}

const WRAPS = { 1: 0x812f, 2: 0x8370, 3: 0x2901 };

// How the numbers of a picture given as numbers are handed over. Whole
// fractions are kept as halves, which is what can be smoothed.
const forms = () => ({
  RGBA8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE],
  RGBA16F: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT],
  RGBA32F: [gl.RGBA16F, gl.RGBA, gl.FLOAT],
  R8: [gl.R8, gl.RED, gl.UNSIGNED_BYTE],
  R16F: [gl.R16F, gl.RED, gl.HALF_FLOAT],
  R32F: [gl.R16F, gl.RED, gl.FLOAT],
});

// A picture as a texture, sampled as its Texture says: an element of the
// page, or numbers, whose first row is the bottom one already, or what a
// view last drew.
const textures = new WeakMap();
// Which picture is being drawn: what something draws on is read once for
// one, however many read it.
let turn = 0;
function bound(map, unit = 0) {
  const from = map.element ?? map.data;
  let made = map.view ? viewed(map) : textures.get(from);
  const fresh = !made;
  if (fresh) textures.set(from, (made = { texture: gl.createTexture(), mipped: false, turn: 0, smaller: undefined, larger: undefined, across: undefined, down: undefined }));
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, made.texture);
  if (map.view) {
    // Nothing is read: it is here already.
  } else if (fresh && map.data) {
    const { pixels, width, height, format } = map.data;
    const [inner, outer, kind] = forms()[format];
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, inner, width, height, 0, outer, kind, pixels);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  } else if (!map.data && (fresh || (map.live && made.turn !== turn))) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, map.element);
    made.mipped = false;
    made.turn = turn;
  }
  if (map.mip && !made.mipped) {
    gl.generateMipmap(gl.TEXTURE_2D);
    made.mipped = true;
  }
  const near = map.min === 1;
  const smaller = map.mip === 0 ? (near ? gl.NEAREST : gl.LINEAR) : map.mip === 1 ? (near ? gl.NEAREST_MIPMAP_NEAREST : gl.LINEAR_MIPMAP_NEAREST) : near ? gl.NEAREST_MIPMAP_LINEAR : gl.LINEAR_MIPMAP_LINEAR;
  const larger = map.mag === 1 ? gl.NEAREST : gl.LINEAR;
  const across = WRAPS[map.horizontal] ?? gl.REPEAT;
  const down = WRAPS[map.vertical] ?? gl.REPEAT;
  // A picture keeps how it is read, and is told again only when that
  // changes: but for one another view drew, which that view may make anew.
  if (map.view || made.smaller !== smaller || made.larger !== larger || made.across !== across || made.down !== down) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, smaller);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, larger);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, across);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, down);
    if (!map.view) Object.assign(made, { smaller, larger, across, down });
  }
  if (unit) gl.activeTexture(gl.TEXTURE0);
}

// What a view last drew, for what takes the view as a texture: the right
// way up and upside down, as it is asked for. The picture leaves the
// surface for the page once drawn, so it is copied before it does, and a
// view that reads itself reads the picture before the one being drawn.
const views = new WeakMap();
let undrawn = null;
function viewed(map) {
  const record = views.get(map.element);
  const side = record && (map.down ? record.down : record.up);
  if (side) return side;
  if (!undrawn) {
    undrawn = { texture: gl.createTexture(), mipped: false };
    gl.activeTexture(gl.TEXTURE0 + MAKING);
    gl.bindTexture(gl.TEXTURE_2D, undrawn.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }
  return undrawn;
}

// The surface as it stands is kept as a view's picture: `ways` says which
// way up it is wanted, the right way (1), upside down (2) or both.
function retained(canvas, width, height, ways) {
  let record = views.get(canvas);
  if (!record) views.set(canvas, (record = { width: 0, height: 0, up: null, down: null }));
  const sized = record.width !== width || record.height !== height;
  Object.assign(record, { width, height });
  gl.activeTexture(gl.TEXTURE0 + MAKING);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  for (const [way, name] of [[1, "up"], [2, "down"]]) {
    if (!(ways & way)) continue;
    let side = record[name];
    const fresh = !side;
    if (fresh) side = record[name] = { texture: gl.createTexture(), frame: gl.createFramebuffer(), mipped: false };
    gl.bindTexture(gl.TEXTURE_2D, side.texture);
    if (fresh || sized) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, side.frame);
    if (fresh) gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, side.texture, 0);
    // A texture's first row is its bottom one, as the surface's is.
    if (way === 1) gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    else gl.blitFramebuffer(0, 0, width, height, 0, height, width, 0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    side.mipped = false;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// A cube of so many levels, each side of the first `size` across.
function cube(size, levels, format = fractions ? gl.RGBA16F : gl.RGBA8) {
  const made = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + MAKING);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, made);
  gl.texStorage2D(gl.TEXTURE_CUBE_MAP, levels, format, size, size);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return made;
}

// The passes that draw no shape: made when first there is something for
// them to draw.
let fold;
let blur;
let sky;
const BLURRING = ["u_from", "u_ways", "u_roughness", "u_resolution", "u_round", "u_side"];

function covering() {
  gl.bindVertexArray(null);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.depthMask(false);
}

// Each side of one level of a cube, drawn by the pass that is at work into
// the frame that is.
function sides(onto, level, across, at) {
  gl.viewport(0, 0, across, across);
  for (let side = 0; side < 6; side++) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + side, onto, level);
    uniform.i(at.u_side, side);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

// One cube blurred into another of so many levels: the first as it is, the
// last what a surface takes of it from all round, and those between what
// surfaces of more and more roughness give back of it.
function blurred(from, into, size, levels) {
  gl.activeTexture(gl.TEXTURE0 + MAKING);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, from);
  gl.useProgram(blur.program);
  uniform.i(blur.at.u_from, MAKING);
  uniform.i(blur.at.u_ways, WAYS);
  uniform.f(blur.at.u_resolution, size);
  for (let level = 0; level < levels; level++) {
    uniform.f(blur.at.u_roughness, level / (levels - 2));
    uniform.i(blur.at.u_round, level === levels - 1 ? 1 : 0);
    sides(into, level, size >> level, blur.at);
  }
}

// The ways a surface of one roughness that faces along z gives back what is
// round it, as Qt picks them for a reflection probe: the first sixteen of
// the hundred and more it tries that come back from in front of the
// surface, each with the level of the cube it reads, which is the higher
// the more of the cube the way stands for.
function few(roughness, resolution) {
  const alpha = roughness ** 4;
  const texel = (4 * Math.PI) / (6 * resolution * resolution);
  const found = [];
  for (let index = 0; index < FEW * 8 && found.length < FEW * 4; index++) {
    // Each bit of the count, the other way round, behind the point.
    let turned = 0;
    for (let bits = index, bit = 0.5; bits; bits >>= 1, bit /= 2) if (bits & 1) turned += bit;
    const phi = (2 * Math.PI * index) / FEW;
    const cosine = Math.sqrt((1 - turned) / (1 + (alpha - 1) * turned));
    const sine = Math.sqrt(1 - cosine * cosine);
    const back = 2 * cosine * cosine - 1;
    // One that comes back along the surface counts for nothing, and Qt's
    // sums leave it just behind.
    if (back <= 1e-6) continue;
    const spread = alpha / (Math.PI * (cosine * cosine * (alpha - 1) + 1) ** 2);
    const stood = 1 / (FEW * (spread / 4 + 0.0001) + 0.0001);
    found.push(2 * cosine * sine * Math.cos(phi), 2 * cosine * sine * Math.sin(phi), back, roughness === 0 ? 0 : 0.5 * Math.log2(stood / texel));
  }
  return found;
}

// What is round a reflection probe blurred into a cube of so many levels,
// as `blurred` blurs a light probe: but the levels of a roughness summed
// over those few ways, and the last over a quarter as many as a side is
// across, each read of the cube as it is and not of its smaller levels.
let gloss;
let whole;
function glossed(from, into, size, levels) {
  gl.activeTexture(gl.TEXTURE0 + MAKING);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, from);
  gl.useProgram(gloss.program);
  uniform.i(gloss.at.u_from, MAKING);
  for (let level = 0; level < levels - 1; level++) {
    const ways = few(level / (levels - 2), size);
    uniform.f4(gloss.at["u_few[0]"], ways);
    uniform.i(gloss.at.u_count, ways.length / 4);
    sides(into, level, size >> level, gloss.at);
  }
  gl.useProgram(blur.program);
  uniform.i(blur.at.u_from, MAKING);
  uniform.i(blur.at.u_ways, size / 4);
  uniform.f(blur.at.u_resolution, size);
  uniform.f(blur.at.u_roughness, 0);
  uniform.i(blur.at.u_round, 1);
  if (!whole) {
    whole = gl.createSampler();
    gl.samplerParameteri(whole, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.samplerParameteri(whole, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.samplerParameteri(whole, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(whole, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  gl.bindSampler(MAKING, whole);
  sides(into, levels - 1, size >> (levels - 1), blur.at);
  gl.bindSampler(MAKING, null);
}

// Surroundings Qt baked into a file are that cube already, every level of
// it: handed over as they are, each side's first row first, and the file
// let go of. Qt reads as many levels as the file has, whatever they hold.
function baked(data) {
  const { width, levels } = data;
  if (!levels || width > gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE)) return null;
  const made = cube(width, levels.length, gl.RGBA16F);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  levels.forEach((sides, level) => {
    const across = Math.max(1, width >> level);
    sides.forEach((side, index) => gl.texSubImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + index, level, 0, 0, across, across, gl.RGBA, gl.HALF_FLOAT, side));
  });
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.activeTexture(gl.TEXTURE0);
  data.spent();
  return { cube: made, levels: levels.length };
}

// The picture of a light probe as the cube that is read when a scene is lit
// by it, made as Qt makes it: each side at least 512 across, half the
// picture's height where that is more, and six levels. The first is the
// picture itself; the next four what surfaces of a roughness of a quarter,
// a half, three quarters and one give back of it; the last what one takes
// of it from all round.
const probes = new WeakMap();
const LEVELS = 6;
function probed(map) {
  const from = map.element ?? map.data;
  let made = probes.get(from);
  if (made !== undefined) return made;
  if (map.data?.baked && map.data.sides === 6) {
    probes.set(from, (made = baked(map.data)));
    return made;
  }
  fold ??= program(COVER, FOLD, ["u_from", "u_screen", "u_side"]);
  blur ??= program(COVER, BLUR, BLURRING);
  if (!fold || !blur) {
    probes.set(from, null);
    return null;
  }
  const high = map.data?.height ?? map.element.naturalHeight ?? map.element.height;
  const size = Math.max(512, Math.floor(high * 0.5));
  const levels = Math.min(Math.floor(Math.log2(size)) + 1, LEVELS);
  covering();
  const frame = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, frame);

  // The picture, folded: read between its pixels, and not past its edges.
  const folded = cube(size, Math.floor(Math.log2(size)) + 1);
  bound(map, MAKING);
  // Read here otherwise than a material reads it, which is said again then.
  const read = textures.get(from);
  if (read) read.smaller = undefined;
  gl.activeTexture(gl.TEXTURE0 + MAKING);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.useProgram(fold.program);
  uniform.i(fold.at.u_from, MAKING);
  uniform.i(fold.at.u_screen, map.data?.linear ? 0 : 1);
  sides(folded, 0, size, fold.at);
  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

  // And blurred, level by level.
  const cubed = cube(size, levels);
  blurred(folded, cubed, size, levels);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(frame);
  gl.deleteTexture(folded);
  gl.activeTexture(gl.TEXTURE0);
  gl.useProgram(shaded.program);
  probes.set(from, (made = { cube: cubed, levels }));
  return made;
}

// The surroundings behind everything, as blurred as the scene says.
function backdrop(probe, environment, projection, eye, tonemap) {
  sky ??= program(BEHIND, SKY, ["u_back", "u_eye", "u_turn", "u_from", "u_level", "u_exposure", "u_tonemap"]);
  const back = sky && math.inverse(projection);
  if (!back) return;
  covering();
  gl.useProgram(sky.program);
  uniform.i(sky.at.u_from, PROBE);
  uniform.m4(sky.at.u_back, back);
  uniform.m3(sky.at.u_eye, [eye[0], eye[1], eye[2], eye[4], eye[5], eye[6], eye[8], eye[9], eye[10]]);
  uniform.m3(sky.at.u_turn, environment.probe.turn);
  uniform.f(sky.at.u_level, environment.blur * (probe.levels - 2));
  uniform.f(sky.at.u_exposure, environment.probe.exposure);
  uniform.i(sky.at.u_tonemap, tonemap);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.useProgram(shaded.program);
}

// A colour in linear light as the screen shows it, by the same sums as the
// shader's.
function toned([r, g, b], mode) {
  const screen = (c) => 0.585122381 * Math.sqrt(c) + 0.783140355 * c ** 0.25 - 0.368262736 * c ** 0.125;
  const filmic = (c) => (c * (0.15 * c + 0.05) + 0.004) / (c * (0.15 * c + 0.5) + 0.06) - 0.02 / 0.3;
  const one = (c) => {
    if (mode === 1) return screen(c);
    if (mode === 2) return screen(Math.min(1, Math.max(0, (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14))));
    if (mode === 3) {
      c = Math.max(0, c - 0.004);
      return (c * (6.2 * c + 0.5)) / (c * (6.2 * c + 1.7) + 0.06);
    }
    if (mode === 4) return screen(filmic(c * 2) / filmic(11.2));
    return c;
  };
  return [one(r), one(g), one(b)];
}

// Where edges are to be smooth, everything is drawn several times to the
// pixel into this, and from it to the surface.
let smooth = null;
function smoothed(width, height, samples, format) {
  samples = Math.min(samples, gl.getParameter(gl.MAX_SAMPLES));
  if (samples < 2) return null;
  smooth ??= { frame: gl.createFramebuffer(), color: gl.createRenderbuffer(), depth: gl.createRenderbuffer() };
  if (smooth.width !== width || smooth.height !== height || smooth.samples !== samples || smooth.format !== format) {
    Object.assign(smooth, { width, height, samples, format });
    gl.bindRenderbuffer(gl.RENDERBUFFER, smooth.color);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, format, width, height);
    gl.bindRenderbuffer(gl.RENDERBUFFER, smooth.depth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, smooth.frame);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, smooth.color);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, smooth.depth);
  }
  return smooth.frame;
}

// Where the whole picture is brought to the screen after it is drawn, it
// is drawn in linear light into this, which holds more than a screen shows.
// Null where the browser cannot draw into such a thing.
let linear = null;
function unscreened(width, height) {
  if (!gl.getExtension("EXT_color_buffer_float")) return null;
  linear ??= { frame: gl.createFramebuffer(), color: gl.createTexture(), depth: gl.createTexture() };
  if (linear.width !== width || linear.height !== height) {
    Object.assign(linear, { width, height });
    gl.bindTexture(gl.TEXTURE_2D, linear.color);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // How far each place of it is can be read too, by an effect.
    gl.bindTexture(gl.TEXTURE_2D, linear.depth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, linear.frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, linear.color, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, linear.depth, 0);
  }
  return linear.frame;
}

// Such a picture brought to the screen, as the environment says.
let graded = null;
function finished(grade, from) {
  graded ??= program(OVER, GRADE, ["u_from", "u_tonemap", "u_grade", "u_fine", "u_adjust", "u_vignette", "u_vignetting"]);
  if (!graded) return;
  covering();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(graded.program);
  gl.bindTexture(gl.TEXTURE_2D, from);
  uniform.i(graded.at.u_from, 0);
  uniform.i(graded.at.u_tonemap, grade.tonemap);
  uniform.f4(graded.at.u_grade, [grade.exposure, grade.white, grade.sharpness, 0]);
  uniform.i2(graded.at.u_fine, [grade.smooth ? 1 : 0, grade.dither ? 1 : 0]);
  uniform.f4(graded.at.u_adjust, [grade.adjust ? 1 : 0, ...(grade.adjust ?? [1, 1, 1])]);
  uniform.f4(graded.at.u_vignette, [...(grade.vignette?.slice(0, 3) ?? [0, 0, 0]), grade.vignette ? 1 : 0]);
  uniform.f2(graded.at.u_vignetting, [grade.vignette?.[3] ?? 0, grade.vignette?.[4] ?? 0]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.depthMask(true);
  gl.useProgram(shaded.program);
}

// What is behind what reads it, drawn into: a picture of the scene, of
// fractions where one can be drawn into, and one of how far each place of
// it is.
let background = null;
function behind(width, height) {
  if (background?.width === width && background.height === height) return background;
  if (background) {
    gl.deleteTexture(background.color);
    gl.deleteTexture(background.depth);
    gl.deleteFramebuffer(background.frame);
  }
  const made = (format, levels, filter, wrap) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, levels, format, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return texture;
  };
  // Read past its edge, the picture is there again, and how far is as at
  // the edge: Qt has both so.
  const color = made(fractions ? gl.RGBA16F : gl.RGBA8, Math.floor(Math.log2(Math.max(width, height))) + 1, gl.LINEAR, gl.REPEAT);
  const depth = made(gl.DEPTH_COMPONENT24, 1, gl.NEAREST, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  const frame = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  return (background = { width, height, color, depth, frame });
}

// The joints of a bent shape, as a texture the corners look their matrices
// up in.
let skeleton = null;
function jointed(bones) {
  skeleton ??= gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, skeleton);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, bones.width, bones.width, 0, gl.RGBA, gl.FLOAT, bones.data);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.activeTexture(gl.TEXTURE0);
}

// The entries of a table, as OpenGL holds them: each is three rows of a
// matrix, a colour, and four numbers of its own, which the shaders of a
// CustomMaterial may read. A table whose entries are put in order for every
// picture has one buffer for them all.
const ENTRY = 20;
const ROWS = ENTRY / 4;
const tables = new WeakMap();
let ordered = null;
function entered(instances) {
  let buffer = instances.fresh ? (ordered ??= gl.createBuffer()) : tables.get(instances.data);
  const fresh = instances.fresh || !buffer;
  if (!buffer) tables.set(instances.data, (buffer = gl.createBuffer()));
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  if (fresh) gl.bufferData(gl.ARRAY_BUFFER, instances.data, instances.fresh ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  for (let row = 0; row < ROWS; row++) {
    gl.enableVertexAttribArray(9 + row);
    gl.vertexAttribPointer(9 + row, 4, gl.FLOAT, false, ENTRY * 4, row * 16);
    gl.vertexAttribDivisor(9 + row, 1);
  }
}

// The entries of a table from the farthest along the way the eye looks to
// the nearest, which is the order Qt draws them in where the table says to
// put them in order: `way` is the way the eye looks, as the model has it.
function farthestFirst(data, count, way) {
  const order = Array.from({ length: count }, (_, index) => {
    const from = index * ENTRY;
    return [data[from + 3] * way[0] + data[from + 7] * way[1] + data[from + 11] * way[2], from];
  }).sort((a, b) => b[0] - a[0]);
  const sorted = new Float32Array(count * ENTRY);
  order.forEach(([, from], index) => sorted.set(data.subarray(from, from + ENTRY), index * ENTRY));
  return sorted;
}

const UNTURNED = [1, 0, 0, 0, 1, 0, 0, 0, 1];
// Whether a part mirrors a probe's cube, and whether by where it is in its box.
const MIRRORINGS = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];
// How each picture of a part's material is read, and where on it: said
// again for each part, and the same for most.
const reads = new Float32Array(MAPS.length * 3);
const places = new Float32Array(MAPS.length * 9);

// The lights a part is lit by, which are the scene's unless one of them is
// for some of it only: said again when they are others than the last
// part's.
let shining = null;
function shone(all) {
  if (all === shining) return;
  shining = all;
  const lights = all.slice(0, LIGHTS);
  const ambient = [0, 0, 0];
  for (const light of all) for (let index = 0; index < 3; index++) ambient[index] += light.ambient[index];
  uniform.f3(at.u_ambient, ambient);
  uniform.i(at.u_count, lights.length);
  if (!lights.length) return;
  uniform.f3(at.u_lightColor, lights.flatMap((light) => light.color));
  uniform.f4(at.u_lightPlace, lights.flatMap((light) => [...light.position, light.kind]));
  uniform.f3(at.u_lightWay, lights.flatMap((light) => light.direction));
  uniform.f3(at.u_lightFade, lights.flatMap((light) => light.fade));
  uniform.f2(at.u_lightCone, lights.flatMap((light) => [light.cone, light.inner]));
}

// What every program is told once for a picture: of the eye, of the
// surroundings and of the fog. A program of a CustomMaterial's is told when
// it first draws in it.
let telling = null;
function tell() {
  uniform.f4(at.u_probing, telling.probing);
  uniform.m3(at.u_probeTurn, telling.probeTurn);
  uniform.f3(at.u_eye, telling.eye);
  uniform.f4(at.u_fog, telling.fog);
  uniform.f4(at.u_fogDepth, telling.fogDepth);
  uniform.f4(at.u_fogHeight, telling.fogHeight);
  uniform.f2(at.u_fogLet, telling.fogLet);
  uniform.f(at.u_far, telling.far);
  uniform.i(at.u_tonemap, telling.tonemap);
  if (!("u_view" in at)) return;
  uniform.m4(at.u_view, telling.view);
  uniform.m4(at.u_projection, telling.projection);
  uniform.m4(at.u_seen, telling.seen);
  uniform.m4(at.u_unprojected, telling.unprojected);
  uniform.f3(at.u_looking, telling.looking);
  uniform.f2(at.u_clips, telling.clips);
}

// What the shaders of a CustomMaterial are told besides, and where what
// they may read is: what is behind them and how far it is, a picture that
// is white all over, and after those the material's own pictures.
const MORE = ["u_view", "u_projection", "u_seen", "u_unprojected", "u_looking", "u_clips", "u_screen", "u_depth", "u_white"];
const SCREEN = 13;
const DEPTH = 14;
const WHITE = 15;
const OWN = 17;

// Qt's numbers for how what is drawn is put over what is there, as OpenGL
// has them. The first is for none.
const FACTORS = [0, 0, 1, 0x300, 0x301, 0x306, 0x307, 0x302, 0x303, 0x304, 0x305, 0x8001, 0x8002, 0x8003, 0x8004, 0x308];

// A picture of one colour all over.
const flats = new Map();
function flat(...rgba) {
  const key = rgba.join(" ");
  let made = flats.get(key);
  if (!made) {
    flats.set(key, (made = gl.createTexture()));
    gl.bindTexture(gl.TEXTURE_2D, made);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  return made;
}

function pictured(unit, texture) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.activeTexture(gl.TEXTURE0);
}

// The program a CustomMaterial is drawn with, made once of its shaders:
// null where they make none, which is said once.
const tailored = new WeakMap();
function tailor(source) {
  let made = tailored.get(source);
  if (made !== undefined) return made;
  const { vertex, fragment } = customised({ vertex: VERTEX, fragment: FRAGMENT }, source);
  const own = program(vertex, fragment, []);
  made = null;
  if (own) {
    const where = (name) => gl.getUniformLocation(own.program, name);
    made = { program: own.program, at: Object.fromEntries([...UNIFORMS, ...MORE].map((name) => [name, where(`qt_${name}`)])), own: new Map(), told: null, shining: null };
    gl.useProgram(made.program);
    uniform.i(made.at.u_map, 0);
    uniform.i(made.at.u_bones, 1);
    uniform.i(made.at.u_morphed, MORPHS);
    uniform.i(made.at.u_probe, PROBE);
    uniform.i(made.at.u_mirror, MIRROR);
    SAMPLERS.forEach((name, index) => name && uniform.i(made.at[name], UNITS[index]));
    uniform.i(made.at.u_screen, SCREEN);
    uniform.i(made.at.u_depth, DEPTH);
    uniform.i(made.at.u_white, WHITE);
    source.samplers.forEach((name, index) => uniform.i(where(name), OWN + index));
    gl.useProgram(shaded.program);
    pictured(WHITE, flat(255, 255, 255, 255));
  }
  tailored.set(source, made);
  return made;
}

// What a material's own properties are to its shaders, handed over. A
// picture that is not there reads as black, nothing seen through it, as in
// Qt.
function handed(own, uniforms) {
  let unit = OWN;
  for (const { name, type, value } of uniforms) {
    if (type === "sampler2D") {
      if (value) bound(value, unit++);
      else pictured(unit++, flat(0, 0, 0, 255));
      continue;
    }
    let where = own.own.get(name);
    if (where === undefined) own.own.set(name, (where = gl.getUniformLocation(own.program, name)));
    if (!where) continue;
    if (type === "float") uniform.f(where, value);
    else if (type === "int" || type === "bool") uniform.i(where, value);
    else if (type === "vec2") uniform.f2(where, value);
    else if (type === "vec3") uniform.f3(where, value);
    else if (type === "vec4") uniform.f4(where, value);
    else if (type === "mat4") uniform.m4(where, value);
  }
}

// One part of a shape, with the material it is drawn with, saying how far
// it is where it hides what is drawn behind it afterwards. A
// CustomMaterial's is drawn by its own program: put over what is there as
// the material says and no other way.
function part(piece) {
  const { custom } = piece.material;
  gl.depthMask(piece.hides);
  if (!custom) return drawn(piece);
  const own = tailor(custom.source);
  if (!own) return;
  const lit = shining;
  gl.useProgram(own.program);
  at = own.at;
  if (own.told !== telling) {
    own.told = telling;
    own.shining = null;
    tell();
  }
  shining = own.shining;
  handed(own, custom.uniforms);
  // What it is handed may be under a name the material's own is said by.
  worn = null;
  if (custom.blend) {
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(...custom.blend.map((factor) => FACTORS[factor]));
  } else gl.disable(gl.BLEND);
  drawn(piece);
  own.shining = shining;
  shining = lit;
  at = shaded.at;
  gl.useProgram(shaded.program);
}

let morphing = null;
// The material the last part was drawn with, by which program: one drawn
// with the same again has all of it said already. Forgotten for each
// picture, as a material may be another by then.
let worn = null;
let wearing = null;
const facing = new Float32Array(9);
function drawn(piece) {
  const { shape, subset, world, material, opacity } = piece;
  const made = held(shape);
  shone(piece.lights);
  gl.bindVertexArray(made.array);
  uniform.m4(at.u_all, piece.all);
  uniform.m4(at.u_world, world);
  uniform.m3(at.u_facing, piece.bones ? UNTURNED : math.normalInto(facing, world));
  const skinned = Boolean(piece.bones) && made.jointed;
  uniform.i(at.u_skinned, skinned ? 1 : 0);
  if (skinned) jointed(piece.bones);
  // What it goes towards, and by how much: a target the model has no
  // weight for is not gone towards at all.
  const { morphs } = made;
  uniform.i(at.u_morphs, morphs ? morphs.count : 0);
  if (morphs !== morphing) {
    morphing = morphs;
    gl.activeTexture(gl.TEXTURE0 + MORPHS);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, morphs?.texture ?? null);
    gl.activeTexture(gl.TEXTURE0);
  }
  if (morphs) {
    const by = new Float32Array(MOST);
    (piece.weights ?? []).slice(0, morphs.count).forEach((weight, index) => (by[index] = weight));
    uniform.i4(at.u_morphAt, morphs.at);
    uniform.fv(at.u_morphBy, by);
  }
  uniform.f(at.u_opacity, opacity * material.opacity);
  if (material !== worn || at !== wearing) {
    worn = material;
    wearing = at;
    dressed(material);
  }
  // An entry of a table colours what it draws whether the material looks
  // at the colours of the corners or not; how far it is seen through shows
  // only where the table says something of it is.
  const { instances } = piece;
  uniform.i(at.u_instanced, instances ? 1 : 0);
  if (instances) uniform.m4(at.u_above, instances.above);
  uniform.i(at.u_colors, (material.colors && made.colors) || instances ? 1 : 0);
  uniform.i(at.u_solid, material.solid || (instances && !piece.sheer) ? 1 : 0);
  uniform.i(at.u_framed, made.framed ? 1 : 0);
  // What is round the reflection probe it is near, where it is near one.
  const { mirror } = piece;
  const round = (mirror && cubes.get(mirror.key)?.cube) || nothing;
  uniform.f2(at.u_mirroring, MIRRORINGS[(round === nothing ? 0 : 2) + (mirror?.parallax ? 1 : 0)]);
  if (round !== nothing) {
    uniform.f3(at.u_mirrorAt, mirror.at);
    uniform.f3(at.u_mirrorMin, mirror.min);
    uniform.f3(at.u_mirrorMax, mirror.max);
  }
  if (round !== reflecting) {
    reflecting = round;
    gl.activeTexture(gl.TEXTURE0 + MIRROR);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, round);
    gl.activeTexture(gl.TEXTURE0);
  }
  // A material with no pictures reads none, which the program is told
  // once until one with pictures is drawn by it.
  const bare = !material.map && !material.maps;
  if (!bare || !at.bare) {
    at.bare = bare;
    pictures(material);
    uniform.f3(at.u_reads, reads);
    uniform.m3(at.u_places, places);
  }
  // Which side of a triangle is its front is the other one in a mirror.
  const anticlockwise = (shape.winding !== 1) !== math.mirrors(piece.placed ?? world);
  gl.frontFace(anticlockwise ? gl.CCW : gl.CW);
  if (material.cull === 3) gl.disable(gl.CULL_FACE);
  else {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(material.cull === 2 ? gl.FRONT : gl.BACK);
  }
  if (!instances) {
    if (made.kind) gl.drawElements(made.mode, subset.count, made.kind, subset.offset * made.size);
    else gl.drawArrays(made.mode, subset.offset, subset.count);
    return;
  }
  entered(instances);
  if (made.kind) gl.drawElementsInstanced(made.mode, subset.count, made.kind, subset.offset * made.size, instances.count);
  else gl.drawArraysInstanced(made.mode, subset.offset, subset.count, instances.count);
  // The shape is held once, for what draws it once as well.
  for (let row = 0; row < ROWS; row++) gl.disableVertexAttribArray(9 + row);
}

// Where each picture of a material is read from, and how, into `reads` and
// `places`; and each picture bound for it.
function pictures(material) {
  reads.fill(0);
  places.fill(0);
  for (let index = 0; index < MAPS.length; index++) {
    const name = MAPS[index];
    const map = name === "map" ? material.map : material.maps?.[name];
    if (!map) continue;
    bound(map, UNITS[index]);
    const read = index * 3;
    reads[read] = map.data?.linear ? 2 : 1;
    reads[read + 1] = map.channel ?? 0;
    reads[read + 2] = map.index ? 1 : 0;
    const m = map.transform;
    const place = index * 9;
    places[place] = m[0];
    places[place + 1] = m[1];
    places[place + 3] = m[4];
    places[place + 4] = m[5];
    places[place + 6] = m[12];
    places[place + 7] = m[13];
    places[place + 8] = 1;
  }
}

// What is said of a material alone, for the program in use.
function dressed(material) {
  uniform.f(at.u_point, material.point);
  uniform.f4(at.u_color, material.color);
  uniform.f3(at.u_emissive, material.emissive);
  uniform.i(at.u_lit, material.lit ? 1 : 0);
  uniform.i(at.u_principled, material.principled ? 1 : 0);
  uniform.f(at.u_cutoff, material.cutoff);
  uniform.f(at.u_specular, material.specular);
  uniform.f(at.u_shine, material.shine ?? 1);
  uniform.f(at.u_roughness, material.roughness ?? 0);
  uniform.f(at.u_metalness, material.metalness);
  uniform.f(at.u_ior, material.ior);
  uniform.f(at.u_fresnel, material.fresnel);
  uniform.i(at.u_inverted, material.inverted ? 1 : 0);
  uniform.f(at.u_bump, material.bump ?? 1);
  uniform.f(at.u_occlusion, material.occlusion ?? 1);
  uniform.f(at.u_coat, material.coat ?? 0);
  uniform.f(at.u_coatRoughness, material.coatRoughness ?? 0);
  uniform.f(at.u_coatBump, material.coatBump ?? 1);
  uniform.f3(at.u_coatEdge, material.coatEdge ?? COAT_EDGE);
  uniform.f3(at.u_tint, material.tint ?? UNTINTED);
  uniform.i(at.u_shiny, material.shiny === false ? 0 : 1);
  uniform.i(at.u_glint, material.glint ? 1 : 0);
  uniform.f2(at.u_edge, material.edge ?? UNEDGED);
  uniform.i(at.u_sided, material.cull === 3 ? 1 : 0);
}
const COAT_EDGE = [5, 1, 0];
const UNTINTED = [1, 1, 1];
const UNEDGED = [1, 0];

// Whether something is seen through what a material draws.
// A picture to draw into, of a size and a kind: the one held, where that is
// such a one.
function sheet(held, width, height, format, filter, wrap) {
  if (held?.width === width && held.height === height && held.format === format && held.filter === filter && held.wrap === wrap) return held;
  if (held) {
    gl.deleteTexture(held.texture);
    gl.deleteFramebuffer(held.frame);
  }
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.bindTexture(gl.TEXTURE_2D, null);
  const frame = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return { texture, frame, width, height, format, filter, wrap };
}

// The program a pass of an Effect draws with, made once of its shaders:
// null where they make none, which is said once.
const SEEN = ["u_input", "u_depth", "u_inputSize", "u_outputSize", "u_frame", "u_clips", "u_projection", "u_unprojected"];
const passing = new WeakMap();
function passed(source) {
  let made = passing.get(source);
  if (made !== undefined) return made;
  const { vertex, fragment } = effected(source);
  const own = program(vertex, fragment, []);
  made = null;
  if (own) {
    const where = (name) => gl.getUniformLocation(own.program, name);
    made = { program: own.program, at: Object.fromEntries(SEEN.map((name) => [name, where(`qt_${name}`)])), own: new Map() };
    gl.useProgram(made.program);
    uniform.i(made.at.u_input, 0);
    uniform.i(made.at.u_depth, DEPTH);
    source.samplers.forEach((name, index) => uniform.i(where(name), OWN + index));
  }
  passing.set(source, made);
  return made;
}

// What a Buffer is drawn into as: Qt's numbers for the kind of picture it
// is, for how it is read between its places and for how past its edges.
// Fractions are kept as halves, and one number to a place as a fraction.
// A view keeps each by its name, from one picture to the next: one that
// nothing drew into yet is black, and all of it seen through.
const kinds = () => ({ 1: gl.RGBA8, 2: gl.RGBA16F, 3: gl.RGBA16F, 4: gl.R8, 5: gl.R16F, 6: gl.R16F, 7: gl.R16F });
const kept = new WeakMap();
function buffered(view, { name, format, filter, wrap, scale }, width, height) {
  if (!kept.has(view)) kept.set(view, new Map());
  const held = kept.get(view);
  // Qt rounds the size: half of 75 rows is 38.
  const made = sheet(held.get(name), Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)), kinds()[format] ?? gl.RGBA16F, filter === 1 ? gl.NEAREST : gl.LINEAR, WRAPS[wrap] ?? gl.CLAMP_TO_EDGE);
  held.set(name, made);
  return made;
}

// The effects of an environment, run over the picture `from` one after
// another: what the last leaves, as a texture. Each pass draws a rectangle
// over the whole of what it draws into, which is black before it: the
// picture the next effect reads, or a Buffer of the `view`'s. What it
// reads is the picture the effect was given, unless it says a Buffer in its
// place; and a Buffer, or that picture, by the name of one of the effect's
// own pictures where it says so. The picture an effect leaves is of the kind
// the last pass to draw into it says, and of the kind the effect was given
// where that says none: whole numbers, once an effect says them, to every
// effect after it.
let quad = null;
let frames = 0;
const turns = new Map();
function affected(effects, from, width, height, scene, view) {
  if (!quad) {
    quad = gl.createVertexArray();
    gl.bindVertexArray(quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    // Each corner, and where in the picture it is: the first row of that
    // is its bottom one.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 0, 0, 1, -1, 0, 1, 0, -1, 1, 0, 0, 1, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
  }
  covering();
  gl.bindVertexArray(quad);
  frames++;
  const projection = scene.projection ?? math.IDENTITY;
  const unprojected = math.inverse(projection) ?? math.IDENTITY;
  pictured(DEPTH, effects.some(({ passes }) => passes.some(({ source }) => source.depth)) ? linear.depth : flat(0, 0, 0, 255));
  let given = { texture: from, width, height, format: gl.RGBA16F };
  let turn = 0;
  let most = 0;
  for (const { uniforms, passes } of effects) {
    const kind = kinds()[passes.findLast(({ output }) => !output)?.format] ?? given.format;
    const key = `${turn} ${kind}`;
    const out = sheet(turns.get(key), width, height, kind, gl.LINEAR, gl.CLAMP_TO_EDGE);
    turns.set(key, out);
    let wrote = false;
    for (const { source, reads, set, output } of passes) {
      const own = passed(source);
      if (!own) continue;
      const into = output ? buffered(view, output, width, height) : out;
      gl.useProgram(own.program);
      handed(own, uniforms);
      handed(own, set);
      most = Math.max(most, source.samplers.length);
      let read = given;
      for (const { buffer, sampler } of reads) {
        const held = buffer ? buffered(view, buffer, width, height) : given;
        const unit = source.samplers.indexOf(sampler);
        if (held === into) continue;
        if (!sampler) read = held;
        else if (unit >= 0) pictured(OWN + unit, held.texture);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, into.frame);
      gl.viewport(0, 0, into.width, into.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, read.texture);
      uniform.f2(own.at.u_inputSize, [read.width, read.height]);
      uniform.f2(own.at.u_outputSize, [into.width, into.height]);
      uniform.f(own.at.u_frame, frames);
      uniform.f2(own.at.u_clips, [scene.near ?? 0, scene.far ?? 0]);
      uniform.m4(own.at.u_projection, projection);
      uniform.m4(own.at.u_unprojected, unprojected);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (into === out) wrote = true;
    }
    if (wrote) {
      given = out;
      turn = 1 - turn;
    }
  }
  // Nothing drawn into is left where a shape's program would read it.
  for (let unit = 0; unit < most; unit++) pictured(OWN + unit, null);
  pictured(DEPTH, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindVertexArray(null);
  gl.viewport(0, 0, width, height);
  gl.depthMask(true);
  gl.useProgram(shaded.program);
  return given.texture;
}

// A picture in linear light brought to the screen by the tone mapping
// alone: what is seen through it is left as far seen through.
const SHOWN = `#version 300 es
precision highp float;
uniform sampler2D u_from;
in vec2 v_at;
out vec4 fragColor;
${TONES}
void main() {
    vec4 read = texture(u_from, v_at);
    fragColor = vec4(tonemap(max(read.rgb, vec3(0.0))), read.a);
}
`;

let showing = null;
function shown(from, tonemap) {
  showing ??= program(OVER, SHOWN, ["u_from", "u_tonemap"]);
  if (!showing) return;
  covering();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(showing.program);
  gl.bindTexture(gl.TEXTURE_2D, from);
  uniform.i(showing.at.u_from, 0);
  uniform.i(showing.at.u_tonemap, tonemap);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.depthMask(true);
  gl.useProgram(shaded.program);
}

const sheer = (material, opacity) =>
  material.custom
    ? material.custom.through
    : material.blended || material.blend !== 0 || opacity * material.opacity < 1 || Boolean(material.maps?.opacity) || (!material.solid && (material.color[3] < 1 || Boolean(material.map?.sheer)));

// What every program is told for a picture seen by an eye (`eye` is where
// the camera is and how it is turned) through `projection`.
function said(environment, probe, eye, projection, tonemap, near, far) {
  const view = math.inverse(eye) ?? math.IDENTITY;
  return {
    probing: [probe ? 1 : 0, probe ? probe.levels - 1 : 0, environment.probe?.horizon ?? -1, environment.probe?.exposure ?? 0],
    probeTurn: environment.probe?.turn ?? UNTURNED,
    eye: eye.slice(12, 15),
    fog: environment.fog?.color ?? NONE,
    fogDepth: environment.fog?.depth ?? NONE,
    fogHeight: environment.fog?.height ?? NONE,
    fogLet: environment.fog?.through ?? NONE.slice(0, 2),
    far,
    tonemap,
    view,
    projection,
    seen: math.multiply(projection, view),
    unprojected: math.inverse(projection) ?? math.IDENTITY,
    looking: [-eye[8], -eye[9], -eye[10]],
    clips: [near, far],
  };
}

// The reflection probe a part of a shape mirrors by: one whose box the
// part's own meets, and of those the one whose middle is nearest the
// middle of the part's. The part's box is its two corners where the shape
// is put, as Qt has it.
function near(probes, placed, { min, max }) {
  const least = math.point(placed, ...min);
  const most = math.point(placed, ...max);
  let chosen = null;
  let nearest = Infinity;
  for (const probe of probes) {
    if (least.some((value, axis) => probe.min[axis] > most[axis] || value > probe.max[axis])) continue;
    const distance = Math.hypot(...least.map((value, axis) => (value + most[axis] - probe.min[axis] - probe.max[axis]) / 2));
    if (distance < nearest) {
      chosen = probe;
      nearest = distance;
    }
  }
  return chosen;
}

// How far along the eye's z the middle of `subset` is, where `placed` puts
// it: what `math.point` says, with nothing made for each part of a scene.
function ahead(view, placed, { min, max }) {
  const x = (min[0] + max[0]) / 2;
  const y = (min[1] + max[1]) / 2;
  const z = (min[2] + max[2]) / 2;
  let px = placed[0] * x + placed[4] * y + placed[8] * z + placed[12];
  let py = placed[1] * x + placed[5] * y + placed[9] * z + placed[13];
  let pz = placed[2] * x + placed[6] * y + placed[10] * z + placed[14];
  const pw = placed[3] * x + placed[7] * y + placed[11] * z + placed[15];
  if (pw !== 1 && pw !== 0) {
    px /= pw;
    py /= pw;
    pz /= pw;
  }
  const along = view[2] * px + view[6] * py + view[10] * pz + view[14];
  const w = view[3] * px + view[7] * py + view[11] * pz + view[15];
  return w === 1 || w === 0 ? along : along / w;
}

// What there is to draw, as `told` has it seen: each part of each shape
// with a material is a thing to draw. A shape with fewer materials than
// parts has the last for the rest; one with none is not drawn. What nothing
// is seen through is `solid`, the nearest first; what something is,
// `clear`, the farthest first; and what reads the picture of what is behind
// it is `reading`, the farthest first, whether anything is seen through it
// or not. Each is as far as the middle of it is in front of the eye, and a
// model's `depthBias` times itself farther, or nearer where it is below
// nothing, as in Qt.
//
// A thing hides what is drawn behind it afterwards (`hides`) unless its
// material is never to (`depthDrawMode` 2); one that something is seen
// through, only where its material is always to (1).
//
// What a reflection probe sees (`mirrored`) is the shapes that are for
// mirroring, and none of them mirrors anything.
function listed(scene, { view, seen, looking }, mirrored) {
  const solid = [];
  const reading = [];
  const clear = [];
  const probes = mirrored ? [] : (scene.probes ?? []);
  for (const model of scene.models) {
    if (mirrored && !model.mirrored) continue;
    const { shape, materials, opacity, bones, weights } = model;
    const bias = model.bias ?? 0;
    const lights = model.lights ?? scene.lights;
    let { instances } = model;
    if (instances && !instances.count) continue;
    // A bent shape is where its joints put it, wherever its model is. One
    // drawn by a table is where each entry puts it, which the corners
    // work out: here it is as its model is within the entry.
    const world = bones ? math.IDENTITY : (instances?.local ?? model.world);
    const all = instances ? seen : math.multiply(seen, world);
    const placed = instances ? math.multiply(instances.above, world) : world;
    if (instances?.sorted) {
      const way = math.normalized(math.point(math.inverse(model.world) ?? math.IDENTITY, ...looking));
      instances = { ...instances, data: farthestFirst(instances.data, instances.count, way), fresh: true };
    }
    const { subsets } = shape;
    for (let index = 0; index < subsets.length; index++) {
      const subset = subsets[index];
      const material = materials[Math.min(index, materials.length - 1)];
      if (!material || material.waiting) continue;
      // How far in front of the eye it is: the eye looks down its own z.
      const distance = -ahead(view, placed, subset) + Math.sign(bias) * bias * bias;
      const through = sheer(material, opacity) || Boolean(instances?.sheer);
      const reads = Boolean(material.custom?.source.screen);
      const depth = material.custom ? material.custom.depth : material.depth;
      const hides = through && !reads ? depth === 1 : depth !== 2;
      const mirror = model.mirrors && probes.length ? near(probes, placed, subset) : null;
      (reads ? reading : through ? clear : solid).push({ shape, subset, world, all, material, opacity, distance, bones, weights, lights, instances, placed, sheer: through, hides, mirror });
    }
  }
  // What nodes draw by themselves (`paints`), each with a program of its
  // own, is among what is seen through: as far away as the node is.
  if (!mirrored) for (const paint of scene.paints ?? []) clear.push({ paint, distance: -math.point(view, ...paint.at)[2] });
  solid.sort((a, b) => a.distance - b.distance);
  reading.sort((a, b) => b.distance - a.distance);
  clear.sort((a, b) => b.distance - a.distance);
  return { solid, reading, clear };
}

// Draws what was listed, into what is drawn into, as `told` has it seen:
// what nothing is seen through, then what reads the picture of what is
// behind it, then what something is seen through, as Qt does.
function pieces({ solid, reading, clear }, environment, told) {
  if (environment.depth) gl.enable(gl.DEPTH_TEST);
  else gl.disable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.BLEND);
  for (const piece of solid) part(piece);
  for (const piece of reading) part(piece);
  gl.enable(gl.BLEND);
  for (const piece of clear) {
    if (piece.paint) {
      // What a node draws by itself hides nothing.
      gl.depthMask(false);
      const own = gl.getParameter(gl.CURRENT_PROGRAM);
      piece.paint({ gl, view: told.view, projection: told.projection, tonemap: told.tonemap, bound });
      gl.useProgram(own);
      continue;
    }
    // What is drawn is already times its own alpha.
    const { blend } = piece.material;
    if (blend === 1) gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
    else if (blend === 2) gl.blendFuncSeparate(gl.DST_COLOR, gl.ZERO, gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    part(piece);
    gl.enable(gl.BLEND);
  }
  gl.depthMask(true);
  gl.bindVertexArray(null);
}

// The six sides of a cube as a camera looks through each: which way is to
// its right, which is up, and which is behind it. OpenGL's order, and its
// way up for each.
const LOOKS = [
  [0, 0, -1, 0, -1, 0, -1, 0, 0],
  [0, 0, 1, 0, -1, 0, 1, 0, 0],
  [1, 0, 0, 0, 0, 1, 0, -1, 0],
  [1, 0, 0, 0, 0, -1, 0, 1, 0],
  [1, 0, 0, 0, -1, 0, 0, 0, -1],
  [-1, 0, 0, 0, -1, 0, 0, 0, 1],
];

// What is round a reflection probe, as the cube the models near it read:
// the scene as its lights light it, in linear light, seen from where the
// probe is through each side of a cube, over the probe's own colour for
// what nothing is seen of, or over the surroundings where those are what is
// behind the scene, with no tone mapping; and that blurred level by level
// (`glossed`). Qt looks from one to ten thousand away.
//
// A probe that is looked through once is looked through again when it is
// asked to be, and when more of the scene is here than was.
const cubes = new WeakMap();
let reflecting;
function reflected(probe, scene, environment, surroundings) {
  blur ??= program(COVER, BLUR, BLURRING);
  gloss ??= program(COVER, GLOSS, ["u_from", "u_few[0]", "u_count", "u_side"]);
  if (!blur || !gloss) return;
  const { across } = probe;
  let held = cubes.get(probe.key);
  if (held && held.across !== across) {
    gl.deleteTexture(held.raw);
    gl.deleteTexture(held.cube);
    gl.deleteRenderbuffer(held.depth);
    gl.deleteFramebuffer(held.frame);
    gl.deleteFramebuffer(held.blurring);
    held = null;
    reflecting = undefined;
  }
  const projection = math.perspective(90, 1, 1, 10000);
  const through = LOOKS.map((look) => {
    const eye = [look[0], look[1], look[2], 0, look[3], look[4], look[5], 0, look[6], look[7], look[8], 0, ...probe.at, 1];
    const told = said(environment, surroundings, eye, projection, 0, 1, 10000);
    return { told, eye, ...listed(scene, told, true) };
  });
  const there = `${probe.turn} ${surroundings && environment.sky ? 1 : 0} ${through[0].solid.length + through[0].reading.length + through[0].clear.length}`;
  if (held && probe.once && held.there === there) return;
  if (!held) {
    held = { across, raw: cube(across, Math.floor(Math.log2(across)) + 1), cube: cube(across, LEVELS), depth: gl.createRenderbuffer(), frame: gl.createFramebuffer(), blurring: gl.createFramebuffer() };
    gl.bindRenderbuffer(gl.RENDERBUFFER, held.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, across, across);
    gl.bindFramebuffer(gl.FRAMEBUFFER, held.frame);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, held.depth);
    cubes.set(probe.key, held);
  }
  held.there = there;
  // Nothing is behind what reads what is behind it, in what a probe sees.
  pictured(SCREEN, flat(0, 0, 0, 255));
  pictured(DEPTH, flat(0, 0, 0, 255));
  through.forEach(({ told, eye, ...all }, side) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, held.frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + side, held.raw, 0);
    gl.viewport(0, 0, across, across);
    gl.depthMask(true);
    gl.clearColor(...probe.clear);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (surroundings && environment.sky) backdrop(surroundings, environment, projection, eye, 0);
    telling = told;
    tell();
    shining = null;
    pieces(all, environment, told);
  });
  covering();
  gl.activeTexture(gl.TEXTURE0 + MAKING);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, held.raw);
  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  gl.bindFramebuffer(gl.FRAMEBUFFER, held.blurring);
  glossed(held.raw, held.cube, across, LEVELS);
  gl.activeTexture(gl.TEXTURE0);
  gl.depthMask(true);
  gl.useProgram(shaded.program);
}

// Draws `scene` (`{ width, height, environment, projection, camera, models,
// lights, probes }`) and hands the picture to `paper`, the context of
// `canvas`.
export function draw(scene, canvas, paper, ways = 0) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(scene.width * ratio);
  const height = Math.round(scene.height * ratio);
  if (width <= 0 || height <= 0 || !context()) {
    canvas.width = canvas.height = 0;
    return;
  }
  if (surface.width !== width) surface.width = width;
  if (surface.height !== height) surface.height = height;
  turn++;
  worn = null;
  const { environment } = scene;
  const probe = environment.probe ? probed(environment.probe.map) : null;
  // What an effect brings to the screen afterwards is drawn in linear
  // light, into something that holds it.
  const grade = environment.grade && unscreened(width, height) ? environment.grade : null;
  // And so is what effects are run over.
  const effects = environment.effects?.length && unscreened(width, height) ? environment.effects : null;
  const late = Boolean(grade || effects);
  // Left as it is drawn (-1): which is not the same as no tone mapping
  // being asked for (0), where what lights from all round is as bright as
  // its picture says.
  const tonemap = late && environment.tonemap !== 0 ? -1 : environment.tonemap;
  const frame = smoothed(width, height, environment.samples, late ? gl.RGBA16F : gl.RGBA8);
  gl.bindFramebuffer(gl.FRAMEBUFFER, frame ?? (late ? linear.frame : null));
  gl.viewport(0, 0, width, height);
  gl.depthMask(true);
  // What is behind the scene is a colour of the screen's, which Qt brings
  // to linear light and back as it does everything it draws.
  const [red, green, blue, alpha] = environment.clear;
  gl.clearColor(...toned([red, green, blue], tonemap).map((channel) => channel * alpha), alpha);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.activeTexture(gl.TEXTURE0 + PROBE);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, probe?.cube ?? nothing);
  gl.activeTexture(gl.TEXTURE0);

  if (scene.camera) {
    // The eye sees from where the camera is and the way it is turned,
    // however big it is.
    const eye = math.unscaled(scene.camera);
    if (probe && environment.sky) backdrop(probe, environment, scene.projection, eye, tonemap);
    const told = said(environment, probe, eye, scene.projection, tonemap, scene.near ?? 0, scene.far ?? 0);
    const all = listed(scene, told, false);
    const { solid } = all;
    const each = [...solid, ...all.reading, ...all.clear];

    // What is round each reflection probe that something mirrors by is
    // drawn for it first.
    const mirrors = new Set(each.map(({ mirror }) => mirror).filter(Boolean));
    if (mirrors.size) {
      for (const mirror of mirrors) reflected(mirror, scene, environment, probe);
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame ?? (late ? linear.frame : null));
      gl.viewport(0, 0, width, height);
    }
    telling = told;
    tell();
    shining = null;

    // What is behind what reads it is drawn for it first, as it is in
    // linear light: what nothing is seen through, over what is behind the
    // scene. Something that reads only how far that is, and is not seen
    // through, is itself of it, as in Qt.
    const reading = each.filter(({ material }) => material?.custom?.source.screen || material?.custom?.source.depth);
    const back = reading.length ? behind(width, height) : null;
    if (back) {
      // Read while it is being drawn, there is nothing behind anything.
      pictured(SCREEN, flat(0, 0, 0, 255));
      pictured(DEPTH, flat(0, 0, 0, 255));
      gl.bindFramebuffer(gl.FRAMEBUFFER, back.frame);
      gl.depthMask(true);
      gl.clearColor(red * alpha, green * alpha, blue * alpha, alpha);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (probe && environment.sky) backdrop(probe, environment, scene.projection, eye, -1);
      telling = { ...told, tonemap: -1 };
      tell();
      shining = null;
      if (environment.depth) gl.enable(gl.DEPTH_TEST);
      else gl.disable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);
      for (const piece of solid) part(piece);
      gl.depthMask(true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame ?? (late ? linear.frame : null));
      const mipped = reading.some(({ material }) => material.custom.source.mips);
      gl.activeTexture(gl.TEXTURE0 + DEPTH);
      gl.bindTexture(gl.TEXTURE_2D, back.depth);
      gl.activeTexture(gl.TEXTURE0 + SCREEN);
      gl.bindTexture(gl.TEXTURE_2D, back.color);
      if (mipped) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.activeTexture(gl.TEXTURE0);
      telling = told;
      tell();
      shining = null;
    }

    pieces(all, environment, told);
  }

  if (frame) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, frame);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, late ? linear.frame : null);
    // With how far each place is, for an effect that reads it.
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT | (effects ? gl.DEPTH_BUFFER_BIT : 0), gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  const picture = effects ? affected(effects, linear.color, width, height, scene, canvas) : late ? linear.color : null;
  if (grade) finished(grade, picture);
  else if (effects) shown(picture, environment.tonemap);
  if (ways) retained(canvas, width, height, ways);
  // The picture leaves the surface for the canvas: nothing is copied.
  paper.transferFromImageBitmap(surface.transferToImageBitmap());
}
