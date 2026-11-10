// Hand poses for Diego, in POV space: the eye is the origin, x right, y up, the view goes down -z.
//   dir  = where the fingers point        back = where the back of the hand faces
// Right-hand poses are authored; mirror() gives the left-hand twin.

export const mirror = (p) => ({
  ...p,
  pos: [-p.pos[0], p.pos[1], p.pos[2]],
  dir: [-p.dir[0], p.dir[1], p.dir[2]],
  back: [-p.back[0], p.back[1], p.back[2]],
  elbow: [-p.elbow[0], p.elbow[1], p.elbow[2]],
});

export const R = {
  // hanging at his side, out of frame
  down: { pos: [0.3, -0.78, -0.12], dir: [0, -0.3, -1], back: [1, 0.2, 0], curl: 0.45, thumb: [0.4, 0.3], elbow: [0.33, -0.85, 0.2] },
  // loose in the lower corner of the view while he stands or walks: thumb up, palm inwards
  low: { pos: [0.245, -0.52, -0.33], dir: [-0.12, 0.42, -0.9], back: [0.86, 0.5, 0.1], curl: [0.45, 0.52, 0.6, 0.66], thumb: [0.35, 0.3], elbow: [0.35, -0.74, 0.12] },
  // lifted into view, relaxed (the opening shot)
  show: { pos: [0.17, -0.31, -0.42], dir: [-0.2, 0.82, -0.52], back: [0.45, 0.42, 0.78], curl: [0.2, 0.28, 0.36, 0.45], thumb: [0.8, 0.1], elbow: [0.33, -0.68, 0.02] },
  // "afasta!" - palm out, fingers spread
  clear: { pos: [0.23, -0.2, -0.44], dir: [0.12, 0.95, -0.28], back: [-0.1, 0.28, 1], curl: 0.03, thumb: [1, 0], elbow: [0.36, -0.6, -0.05] },
  // fist on a rail, pushing
  push: { pos: [0.2, -0.4, -0.47], dir: [0, -0.2, -1], back: [0, 1, -0.2], curl: 0.95, thumb: [0.1, 0.8], elbow: [0.3, -0.64, -0.02] },
  // running fist
  pump: { pos: [0.25, -0.38, -0.36], dir: [-0.2, 0.75, -0.62], back: [0.9, 0.3, 0.2], curl: 1.0, thumb: [0.15, 0.8], elbow: [0.35, -0.68, 0.1] },
  // syringe held like a pen, pointing down-left at the port
  syringe: { pos: [0.1, -0.33, -0.41], dir: [-0.55, -0.25, -0.8], back: [0.35, 0.9, -0.25], curl: [0.62, 0.66, 0.9, 0.95], thumb: [0.25, 0.6], elbow: [0.34, -0.6, 0.06] },
  // palm to the face, cradling the phone
  phone: { pos: [0.05, -0.36, -0.33], dir: [-0.06, 0.74, -0.67], back: [0, -0.67, -0.74], curl: [0.1, 0.12, 0.14, 0.18], thumb: [0.3, 0.35], elbow: [0.3, -0.7, 0.05] },
  // offered palm up, being gripped
  held: { pos: [0.0, -0.4, -0.43], dir: [-0.55, 0.05, -0.83], back: [0.1, -1, 0.05], curl: 0.4, thumb: [0.7, 0.2], elbow: [0.33, -0.66, 0.05] },
  // flat palm pushing a door
  door: { pos: [0.15, -0.14, -0.5], dir: [0.05, 0.93, -0.36], back: [0, 0.36, 1], curl: 0.03, thumb: [0.9, 0], elbow: [0.34, -0.55, -0.05] },
  // held out, palm down, to have its glove pulled off
  strip: { pos: [0.1, -0.36, -0.42], dir: [-0.5, 0.15, -0.85], back: [0.2, 0.95, 0.2], curl: 0.15, thumb: [0.4, 0.1], elbow: [0.34, -0.64, 0.05] },
  // bare hand turned over and flexed after the glove comes off
  bare: { pos: [0.14, -0.33, -0.42], dir: [-0.3, 0.55, -0.78], back: [0.5, 0.6, 0.62], curl: [0.3, 0.35, 0.42, 0.5], thumb: [0.7, 0.15], elbow: [0.34, -0.66, 0.05] },
};

export const L = {
  down: mirror(R.down),
  low: mirror(R.low),
  show: mirror(R.show),
  clear: mirror(R.clear),
  push: mirror(R.push),
  pump: mirror(R.pump),
  door: mirror(R.door),
  // pinching the IV port
  port: { pos: [-0.1, -0.37, -0.42], dir: [0.5, -0.1, -0.86], back: [-0.3, 0.9, -0.25], curl: [0.6, 0.65, 0.9, 0.95], thumb: [0.25, 0.55], elbow: [-0.34, -0.62, 0.06] },
  // pinching the cuff of the other glove
  pinch: { pos: [0.0, -0.33, -0.4], dir: [0.78, -0.15, -0.6], back: [-0.2, 0.9, -0.4], curl: [0.7, 0.75, 0.9, 0.95], thumb: [0.2, 0.7], elbow: [-0.34, -0.62, 0.06] },
  // holding the stripped glove away
  pulled: { pos: [-0.23, -0.31, -0.4], dir: [0.3, 0.3, -0.9], back: [-0.5, 0.8, 0.2], curl: [0.7, 0.75, 0.9, 0.95], thumb: [0.2, 0.7], elbow: [-0.36, -0.64, 0.06] },
};
