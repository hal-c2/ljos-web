void MAIN()
{
    vec4 c = texture(INPUT, INPUT_UV);
    vec3 bloom = texture(bloomed, INPUT_UV).rgb * tonemappingLerp / (1.0 + blurFalloff);
    vec3 lit = (c.rgb + bloom) * pow(2.0, exposure);
    FRAGCOLOR = vec4(pow(lit, vec3(1.0 / gamma)), c.a);
}
