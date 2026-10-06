import { useEffect, useState } from "react";
import { setGameAudioEnabled, startGameMusic, unlockGameAudio } from "../gameSound";

export default function GameAudio() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem("75hard.gameAudio") !== "off");
  useEffect(() => {
    setGameAudioEnabled(enabled);
    localStorage.setItem("75hard.gameAudio", enabled ? "on" : "off");
  }, [enabled]);
  useEffect(() => {
    const unlock = () => unlockGameAudio();
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
  return <button className="pill" aria-pressed={enabled} aria-label={enabled ? "Mute game audio" : "Enable game audio"}
    onClick={() => { unlockGameAudio(); setEnabled(!enabled); }}>
    {enabled ? "Sound on" : "Sound off"}
  </button>;
}
