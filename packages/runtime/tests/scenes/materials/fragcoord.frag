// Written as FX_Material_Showroom's snow writes it: by gl_FragCoord, not FRAGCOORD.
void MAIN()
{
    bool upper = gl_FragCoord.y / float(textureSize(SCREEN_TEXTURE, 0).y) > 0.5;
    bool deep = gl_FragCoord.z > 0.5 && gl_FragCoord.z < 1.0;
    FRAGCOLOR = vec4(upper ? 1.0 : 0.0, deep ? 1.0 : 0.0, 0.0, 1.0);
}
