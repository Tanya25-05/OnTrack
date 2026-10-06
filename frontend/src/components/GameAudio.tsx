import { useEffect, useRef, useState } from "react";
import { setSoundEnabled, startGameMusic, unlockGameAudio } from "../gameSound";

const KEY = "75hard.soundSettings";
function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const legacy = localStorage.getItem("75hard.gameAudio") !== "off";
    return { effects: typeof saved?.effects === "boolean" ? saved.effects : legacy,
      music: typeof saved?.music === "boolean" ? saved.music : legacy };
  } catch { return { effects: true, music: true }; }
}

export default function GameAudio() {
  const [settings, setSettings] = useState(readSettings);
  const [status, setStatus] = useState<"waiting" | "playing" | "blocked">("waiting");
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    setSoundEnabled("effects", settings.effects);
    setSoundEnabled("music", settings.music);
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Session preferences still work. */ }
  }, [settings]);
  useEffect(() => {
    let mounted = true;
    const unlock = () => { void unlockGameAudio().then((ready) => {
      if (mounted) setStatus(ready ? "playing" : "blocked");
    }); };
    const outside = (event: PointerEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) panel.current.open = false;
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && panel.current?.open) {
        panel.current.open = false;
        panel.current.querySelector("summary")?.focus();
      }
      unlock();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === KEY || event.key === null) setSettings(readSettings());
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", keydown);
    window.addEventListener("storage", storage);
    const stop = startGameMusic();
    return () => {
      mounted = false;
      stop();
      setSoundEnabled("effects", false);
      setSoundEnabled("music", false);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("storage", storage);
    };
  }, []);
  return <details className="sound-control" ref={panel}>
    <summary className="pill">Sound <span aria-hidden="true">⌄</span></summary>
    <div className="sound-dropdown">
      <label><span>Effects sound<small>Jump, coin collection, and win</small></span>
        <input type="checkbox" checked={settings.effects} onChange={(event) => {
          setSoundEnabled("effects", event.target.checked);
          setSettings((previous) => ({ ...previous, effects: event.target.checked }));
        }} /></label>
      <label><span>Game sound<small>Continuous background music</small></span>
        <input type="checkbox" checked={settings.music} onChange={(event) => {
          setSoundEnabled("music", event.target.checked);
          setSettings((previous) => ({ ...previous, music: event.target.checked }));
        }} /></label>
      <p className="muted" role="status">{status === "waiting" ? "Click or tap to start audio." : status === "blocked" ? "Audio is blocked. Allow sound in your browser, then tap again." : "Uncheck an option to mute only that sound."}</p>
    </div>
  </details>;
}
