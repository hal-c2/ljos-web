void MAIN()
{
    vec4 c = texture(INPUT, INPUT_UV);
    float most = max(c.r, max(c.g, c.b));
    // A soft edge below the threshold, so that what comes up to it does not
    // appear all at once.
    float knee = bloomThreshold * 0.5;
    float over = clamp((most - knee) / max(bloomThreshold - knee, 0.0001), 0.0, 1.0);
    float strong = clamp(most / max(channelThreshold, 0.0001), 0.0, 1.0);
    FRAGCOLOR = vec4(c.rgb * over * strong, c.a);
}
