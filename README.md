# Hand Games

Two browser games you play with your hands in front of a webcam, made in TDM 155AI.

- **Air Hero** (`air-hero/`): notes fall down lanes; hold a fingertip over each circle as its note lands to play the melody.
- **Cross the Road** (`cross-the-road/`): swipe your hand to aim, pinch (thumb to index finger) to hop the chicken across roads and rivers.

Hand tracking is [MediaPipe Hands](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker), loaded from a CDN and run in the browser, so the camera picture never leaves the computer. Air Hero's sound uses [Tone.js](https://tonejs.github.io/). There's no build step: these are plain HTML and JavaScript files.

## Change things

Each game has a `settings.js` for its rules and look, and Air Hero has a `songs.js` where you can add a song by typing its notes (`"E D C D | E E E ."`). The songs are public domain or original.

## Run it locally

The camera needs a web server (not a file opened directly). From this folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000 in Chrome.
