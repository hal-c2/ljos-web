void MAIN()
{
    vec2 step = along / INPUT_SIZE;
    vec3 sum = texture(INPUT, INPUT_UV).rgb * 0.227;
    sum += (texture(INPUT, INPUT_UV + step * 1.385).rgb + texture(INPUT, INPUT_UV - step * 1.385).rgb) * 0.316;
    sum += (texture(INPUT, INPUT_UV + step * 3.231).rgb + texture(INPUT, INPUT_UV - step * 3.231).rgb) * 0.0703;
    FRAGCOLOR = vec4(sum, 1.0);
}
