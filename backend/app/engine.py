"""Scoring brain.

Everything here is *derived* from the completions table -- nothing about a
streak, a reset or an XP total is stored. That is deliberate: it means back-
filling yesterday morning heals a run that looked broken, and recomputing can
never drift out of sync with the checkboxes people actually ticked.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Dict, List, Optional, Set

from sqlmodel import Session, select

from .models import Completion, DayNote, Task, User

CHALLENGE_LENGTH = 75

TASK_XP = 10
PERFECT_DAY_XP = 40

DAY_BADGES = [
    (3, "Ignition", "Three days deep. The hard part is behind you."),
    (7, "One Week", "A full week without a miss."),
    (14, "Fortnight", "Two weeks. This is a routine now."),
    (21, "Habit Formed", "Twenty-one days -- it stops being a decision."),
    (30, "Thirty Strong", "A month of showing up."),
    (50, "Golden Fifty", "Two thirds. Nobody quits from here."),
    (60, "Home Stretch", "Sixty days. Fifteen to go."),
    (CHALLENGE_LENGTH, "75 HARD", "Finished. You did the whole thing."),
]

# Tuned so a full clean 75 days lands right around Legend (~9.5k XP) instead
# of topping out somewhere in the forties.
LEVELS = [
    (0, "Rookie"),
    (400, "Grinder"),
    (1000, "Relentless"),
    (1900, "Iron"),
    (3200, "Savage"),
    (5000, "Unbreakable"),
    (7500, "Legend"),
]


@dataclass
class DayCell:
    day: date
    index: int  # 1-based position inside the current run
    status: str  # done | partial | missed | today | future
    done: int
    total: int


@dataclass
class Progress:
    user_id: int
    name: str
    color: str
    run_start: date
    day_number: int  # which day of 75 they are on today
    streak: int  # perfect days banked in the current run
    best_streak: int
    resets: int
    completed_today: int
    core_today: int
    perfect_today: bool
    xp: int
    level: int
    level_name: str
    level_floor: int
    level_ceiling: Optional[int]
    perfect_days_ever: int
    badges: List[dict]
    next_badge: Optional[dict]
    calendar: List[DayCell] = field(default_factory=list)


def completions_by_day(session: Session, user_id: int) -> Dict[date, Set[int]]:
    rows = session.exec(select(Completion).where(Completion.user_id == user_id)).all()
    out: Dict[date, Set[int]] = {}
    for row in rows:
        out.setdefault(row.day, set()).add(row.task_id)
    return out


def active_tasks(session: Session, user_id: int) -> List[Task]:
    return list(
        session.exec(
            select(Task)
            .where(Task.user_id == user_id, Task.archived == False)  # noqa: E712
            .order_by(Task.sort, Task.id)
        ).all()
    )


def _daterange(start: date, end: date):
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)


def level_for(xp: int):
    idx = 0
    for i, (floor, _name) in enumerate(LEVELS):
        if xp >= floor:
            idx = i
    floor, name = LEVELS[idx]
    ceiling = LEVELS[idx + 1][0] if idx + 1 < len(LEVELS) else None
    return idx + 1, name, floor, ceiling


def compute(session: Session, user: User, today: Optional[date] = None) -> Progress:
    today = today or date.today()
    tasks = active_tasks(session, user.id)
    core_ids = {t.id for t in tasks if t.is_core}
    done_by_day = completions_by_day(session, user.id)

    def day_stats(day: date):
        done = done_by_day.get(day, set())
        core_done = len(done & core_ids)
        return core_done, len(core_ids), bool(core_ids) and core_done == len(core_ids)

    # Walk every day the user has been signed up for. A day in the past that
    # wasn't perfect ends the run; the next day becomes day 1 again.
    run_start = user.start_date
    best_streak = 0
    resets = 0
    perfect_days_ever = 0
    current_run = 0

    for day in _daterange(user.start_date, today - timedelta(days=1)):
        _, _, perfect = day_stats(day)
        if perfect:
            current_run += 1
            perfect_days_ever += 1
            best_streak = max(best_streak, current_run)
        else:
            if current_run > 0:
                resets += 1
            current_run = 0
            run_start = day + timedelta(days=1)

    done_today, core_today, perfect_today = day_stats(today)
    if perfect_today:
        perfect_days_ever += 1
        best_streak = max(best_streak, current_run + 1)

    streak = current_run + (1 if perfect_today else 0)
    day_number = (today - run_start).days + 1

    total_completions = sum(len(v) for v in done_by_day.values())
    xp = total_completions * TASK_XP + perfect_days_ever * PERFECT_DAY_XP
    for threshold, _n, _d in DAY_BADGES:
        if best_streak >= threshold:
            xp += threshold * 5

    level, level_name, level_floor, level_ceiling = level_for(xp)

    badges = [
        {
            "day": threshold,
            "name": name,
            "blurb": blurb,
            "earned": best_streak >= threshold,
        }
        for threshold, name, blurb in DAY_BADGES
    ]
    next_badge = next((b for b in badges if not b["earned"]), None)

    calendar: List[DayCell] = []
    for i in range(CHALLENGE_LENGTH):
        day = run_start + timedelta(days=i)
        done, total, perfect = day_stats(day)
        if day > today:
            status = "future"
        elif day == today:
            status = "done" if perfect else "today"
        elif perfect:
            status = "done"
        else:
            status = "partial" if done else "missed"
        calendar.append(DayCell(day=day, index=i + 1, status=status, done=done, total=total))

    return Progress(
        user_id=user.id,
        name=user.name,
        color=user.color,
        run_start=run_start,
        day_number=min(day_number, CHALLENGE_LENGTH),
        streak=streak,
        best_streak=best_streak,
        resets=resets,
        completed_today=done_today,
        core_today=core_today,
        perfect_today=perfect_today,
        xp=xp,
        level=level,
        level_name=level_name,
        level_floor=level_floor,
        level_ceiling=level_ceiling,
        perfect_days_ever=perfect_days_ever,
        badges=badges,
        next_badge=next_badge,
        calendar=calendar,
    )


def day_detail(session: Session, user: User, day: date) -> dict:
    tasks = active_tasks(session, user.id)
    done_ids = {
        c.task_id
        for c in session.exec(
            select(Completion).where(Completion.user_id == user.id, Completion.day == day)
        ).all()
    }
    note = session.exec(
        select(DayNote).where(DayNote.user_id == user.id, DayNote.day == day)
    ).first()
    items = [
        {
            "id": t.id,
            "title": t.title,
            "emoji": t.emoji,
            "is_core": t.is_core,
            "locked": t.locked,
            "reps_target": t.reps_target,
            "done": t.id in done_ids,
        }
        for t in tasks
    ]
    return {
        "day": day,
        "tasks": items,
        "pending": [i for i in items if not i["done"]],
        "note": note.text if note else "",
    }
