import { expect, open, test } from "./open.js";
import { pixels } from "./pixels.js";

// A second of 64 by 48 picture without sound, the same with a silent sound
// track, and a tenth of a second of silence.
const CLIP = "/assets/clip.webm";
const SOUND = "/assets/sound.webm";
// A file that is there and is no film.
const PICTURE = "/assets/flag.png";

const WHITE = "255 255 255";

const log = (page) => page.evaluate(() => window.objects.log.splice(0));
// What the player said, without where it had got to.
const said = async (page) => (await log(page)).filter((entry) => !entry.startsWith("position"));
// What it says by the time a source has been assigned to it.
const assign = (page, source) =>
  page.evaluate((source) => ((window.objects.player.source = source), window.objects.log.splice(0)), source);
const status = (page, value, name = "player") =>
  page.waitForFunction(([name, value]) => window.objects[name].mediaStatus === value, [name, value]);

// The scene with `source` loaded, and nothing said yet.
async function loaded(page, source) {
  await open(page, "mediaplayer");
  await page.evaluate((source) => (window.objects.player.source = source), source);
  await status(page, 2);
  await log(page);
}

const element = (page, name = "player") =>
  page.evaluate((name) => {
    const { player, video } = window.objects;
    const { element } = (name === "video" ? video.$player : player).$media;
    const { x, y, width, height } = element.getBoundingClientRect();
    return {
      muted: element.muted,
      volume: element.volume,
      paused: element.paused,
      rate: element.playbackRate,
      loop: element.loop,
      visible: getComputedStyle(element).visibility === "visible",
      fit: getComputedStyle(element).objectFit,
      box: [x, y, width, height],
      inside: element.parentNode?.className ?? null,
    };
  }, name);

// What the machine has plugged in is not the scene's: its first answer would
// be told as `outputs 1` beside what a test expects to hear. A test about the
// devices says which there are, after this.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (navigator.mediaDevices) navigator.mediaDevices.enumerateDevices = async () => [];
  });
});

test("a player with nothing to play is as Qt's", async ({ page }) => {
  await open(page, "mediaplayer");
  const read = await page.evaluate(() => {
    const { player, MediaPlayer, VideoOutput, output } = window.objects;
    player.play();
    player.pause();
    player.stop();
    player.setPosition(100);
    return {
      state: [player.playbackState, player.mediaStatus, player.error, player.errorString, player.playing],
      time: [player.duration, player.position, player.bufferProgress, player.playbackRate, player.loops],
      has: [player.seekable, player.hasAudio, player.hasVideo, player.autoPlay, player.metaData.isEmpty()],
      tracks: [player.audioTracks.length, player.videoTracks.length, player.subtitleTracks.length],
      active: [player.activeAudioTrack, player.activeVideoTrack, player.activeSubtitleTrack],
      enums: [MediaPlayer.Infinite, MediaPlayer.PausedState, MediaPlayer.EndOfMedia, MediaPlayer.InvalidMedia],
      output: [output.fillMode, VideoOutput.PreserveAspectCrop, output.endOfStreamPolicy, VideoOutput.KeepLastFrame],
      source: String(output.sourceRect),
      content: String(output.contentRect),
    };
  });
  expect(read).toEqual({
    state: [0, 0, 0, "", false],
    time: [0, 0, 0, 1, 1],
    has: [false, false, false, false, true],
    tracks: [0, 0, 0],
    active: [-1, -1, -1],
    enums: [-1, 2, 6, 7],
    output: [1, 2, 0, 1],
    source: "QRectF(0, 0, 0, 0)",
    content: "QRectF(0, 0, 200, 100)",
  });
  expect(await log(page)).toEqual([]);
});

test("a player tells what it found in a file, in Qt's order", async ({ page }) => {
  await open(page, "mediaplayer");
  // Loading is told of by the time the assignment returns.
  expect(await assign(page, CLIP)).toEqual(["status 1", "source"]);
  await status(page, 2);
  expect(await log(page)).toEqual([
    "duration 1000",
    "tracks -1,0,-1",
    "metaData 10,27",
    "seekable true",
    "hasVideo true",
    "status 2",
  ]);
  const read = await page.evaluate(() => {
    const { player, MediaMetaData } = window.objects;
    const data = player.metaData;
    return {
      strings: [data.stringValue(MediaMetaData.Duration), data.stringValue(MediaMetaData.Resolution)],
      missing: [data.value(MediaMetaData.Title), data.stringValue(MediaMetaData.Title)],
      value: data.value(MediaMetaData.Duration),
      names: data.keys().map((key) => data.metaDataKeyToString(key)),
      tracks: [player.audioTracks.length, player.videoTracks.length, player.subtitleTracks.length],
      track: player.videoTracks[0].stringValue(MediaMetaData.Resolution),
      has: [player.hasAudio, player.hasVideo, player.seekable],
    };
  });
  expect(read).toEqual({
    strings: ["00:00:01", "64 x 48"],
    missing: [undefined, ""],
    value: 1000,
    names: ["Duration", "Resolution"],
    tracks: [0, 1, 0],
    track: "64 x 48",
    has: [false, true, true],
  });
  // One with sound has an audio track, and the same source again is no news.
  expect(await assign(page, SOUND)).toEqual(["duration 0", "status 1", "source"]);
  await status(page, 2);
  expect(await log(page)).toEqual([
    "duration 1008",
    "tracks 0,0,-1",
    "metaData 10,27",
    "hasAudio true",
    "status 2",
  ]);
  expect(await assign(page, SOUND)).toEqual([]);
});

test("a player plays to the end and says where it is on the way", async ({ page }) => {
  await loaded(page, CLIP);
  await page.evaluate(() => window.objects.player.play());
  await status(page, 5);
  expect(await said(page)).toEqual(["playing true", "state 1", "status 4", "status 5"]);
  await status(page, 6);
  const entries = await log(page);
  const positions = entries.filter((entry) => entry.startsWith("position")).map((entry) => Number(entry.slice(9)));
  // Often enough for a slider to follow, forwards, and at the end the end.
  expect(positions.length).toBeGreaterThan(5);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(positions.at(-1)).toBe(1000);
  expect(entries.slice(-4)).toEqual(["position 1000", "playing false", "state 0", "status 6"]);
  // From the end it plays from the start, and stopping there is being loaded.
  await page.evaluate(() => window.objects.player.play());
  await status(page, 5);
  expect((await log(page)).slice(0, 4)).toEqual(["playing true", "state 1", "position 0", "status 4"]);
  await status(page, 6);
  await log(page);
  expect(await page.evaluate(() => (window.objects.player.stop(), window.objects.log.splice(0)))).toEqual([
    "position 0",
    "status 2",
  ]);
});

test("a player pauses, seeks and stops as Qt's does", async ({ page }) => {
  await loaded(page, SOUND);
  // What the player says of something done to it. Where the element had
  // got to when it was paused it may say a moment later.
  const act = async (work) => {
    const entries = await page.evaluate(`(${work})(window.objects.player), window.objects.log.splice(0)`);
    return entries.filter((entry) => !/^position (?!0$|100$|300$|500$|900$|1008$)/.test(entry));
  };
  // Paused from stopped: the first frame is got, and that is buffering.
  expect(await act((player) => player.pause())).toEqual(["state 2", "status 4", "status 5"]);
  expect(await act((player) => player.setPosition(500))).toEqual(["position 500"]);
  expect(await act((player) => player.setPosition(5000))).toEqual(["position 1008"]);
  expect(await act((player) => player.setPosition(-5))).toEqual(["position 0"]);
  expect(await act((player) => (player.position = 300))).toEqual(["position 300"]);
  expect(await page.evaluate(() => window.objects.player.position)).toBe(300);
  expect(await act((player) => player.play())).toEqual(["playing true", "state 1"]);
  await page.waitForFunction(() => window.objects.player.position > 400);
  expect(await act((player) => player.pause())).toEqual(["playing false", "state 2"]);
  expect((await element(page)).paused).toBe(true);
  expect(await act((player) => player.pause())).toEqual([]);
  expect(await act((player) => player.stop())).toEqual(["position 0", "state 0", "status 2"]);
  expect(await act((player) => player.stop())).toEqual([]);
  // Stopped, it can be put somewhere, and plays from there.
  expect(await act((player) => player.setPosition(900))).toEqual(["position 900"]);
  await page.evaluate(() => window.objects.player.play());
  await status(page, 6);
  const entries = await log(page);
  expect(entries.slice(0, 3)).toEqual(["playing true", "state 1", "status 4"]);
  expect(entries.slice(-4)).toEqual(["position 1008", "playing false", "state 0", "status 6"]);
  // A seek from the end leaves the end.
  expect(await act((player) => player.setPosition(100))).toEqual(["position 100", "status 2"]);
});

test("a player plays as many times as its loops say", async ({ page }) => {
  await loaded(page, CLIP);
  await page.evaluate(() => {
    const { player } = window.objects;
    player.loops = 2;
    player.playbackRate = 2;
    player.play();
  });
  expect((await element(page)).rate).toBe(2);
  await status(page, 6);
  const entries = await log(page);
  // The first time over it starts again, and nothing else is told.
  const turn = entries.indexOf("position 1000");
  expect(entries.slice(turn, turn + 2)).toEqual(["position 1000", "position 0"]);
  expect(entries.filter((entry) => !entry.startsWith("position"))).toEqual([
    "playing true",
    "state 1",
    "status 4",
    "status 5",
    "playing false",
    "state 0",
    "status 6",
  ]);
  expect(entries.filter((entry) => entry === "position 1000").length).toBe(2);
  // For ever is the element's own loop.
  await page.evaluate(() => (window.objects.player.loops = window.objects.MediaPlayer.Infinite));
  expect((await element(page)).loop).toBe(true);
});

test("a player told to play while it loads plays once it has", async ({ page }) => {
  await open(page, "mediaplayer");
  const first = await page.evaluate((source) => {
    const { player, log } = window.objects;
    player.source = source;
    player.play();
    return [player.playbackState, player.mediaStatus, ...log.splice(0)];
  }, CLIP);
  expect(first).toEqual([0, 1, "status 1", "source"]);
  await status(page, 5);
  expect((await said(page)).slice(-5)).toEqual(["status 2", "playing true", "state 1", "status 4", "status 5"]);
  // Paused while it loads, it is paused once it has.
  const second = await page.evaluate((source) => {
    const { player, log } = window.objects;
    player.source = source;
    player.pause();
    log.length = 0;
    return [player.playbackState, player.mediaStatus];
  }, SOUND);
  expect(second).toEqual([0, 1]);
  await status(page, 5);
  expect((await said(page)).slice(-4)).toEqual(["status 2", "state 2", "status 4", "status 5"]);
  // And with `autoPlay` it needs no telling.
  await page.evaluate((source) => {
    const { player, log } = window.objects;
    player.stop();
    player.autoPlay = true;
    player.source = source;
    log.length = 0;
  }, CLIP);
  await status(page, 6);
  expect((await said(page)).slice(-8)).toEqual([
    "status 2",
    "playing true",
    "state 1",
    "status 4",
    "status 5",
    "playing false",
    "state 0",
    "status 6",
  ]);
});

test("a file that is no film is an error, and the next one is not", async ({ page }) => {
  await open(page, "mediaplayer");
  expect(await assign(page, PICTURE)).toEqual(["status 1", "source"]);
  await status(page, 7);
  expect(await log(page)).toEqual(["error 1 true", "errorChanged 1", "status 7"]);
  const read = await page.evaluate(() => {
    const { player, log } = window.objects;
    player.play();
    player.pause();
    return [player.playbackState, player.error, player.errorString !== "", player.hasVideo, ...log];
  });
  expect(read).toEqual([0, 1, true, false]);
  expect(await assign(page, CLIP)).toEqual(["errorChanged 0", "status 1", "source"]);
  await status(page, 2);
  // A bad one after a good one: what was known of the good one is gone.
  await log(page);
  expect(await assign(page, PICTURE)).toEqual(["duration 0", "status 1", "source"]);
  await status(page, 7);
  expect(await log(page)).toEqual([
    "error 1 true",
    "errorChanged 1",
    "seekable false",
    "hasVideo false",
    "metaData ",
    "tracks -1,-1,-1",
    "status 7",
  ]);
});

test("taking the source away while it plays stops it", async ({ page }) => {
  await loaded(page, CLIP);
  await page.evaluate(() => window.objects.player.play());
  await status(page, 5);
  await log(page);
  expect((await assign(page, "")).filter((entry) => !entry.startsWith("position"))).toEqual([
    "playing false",
    "state 0",
    "status 2",
    "duration 0",
    "seekable false",
    "hasVideo false",
    "metaData ",
    "tracks -1,-1,-1",
    "status 0",
    "source",
  ]);
  expect((await element(page)).paused).toBe(true);
});

test("an audio output is how loud the player is, and none is no sound", async ({ page }) => {
  await loaded(page, SOUND);
  expect(await element(page)).toMatchObject({ muted: false, volume: 1 });
  await page.evaluate(() => (window.objects.audio.volume = 0.25));
  expect(await element(page)).toMatchObject({ muted: false, volume: 0.25 });
  await page.evaluate(() => window.objects.audio.setMuted(true));
  expect((await element(page)).muted).toBe(true);
  await page.evaluate(() => (window.objects.audio.muted = false));
  expect((await element(page)).muted).toBe(false);
  // No audio track is no sound either, and choosing one is told of.
  await page.evaluate(() => (window.objects.player.activeAudioTrack = -1));
  expect((await element(page)).muted).toBe(true);
  expect(await log(page)).toEqual(["active -1,0,-1"]);
  await page.evaluate(() => (window.objects.player.activeAudioTrack = 0));
  expect((await element(page)).muted).toBe(false);
  await page.evaluate(() => (window.objects.player.audioOutput = null));
  expect((await element(page)).muted).toBe(true);
});

test("the devices are the ones the browser tells of", async ({ page }) => {
  await page.addInitScript(() => {
    window.devices = [
      { deviceId: "default", kind: "audiooutput", label: "Default" },
      { deviceId: "speakers", kind: "audiooutput", label: "Speakers" },
      { deviceId: "microphone", kind: "audioinput", label: "" },
    ];
    navigator.mediaDevices.enumerateDevices = async () => window.devices;
  });
  await open(page, "mediaplayer");
  await page.waitForFunction(() => window.objects.devices.audioOutputs.length === 2);
  const read = () =>
    page.evaluate(() => {
      const { devices } = window.objects;
      const plain = ({ id, description, isDefault, mode }) => [id, description, isDefault, mode];
      return {
        outputs: devices.audioOutputs.map(plain),
        inputs: devices.audioInputs.map(plain),
        output: plain(devices.defaultAudioOutput),
        input: plain(devices.defaultAudioInput),
        cameras: devices.videoInputs.length,
      };
    });
  expect(await read()).toEqual({
    outputs: [
      ["default", "Default", true, 2],
      ["speakers", "Speakers", false, 2],
    ],
    inputs: [["microphone", "", true, 1]],
    output: ["default", "Default", true, 2],
    input: ["microphone", "", true, 1],
    cameras: 0,
  });
  const told = () => page.evaluate(() => window.objects.deviceLog.splice(0));
  expect(await told()).toEqual(["outputs 2"]);
  // One is unplugged: the browser says so.
  await page.evaluate(() => {
    window.devices = window.devices.slice(1);
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  await page.waitForFunction(() => window.objects.devices.audioOutputs.length === 1);
  expect((await read()).output).toEqual(["speakers", "Speakers", true, 2]);
  expect(await told()).toEqual(["outputs 1"]);
  // The player's sound goes to the one its output names.
  const sink = await page.evaluate(async () => {
    const { audio, devices, player } = window.objects;
    const asked = [];
    player.$media.element.setSinkId = async (id) => void asked.push(id);
    audio.device = devices.defaultAudioOutput;
    return asked;
  });
  expect(sink).toEqual(["speakers"]);
});

test("a video output shows the frame, fitted as Qt fits it", async ({ page }) => {
  await loaded(page, CLIP);
  const read = () =>
    page.evaluate(() => {
      const { output } = window.objects;
      const { x, y, width, height } = output.contentRect;
      return {
        content: [x, y, width, height].map((number) => Math.round(number * 100) / 100),
        source: String(output.sourceRect),
        implicit: [output.implicitWidth, output.implicitHeight],
      };
    });
  // Loaded and stopped, there is no frame to show.
  expect(await read()).toEqual({ content: [0, 0, 200, 100], source: "QRectF(0, 0, 0, 0)", implicit: [0, 0] });
  expect(await element(page)).toMatchObject({ visible: false, inside: "qq" });
  await page.evaluate(() => window.objects.player.pause());
  expect(await read()).toEqual({
    content: [33.33, 0, 133.33, 100],
    source: "QRectF(0, 0, 64, 48)",
    implicit: [64, 48],
  });
  expect(await element(page)).toMatchObject({ visible: true, fit: "contain", box: [0, 0, 200, 100] });
  // The picture is there, and beside it is not.
  await page.waitForFunction(() => window.objects.player.mediaStatus === 5);
  const [beside, middle] = await pixels(page, [
    [15, 50],
    [100, 50],
  ]);
  expect(beside).toBe(WHITE);
  expect(middle).not.toBe(WHITE);
  await page.evaluate(() => (window.objects.output.fillMode = window.objects.VideoOutput.Stretch));
  expect((await read()).content).toEqual([0, 0, 200, 100]);
  expect((await element(page)).fit).toBe("fill");
  await page.evaluate(() => (window.objects.output.fillMode = window.objects.VideoOutput.PreserveAspectCrop));
  expect((await read()).content).toEqual([0, -25, 200, 150]);
  expect((await element(page)).fit).toBe("cover");
  // On its side the frame's sides change places; what the file is does not.
  await page.evaluate(() => {
    const { output, VideoOutput } = window.objects;
    output.fillMode = VideoOutput.PreserveAspectFit;
    output.orientation = 90;
  });
  expect(await read()).toEqual({ content: [62.5, 0, 75, 100], source: "QRectF(0, 0, 64, 48)", implicit: [48, 64] });
  const turned = await page.evaluate(() => {
    const { style } = window.objects.player.$media.element;
    return [style.width, style.height, style.left, style.top, style.transform];
  });
  expect(turned).toEqual(["100px", "200px", "50px", "-50px", "rotate(90deg)"]);
  expect((await element(page)).box).toEqual([0, 0, 200, 100]);
  await page.evaluate(() => {
    const { output } = window.objects;
    output.orientation = -180;
    output.mirrored = true;
  });
  expect(await page.evaluate(() => window.objects.player.$media.element.style.transform)).toBe(
    "scaleX(-1) rotate(180deg)",
  );
  expect((await read()).implicit).toEqual([64, 48]);
});

test("a video output shows nothing when there is nothing to show", async ({ page }) => {
  await loaded(page, CLIP);
  const shown = async () => (await element(page)).visible;
  await page.evaluate(() => window.objects.player.pause());
  expect(await shown()).toBe(true);
  // Cleared, until the player has another frame.
  await page.evaluate(() => window.objects.output.clearOutput());
  expect(await shown()).toBe(false);
  expect(await page.evaluate(() => window.objects.output.implicitWidth)).toBe(0);
  await page.evaluate(() => window.objects.player.setPosition(500));
  await page.waitForFunction(() => window.objects.output.implicitWidth === 64);
  expect(await shown()).toBe(true);
  // No video track is no picture.
  await page.evaluate(() => (window.objects.player.activeVideoTrack = -1));
  expect(await shown()).toBe(false);
  await page.evaluate(() => (window.objects.player.activeVideoTrack = 0));
  expect(await shown()).toBe(true);
  await page.evaluate(() => window.objects.player.stop());
  expect(await shown()).toBe(false);
  // At the end the output is cleared, unless it is to keep the last frame.
  await page.evaluate(() => window.objects.player.play());
  await status(page, 6);
  expect(await shown()).toBe(false);
  await page.evaluate(() => {
    const { output, player, VideoOutput } = window.objects;
    output.endOfStreamPolicy = VideoOutput.KeepLastFrame;
    player.play();
  });
  await status(page, 5);
  await status(page, 6);
  expect(await shown()).toBe(true);
  await page.evaluate(() => window.objects.player.stop());
  expect(await shown()).toBe(false);
  // Another output takes the picture with it.
  await page.evaluate(() => (window.objects.player.videoOutput = null));
  expect((await element(page)).inside).toBe(null);
});

test("a video is a player and its output in one", async ({ page }) => {
  await open(page, "mediaplayer");
  await page.evaluate((source) => {
    const { video } = window.objects;
    video.source = source;
    video.volume = 0.5;
  }, SOUND);
  await page.waitForFunction(() => window.objects.video.duration === 1008);
  const read = () =>
    page.evaluate(() => {
      const { video } = window.objects;
      return {
        state: [video.playbackState, video.error, video.errorString],
        has: [video.hasAudio, video.hasVideo, video.seekable],
        time: [video.duration, video.position],
        data: video.metaData.keys(),
        implicit: [video.implicitWidth, video.implicitHeight],
      };
    });
  await page.waitForFunction(() => window.objects.video.hasVideo);
  expect(await log(page)).toEqual(["video duration 1008"]);
  expect(await read()).toEqual({
    state: [0, 0, ""],
    has: [true, true, true],
    time: [1008, 0],
    data: [10, 27],
    implicit: [0, 0],
  });
  expect(await page.evaluate(() => (window.objects.video.pause(), window.objects.log.splice(0)))).toEqual([
    "video paused",
  ]);
  expect((await read()).implicit).toEqual([64, 48]);
  expect(await element(page, "video")).toMatchObject({ visible: true, volume: 0.5, muted: false, box: [0, 100, 100, 50] });
  await page.evaluate(() => (window.objects.video.muted = true));
  expect((await element(page, "video")).muted).toBe(true);
  // Assigning to the position is a seek, and so is `seek`.
  await page.evaluate(() => (window.objects.video.position = 800));
  expect((await read()).time).toEqual([1008, 800]);
  await page.evaluate(() => window.objects.video.seek(900));
  expect((await read()).time).toEqual([1008, 900]);
  await page.evaluate(() => window.objects.video.play());
  await page.waitForFunction(() => window.objects.video.playbackState === 0);
  expect(await log(page)).toEqual(["video playing", "video stopped"]);
  await page.evaluate(() => {
    const { video } = window.objects;
    video.play();
    video.stop();
  });
  expect(await log(page)).toEqual(["video playing", "video stopped"]);
  await page.evaluate((source) => (window.objects.video.source = source), PICTURE);
  await page.waitForFunction(() => window.objects.video.error === 1);
  expect(await log(page)).toEqual(["video duration 0", "video error 1"]);
});

// What the autoplay scene says once its film and its sound are playing.
async function playing(page) {
  const film = page.waitForEvent("console", (message) => message.text() === "player playing");
  const sound = page.waitForEvent("console", (message) => message.text() === "effect playing true");
  await page.goto("/?scene=autoplay");
  await Promise.all([film, sound]);
}

const heard = (page) =>
  page.evaluate(() => {
    const { player, effect } = window.objects;
    const { element } = player.$media;
    return {
      player: [player.playbackState, player.mediaStatus, player.error, player.errorString],
      element: [element.paused, element.muted],
      effect: [effect.status, effect.playing, effect.loopsRemaining, Boolean(effect.$sound.node)],
    };
  });

test("what plays before the user has done anything plays silently until then", async ({ page }) => {
  await playing(page);
  // The browser refused the sound: the player plays all the same, and what
  // it says is that it plays. Nothing was thrown, and nothing logged.
  expect(await page.evaluate(() => [...window.objects.log])).toEqual(["state 1", "moving muted true"]);
  expect(await heard(page)).toEqual({
    player: [1, 5, 0, ""],
    element: [false, true],
    effect: [2, true, -2, false],
  });
  await page.waitForFunction(() => window.objects.player.position > 0);
  // The first press brings the sound on.
  await page.mouse.click(300, 250);
  expect(await heard(page)).toEqual({
    player: [1, 5, 0, ""],
    element: [false, false],
    effect: [2, true, -2, true],
  });
  expect(await page.evaluate(() => [...window.objects.log])).toEqual(["state 1", "moving muted true"]);
});

const advance = (page, ms) => page.evaluate((ms) => window.objects.clock.advance(ms), ms);

async function sounds(page) {
  await open(page, "soundeffect");
  await page.waitForFunction(() => window.objects.beep.status === 2 && window.objects.broken.status === 3);
}

test("a sound effect loads its sound, or says that it could not", async ({ page }) => {
  await sounds(page);
  const entries = await log(page);
  expect(entries.filter((entry) => entry.startsWith("beep"))).toEqual(["beep status 2", "beep loaded"]);
  expect(entries.filter((entry) => entry.startsWith("broken"))).toEqual(["broken status 3"]);
  const read = await page.evaluate(() => {
    const { beep, once, broken, none, SoundEffect, log } = window.objects;
    broken.play();
    none.play();
    none.stop();
    return {
      beep: [beep.status, beep.loops, beep.loopsRemaining, beep.volume, beep.muted, beep.playing],
      // Qt plays once for 0 loops, and says 1.
      once: once.loops,
      broken: [broken.status, broken.playing],
      none: [none.status, none.playing],
      enums: [SoundEffect.Infinite, SoundEffect.Null, SoundEffect.Loading, SoundEffect.Ready, SoundEffect.Error],
      log,
    };
  });
  expect(read).toEqual({
    beep: [2, 1, 0, 1, false, false],
    once: 1,
    broken: [3, false],
    none: [0, false],
    enums: [-2, 0, 1, 2, 3],
    log: [],
  });
});

test("a sound effect plays for as long as its sound is", async ({ page }) => {
  await sounds(page);
  await log(page);
  await page.evaluate(() => window.objects.beep.play());
  expect((await log(page)).sort()).toEqual(["beep playing true", "beep remaining 1"]);
  await advance(page, 99);
  expect(await log(page)).toEqual([]);
  await advance(page, 1);
  expect((await log(page)).sort()).toEqual(["beep playing false", "beep remaining 0"]);
  expect(await page.evaluate(() => window.objects.clock.running)).toBe(false);
  // Played again while it plays, it starts over.
  await page.evaluate(() => window.objects.beep.play());
  await advance(page, 60);
  await page.evaluate(() => window.objects.beep.play());
  await advance(page, 60);
  expect(await page.evaluate(() => window.objects.beep.playing)).toBe(true);
  await advance(page, 40);
  expect(await page.evaluate(() => window.objects.beep.playing)).toBe(false);
  await log(page);
  // And stopped, it has stopped.
  expect(
    await page.evaluate(() => {
      const { beep, log } = window.objects;
      beep.play();
      beep.stop();
      beep.stop();
      return [beep.playing, beep.loopsRemaining, ...log.splice(0)];
    }),
  ).toEqual([false, 0, "beep remaining 1", "beep playing true", "beep remaining 0", "beep playing false"]);
});

test("a sound effect plays as many times as its loops say", async ({ page }) => {
  await sounds(page);
  await log(page);
  await page.evaluate(() => {
    const { beep } = window.objects;
    beep.loops = 3;
    beep.play();
  });
  expect((await log(page)).sort()).toEqual(["beep loops 3", "beep playing true", "beep remaining 3"]);
  await advance(page, 100);
  expect(await log(page)).toEqual(["beep remaining 2"]);
  await advance(page, 150);
  expect(await log(page)).toEqual(["beep remaining 1"]);
  await advance(page, 50);
  expect((await log(page)).sort()).toEqual(["beep playing false", "beep remaining 0"]);
  // For ever, until it is stopped.
  await page.evaluate(() => {
    const { beep, SoundEffect } = window.objects;
    beep.loops = SoundEffect.Infinite;
    beep.play();
  });
  await advance(page, 5000);
  expect(await page.evaluate(() => [window.objects.beep.playing, window.objects.beep.loopsRemaining])).toEqual([
    true,
    -2,
  ]);
  await page.evaluate(() => window.objects.beep.stop());
  expect(await page.evaluate(() => [window.objects.beep.playing, window.objects.beep.loopsRemaining])).toEqual([
    false,
    0,
  ]);
  // A number it cannot loop is once.
  expect(await page.evaluate(() => ((window.objects.beep.loops = -7), window.objects.beep.loops))).toBe(1);
});

test("sound effects play over each other, each as loud as it says", async ({ page }) => {
  await sounds(page);
  const read = await page.evaluate(() => {
    const { beep, other, once } = window.objects;
    beep.play();
    other.play();
    once.play();
    const nodes = [beep, other, once].map((effect) => effect.$sound.node);
    const gains = () => [beep, other, once].map((effect) => effect.$sound.gain.gain.value);
    const before = gains();
    other.muted = true;
    beep.volume = 0.2;
    return {
      playing: [beep.playing, other.playing, once.playing],
      apart: new Set(nodes).size,
      // One decoding for all three.
      shared: new Set(nodes.map((node) => node.buffer)).size,
      context: nodes[0].context.state,
      before,
      after: gains().map((gain) => Math.round(gain * 100) / 100),
    };
  });
  expect(read).toEqual({
    playing: [true, true, true],
    apart: 3,
    shared: 1,
    context: "running",
    before: [1, 0.5, 1],
    after: [0.2, 0, 1],
  });
  await advance(page, 100);
  expect(await page.evaluate(() => ["beep", "other", "once"].map((name) => window.objects[name].playing))).toEqual([
    false,
    false,
    false,
  ]);
});

test("a sound effect given a source and told to play plays once it is loaded", async ({ page }) => {
  await sounds(page);
  const first = await page.evaluate(() => {
    const { none } = window.objects;
    none.source = "/assets/beep.wav?again";
    none.play();
    return [none.status, none.playing, none.loopsRemaining];
  });
  // As Qt: it says nothing of playing until it does.
  expect(first).toEqual([1, false, 0]);
  await page.waitForFunction(() => window.objects.none.playing);
  expect(await page.evaluate(() => [window.objects.none.status, window.objects.none.loopsRemaining])).toEqual([2, 1]);
  // Another source stops it.
  await page.evaluate(() => (window.objects.none.source = ""));
  expect(await page.evaluate(() => [window.objects.none.status, window.objects.none.playing])).toEqual([0, false]);
});
