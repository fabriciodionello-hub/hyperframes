#!/usr/bin/env node
// Prints the film's timing as JSON, for tools that are not JavaScript (the sound build).
import { T0, NARRATION, DURATION, FPS, CHUNKS, CAPTIONS, CARD_AT } from "../film/narration.js";
import * as beats from "../film/beats.js";
console.log(JSON.stringify({ T0, NARRATION, DURATION, FPS, CARD_AT, CHUNKS, CAPTIONS, beats: { ...beats } }));
