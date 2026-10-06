// Original arcade audio. Music and effects have independent output channels.
export type SoundChannel = "effects" | "music";
let context: AudioContext | undefined;
const outputs: Partial<Record<SoundChannel, GainNode>> = {};
const enabled = { effects: true, music: true };
const sources = { effects: new Set<OscillatorNode>(), music: new Set<OscillatorNode>() };

export async function unlockGameAudio(): Promise<boolean> {
  try {
    context ??= new AudioContext();
    for (const channel of ["effects", "music"] as const) {
      if (!outputs[channel]) {
        const output = context.createGain();
        output.gain.value = enabled[channel] ? 0.16 : 0;
        output.connect(context.destination);
        outputs[channel] = output;
      }
    }
    if (context.state !== "running") await context.resume();
    return context.state === "running";
  } catch { return false; }
}

function stopNotes(channel: SoundChannel) {
  for (const source of sources[channel]) {
    try { source.stop(); } catch { /* Already ended. */ }
  }
  sources[channel].clear();
}

export function setSoundEnabled(channel: SoundChannel, value: boolean) {
  enabled[channel] = value;
  const output = outputs[channel];
  if (context && output) {
    output.gain.cancelScheduledValues(context.currentTime);
    output.gain.setTargetAtTime(value ? 0.16 : 0, context.currentTime, 0.015);
  }
  if (!value) stopNotes(channel);
}

function tone(channel: SoundChannel, frequency: number, at: number, length: number, type: OscillatorType = "square", end?: number) {
  const output = outputs[channel];
  if (!context || !output || !enabled[channel]) return;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  if (end) oscillator.frequency.exponentialRampToValueAtTime(end, at + length);
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(0.35, at + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.001, at + length);
  oscillator.connect(envelope).connect(output);
  sources[channel].add(oscillator);
  oscillator.onended = () => { sources[channel].delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
  oscillator.start(at);
  oscillator.stop(at + length + 0.01);
}

export function playGameEffect(effect: "jump" | "coin" | "win") {
  if (!enabled.effects || document.hidden || !context || context.state !== "running") return;
  const now = context.currentTime;
  if (effect === "jump") tone("effects", 180, now, 0.16, "triangle", 720);
  if (effect === "coin") {
    tone("effects", 988, now + 0.18, 0.08);
    tone("effects", 1319, now + 0.26, 0.18);
  }
  if (effect === "win") {
    [523, 659, 784, 1047, 784, 1047].forEach((note, i) => tone("effects", note, now + i * 0.14, 0.25));
  }
}

export function startGameMusic(): () => void {
  let step = 0;
  let next = 0;
  const melody = [523, 659, 784, 659, 587, 698, 880, 698, 659, 784, 988, 784, 587, 698, 784, 392];
  const schedule = () => {
    if (!enabled.music || document.hidden || !context || context.state !== "running") { next = 0; return; }
    if (next < context.currentTime) next = context.currentTime + 0.02;
    while (next < context.currentTime + 0.15) {
      tone("music", melody[step % melody.length], next, 0.24, "triangle");
      if (step % 2 === 0) tone("music", [131, 147, 165, 147][Math.floor(step / 4) % 4], next, 0.3, "sine");
      step++;
      next += 0.24;
    }
  };
  const visibility = () => {
    if (document.hidden) { stopNotes("music"); stopNotes("effects"); }
    next = 0;
    schedule();
  };
  const timer = window.setInterval(schedule, 60);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", visibility);
    stopNotes("music");
    stopNotes("effects");
  };
}
