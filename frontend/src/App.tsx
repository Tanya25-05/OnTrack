import { useCallback, useEffect, useRef, useState } from "react";
import { api, shiftISO, todayISO } from "./api";
import type { DayDetail, Progress, TaskItem, User } from "./types";
import Onboard from "./components/Onboard";
import Checklist from "./components/Checklist";
import Calendar75 from "./components/Calendar75";
import Badges from "./components/Badges";
import Rivals from "./components/Rivals";
import Runner, { Avatar3D, Sprite, type AvatarId } from "./components/Runner";
import ThemePicker, { THEMES, type ThemeId } from "./components/ThemePicker";
import { playAlarmSiren, playDiscoBeat } from "./discoSound";
import GameAudio from "./components/GameAudio";
import DailyFocus from "./components/DailyFocus";
import { isGameAudioEnabled, playGameEffect } from "./gameSound";

const LAST_USER = "75hard.user";
const THEME_KEY = "75hard.theme";
const AVATAR_KEY = "75hard.avatar";
const AVATARS: AvatarId[] = ["guy", "girl"];

const storedTheme = (): ThemeId => {
  const saved = localStorage.getItem(THEME_KEY) as ThemeId | null;
  return THEMES.some((t) => t.id === saved) ? (saved as ThemeId) : "dark";
};

const storedAvatars = (): Record<number, AvatarId> => {
  try {
    const raw = localStorage.getItem(AVATAR_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export function LevelRing({ p }: { p: Progress }) {
  const span = (p.level_ceiling ?? p.xp) - p.level_floor;
  const pct = p.level_ceiling === null ? 1 : span > 0 ? (p.xp - p.level_floor) / span : 0;
  const r = 44;
  const c = 2 * Math.PI * r;

  return (
    <div className="ring">
      <svg width="108" height="108">
        <circle cx="54" cy="54" r={r} fill="none" stroke="var(--line-soft)" strokeWidth="6" />
        <circle
          cx="54"
          cy="54"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, pct)))}
          style={{ transition: "stroke-dashoffset .5s ease" }}
        />
      </svg>
      <div className="ring-mid">
        <div className="lv">Lv {p.level}</div>
        <div className="name">{p.level_name}</div>
        <div className="xp">
          {p.level_ceiling === null ? `${p.xp} xp` : `${p.xp}/${p.level_ceiling}`}
        </div>
      </div>
    </div>
  );
}

function PinPrompt({
  name,
  error,
  onSubmit,
  onCancel,
}: {
  name: string;
  error?: string;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  return (
    <div className="pin-backdrop" onClick={onCancel}>
      <div className="pin-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{name}'s PIN</h3>
        <p className="muted">Needed to edit {name}'s progress -- viewing never needs it.</p>
        <input
          className="field"
          type="password"
          inputMode="numeric"
          autoFocus
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && pin && onSubmit(pin)}
        />
        {error && <p className="pin-error">{error}</p>}
        <button className="btn primary wide" disabled={!pin} onClick={() => onSubmit(pin)}>
          Unlock
        </button>
      </div>
    </div>
  );
}

function ShareDialog({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const copy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => setCopied(true))
      .catch(() => inputRef.current?.select());
  };

  return (
    <div className="pin-backdrop" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Share {name}'s progress</h3>
        <p className="muted">Read only -- no PIN, no editing. Works for anyone who has the link.</p>
        <input
          ref={inputRef}
          className="field"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button className="btn primary wide" onClick={copy}>
          {copied ? "Copied!" : "Copy link"}
        </button>
        <button className="btn ghost wide" style={{ marginTop: 8 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function AlarmOverlay({ task, onDone }: { task: TaskItem; onDone: () => void }) {
  useEffect(() => {
    const stop = playAlarmSiren();
    return stop;
  }, []);

  return (
    <div className="alarm-overlay">
      <div className="alarm-emoji">⏰</div>
      <h1>Time to get up</h1>
      <p>{task.title} -- the alarm won't stop until you have.</p>
      <button className="btn primary wide alarm-btn" onClick={onDone}>
        Done -- {task.reps_target ?? 20} reps
      </button>
    </div>
  );
}

export default function App() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [board, setBoard] = useState<Progress[]>([]);
  const [day, setDay] = useState(todayISO());
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved">("idle");
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeId>(storedTheme);
  const [avatars, setAvatars] = useState<Record<number, AvatarId>>(storedAvatars);
  const [pendingAvatar, setPendingAvatar] = useState<AvatarId>("guy");
  const [adding, setAdding] = useState(false);
  const [disco, setDisco] = useState(false);
  const [unlockedPins, setUnlockedPins] = useState<Record<number, string>>({});
  const [pinPrompt, setPinPrompt] = useState<{ userId: number; error?: string } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const noteTimer = useRef<number | undefined>(undefined);
  const discoTimer = useRef<number | undefined>(undefined);
  const pinRetry = useRef<((pin: string) => void) | null>(null);

  const me = board.find((p) => p.user_id === meId) ?? null;
  const myAvatar: AvatarId = (meId != null && avatars[meId]) || "guy";

  // Viewing (board/progress/day) never needs a PIN -- only mutating a
  // user's own data does. `fn` receives the unlocked PIN (or undefined for
  // legacy users who never set one) and is retried once a correct PIN is
  // supplied; a 403 from the backend means a stale/wrong cached PIN, which
  // gets cleared so the prompt reappears instead of failing silently.
  const runWithPin = (userId: number, fn: (pin?: string) => Promise<void>) => {
    const user = users?.find((u) => u.id === userId);
    const cached = unlockedPins[userId];
    if (user?.has_pin && cached === undefined) {
      pinRetry.current = (pin: string) => {
        fn(pin)
          .then(() => {
            setUnlockedPins((p) => ({ ...p, [userId]: pin }));
            setPinPrompt(null);
          })
          .catch(() => setPinPrompt({ userId, error: "wrong PIN" }));
      };
      setPinPrompt({ userId });
      return;
    }
    fn(cached).catch((e) => {
      if (e instanceof Error && /pin/i.test(e.message)) {
        setUnlockedPins((p) => {
          const next = { ...p };
          delete next[userId];
          return next;
        });
      }
      throw e;
    });
  };

  const setAvatarFor = (userId: number, a: AvatarId) => {
    setAvatars((prev) => {
      const next = { ...prev, [userId]: a };
      localStorage.setItem(AVATAR_KEY, JSON.stringify(next));
      return next;
    });
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const partyTime = () => {
    setDisco(true);
    if (isGameAudioEnabled()) playDiscoBeat(4200);
    window.clearTimeout(discoTimer.current);
    discoTimer.current = window.setTimeout(() => setDisco(false), 4200);
  };

  // Boards are scoped per group server-side -- `asUserId` tells the backend
  // whose group to look up. Omit it only for a browser with no local user
  // yet (a brand new, still-empty board).
  const loadUsers = useCallback(async (asUserId?: number) => {
    const list = await api.users(asUserId);
    setUsers(list);
    if (list.length) {
      const pick = list.find((u) => u.id === asUserId) ?? list[0];
      setMeId((cur) => cur ?? pick.id);
    }
    return list;
  }, []);

  const loadBoard = useCallback(async (asUserId?: number) => setBoard(await api.board(asUserId)), []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const saved = Number(localStorage.getItem(LAST_USER)) || undefined;
    loadUsers(saved).then(async (list) => {
      if (list.length) await loadBoard(saved ?? list[0].id);
    }).catch(() => setLoadError("Could not load your dashboard. Check that the backend is running, then retry."));
  }, [loadUsers, loadBoard]);

  useEffect(() => {
    if (meId == null) return;
    localStorage.setItem(LAST_USER, String(meId));
    api.day(meId, day).then((d) => {
      setDetail(d);
      setNote(d.note);
      setNoteState("idle");
    }).catch(() => setLoadError("Could not load your tasks. Check that the backend is running, then retry."));
  }, [meId, day]);

  // The alarm condition (current time vs. wake_time) isn't itself reactive
  // state -- this just forces a re-render often enough to notice crossing it.
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const myUser = users?.find((u) => u.id === meId) ?? null;
  const lockedTask = detail?.tasks.find((t) => t.locked) ?? null;
  const alarmActive =
    day === todayISO() &&
    !!myUser?.wake_time &&
    !!lockedTask &&
    !lockedTask.done &&
    new Date().toTimeString().slice(0, 8) >= myUser!.wake_time!;

  const toggle = (t: TaskItem) => {
    if (meId == null || !detail) return;
    const curDetail = detail;
    const curMe = me;
    runWithPin(meId, async (pin) => {
      const wasPerfect = curMe?.perfect_today ?? false;
      const wasFullClear = curDetail.tasks.length > 0 && curDetail.tasks.every((x) => x.done);
      setDetail({
        ...curDetail,
        tasks: curDetail.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
      });
      const res = await api.toggle(meId, t.id, day, !t.done, pin);
      setDetail(res.day);
      setBoard((b) => b.map((p) => (p.user_id === meId ? res.progress : p)));

      if (!t.done) {
        playGameEffect("jump");
        playGameEffect("coin");
      }

      const nowFullClear = res.day.tasks.length > 0 && res.day.tasks.every((x) => x.done);
      const becameFullClear = day === todayISO() && !wasFullClear && nowFullClear;
      if (day === todayISO() && !wasPerfect && res.progress.perfect_today) {
        const hit = res.progress.badges.find((x) => x.day === res.progress.streak && x.earned);
        flash(hit ? `${hit.name} unlocked - day ${res.progress.streak}` : `Day ${res.progress.day_number} locked in`);
      } else if (becameFullClear) {
        flash("Full clear - nothing left today");
      }
      if (becameFullClear) {
        playGameEffect("win");
        partyTime();
      }
    });
  };

  const addTask = (title: string) => {
    if (meId == null || adding) return;
    runWithPin(meId, async (pin) => {
      setAdding(true);
      try {
        await api.addTask(meId, title, "+", false, pin);
        setDetail(await api.day(meId, day));
        await loadBoard(meId);
      } finally {
        setAdding(false);
      }
    });
  };

  const removeTask = (t: TaskItem) => {
    if (meId == null) return;
    runWithPin(meId, async (pin) => {
      await api.removeTask(meId, t.id, pin);
      setDetail(await api.day(meId, day));
      await loadBoard(meId);
    });
  };

  const editNote = (text: string) => {
    setNote(text);
    setNoteState("saving");
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => {
      if (meId == null) return;
      runWithPin(meId, async (pin) => {
        await api.saveNote(meId, day, text, pin);
        setNoteState("saved");
      });
    }, 600);
  };

  const restart = () => {
    if (meId == null) return;
    if (!confirm("Wipe the current run and start again from day 1 today?")) return;
    runWithPin(meId, async (pin) => {
      await api.restart(meId, pin);
      await loadBoard(meId);
      flash("Back to day 1. Go.");
    });
  };

  if (loadError) return <div className="shell" role="alert"><p>{loadError}</p><button className="btn" onClick={() => location.reload()}>Retry</button></div>;
  if (users === null) return <div className="shell muted">loading...</div>;

  if (users.length === 0) {
    return (
      <Onboard
        theme={theme}
        onTheme={setTheme}
        avatar={pendingAvatar}
        onAvatar={setPendingAvatar}
        existing={[]}
        onCreate={async (name, color, pin, wakeTime, reps) => {
          const u = await api.createUser(name, color, pin, wakeTime, reps);
          setAvatarFor(u.id, pendingAvatar);
          setMeId(u.id);
          await loadUsers(u.id);
          await loadBoard(u.id);
        }}
      />
    );
  }

  if (!me || !detail) return <div className="shell muted">loading...</div>;

  const isToday = day === todayISO();

  return (
    <div className={`shell${disco ? " disco" : ""}`} style={{ ["--u" as string]: me.color }}>
      {disco && (
        <div className="disco-overlay" aria-hidden="true">
          <span className="disco-ball">🪩</span>
        </div>
      )}
      {disco && (
        <div className="disco-finale">
          <Avatar3D avatar={myAvatar} running zoomed />
        </div>
      )}
      {alarmActive && lockedTask && <AlarmOverlay task={lockedTask} onDone={() => toggle(lockedTask)} />}
      {pinPrompt && (
        <PinPrompt
          name={users.find((u) => u.id === pinPrompt.userId)?.name ?? "that user"}
          error={pinPrompt.error}
          onCancel={() => {
            pinRetry.current = null;
            setPinPrompt(null);
          }}
          onSubmit={(pin) => pinRetry.current?.(pin)}
        />
      )}
      {shareUrl && <ShareDialog name={me.name} url={shareUrl} onClose={() => setShareUrl(null)} />}
      <div className={disco ? "disco-tint" : undefined}>
      <header className="topbar">
        <div className="wordmark">
          <b>75</b>
          <span>hard</span>
        </div>
        <div className="who">
          <div className="avatars" role="group" aria-label="Your character">
            {AVATARS.map((a) => (
              <button
                key={a}
                className={`avatar-btn${a === myAvatar ? " on" : ""}`}
                onClick={() => meId != null && setAvatarFor(meId, a)}
                title={`play as ${a}`}
                aria-label={`play as ${a}`}
                aria-pressed={a === myAvatar}
              >
                <Sprite avatar={a} running={false} />
              </button>
            ))}
          </div>
          <ThemePicker theme={theme} onPick={setTheme} />
          <GameAudio />
          {users.map((u) => (
            <button
              key={u.id}
              className={`pill${u.id === meId ? " on" : ""}`}
              style={{ ["--u" as string]: u.color, color: u.id === meId ? u.color : undefined }}
              onClick={() => setMeId(u.id)}
            >
              <i className="dot" />
              {u.name}
            </button>
          ))}
          {users.length < 4 && (
            <button
              className="pill"
              onClick={async () => {
                const name = prompt("Friend's name?");
                if (!name?.trim()) return;
                const pin = prompt("Pick a 4-6 digit PIN for editing their own progress:");
                if (!pin?.trim()) return;
                const palette = ["#4a9ee8", "#5cbd7e", "#b76ae8", "#e8c14a"];
                try {
                  await api.createUser(name.trim(), palette[users.length % palette.length], pin.trim(), null, 20, meId ?? undefined);
                  await loadUsers(meId ?? undefined);
                  await loadBoard(meId ?? undefined);
                } catch (e) {
                  alert(e instanceof Error ? e.message : "could not add");
                }
              }}
            >
              +
            </button>
          )}
          <button
            className="pill"
            title="Get a read-only link to your progress -- no PIN, no editing"
            onClick={() => {
              const token = users.find((u) => u.id === meId)?.share_token;
              if (!token) return;
              setShareUrl(`${location.origin}${location.pathname}?share=${token}`);
            }}
          >
            Share
          </button>
        </div>
      </header>

      <DailyFocus detail={detail} onToggle={toggle} onToday={() => setDay(todayISO())} />

      <section className="hero">
        <div>
          <div className="counter">
            <span className="big num">{String(me.day_number).padStart(2, "0")}</span>
            <span className="of">/ 75</span>
          </div>
          <div className="hero-sub">
            <span className="streakchip">{me.streak} day streak</span>
            <span className="sep">|</span>
            <span>
              best <b className="num">{me.best_streak}</b>
            </span>
            <span className="sep">|</span>
            <span>
              <b className="num">{me.perfect_days_ever}</b> perfect day
              {me.perfect_days_ever === 1 ? "" : "s"}
            </span>
            {me.resets > 0 && (
              <>
                <span className="sep">|</span>
                <span>
                  <b className="num">{me.resets}</b> restart{me.resets > 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        </div>
        <LevelRing p={me} />
      </section>

      <div className="cols">
        <div>
          <Runner detail={detail} avatar={myAvatar} onRemove={removeTask} />

          <Checklist
            detail={detail}
            day={day}
            onShift={(delta) => {
              const next = shiftISO(day, delta);
              if (next <= todayISO()) setDay(next);
            }}
            onToggle={toggle}
            onAdd={addTask}
            onRemove={removeTask}
          />

          <div className="card">
            <div className="card-head">
              <h2>{isToday ? "Still pending" : "That day"}</h2>
              <span className="saved">
                {noteState === "saving" ? "saving..." : noteState === "saved" ? "saved" : ""}
              </span>
            </div>
            {detail.pending.length > 0 ? (
              <p className="muted" style={{ margin: "0 0 12px" }}>
                {detail.pending.map((t) => t.title).join(" · ")}
              </p>
            ) : (
              <p className="muted" style={{ margin: "0 0 12px", color: "var(--good)" }}>
                Everything ticked off. Clean day.
              </p>
            )}
            <textarea
              className="note"
              placeholder="what's left, what went wrong, what you owe tomorrow..."
              value={note}
              onChange={(e) => editNote(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Rivals board={board} meId={me.user_id} />
          <Badges p={me} />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <Calendar75 cells={me.calendar} onPick={setDay} />
      </div>

      <div style={{ marginTop: 22, textAlign: "center" }}>
        <button className="btn ghost" onClick={restart}>
          Reset my run
        </button>
      </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
