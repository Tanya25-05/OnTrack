import type { DayDetail, TaskItem } from "../types";
import { prettyDate, todayISO } from "../api";

export default function DailyFocus({ detail, onToggle, onToday }: {
  detail: DayDetail;
  onToggle: (task: TaskItem) => void;
  onToday: () => void;
}) {
  const pending = detail.tasks.filter((task) => !task.done);
  const next = pending.find((task) => task.is_core) ?? pending[0];
  const done = detail.tasks.length - pending.length;
  const coreLeft = pending.filter((task) => task.is_core).length;
  const isToday = detail.day === todayISO();
  return (
    <section className="card daily-focus" aria-labelledby="daily-focus-title">
      <div className="focus-main">
        <h2 id="daily-focus-title">{isToday ? "Today’s focus" : prettyDate(detail.day)}</h2>
        <p className="focus-task">{next ? `${next.emoji} ${next.title}` : detail.tasks.length ? "Everything complete" : "No tasks yet"}</p>
        <p className="muted">{next ? `${pending.length} remaining · ${coreLeft} core · ${pending.length - coreLeft} bonus` : detail.tasks.length ? "All your tasks are checked off. Nicely done." : "Add a habit below to get started."}</p>
        {next && <button className="btn primary" onClick={() => onToggle(next)}>Complete {next.is_core ? "next core task" : "next bonus task"}</button>}
        {!isToday && <button className="btn ghost" onClick={onToday}>Back to today</button>}
      </div>
      <div className="focus-progress">
        <span className="num">{done}<span className="muted"> / {detail.tasks.length}</span></span>
        <label htmlFor="daily-progress">{isToday ? "Today’s progress" : "Day’s progress"}</label>
        <progress id="daily-progress" value={done} max={Math.max(1, detail.tasks.length)} />
        <span className="muted">{detail.tasks.length ? Math.round(done / detail.tasks.length * 100) : 0}% complete</span>
      </div>
    </section>
  );
}
