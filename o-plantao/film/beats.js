// The story's beats in film seconds, derived from the narration timing. Shared by the picture
// (direction.js) and the sound (tools/build_audio.py), so a flash and its thump can never drift apart.
import { S, E, CARD_AT } from "./narration.js";

export const FADE_OUT = [10.8, 11.05]; // the corridor fades to black
export const DOORS_HIT = 10.42; // the stretcher bursts the SALA 2 doors
export const B2 = 11.12; // SALA 2 (after the fade)
export const B3 = S(23) - 0.11; // corridor, yellow
export const B4 = S(35) - 0.12; // ambulance
export const SHOCK1 = S(11) + 0.3;
export const SHOCK2 = S(14) + 0.42;
export const PULSE_BACK = S(18) + 0.1; // the first beat on the monitor
export const GLOVE_OFF = S(22) + 0.75;
export const RED_WINDOW = S(31) - 0.3; // the light outside the station window
export const RED_RATE = 0.78; // pulses per second of that red light
export const DOOR_PUSH = S(45) + 0.05;
export const RED_STOPS = S(56) + 0.1; // "o giroflex para"
export const FREEZE = CARD_AT; // the picture holds under the end card

/** When each beat of Seu Vanderlei's heart lands once it restarts: slow and far apart at first. */
export const HEART = (() => {
  const out = [];
  const gaps = [1.02, 0.84, 0.76, 0.72, 0.7];
  let b = PULSE_BACK;
  let i = 0;
  while (b < B3 + 1) {
    out.push(b);
    b += gaps[Math.min(i++, gaps.length - 1)];
  }
  return out;
})();
