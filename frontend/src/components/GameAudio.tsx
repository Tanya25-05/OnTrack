import { useEffect, useState } from "react";
import { setGameAudioEnabled, startGameMusic, unlockGameAudio } from "../gameSound";

export default function GameAudio() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("75hard.gameAudio") !== "off");
  const [started, setStarted] = useState(false);
  useEffect(() => {
    setGameAudioEnabled(enabled);
    localStorage.setItem("75hard.gameAudio", enabled ? "on" : "off");
  }, [enabled]);
  useEffect(() => {
    const unlock = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("[data-game-audio]")) return;
      unlockGameAudio();
      setStarted(true);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const stop = startGameMusic();
    return () => {
      stop();
      setGameAudioEnabled(false);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  return <button className="pill" data-game-audio aria-pressed={enabled && started} aria-label={!started ? "Start game audio" : enabled ? "Mute game audio" : "Enable game audio"}
    onClick={() => { unlockGameAudio(); setEnabled(started ? !enabled : true); setStarted(true); }}>
    {!started ? "Start sound" : enabled ? "Sound on" : "Sound off"}
  </button>;
}
