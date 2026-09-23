import json
import os
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import messagebox, ttk

DATA_FILE = Path(__file__).resolve().parent / "time_data.json"
DEFAULT_LABELS = [
    "개발",
    "회의",
    "문서",
    "메일",
    "디자인",
    "고객 대응",
    "테스트",
    "기획",
    "업무",
    "기타",
]


def to_local_date(value):
    return datetime.fromisoformat(value).date().isoformat()


def format_duration(total_seconds):
    if total_seconds < 0:
        total_seconds = 0
    hours = int(total_seconds // 3600)
    minutes = int((total_seconds % 3600) // 60)
    seconds = int(total_seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def format_datetime(value):
    if not value:
        return "-"
    dt = datetime.fromisoformat(value)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def summarize_day(entries, date_string):
    grouped = {}
    for entry in entries:
        if not entry.get("started_at"):
            continue
        if to_local_date(entry["started_at"]) != date_string:
            continue
        title = (entry.get("title") or "Untitled").strip() or "Untitled"
        start = datetime.fromisoformat(entry["started_at"])
        end = datetime.fromisoformat(entry["ended_at"]) if entry.get("ended_at") else datetime.now()
        duration = max(0, (end - start).total_seconds())
        if title not in grouped:
            grouped[title] = {"title": title, "total_seconds": 0, "count": 0}
        grouped[title]["total_seconds"] += duration
        grouped[title]["count"] += 1

    rows = list(grouped.values())
    rows.sort(key=lambda row: row["total_seconds"], reverse=True)
    return rows


class TimeTrackerApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Time Keeping App")
        self.root.geometry("1100x800")
        self.root.minsize(900, 700)
        self.root.configure(bg="#f4f6fb")

        self.selected_day = datetime.now().date().isoformat()
        self.current_entry_id = None
        self.entries = self.load_entries()

        self.setup_ui()
        self.refresh_all()

    def load_entries(self):
        if not DATA_FILE.exists():
            return []
        try:
            with DATA_FILE.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
                return data if isinstance(data, list) else []
        except (json.JSONDecodeError, OSError):
            return []

    def save_entries(self):
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        with DATA_FILE.open("w", encoding="utf-8") as handle:
            json.dump(self.entries, handle, ensure_ascii=False, indent=2)

    def setup_ui(self):
        self.root.configure(bg="#eef4ff")

        main = tk.Frame(self.root, bg="#eef4ff", padx=20, pady=20)
        main.pack(fill="both", expand=True)

        top = tk.Frame(main, bg="#eef4ff")
        top.pack(fill="x", pady=(0, 18))

        title_label = tk.Label(top, text="Time Keeping App", font=("Segoe UI", 26, "bold"), bg="#eef4ff", fg="#172033")
        title_label.pack(anchor="w")

        subtitle = tk.Label(top, text="Daily work timer", foreground="#5f6f8c", bg="#eef4ff", font=("Segoe UI", 10))
        subtitle.pack(anchor="w", pady=(4, 0))

        self.clock_var = tk.StringVar(value="--:--:--")
        clock_frame = tk.Frame(top, bg="#eef4ff")
        clock_frame.pack(anchor="e")
        tk.Label(clock_frame, text="Now", foreground="#5f6f8c", bg="#eef4ff", font=("Segoe UI", 9)).pack(anchor="e")
        tk.Label(clock_frame, textvariable=self.clock_var, font=("Segoe UI", 15, "bold"), bg="#eef4ff", fg="#172033").pack(anchor="e")

        content = tk.Frame(main, bg="#eef4ff")
        content.pack(fill="both", expand=True)

        left = tk.Frame(content, bg="#eef4ff")
        left.pack(side="left", fill="y", padx=(0, 16))

        right = tk.Frame(content, bg="#eef4ff")
        right.pack(side="right", fill="both", expand=True)

        tracker_card = tk.Frame(left, bg="#ffffff", relief="flat", bd=1)
        tracker_card.pack(fill="x", padx=16, pady=(0, 16), ipadx=4, ipady=4)

        tk.Label(tracker_card, text="Track current task", font=("Segoe UI", 14, "bold"), bg="#ffffff", fg="#172033").pack(anchor="w", pady=(0, 12))

        tk.Label(tracker_card, text="Title", bg="#ffffff", fg="#172033", font=("Segoe UI", 10, "bold")).pack(anchor="w")
        self.title_var = tk.StringVar()
        self.title_entry = tk.Entry(tracker_card, textvariable=self.title_var, width=40, font=("Segoe UI", 11), bd=1, relief="solid")
        self.title_entry.pack(fill="x", pady=(0, 10))

        tk.Label(tracker_card, text="Quick labels", bg="#ffffff", fg="#172033", font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(6, 8))
        self.quick_label_frame = tk.Frame(tracker_card, bg="#ffffff")
        self.quick_label_frame.pack(fill="x")
        self.quick_buttons = {}
        for label in DEFAULT_LABELS:
            button = tk.Button(
                self.quick_label_frame,
                text=label,
                width=10,
                height=1,
                bg="#eaf2ff",
                fg="#1d4ed8",
                activebackground="#dbeafe",
                relief="flat",
                bd=0,
                cursor="hand2",
                command=lambda value=label: self.activate_quick_label(value),
            )
            button.pack(side="left", padx=(0, 8), pady=(0, 8))
            self.quick_buttons[label] = button

        tk.Label(tracker_card, text="Description", bg="#ffffff", fg="#172033", font=("Segoe UI", 10, "bold")).pack(anchor="w", pady=(8, 4))
        self.description_var = tk.StringVar()
        self.description_entry = tk.Entry(tracker_card, textvariable=self.description_var, width=40, font=("Segoe UI", 11), bd=1, relief="solid")
        self.description_entry.pack(fill="x", pady=(0, 12))

        buttons = tk.Frame(tracker_card, bg="#ffffff")
        buttons.pack(fill="x")
        self.track_button = tk.Button(buttons, text="Start tracking", command=self.toggle_tracking, bg="#2563eb", fg="#ffffff", relief="flat", bd=0, height=1, padx=16, pady=8, cursor="hand2")
        self.track_button.pack(side="left")
        tk.Button(buttons, text="Clear day", command=self.clear_selected_day, bg="#edf2ff", fg="#172033", relief="flat", bd=0, height=1, padx=16, pady=8, cursor="hand2").pack(side="left", padx=(10, 0))

        status_row = tk.Frame(tracker_card, bg="#ffffff")
        status_row.pack(fill="x", pady=(16, 0))
        self.status_var = tk.StringVar(value="Idle")
        self.status_label = tk.Label(status_row, textvariable=self.status_var, foreground="#1f9d61", bg="#ffffff", font=("Segoe UI", 10, "bold"))
        self.status_label.pack(side="left")
        self.timer_var = tk.StringVar(value="00:00:00")
        tk.Label(status_row, textvariable=self.timer_var, font=("Segoe UI", 18, "bold"), bg="#ffffff", fg="#172033").pack(side="right")

        summary_card = tk.Frame(right, bg="#ffffff", padx=16, pady=16)
        summary_card.pack(fill="both", expand=True)

        summary_top = tk.Frame(summary_card, bg="#ffffff")
        summary_top.pack(fill="x", pady=(0, 12))
        tk.Label(summary_top, text="Daily summary", font=("Segoe UI", 14, "bold"), bg="#ffffff", fg="#172033").pack(side="left")

        tk.Label(summary_top, text="Day", bg="#ffffff", fg="#172033").pack(side="right", padx=(0, 6))
        self.day_var = tk.StringVar(value=self.selected_day)
        tk.Entry(summary_top, textvariable=self.day_var, width=12, font=("Segoe UI", 10), bd=1, relief="solid").pack(side="right")
        tk.Button(summary_top, text="Load", command=self.load_selected_day, bg="#f3f4f6", fg="#172033", relief="flat", bd=0, padx=10, pady=4, cursor="hand2").pack(side="right", padx=(0, 10))

        self.summary_tree = ttk.Treeview(summary_card, columns=("title", "total"), show="headings", height=12)
        self.summary_tree.heading("title", text="Title")
        self.summary_tree.heading("total", text="Total")
        self.summary_tree.column("title", width=260, anchor="w")
        self.summary_tree.column("total", width=120, anchor="e")
        self.summary_tree.pack(fill="both", expand=True)

        entries_card = tk.Frame(main, bg="#eef4ff")
        entries_card.pack(fill="both", expand=True, pady=(0, 10))

        label = tk.Label(entries_card, text="Time blocks", font=("Segoe UI", 14, "bold"), bg="#eef4ff", fg="#172033")
        label.pack(anchor="w", pady=(0, 10))

        self.entries_tree = ttk.Treeview(entries_card, columns=("title", "description", "start", "end", "duration"), show="headings", height=12)
        self.entries_tree.heading("title", text="Title")
        self.entries_tree.heading("description", text="Description")
        self.entries_tree.heading("start", text="Start")
        self.entries_tree.heading("end", text="End")
        self.entries_tree.heading("duration", text="Duration")
        self.entries_tree.column("title", width=170, anchor="w")
        self.entries_tree.column("description", width=240, anchor="w")
        self.entries_tree.column("start", width=160)
        self.entries_tree.column("end", width=160)
        self.entries_tree.column("duration", width=100, anchor="e")
        self.entries_tree.pack(fill="both", expand=True)

        action_bar = tk.Frame(entries_card, bg="#eef4ff")
        action_bar.pack(fill="x", pady=(10, 0))
        tk.Button(action_bar, text="Edit selected", command=self.edit_selected_entry, bg="#e0f2fe", fg="#0f172a", relief="flat", bd=0, padx=14, pady=6, cursor="hand2").pack(side="left")
        tk.Button(action_bar, text="Delete selected", command=self.delete_selected_entry, bg="#fee2e2", fg="#991b1b", relief="flat", bd=0, padx=14, pady=6, cursor="hand2").pack(side="left", padx=(10, 0))

        self.root.protocol("WM_DELETE_WINDOW", self.root.destroy)

    def update_clock(self):
        now = datetime.now()
        self.clock_var.set(now.strftime("%H:%M:%S"))
        active = self.get_active_entry()
        if active:
            elapsed = (datetime.now() - datetime.fromisoformat(active["started_at"])).total_seconds()
            self.timer_var.set(format_duration(elapsed))
            self.status_var.set("Tracking")
            self.status_label.configure(foreground="#1f9d61")
            self.track_button.configure(text="Stop tracking")
        else:
            self.timer_var.set("00:00:00")
            self.status_var.set("Idle")
            self.status_label.configure(foreground="#4b5563")
            self.track_button.configure(text="Start tracking")

    def load_selected_day(self):
        raw = self.day_var.get().strip()
        if not raw:
            raw = datetime.now().date().isoformat()
        self.selected_day = raw
        self.day_var.set(raw)
        self.refresh_all()

    def get_active_entry(self):
        for entry in self.entries:
            if not entry.get("ended_at"):
                return entry
        return None

    def activate_quick_label(self, label_name):
        self.title_var.set(label_name)
        if self.get_active_entry():
            active_entry = self.get_active_entry()
            active_entry["title"] = label_name
            self.save_entries()
            self.refresh_all()
            return
        self.start_tracking(label_name)

    def start_tracking(self, title_override=None):
        title = (title_override or self.title_var.get().strip() or "Untitled task").strip() or "Untitled task"
        description = self.description_var.get().strip()
        entry = {
            "id": f"{datetime.now().timestamp():.0f}",
            "title": title,
            "description": description,
            "started_at": datetime.now().isoformat(),
            "ended_at": None,
        }
        self.entries.append(entry)
        self.save_entries()
        self.refresh_all()

    def toggle_tracking(self):
        active = self.get_active_entry()
        if active:
            active["ended_at"] = datetime.now().isoformat()
            self.save_entries()
            self.refresh_all()
            return

        self.start_tracking()

    def refresh_summary(self):
        rows = summarize_day(self.entries, self.selected_day)
        for row in self.summary_tree.get_children():
            self.summary_tree.delete(row)

        if not rows:
            self.summary_tree.insert("", "end", values=("No data", "00:00:00"))
            return

        for row in rows:
            self.summary_tree.insert("", "end", values=(row["title"], format_duration(row["total_seconds"])))

    def refresh_entries(self):
        for row in self.entries_tree.get_children():
            self.entries_tree.delete(row)

        day_entries = [
            entry for entry in self.entries
            if entry.get("started_at") and to_local_date(entry["started_at"]) == self.selected_day
        ]
        day_entries.sort(key=lambda x: x.get("started_at", ""), reverse=True)

        for entry in day_entries:
            start = datetime.fromisoformat(entry["started_at"])
            end = datetime.fromisoformat(entry["ended_at"]) if entry.get("ended_at") else datetime.now()
            duration_seconds = max(0, (end - start).total_seconds())
            self.entries_tree.insert(
                "",
                "end",
                values=(
                    entry.get("title", "Untitled"),
                    entry.get("description", ""),
                    format_datetime(entry["started_at"]),
                    format_datetime(entry.get("ended_at")) if entry.get("ended_at") else "In progress",
                    format_duration(duration_seconds),
                ),
            )

        if not day_entries:
            self.entries_tree.insert("", "end", values=("No entries", "", "", "", ""))

    def refresh_all(self):
        self.day_var.set(self.selected_day)
        self.refresh_summary()
        self.refresh_entries()
        self.update_clock()

    def clear_selected_day(self):
        self.entries = [entry for entry in self.entries if to_local_date(entry["started_at"]) != self.selected_day]
        self.save_entries()
        self.refresh_all()

    def edit_selected_entry(self):
        selected = self.entries_tree.selection()
        if not selected:
            messagebox.showinfo("Edit", "Please select a row to edit.")
            return

        item = self.entries_tree.item(selected[0])['values']
        if item[0] == "No entries":
            return

        title = item[0]
        description = item[1]
        start = item[2]
        end = item[3]

        day_entry = [entry for entry in self.entries if entry.get("title") == title and entry.get("description") == description and entry.get("started_at") and format_datetime(entry["started_at"]) == start][0]

        dialog = tk.Toplevel(self.root)
        dialog.title("Edit time block")
        dialog.geometry("460x320")
        dialog.transient(self.root)
        dialog.grab_set()

        tk.Label(dialog, text="Title").pack(anchor="w", padx=16, pady=(16, 4))
        title_var = tk.StringVar(value=day_entry.get("title", ""))
        tk.Entry(dialog, textvariable=title_var, width=40).pack(fill="x", padx=16)

        tk.Label(dialog, text="Description").pack(anchor="w", padx=16, pady=(10, 4))
        desc_var = tk.StringVar(value=day_entry.get("description", ""))
        tk.Entry(dialog, textvariable=desc_var, width=40).pack(fill="x", padx=16)

        tk.Label(dialog, text="Start").pack(anchor="w", padx=16, pady=(10, 4))
        start_var = tk.StringVar(value=datetime.fromisoformat(day_entry["started_at"]).strftime("%Y-%m-%d %H:%M:%S"))
        tk.Entry(dialog, textvariable=start_var, width=40).pack(fill="x", padx=16)

        tk.Label(dialog, text="End").pack(anchor="w", padx=16, pady=(10, 4))
        end_var = tk.StringVar(value=datetime.fromisoformat(day_entry["ended_at"]).strftime("%Y-%m-%d %H:%M:%S") if day_entry.get("ended_at") else "")
        tk.Entry(dialog, textvariable=end_var, width=40).pack(fill="x", padx=16)

        def save():
            try:
                day_entry["title"] = title_var.get().strip() or "Untitled task"
                day_entry["description"] = desc_var.get().strip()
                day_entry["started_at"] = datetime.strptime(start_var.get(), "%Y-%m-%d %H:%M:%S").isoformat()
                if end_var.get().strip():
                    day_entry["ended_at"] = datetime.strptime(end_var.get(), "%Y-%m-%d %H:%M:%S").isoformat()
                else:
                    day_entry["ended_at"] = None
                self.save_entries()
                self.refresh_all()
                dialog.destroy()
            except ValueError:
                messagebox.showerror("Invalid time", "Please use the format YYYY-MM-DD HH:MM:SS.")

        ttk.Button(dialog, text="Save", command=save).pack(pady=(16, 0))
        dialog.bind("<Return>", lambda event: save())

    def delete_selected_entry(self):
        selected = self.entries_tree.selection()
        if not selected:
            messagebox.showinfo("Delete", "Please select a row to delete.")
            return

        item = self.entries_tree.item(selected[0])['values']
        if item[0] == "No entries":
            return

        title = item[0]
        description = item[1]
        start = item[2]

        for entry in self.entries:
            if entry.get("title") == title and entry.get("description") == description and format_datetime(entry["started_at"]) == start:
                self.entries.remove(entry)
                self.save_entries()
                self.refresh_all()
                return

    def run(self):
        self.root.after(1000, self.start_tick)
        self.root.mainloop()

    def start_tick(self):
        self.update_clock()
        self.root.after(1000, self.start_tick)


if __name__ == "__main__":
    app = TimeTrackerApp()
    app.run()
