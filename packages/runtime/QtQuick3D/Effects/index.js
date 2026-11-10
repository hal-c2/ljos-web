// `import QtQuick3D.Effects`: the effects Qt has ready, Blur and Vignette
// and the rest. None of it is in C++: each is QML over Effect. Some are
// Ljós's, with shaders of Ljós's (`quick3d/`); the others are Qt's own, with
// shaders kept in its plugin, read from a Qt that is installed.
//
// What runs them is the Effect of QtQuick3D (`../effects.js`).
export {};
