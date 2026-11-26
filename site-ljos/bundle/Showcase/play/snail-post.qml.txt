import Ljos.Ui
import LjosPlay

// Snail Post: a post office under a hedge. Snails fetch letters, carry them
// to the boxes, nap under toadstools and stop to gossip.
World {
    id: post

    readonly property list<string> shells: ["#c9634f", "#d8a03f", "#7d6bb3", "#4f8fb0", "#b05c86", "#6f9a4c", "#c27f3d", "#8f6f5a"]

    name: "Snail Post"
    width: 800
    height: 560
    columns: 22
    rows: 15
    seed: 41
    backdrop: "#2f4233"
    poses: [
        Pose { name: "sort"; frames: [0, 2]; every: 350 },
        Pose { name: "post"; frames: [0, 2]; every: [700, 200] },
        Pose { name: "nap"; frames: [3] }
    ]

    Art {
        z: -1
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
            ctx.fillStyle = "#6f8f4e";
            ctx.fillRect(0, 0, w, h);
            const draw = post.random(7);
            for (let i = 0; i < 420; i++) {
                ctx.fillStyle = post.pick(draw, ["#678748", "#7b9b57", "#86a560"]);
                ctx.fillRect(Math.floor(draw() * w), Math.floor(draw() * h), 2, 1);
            }
            ctx.fillStyle = "#a88d63";
            ctx.fillRect(0, 96, w, 18);
            ctx.fillRect(168, 48, 18, 160);
            ctx.fillStyle = "#b79c70";
            for (let x = 4; x < w; x += 23)
                ctx.fillRect(x, 101 + (x % 7), 3, 2);
        }
    }

    Thing {
        id: hedge
        columns: post.columns
        solid: true

        Art {
            draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
                for (let x = 0; x < w; x += 8) {
                    ctx.fillStyle = x % 24 !== 0 ? "#35582f" : "#3f6636";
                    ctx.fillRect(x, (x * 5) % 4, 8, h);
                    ctx.fillStyle = "#5b8447";
                    ctx.fillRect(x + 2, (x * 3) % 7 + 2, 3, 2);
                }
            }
        }
    }

    // The sorting office: a log with two hatches.
    Thing {
        tx: 8
        ty: 1
        columns: 6
        rows: 2
        solid: true

        Art {
            draw: [
                [1, 3, 94, 27, "#3b2a24"], [3, 5, 90, 23, "#86603f"], [3, 5, 90, 4, "#9c7550"],
                [10, 14, 26, 11, "#3b2a24"], [60, 14, 26, 11, "#3b2a24"],
                [13, 20, 9, 5, "#efe6cf"], [24, 21, 8, 4, "#d8cdb2"], [64, 21, 10, 4, "#efe6cf"],
                [42, 11, 12, 9, "#efe6cf"], [47, 14, 2, 2, "#c9634f"]
            ]
        }
        Spot { kind: "hatch"; tx: 1; ty: 2; face: "up"; pose: "sort" }
        Spot { kind: "hatch"; tx: 4; ty: 2; face: "up"; pose: "sort" }
    }

    component Mailbox: Thing {
        property color coat: "#c9634f"

        solid: true
        Art {
            width: 16
            height: 22
            y: -6
            draw: [
                [7, 12, 3, 10, "#3b2a24"], [2, 2, 13, 11, "#3b2a24"], [3, 3, 11, 9, String(coat)],
                [5, 6, 7, 1, "#3b2a24"], [12, 0, 1, 4, "#efe6cf"], [12, 0, 3, 2, "#efe6cf"]
            ]
        }
        Spot { kind: "box"; ty: 1; face: "up"; pose: "post" }
    }

    Mailbox { tx: 2; ty: 5; coat: "#c9634f" }
    Mailbox { tx: 18; ty: 4; coat: "#4f8fb0" }
    Mailbox { tx: 5; ty: 11; coat: "#d8a03f" }
    Mailbox { tx: 16; ty: 12; coat: "#7d6bb3" }
    Mailbox { tx: 20; ty: 8; coat: "#b05c86" }

    component Toadstool: Thing {
        columns: 3
        rows: 2
        solid: true
        Art {
            draw: [
                [18, 14, 12, 17, "#3b2a24"], [19, 14, 10, 16, "#e6d8bd"],
                [6, 8, 36, 9, "#3b2a24"], [10, 3, 28, 7, "#3b2a24"],
                [7, 9, 34, 6, "#c94f4f"], [11, 4, 26, 7, "#c94f4f"],
                [14, 6, 5, 3, "#f6eee0"], [29, 8, 6, 3, "#f6eee0"], [23, 4, 3, 2, "#f6eee0"]
            ]
        }
        Spot { kind: "shade"; tx: 0; ty: 2; pose: "nap" }
        Spot { kind: "shade"; tx: 2; ty: 2; pose: "nap" }
    }

    Toadstool { tx: 1; ty: 8 }
    Toadstool { tx: 12; ty: 9 }

    Crowd {
        id: staff
        model: ["Pim", "Moss", "Juniper", "Tallow", "Bix", "Orla", "Fen", "Dot"]

        Actor {
            id: snail

            property bool laden: false
            property bool sleepy: false
            readonly property color shell: post.shells[post.hash(key) % post.shells.length]

            speed: 25
            walkFrames: [0, 1]
            talkFrame: 2
            reply: (talk: string) => post.pick(post.rng, ["Never!", "By rain, you say?", "I'll pass it on.", "Slowly, now."])
            activities: [
                Activity {
                    name: "nap"
                    when: snail.sleepy
                    spot: "shade"
                    stay: [5000, 9000]
                    onEnded: snail.sleepy = false
                },
                Activity {
                    name: "deliver"
                    when: snail.laden
                    spot: "box"
                    stay: 1800
                    onEnded: {
                        snail.laden = false;
                        snail.sleepy = post.rng() < 0.25;
                        if (post.rng() < 0.3)
                            post.gossip(snail);
                    }
                },
                Activity {
                    name: "fetch"
                    spot: "hatch"
                    stay: [1200, 2400]
                    onEnded: snail.laden = true
                }
            ]
            overhead: Text {
                x: -width / 2
                y: -height
                visible: snail.sleepy && snail.arrived && snail.bubble === ""
                text: post.bob ? "z" : "Z"
                color: "#eef4dd"
            }
            Component.onCompleted: {
                const start = post.nearestFree(Math.floor(post.rng() * post.columns), 4 + Math.floor(post.rng() * 10), key);
                place(start[0], start[1]);
            }

            Sheet {
                columns: 4
                rows: 3
                frame: snail.frame
                facing: snail.dir
                draw: (frame: number, row: number) => post.snailArt(String(snail.shell), frame, row)
            }
            Art {
                visible: snail.laden
                x: 5
                y: 0
                width: 7
                height: 5
                draw: [[0, 0, 7, 5, "#3b2a24"], [1, 1, 5, 3, "#f6eee0"], [3, 2, 1, 1, "#c9634f"]]
            }
        }
    }

    function gossip(from: Actor): void {
        const others = Object.values(actors).filter((a: Actor) => a !== from && !a.sleepy);
        if (others.length > 0)
            from.tell(pick(rng, others), pick(rng, ["Box three is full of slugs.", "Dew at seven, they say.", "A parcel of lettuce came!", "Have you seen the new toadstool?"]));
    }

    // frame: 0 rest, 1 stretched, 2 nodding, 3 tucked in. row: 0 down, 1 left, 2 up.
    function snailArt(shell: string, frame: number, row: number): (number | string)[][][] {
        const skin = "#e8c99c", ink = "#3b2a24", shine = "#f3ddbd";
        const reach = frame === 1 ? 1 : 0, nod = frame === 2 ? 1 : 0;
        if (frame === 3)
            return [[], [[4, 8, 9, 6, shell]], [[6, 9, 4, 1, shine], [8, 11, 2, 2, ink]]];
        if (row === 1)
            return [[], [[2 - reach, 11, 11 + reach, 3, skin], [2 - reach, 8 + nod, 3, 4, skin], [6, 6, 7, 6, shell]],
                [[2 - reach, 6 + nod, 1, 2, ink], [4 - reach, 6 + nod, 1, 2, ink], [8, 8, 3, 1, shine], [9, 9, 2, 1, ink]]];
        if (row === 2)
            return [[], [[5, 11 - reach, 6, 3 + reach, skin], [4, 6, 8, 7, shell]],
                [[6, 4 + nod, 1, 2, ink], [9, 4 + nod, 1, 2, ink], [6, 8, 4, 1, shine]]];
        return [[], [[4, 5, 8, 6, shell], [5, 8 + nod, 6, 6 + reach - nod, skin]],
            [[6, 6 + nod, 1, 3, ink], [9, 6 + nod, 1, 3, ink], [6, 11, 4, 1, shine]]];
    }
}
