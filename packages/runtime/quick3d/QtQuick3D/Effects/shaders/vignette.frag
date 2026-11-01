void MAIN()
{
    vec4 c = texture(INPUT, INPUT_UV);
    vec2 uv = INPUT_UV * (1.0 - INPUT_UV.yx);
    float edge = clamp(pow(uv.x * uv.y * vignetteStrength, vignetteRadius), 0.0, 1.0);
    FRAGCOLOR = vec4(mix(vignetteColor, c.rgb, edge), c.a);
}
