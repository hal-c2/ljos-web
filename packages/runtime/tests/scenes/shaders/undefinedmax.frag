// `nothing` is 0 and not a constant, so the compiler can't fold this away:
// what FX_Material_Showroom's floor comes to when its roughness is 0. One is
// added as a number written to the screen as NaN reads as 0, like the answer.
void MAIN()
{
    float none = nothing / nothing;
    FRAGCOLOR = vec4(1.0 + max(0.0, none), 1.0 + vec2(0.0).x + max(vec2(0.0), vec2(none)).y, 1.0 + min(0.0, none), 1.0);
}
