import { useEffect, useRef, useState } from "react";
import type { DayDetail, TaskItem } from "../types";
import { todayISO } from "../api";

export type AvatarId = "guy" | "girl";

// Sourced from three.js's own official example assets (mrdoob/three.js,
// examples/models/gltf) -- the well-known Mixamo-derived demo characters.
// Michelle only ships a dance + T-pose (no walk/run/idle clips), so the two
// avatars react differently to progress: he runs, she dances. Both read as
// "my character celebrates a tick," just with different motions.
const AVATAR_SRC: Record<AvatarId, string> = {
  guy: "/avatars/male.glb",
  girl: "/avatars/female.glb",
};
const AVATAR_CLIP: Record<AvatarId, { idle: string; active: string }> = {
  guy: { idle: "Idle", active: "Run" },
  girl: { idle: "TPose", active: "SambaDance" },
};
// The two source models were authored with opposite "forward" conventions --
// verified empirically (headless screenshots at 0/90/180/270deg), not guessed.
const AVATAR_CAMERA: Record<AvatarId, string> = {
  guy: "180deg 75deg 105%",
  girl: "0deg 75deg 105%",
};

export function Avatar3D({
  avatar,
  running,
  zoomed,
}: {
  avatar: AvatarId;
  running: boolean;
  zoomed?: boolean;
}) {
  const clips = AVATAR_CLIP[avatar];
  return (
    <model-viewer
      key={avatar}
      src={AVATAR_SRC[avatar]}
      alt={`${avatar} avatar`}
      animation-name={running ? clips.active : clips.idle}
      camera-orbit={AVATAR_CAMERA[avatar]}
      autoplay
      camera-controls={false}
      disable-zoom
      interaction-prompt="none"
      class={zoomed ? "avatar3d zoomed" : "avatar3d"}
    />
  );
}

export function Sprite({ avatar, running }: { avatar: AvatarId; running: boolean }) {
  // Same hand-drawn-path style as the Check icon and ThemePicker icons --
  // no image assets, colours resolve through --u/--accent like everything else.
  return (
    <svg
      width="26"
      height="30"
      viewBox="0 0 26 30"
      className={`sprite${running ? " running" : ""}`}
      aria-hidden="true"
    >
      <circle cx="13" cy="6" r="4.2" fill="currentColor" />
      <path
        className="torso"
        d="M13 10.5v9"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        className="arm-l"
        d="M13 13.5 8 17"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        className="arm-r"
        d="M13 13.5 18 17"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {avatar === "girl" && (
        <path d="M8.5 10.5 13 14.5 17.5 10.5" fill="currentColor" opacity="0.9" />
      )}
      <path
        className="leg-l"
        d="M13 19.5 9 27"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        className="leg-r"
        d="M13 19.5 17 27"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Runner({
  detail,
  avatar,
  onRemove,
}: {
  detail: DayDetail;
  avatar: AvatarId;
  onRemove?: (t: TaskItem) => void;
}) {
  const tasks = detail.tasks;
  const coreCount = tasks.filter((t) => t.is_core).length;
  const doneCount = tasks.filter((t) => t.done).length;
  const total = tasks.length;

  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(() => localStorage.getItem("75hard.runnerExpanded") !== "off");
  const prevDone = useRef(doneCount);
  const runTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (doneCount !== prevDone.current) {
      prevDone.current = doneCount;
      setRunning(true);
      window.clearTimeout(runTimer.current);
      runTimer.current = window.setTimeout(() => setRunning(false), 1400);
    }
    return () => window.clearTimeout(runTimer.current);
  }, [doneCount]);

  if (total === 0) return null;

  const clearedCore = doneCount >= coreCount;
  const clearedAll = doneCount === total;

  // Step 0 is the starting platform (nobody done yet); steps 1..total sit
  // one per task, each further right and higher than the last -- a
  // staircase the avatar climbs (and jumps between) as tasks get ticked.
  const stepRise = Math.min(12, 75 / Math.max(1, total));
  const stepPos = (k: number) => ({
    left: (k / (total + 1)) * 100,
    bottom: 10 + k * stepRise,
  });

  return (
    <details className="card runner-card" open={expanded} onToggle={(event) => {
      const open = event.currentTarget.open;
      setExpanded(open);
      localStorage.setItem("75hard.runnerExpanded", open ? "on" : "off");
    }}>
      <summary className="card-head runner-summary">
        <h2>{detail.day === todayISO() ? "Today's run" : "Selected day's run"}</h2>
        <span className="count num">
          {doneCount}/{total} <span className="runner-chevron" aria-hidden="true">⌄</span>
        </span>
      </summary>

      <div className="stairs">
        <div className="ground" style={{ left: `${stepPos(0).left}%`, bottom: stepPos(0).bottom }} />

        {tasks.map((t, i) => {
          const { left, bottom } = stepPos(i + 1);
          return (
            <div key={t.id} className="step-wrap" style={{ left: `${left}%`, bottom }}>
              <div
                className={`step${t.is_core ? " core" : ""}${t.done ? " passed" : ""}`}
                title={t.title}
              />
              {!t.locked && onRemove && (
                <button
                  className="checkpoint-kill"
                  onClick={() => onRemove(t)}
                  aria-label={`remove ${t.title}`}
                  title={`remove ${t.title}`}
                >
                  &times;
                </button>
              )}
            </div>
          );
        })}

        {coreCount > 0 && coreCount < total && (
          <i
            className={`flag${clearedCore ? " passed" : ""}`}
            style={{ left: `${stepPos(coreCount).left}%`, bottom: stepPos(coreCount).bottom }}
            title="core tasks done -- day survives"
          />
        )}

        <i
          className={`trophy${clearedAll ? " passed" : ""}`}
          style={{ left: `${stepPos(total).left}%`, bottom: stepPos(total).bottom }}
          title="everything done, clean day"
        />

        <div
          className="runner"
          style={{ left: `${stepPos(doneCount).left}%`, bottom: stepPos(doneCount).bottom }}
        >
          <div className={`hop${running ? " jumping" : ""}`}>
            <Avatar3D avatar={avatar} running={running} />
          </div>
        </div>
      </div>
    </details>
  );
}
