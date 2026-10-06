// Original, synthesized arcade music and effects; no downloaded assets.
let context: AudioContext | undefined;
let output: GainNode | undefined;
let enabled = true;

export function unlockGameAudio() {
  try {
    context ??= new AudioContext();
    if (!output) {
      output = context.createGain();
      output.gain.value = enabled ? 0.16 : 0;
      output.connect(context.destination);
    }
    void context.resume().catch(() => {});
  } catch {
    // Audio support must never prevent tracking progress.
  }
}

export function setGameAudioEnabled(value: boolean) {
  enabled = value;
  if (context && output) output.gain.setTargetAtTime(value ? 0.16 : 0, context.currentTime, 0.02);
}

export function isGameAudioEnabled() { return enabled; }

function tone(frequency: number, at: number, length: number, type: OscillatorType = "square", end?: number) {
  if (!context || !output) return;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  if (end) oscillator.frequency.exponentialRampToValueAtTime(end, at + length);
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(0.35, at + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.001, at + length);
  oscillator.connect(envelope).connect(output);
  oscillator.start(at);
  oscillator.stop(at + length + 0.01);
  oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
}

export function playGameEffect(effect: "jump" | "coin" | "win") {
  if (!enabled || !context || context.state !== "running") return;
  const now = context.currentTime;
  if (effect === "jump") tone(180, now, 0.16, "triangle", 720);
  if (effect === "coin") {
    tone(988, now + 0.18, 0.08);
    tone(1319, now + 0.26, 0.18);
  }
  if (effect === "win") {
    [523, 659, 784, 1047, 784, 1047].forEach((note, i) => tone(note, now + i * 0.14, 0.25));
  }
}

export function startGameMusic(): () => void {
  let step = 0;
  const melody = [523, 659, 784, 659, 587, 698, 880, 698, 659, 784, 988, 784, 587, 698, 784, 392];
  const timer = window.setInterval(() => {
    if (!enabled || document.hidden || !context || context.state !== "running") return;
    const at = context.currentTime + 0.015;
    tone(melody[step % melody.length], at, 0.18, "triangle");
    if (step % 2 === 0) tone([131, 147, 165, 147][Math.floor(step / 4) % 4], at, 0.22, "sine");
    step++;
  }, 240);
  return () => window.clearInterval(timer);
}
