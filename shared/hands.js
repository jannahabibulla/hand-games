// Camera + hand tracking for the games, with nothing to install: MediaPipe's hand landmarker loads from public CDNs
// (the runtime from jsDelivr, the model from Google's model bucket). Docs: https://ai.google.dev/edge/mediapipe/solutions/guide
//
//   const stop = startHands(videoElement, (result, video) => { ... }, (message, isError) => { ... });
//
// `result.landmarks` is one array of 21 points per hand ({x, y} from 0 to 1 across the camera picture, not mirrored).
// Point 0 is the wrist, 4 the thumb tip, 5 the index knuckle, 8 the index fingertip.

const VERSION = "1.2.2";
const VISION = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let modelPromise = null;

// MediaPipe prints some harmless "INFO:" lines through console.error; hide just those.
function quietInfoLines() {
  if (console.error.__quiet) return;
  const original = console.error.bind(console);
  const quiet = (...args) => { if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return; original(...args); };
  quiet.__quiet = true;
  console.error = quiet;
}

// Load the model once. Tries the graphics card first, then the processor.
function loadModel() {
  if (!modelPromise) {
    quietInfoLines();
    const build = async (delegate) => {
      const vision = await import(VISION);
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
      return vision.HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numHands: 2 });
    };
    modelPromise = build("GPU").catch(() => build("CPU"));
    modelPromise.catch(() => { modelPromise = null; });
  }
  return modelPromise;
}

export function startHands(video, onFrame, onStatus = () => {}) {
  let stopped = false;
  let raf = 0;
  let stream = null;
  let lastTime = -1;
  let lastStamp = 0;

  (async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onStatus("This browser can't open a camera here. Use Chrome, on a page that starts with https.", true);
      return;
    }
    onStatus("Starting the camera…");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (error) {
      onStatus(error.name === "NotAllowedError" ? "Camera permission was refused. Click the camera icon in the address bar, allow it, and reload." : `Couldn't open a camera: ${error.message}`, true);
      return;
    }
    if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
    video.srcObject = stream;
    video.play().catch(() => {});
    onStatus("Loading hand tracking… (the first time takes a few seconds)");
    let model;
    try { model = await loadModel(); } catch (error) {
      onStatus(`Couldn't load hand tracking: ${error.message}. Check the internet connection.`, true);
      return;
    }
    if (stopped) return;
    onStatus("Hand tracking is running.");
    const tick = () => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        const stamp = Math.max(performance.now(), lastStamp + 1); // MediaPipe needs ever-increasing timestamps
        lastStamp = stamp;
        try { onFrame(model.detectForVideo(video, stamp), video); } catch (error) { onStatus(`Tracking error: ${error.message}`, true); }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  })();

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}

// The camera picture is cropped to fill the stage (like CSS object-fit: cover) and mirrored. This turns a point from
// the camera (0–1, not mirrored) into stage pixels, given the stage's size and the camera picture's size.
export function toStage(x, y, video, width, height) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const s = Math.max(width / vw, height / vh);
  return { x: (1 - x) * vw * s - (vw * s - width) / 2, y: y * vh * s - (vh * s - height) / 2 };
}
