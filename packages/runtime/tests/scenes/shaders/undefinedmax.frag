// `nothing` is 0 and not a constant, so the compiler can't fold this away:
// what FX_Material_Showroom's floor comes to when its roughness is 0. One is
// added as a number written to the screen as NaN reads as 0, like the answer.
// A constant is worked out by the compiler, from the max it knows.
const float TWO = max(1.0, 2.0);
float ONE = min(1.0, 2.0);

// As a material says it: what the macro comes to is what is called.
#define SAT(x) max(0.0, min(1.0, x))

void MAIN()
{
    const float three = max(1.0, 3.0);
    float room[max(2, 3)];
    float none = nothing / nothing;
    FRAGCOLOR = vec4(1.0 + max(0.0, none) + (TWO - 2.0) + (three - 3.0) + (ONE - 1.0) + float(room.length() - 3), 1.0 + vec2(0.0).x + max(vec2(0.0), vec2(none)).y, 1.0 + min(0.0, none) + SAT(none), 1.0);
}
