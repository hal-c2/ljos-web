// The shaders a scene has of its own, made shaders a browser draws with.
//
// What a CustomMaterial names is a piece of a shader, as Qt has it written:
// a function `MAIN`, beside it for a material that is lit a function for
// each thing it would rather answer for itself (what a light gives it, what
// its surroundings do, what is done to the sum), and words in capitals for
// what Qt hands it: `MODEL_MATRIX`, `BASE_COLOR`, `SCREEN_TEXTURE`. Qt puts
// the piece into a shader of its own, and says there what the words are.
//
// So it is here, with the shader every other shape is drawn with: what that
// declares is declared, each word in capitals is put for what it has for
// it, and a `main` calls the piece where Qt's would, lighting what is lit
// by the same sums as a PrincipledMaterial is lit by. Everything of the
// renderer's own has `qt_` before its name, which Qt keeps for itself, so
// that a piece can call its own things what it likes.
//
// An Effect's shaders are such pieces too, of a shader that draws nothing
// but a picture over the whole of another: theirs is a small one of its
// own, with only what Qt hands an effect in it.
//
// A piece for the corners of a shape that has targets is handed what each
// target has for the corner (`MORPH_POSITION(0)`) and how much each weighs
// (`MORPH_WEIGHTS`), and what it does with them is its own: a shape drawn
// with any piece for its corners is not moved towards its targets, and one
// whose piece names what a target has does not face towards them either.
//
// Not here: what a piece is handed of a shape that bends by a skin
// (`BONE_TRANSFORMS`), what a target has of a corner besides where it is
// and the ways it faces, what is seen through a surface that lets light
// through it (`TRANSMISSION_FACTOR` and what goes with it are handed to a
// piece, and what it says of them is not drawn), a picture of
// the light a scene was baked with, of how its surfaces face or of how they
// move (`LIGHTMAP`, `NORMAL_ROUGHNESS_TEXTURE`, `MOTION_VECTOR_TEXTURE`),
// more than one eye (`VIEW_INDEX` is always the first), and what a piece's
// functions would share of their own (`SHARED_VARS`), which Qt 6.11 does
// not compile either.
import { conditioned, prefixed, Reader, words } from "./glsl.js";

// What Qt's words are here.
const NAMES = {
  MODELVIEWPROJECTION_MATRIX: "qt_u_all",
  VIEWPROJECTION_MATRIX: "qt_u_seen",
  MODEL_MATRIX: "qt_u_world",
  VIEW_MATRIX: "qt_u_view",
  NORMAL_MATRIX: "qt_u_facing",
  PROJECTION_MATRIX: "qt_u_projection",
  INVERSE_PROJECTION_MATRIX: "qt_u_unprojected",
  CAMERA_POSITION: "qt_u_eye",
  CAMERA_DIRECTION: "qt_u_looking",
  CAMERA_PROPERTIES: "qt_u_clips",
  // A picture drawn into has its first row at the bottom, as OpenGL's do.
  FRAMEBUFFER_Y_UP: "1.0",
  NDC_Y_UP: "1.0",
  NEAR_CLIP_VALUE: "(-1.0)",
  IBL_MAXMIPMAP: "qt_u_probing.y",
  IBL_HORIZON: "qt_u_probing.z",
  IBL_EXPOSE: "qt_u_probing.w",
  IBL_TEXTURE: "qt_u_probe",
  POSITION: "gl_Position",
  FRAGCOLOR: "qt_fragColor",
  POINT_SIZE: "gl_PointSize",
  FRAGCOORD: "gl_FragCoord",
  SCREEN_TEXTURE: "qt_u_screen",
  SCREEN_MIP_TEXTURE: "qt_u_screen",
  DEPTH_TEXTURE: "qt_u_depth",
  AO_TEXTURE: "qt_u_white",
  VAR_WORLD_NORMAL: "qt_v_normal",
  VAR_WORLD_TANGENT: "qt_v_tangent",
  VAR_WORLD_BINORMAL: "qt_v_binormal",
  VAR_WORLD_POSITION: "qt_v_position",
  VAR_COLOR: "qt_v_color",
  INSTANCE_COLOR: "qt_inst_color",
  INSTANCE_DATA: "qt_inst_data",
  INSTANCE_INDEX: "gl_InstanceID",
  VIEW_INDEX: "0",
  MORPH_POSITION: "qt_morphPosition",
  MORPH_NORMAL: "qt_morphNormal",
  MORPH_TANGENT: "qt_morphTangent",
  MORPH_BINORMAL: "qt_morphBinormal",
  MORPH_WEIGHTS: "qt_u_morphBy",
  QT_MORPH_MAX_COUNT: "qt_u_morphs",
  // And of an effect: the picture it is run over, where in it a place is
  // read, and how big it and what is drawn into are.
  INPUT: "qt_u_input",
  INPUT_UV: "qt_v_input",
  TEXTURE_UV: "qt_v_texture",
  INPUT_SIZE: "qt_u_inputSize",
  OUTPUT_SIZE: "qt_u_outputSize",
  FRAME: "qt_u_frame",
};

// The functions a piece may have, what each is called here, and what Qt
// hands it: said by Qt, not by the piece.
const CALLED = {
  MAIN: "qt_customMain",
  DIRECTIONAL_LIGHT: "qt_directionalLightProcessor",
  POINT_LIGHT: "qt_pointLightProcessor",
  SPOT_LIGHT: "qt_spotLightProcessor",
  AMBIENT_LIGHT: "qt_ambientLightProcessor",
  SPECULAR_LIGHT: "qt_specularLightProcessor",
  POST_PROCESS: "qt_customPostProcessor",
  IBL_PROBE: "qt_iblProbeProcessor",
};

const CORNER =
  "inout vec3 VERTEX, inout vec3 NORMAL, inout vec2 UV0, inout vec2 UV1, inout vec3 TANGENT, inout vec3 BINORMAL, inout ivec4 JOINTS, inout vec4 WEIGHTS, inout vec4 COLOR, inout mat4 INSTANCE_MODEL_MATRIX, inout mat4 INSTANCE_MODELVIEWPROJECTION_MATRIX";

const HANDED = {
  MAIN: "inout vec4 BASE_COLOR, inout vec3 EMISSIVE_COLOR, inout float METALNESS, inout float ROUGHNESS, inout float SPECULAR_AMOUNT, inout float FRESNEL_POWER, inout vec3 NORMAL, inout vec3 TANGENT, inout vec3 BINORMAL, in vec2 UV0, in vec2 UV1, in vec3 VIEW_VECTOR, inout float IOR, inout float OCCLUSION_AMOUNT, inout float CLEARCOAT_AMOUNT, inout float CLEARCOAT_FRESNEL_POWER, inout float CLEARCOAT_ROUGHNESS, inout vec3 CLEARCOAT_NORMAL, inout float CLEARCOAT_FRESNEL_SCALE, inout float CLEARCOAT_FRESNEL_BIAS, inout float FRESNEL_SCALE, inout float FRESNEL_BIAS, inout float TRANSMISSION_FACTOR, inout float THICKNESS_FACTOR, inout vec3 ATTENUATION_COLOR, inout float ATTENUATION_DISTANCE",
  DIRECTIONAL_LIGHT: "inout vec3 DIFFUSE, in vec3 LIGHT_COLOR, in float SHADOW_CONTRIB, in vec3 TO_LIGHT_DIR, in vec3 NORMAL, in vec4 BASE_COLOR, in float METALNESS, in float ROUGHNESS, in vec3 VIEW_VECTOR",
  POINT_LIGHT: "inout vec3 DIFFUSE, in vec3 LIGHT_COLOR, in float LIGHT_ATTENUATION, in float SHADOW_CONTRIB, in vec3 TO_LIGHT_DIR, in vec3 NORMAL, in vec4 BASE_COLOR, in float METALNESS, in float ROUGHNESS, in vec3 VIEW_VECTOR",
  SPOT_LIGHT:
    "inout vec3 DIFFUSE, in vec3 LIGHT_COLOR, in float LIGHT_ATTENUATION, in float SPOT_FACTOR, in float SHADOW_CONTRIB, in vec3 TO_LIGHT_DIR, in vec3 NORMAL, in vec4 BASE_COLOR, in float METALNESS, in float ROUGHNESS, in vec3 VIEW_VECTOR",
  AMBIENT_LIGHT: "inout vec3 DIFFUSE, in vec3 TOTAL_AMBIENT_COLOR, in vec3 NORMAL, in vec3 VIEW_VECTOR",
  SPECULAR_LIGHT:
    "inout vec3 SPECULAR, in vec3 LIGHT_COLOR, in float LIGHT_ATTENUATION, in float SHADOW_CONTRIB, in vec3 FRESNEL_CONTRIB, in vec3 TO_LIGHT_DIR, in vec3 NORMAL, in vec4 BASE_COLOR, in float METALNESS, in float ROUGHNESS, in float SPECULAR_AMOUNT, in vec3 VIEW_VECTOR",
  POST_PROCESS: "inout vec4 COLOR_SUM, in vec4 DIFFUSE, in vec3 SPECULAR, in vec3 EMISSIVE, in vec2 UV0, in vec2 UV1",
  IBL_PROBE: "inout vec3 DIFFUSE, inout vec3 SPECULAR, in vec4 BASE_COLOR, in float AO_FACTOR, in float SPECULAR_AMOUNT, in float ROUGHNESS, in vec3 NORMAL, in vec3 VIEW_VECTOR, in mat3 IBL_ORIENTATION",
};

// What Qt's words in a piece are: all of them, for what asks whether it
// reads what is behind it, or says where its corners go.
export function mentioned(source) {
  return new Set(String(source ?? "").match(/\b[A-Z][A-Z0-9_]+\b/g));
}

// A piece with Qt's words put for what they are here: its text, which of
// the functions it has, and what it hands from one shader to the other.
// `takes` is what each function is handed, or nothing for what Qt hands
// nothing.
function worded(source, corners, takes) {
  const all = words(conditioned(source, { QSHADER_VIEW_COUNT: 1 }));
  const code = all.filter((word) => word.kind !== "space" && word.kind !== "line");
  const has = new Set();
  const handed = [];
  code.forEach((word, index) => {
    const { text } = word;
    if (word.kind !== "name" || code[index - 1]?.text === ".") return;
    if (text === "VARYING") {
      word.text = corners ? "out" : "in";
      let end = index + 1;
      while (code[end] && code[end].text !== ";") end++;
      handed.push({ name: code[end - 1]?.text, said: all.slice(all.indexOf(word) + 1, all.indexOf(code[end])).map((each) => each.text).join("").trim() });
    } else if (CALLED[text] && code[index - 1]?.text === "void" && code[index + 1]?.text === "(") {
      // What a function is handed is not said by the piece.
      has.add(text);
      word.text = CALLED[text];
      let end = index + 2;
      while (code[end] && code[end].text !== ")") code[end++].text = "";
      code[index + 1].text = `(${takes(text)}`;
    } else if (Object.hasOwn(NAMES, text)) word.text = NAMES[text];
  });
  return { text: all.map((word) => word.text).join(""), has, handed };
}

// GLSL says max is "y if x < y, otherwise x", and min the other way about, and
// Qt's OpenGL does just that; WebGL's built-ins can answer NaN if either side
// is. A shader may lean on it: FX_Material_Showroom's floor takes
// max(0.0, 0.0 / 0.0) where its roughness is 0, and was black with the built-in.
// Whole numbers are never NaN: they have the built-ins, under the same name.
const SIZES = ["", 2, 3, 4];
const forms = (row, one) => SIZES.flatMap((n) => (n ? [[`${row}${n}`, `${row}${n}`], [`${row}${n}`, one]] : [[one, one]]));
const ORDERED = [
  ...forms("vec", "float").map(([a, b]) => {
    const y = a === b ? "y" : `${a}(y)`;
    const pick = a === "float" ? (test) => `${test[0]} < ${test[1]} ? y2 : x` : (test) => `mix(x, y2, lessThan(${test[0]}, ${test[1]}))`;
    return `${a} qt_max(${a} x, ${b} y) { ${a} y2 = ${y}; return ${pick(["x", "y2"])}; }
${a} qt_min(${a} x, ${b} y) { ${a} y2 = ${y}; return ${pick(["y2", "x"])}; }`;
  }),
  ...[...forms("ivec", "int"), ...forms("uvec", "uint")].map(
    ([a, b]) => `${a} qt_max(${a} x, ${b} y) { return max(x, y); }
${a} qt_min(${a} x, ${b} y) { return min(x, y); }`,
  ),
].join("\n");

// What both shaders are told besides what the renderer's own are.
const BOTH = `
uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_seen;
uniform mat4 u_unprojected;
uniform vec3 u_looking;
uniform vec2 u_clips;
uniform highp sampler2D u_screen;
uniform highp sampler2D u_depth;
uniform highp sampler2D u_white;
`;

const CORNERS = `
layout(location = 13) in vec4 inst_data;
uniform vec3 u_eye;
uniform vec4 u_probing;
${BOTH}
// What one target has for this corner, whatever it weighs: nothing, where
// the mesh has no such thing of its targets.
vec3 targeted(int first, int index) {
    return u_morphs > 0 && first >= 0 ? target(first + index) : vec3(0.0);
}
vec3 morphPosition(int index) { return targeted(u_morphAt.x, index); }
vec3 morphNormal(int index) { return targeted(u_morphAt.y, index); }
vec3 morphTangent(int index) { return targeted(u_morphAt.z, index); }
vec3 morphBinormal(int index) { return targeted(u_morphAt.w, index); }
`;

// The words of a piece that has what its targets are from them itself.
const MORPHING = ["MORPH_POSITION", "MORPH_NORMAL", "MORPH_TANGENT", "MORPH_BINORMAL", "MORPH_WEIGHTS"];

const PIXELS = `
uniform mat4 u_all;
uniform mat4 u_world;
uniform mat3 u_facing;
uniform bool u_instanced;
${BOTH}
vec3 sRGBToLinear(vec3 c) {
    return toLinear(c);
}

vec4 sRGBToLinear(vec4 c) {
    return vec4(toLinear(c.rgb), c.a);
}

vec3 linearTosRGB(vec3 c) {
    return toScreen(c);
}

vec4 linearTosRGB(vec4 c) {
    return vec4(toScreen(c.rgb), c.a);
}
`;

// Where a corner goes: as the renderer's own shader puts it, with the
// piece asked first, of the corner as the mesh has it. A piece that says
// itself where the corner is on the screen is not said otherwise.
//
// A shape with targets goes towards them as Qt has it: all of it, where
// there is no piece for the corners (`morphs` is "all"); where there is
// one, only the ways a corner faces, after the piece is asked ("facing");
// and nothing, where the piece names what a target has ("none").
const corner = (has, placed, morphs) => `
void main() {
    customGlobals();
    vec3 vertex = attr_pos;
    vec3 facing = attr_norm;
    vec2 uv0 = attr_uv0;
    vec2 uv1 = attr_uv1;
    vec3 tangent = attr_textan;
    vec3 binormal = attr_binormal;
    ivec4 joints = ivec4(attr_joints);
    vec4 weights = attr_weights;
    vec4 color = attr_color;
    mat4 world = u_world;
    mat3 turn = u_facing;
    mat4 all = u_all;
    if (u_instanced) {
        world = u_above * transpose(mat4(inst_row0, inst_row1, inst_row2, vec4(0.0, 0.0, 0.0, 1.0))) * u_world;
        turn = transpose(inverse(mat3(world)));
        all = u_all * world;
        color *= inst_color;
    }
    gl_PointSize = u_point;
    ${has.has("MAIN") ? "customMain(vertex, facing, uv0, uv1, tangent, binormal, joints, weights, color, world, all);" : ""}
    ${morphs === "all" ? "if (u_morphs > 0) vertex = morphed(vertex, u_morphAt.x);" : ""}
    ${morphs === "none" ? "" : "if (u_morphs > 0) { facing = morphed(facing, u_morphAt.y); tangent = morphed(tangent, u_morphAt.z); binormal = morphed(binormal, u_morphAt.w); }"}
    vec4 position = vec4(vertex, 1.0);
    if (u_skinned && weights != vec4(0.0)) {
        mat4 moved = bone(joints.x * 2) * weights.x + bone(joints.y * 2) * weights.y + bone(joints.z * 2) * weights.z + bone(joints.w * 2) * weights.w;
        position = moved * position;
        facing = (mat3(bone(joints.x * 2 + 1)) * weights.x + mat3(bone(joints.y * 2 + 1)) * weights.y + mat3(bone(joints.z * 2 + 1)) * weights.z + mat3(bone(joints.w * 2 + 1)) * weights.w) * facing;
        tangent = mat3(moved) * tangent;
        binormal = mat3(moved) * binormal;
    }
    v_color = color;
    v_position = (world * position).xyz;
    v_normal = normalize(turn * facing);
    v_tangent = mat3(world) * tangent;
    v_binormal = mat3(world) * binormal;
    v_uv = uv0;
    v_uv1 = uv1;
    ${placed ? "" : "gl_Position = all * position;"}
}
`;

// What is not lit is the colour its piece says, as it says it.
const unlit = (has) => `
void main() {
    customGlobals();
    fragColor = vec4(1.0);
    ${has.has("MAIN") ? "customMain();" : ""}
}
`;

// What is lit, by Qt's sums for a PrincipledMaterial: the piece says what
// the surface is, and each light gives it what the piece's function for
// that light says, or what Qt's own would. How far the sum is seen through
// is written as it is, and not times the colour as the renderer's own
// shader writes it: nothing is seen through a CustomMaterial that does not
// say how it is blended.
//
// A clear coat is over what the piece says one is over: Qt has one only for
// a piece that says \`CLEARCOAT_AMOUNT\`, and so it is here (\`coats\`). What
// is round a reflection probe is in place of the surroundings, and of what
// the piece would say of them itself.
const lit = (has, coats) => `
void main() {
    customGlobals();
    vec4 custom = vec4(1.0);
    vec3 given = vec3(0.0);
    float metalness = 0.0;
    float roughness = 0.0;
    float specular = 0.5;
    float power = 5.0;
    float ior = 1.5;
    float reached = 1.0;
    float side = u_sided && !gl_FrontFacing ? -1.0 : 1.0;
    vec3 N = normalize(v_normal) * side;
    vec3 T = normalize(v_tangent) * side;
    vec3 B = normalize(v_binormal) * side;
    vec3 V = normalize(u_eye - v_position);
    float coat = 0.0;
    float coatPower = 5.0;
    float coatRoughness = 0.0;
    vec3 coated = N;
    vec2 coatEdge = vec2(1.0, 0.0);
    vec2 edged = vec2(1.0, 0.0);
    float through = 0.0;
    float thick = 0.0;
    vec3 dimming = vec3(1.0);
    float dimmingBy = 0.0;
    ${has.has("MAIN") ? "customMain(custom, given, metalness, roughness, specular, power, N, T, B, v_uv, v_uv1, V, ior, reached, coat, coatPower, coatRoughness, coated, coatEdge.x, coatEdge.y, edged.x, edged.y, through, thick, dimming, dimmingBy);" : ""}
    vec3 coating = vec3(0.0);
    vec4 base = custom * (u_colors ? v_color : vec4(1.0));
    float alpha = base.a * u_opacity;
    vec3 diffuse = vec3(0.0);
    vec3 shine = vec3(0.0);
    vec3 dim = u_ambient * (1.0 - metalness) * base.rgb;
    ${has.has("AMBIENT_LIGHT") ? "ambientLightProcessor(diffuse, dim, N, V);" : "diffuse = dim;"}
    float bent = ((ior - 1.0) * (ior - 1.0)) / ((ior + 1.0) * (ior + 1.0));
    vec3 f0 = vec3(bent) * (1.0 - metalness) + base.rgb * metalness;
    float NdotV = clamp(dot(N, V), 0.0, 1.0);
    float edge = power == 0.0 ? 1.0 : pow(1.0 - NdotV, power);
    vec3 turning = f0 + (max(vec3(1.0 - roughness), f0) - f0) * edge;
    vec3 amount = vec3(metalness + specular * (1.0 - metalness)) * clamp(edged.y + edged.x * turning, 0.0, 1.0);
    for (int index = 0; index < u_count; index++) {
        vec3 L = -u_lightWay[index];
        float fade = 1.0;
        float kind = u_lightPlace[index].w;
        // Qt takes what is metal out of the light here, and out of the sum
        // of them once more below.
        vec3 less = u_lightColor[index] * (1.0 - metalness);
        if (kind < 0.5) {
            ${has.has("DIRECTIONAL_LIGHT") ? "directionalLightProcessor(diffuse, less, 1.0, L, N, custom, metalness, roughness, V);" : "diffuse += base.rgb * less * burley(N, L, V, roughness);"}
        } else {
            vec3 to = u_lightPlace[index].xyz - v_position;
            float far = max(length(to), 0.000001);
            L = to / far;
            vec3 by = u_lightFade[index];
            fade = 1.0 / (by.x + by.y * far + by.z * far * far);
            if (kind < 1.5) {
                ${has.has("POINT_LIGHT") ? "pointLightProcessor(diffuse, less, fade, 1.0, L, N, custom, metalness, roughness, V);" : "diffuse += base.rgb * less * fade * burley(N, L, V, roughness);"}
            } else {
                vec2 cone = u_lightCone[index];
                float spot = smoothstep(cone.x, max(cone.y, cone.x + 0.0001), dot(-L, u_lightWay[index]));
                if (spot > 0.0) {
                    ${has.has("SPOT_LIGHT") ? "spotLightProcessor(diffuse, less, fade, spot, 1.0, L, N, custom, metalness, roughness, V);" : "diffuse += base.rgb * less * fade * spot * burley(N, L, V, roughness);"}
                }
                fade *= spot;
            }
        }
        ${has.has("SPECULAR_LIGHT") ? "specularLightProcessor(shine, u_lightColor[index], fade, 1.0, amount, L, N, custom, metalness, roughness, specular, V);" : "shine += u_lightColor[index] * fade * ggx(N, L, V, f0, roughness);"}
        ${coats ? "coating += u_lightColor[index] * fade * ggx(coated, L, V, vec3(bent), coatRoughness);" : ""}
    }
    diffuse *= reached;
    if (u_mirroring.x > 0.5) {
        diffuse += base.rgb * (1.0 - amount) * aroundHere(N);
        shine += mirroredHere(N, V, amount, roughness);
        ${coats ? "coating += mirroredHere(coated, V, vec3(bent), coatRoughness);" : ""}
    } else if (u_probing.x > 0.5 && u_probing.w >= 0.005) {
        vec3 about = vec3(0.0);
        vec3 back = vec3(0.0);
        ${
          has.has("IBL_PROBE")
            ? "iblProbeProcessor(about, back, custom, reached, specular, roughness, N, V, u_probeTurn);"
            : `about = base.rgb * (1.0 - amount) * around(N);
        back = mirrored(N, V, amount, roughness);`
        }
        diffuse += about * reached;
        shine += back * reached;
        ${coats && !has.has("IBL_PROBE") ? "coating += mirrored(coated, V, vec3(bent), coatRoughness) * reached;" : ""}
    }
    diffuse *= 1.0 - metalness;
    if (u_fogDepth.w + u_fogHeight.w > 0.5) fogged(given, shine, diffuse);
    vec4 sum = vec4(diffuse + shine + given, alpha);
    ${
      coats
        ? `float turn = clamp(pow(clamp(dot(coated, V), 0.0, 1.0), coatPower), 0.0, 1.0);
    vec3 over = vec3(bent) + (vec3(1.0) - vec3(bent)) * (1.0 - turn);
    over = clamp(vec3(coatEdge.y) + coatEdge.x * over, 0.0, 1.0);
    sum.rgb = sum.rgb * (1.0 - coat * over) + coating * coat;`
        : ""
    }
    ${has.has("POST_PROCESS") ? "customPostProcessor(sum, vec4(diffuse, alpha), shine, given, v_uv, v_uv1);" : ""}
    fragColor = vec4(tonemap(sum.rgb), sum.a);
}
`;

// The renderer's own shader as far as its `main`, with what a piece is
// told besides, and what reads a piece knowing all of it.
const heads = new Map();
function head(own, more) {
  let made = heads.get(own);
  if (!made) {
    const text = prefixed(own.slice(0, own.lastIndexOf("void main()")).replace("precision highp float;", "precision highp float;\nprecision highp int;") + more);
    const reader = new Reader();
    reader.declare(text);
    heads.set(own, (made = { text, reader }));
  }
  return made;
}

// One of the two shaders: the head, what the material hands the piece, the
// piece fitted for a browser, and the `main` that calls it.
function whole({ text, reader }, declared, extra, piece, main) {
  const reading = reader.fork();
  reading.declare(`${declared}\n${extra}`);
  const fitted = reading.fitted(piece);
  // After it is fitted: the reader knows what max and min give.
  const ordered = (code) => code.replace(/(?<![\w.])(max|min)(?=\s*\()/g, "qt_$1");
  return `${text}\n${declared}\n${extra}\n${ORDERED}\n${ordered(fitted.text)}\nvoid qt_customGlobals() {\n${ordered(fitted.begun.join("\n"))}\n}\n${prefixed(main)}`;
}

// The two shaders a CustomMaterial draws with. `own` is the renderer's
// (`{ vertex, fragment }`); `declared` is what the material's properties
// are to its pieces.
export function customised(own, { vertex, fragment, shaded, declared }) {
  const corners = worded(vertex, true, () => CORNER);
  const pixels = worded(fragment, false, (name) => (shaded ? HANDED[name] : ""));
  // What one shader reads of the other, the other hands it: nothing, where
  // its piece says nothing of it.
  const missing = pixels.handed.filter((read) => !corners.handed.some((written) => written.name === read.name)).map((read) => `out ${read.said};`);
  const names = mentioned(vertex);
  const morphs = !String(vertex ?? "").trim() ? "all" : corners.has.has("MAIN") && MORPHING.some((name) => names.has(name)) ? "none" : "facing";
  return {
    vertex: whole(head(own.vertex, CORNERS), declared, missing.join("\n"), corners.text, corner(corners.has, names.has("POSITION"), morphs)),
    fragment: whole(head(own.fragment, PIXELS), declared, "", pixels.text, shaded ? lit(pixels.has, mentioned(fragment).has("CLEARCOAT_AMOUNT")) : unlit(pixels.has)),
  };
}

// What both shaders of an effect begin with: the picture it is run over,
// how far each thing in it is, the sizes of it and of what is drawn into,
// and the camera's.
const SEEN = `
uniform highp sampler2D u_input;
uniform highp sampler2D u_depth;
uniform vec2 u_inputSize;
uniform vec2 u_outputSize;
uniform float u_frame;
uniform vec2 u_clips;
uniform mat4 u_projection;
uniform mat4 u_unprojected;
`;

const begun = (text) => {
  const reader = new Reader();
  const head = prefixed(text);
  reader.declare(head);
  return { text: head, reader };
};

let over = null;
const OVER = () =>
  (over ??= {
    vertex: begun(`#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec3 attr_pos;
layout(location = 1) in vec2 attr_uv;
out vec2 v_input;
out vec2 v_texture;
${SEEN}`),
    fragment: begun(`#version 300 es
precision highp float;
precision highp int;
in vec2 v_input;
in vec2 v_texture;
layout(location = 0) out vec4 fragColor;
${SEEN}`),
  });

// The two shaders a pass of an Effect draws with: a rectangle over the
// whole of what is drawn into, whose corners the first piece may move, and
// the colour the second says of each place in it, which is that of the
// picture there where it says none.
export function effected({ vertex, fragment, declared }) {
  const corners = worded(vertex, true, () => "inout vec3 VERTEX");
  const pixels = worded(fragment, false, () => "");
  const missing = pixels.handed.filter((read) => !corners.handed.some((written) => written.name === read.name)).map((read) => `out ${read.said};`);
  const head = OVER();
  return {
    vertex: whole(
      head.vertex,
      declared,
      missing.join("\n"),
      corners.text,
      `
void main() {
    customGlobals();
    vec3 vertex = attr_pos;
    v_input = attr_uv;
    v_texture = attr_uv;
    ${corners.has.has("MAIN") ? "customMain(vertex);" : ""}
    gl_Position = vec4(vertex, 1.0);
}
`,
    ),
    fragment: whole(
      head.fragment,
      declared,
      "",
      pixels.text,
      `
void main() {
    customGlobals();
    fragColor = texture(u_input, v_input);
    ${pixels.has.has("MAIN") ? "customMain();" : ""}
}
`,
    ),
  };
}
