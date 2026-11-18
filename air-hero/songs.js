// ─────────────────────────────────────────────────────────────────────────────
//  THE FILE TO CHANGE for Air Hero: the songs.
//  A song is { name, bpm, step, octave, chart }:
//    bpm     beats per minute (how fast)
//    step    how many beats each word in the chart lasts (1 = a beat each, 0.5 = twice as fast)
//    octave  the octave for notes written without one (4 = around middle C)
//    chart   the notes in order, separated by spaces: a note name (C D E F G A B, with # for sharps and an
//            optional octave, like C5) or "." for a rest. "|" is ignored, so use it to mark bars.
//  The lanes are the different notes the song uses, low to high from left to right, so a song with four
//  different notes has four lanes. Keep it to five or fewer: you only have two hands.
//  Only use melodies you're allowed to share: these are public domain or written for this repo.
// ─────────────────────────────────────────────────────────────────────────────

export const songs = [
  {
    name: "Mary Had a Little Lamb (easy)",
    bpm: 84,
    step: 1,
    octave: 4,
    chart: "E D C D | E E E . | D D D . | E G G . | E D C D | E E E E | D D E D | C . . .",
  },
  {
    name: "Ode to Joy (medium)",
    bpm: 96,
    step: 1,
    octave: 4,
    chart: "E E F G | G F E D | C C D E | E . D D | E E F G | G F E D | C C D E | D . C C | D D E C | D E F E C . | D E F E D . | C D G . .",
  },
  {
    name: "Tide Pool (original, hard)",
    bpm: 92,
    step: 0.5,
    octave: 4,
    chart: "C . E . G . E . | A . G . E . . . | D . E . G . A . | G . . . . . . . | C . E G A . G . | E . D . C . . . | A . G . A . G E | D . C . . . . . | C E G A G E D . | E G A G A . G . | E . D . C . . .",
  },
];
