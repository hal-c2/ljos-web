#version 440

// A block with something in it that is no member: reported, not a crash.
uniform buf { layout x; };
void main() {}
