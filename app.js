(function () {
  "use strict";

  // ---------- Utilities ----------
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toISODate(date) {
    return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
  }

  function fromISODate(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function getMondayFirstDowFromDate(date) {
    // JS: Sunday=0..Saturday=6 -> Monday-first 1..7
    const jsDow = date.getDay();
    return jsDow === 0 ? 7 : jsDow; // Monday=1..Sunday=7
  }

  function getMondayFirstDowFromISODate(iso) {
    const d = fromISODate(iso);
    if (!d) return null;
    return getMondayFirstDowFromDate(d);
  }

  function formatMonthLabel(date) {
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  function tryUuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  // ---------- Storage ----------
  const STORAGE_KEY = "weekly_tasks_v1";

  /** @typedef {{ id: string, text: string, dayOfWeek: number|null, scheduledDate: string|null, priority: 'low'|'normal'|'high', completed: boolean, createdAt: string }} Task */

  /** @returns {Task[]} */
  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) {
      console.error("Failed to load tasks", e);
      return [];
    }
  }

  /** @param {Task[]} tasks */
  function saveTasks(tasks) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      console.error("Failed to save tasks", e);
    }
  }

  /** @param {Partial<Task>} partial */
  function createTask(partial) {
    const nowIso = new Date().toISOString();
    const task = {
      id: tryUuid(),
      text: "",
      dayOfWeek: null,
      scheduledDate: null,
      priority: "normal",
      completed: false,
      createdAt: nowIso,
      ...partial,
    };
    const all = loadTasks();
    all.push(task);
    saveTasks(all);
    return task;
  }

  function updateTask(taskId, updater) {
    const all = loadTasks();
    const idx = all.findIndex(t => t.id === taskId);
    if (idx === -1) return;
    const updated = { ...all[idx], ...updater };
    all[idx] = updated;
    saveTasks(all);
    return updated;
  }

  function deleteTask(taskId) {
    const all = loadTasks();
    const next = all.filter(t => t.id !== taskId);
    saveTasks(next);
  }

  // ---------- DOM Helpers ----------
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "dataset") {
        for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
      } else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2), v);
      } else if (k === "html") node.innerHTML = v;
      else if (v !== undefined && v !== null) node.setAttribute(k, v);
    }
    for (const child of children) {
      if (child == null) continue;
      if (Array.isArray(child)) node.append(...child);
      else if (child instanceof Node) node.appendChild(child);
      else node.appendChild(document.createTextNode(String(child)));
    }
    return node;
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function priorityClass(priority) {
    return priority === "high" ? "priority-high" : priority === "low" ? "priority-low" : "priority-normal";
  }

  // ---------- Render: Week View ----------
  function renderWeekView() {
    const tasks = loadTasks();
    const byDow = new Map();
    for (let i = 1; i <= 7; i++) byDow.set(i, []);
    for (const task of tasks) {
      if (task.dayOfWeek) byDow.get(task.dayOfWeek).push(task);
    }

    for (let i = 1; i <= 7; i++) {
      const listEl = document.getElementById(`day-${i}-list`);
      if (!listEl) continue;
      clearChildren(listEl);

      const dayTasks = byDow.get(i)
        .slice()
        .sort((a, b) => Number(a.completed) - Number(b.completed) || (a.priority === "high" ? -1 : a.priority === "low" ? 1 : 0));

      for (const task of dayTasks) {
        const item = renderTaskItem(task);
        listEl.appendChild(item);
      }
    }
  }

  function renderTaskItem(task) {
    const checkbox = el("input", { type: "checkbox", checked: task.completed ? "" : null, oninput: () => toggleComplete(task.id) });
    const title = el("div", { class: "task-title" }, task.text);

    const metaParts = [];
    if (task.scheduledDate) metaParts.push(task.scheduledDate);
    const meta = el("div", { class: "task-meta" }, metaParts.join(" • "));

    const chip = el("span", { class: `priority-chip ${priorityClass(task.priority)}` }, task.priority);

    const delBtn = el("button", { class: "icon-button", title: "Delete", onclick: () => onDeleteTask(task.id) }, "✕");

    const left = el("div", {}, checkbox);
    const middle = el("div", {}, title, meta, chip);
    const right = el("div", {}, delBtn);

    const li = el("li", { class: `task-item${task.completed ? " completed" : ""}` }, left, middle, right);

    li.addEventListener("dblclick", () => onEditTask(task));

    return li;
  }

  function toggleComplete(taskId) {
    const t = loadTasks().find(t => t.id === taskId);
    if (!t) return;
    updateTask(taskId, { completed: !t.completed });
    renderAll();
  }

  function onDeleteTask(taskId) {
    deleteTask(taskId);
    renderAll();
  }

  function onEditTask(task) {
    const nextText = prompt("Edit task", task.text);
    if (nextText == null) return;
    const trimmed = nextText.trim();
    if (!trimmed) return;
    updateTask(task.id, { text: trimmed });
    renderAll();
  }

  // ---------- Render: Calendar ----------
  let currentMonthDate = new Date();
  currentMonthDate.setDate(1);

  function renderCalendar() {
    const monthLabel = document.getElementById("calendar-month-label");
    monthLabel.textContent = formatMonthLabel(currentMonthDate);

    const grid = document.getElementById("calendar-grid");
    clearChildren(grid);

    // Weekday headers (Mon..Sun)
    for (let i = 0; i < 7; i++) {
      grid.appendChild(el("div", { class: "calendar-weekday" }, DAY_NAMES[i]));
    }

    const tasks = loadTasks();

    const firstDayJs = currentMonthDate.getDay(); // 0..6 (Sun..Sat)
    const firstDayDow = firstDayJs === 0 ? 7 : firstDayJs; // 1..7 (Mon..Sun)
    const leadBlanks = firstDayDow - 1; // number of days from previous month to show

    const year = currentMonthDate.getFullYear();
    const monthIndex = currentMonthDate.getMonth();

    const lastOfMonth = new Date(year, monthIndex + 1, 0);
    const daysInMonth = lastOfMonth.getDate();

    // Previous month dates to fill leading blanks
    const prevMonthLastDate = new Date(year, monthIndex, 0).getDate();

    const totalCells = 42; // 6 weeks x 7 days

    const cells = [];

    // Build date objects for all 42 cells
    for (let c = 0; c < totalCells; c++) {
      const dayNum = c - leadBlanks + 1;
      let cellDate, isOtherMonth = false;
      if (dayNum < 1) {
        // previous month
        const d = prevMonthLastDate + dayNum;
        cellDate = new Date(year, monthIndex - 1, d);
        isOtherMonth = true;
      } else if (dayNum > daysInMonth) {
        // next month
        const d = dayNum - daysInMonth;
        cellDate = new Date(year, monthIndex + 1, d);
        isOtherMonth = true;
      } else {
        cellDate = new Date(year, monthIndex, dayNum);
      }
      cells.push({ cellDate, isOtherMonth });
    }

    // Render cells
    for (const { cellDate, isOtherMonth } of cells) {
      const iso = toISODate(cellDate);
      const dayTasks = tasks.filter(t => t.scheduledDate === iso);

      const header = el("div", { class: "cell-header" },
        el("span", {}, String(cellDate.getDate())),
        dayTasks.length ? el("span", { class: "dot", title: `${dayTasks.length} task(s)` }) : null
      );

      const tasksContainer = el("div", { class: "cell-tasks" });
      for (const t of dayTasks.slice(0, 3)) {
        tasksContainer.appendChild(el("div", { class: "cell-task" }, t.text));
      }
      if (dayTasks.length > 3) {
        tasksContainer.appendChild(el("div", { class: "cell-task" }, `+${dayTasks.length - 3} more`));
      }

      const cell = el("div", { class: `calendar-cell${isOtherMonth ? " other-month" : ""}`, role: "button", tabindex: 0, "aria-label": `${iso}: ${dayTasks.length} tasks` });
      cell.append(header, tasksContainer);
      cell.addEventListener("click", () => openSelectedDatePanel(iso));
      cell.addEventListener("keypress", (e) => { if (e.key === "Enter") openSelectedDatePanel(iso); });

      grid.appendChild(cell);
    }
  }

  // Selected date panel
  let openDateIso = null;

  function openSelectedDatePanel(isoDate) {
    openDateIso = isoDate;
    const panel = document.getElementById("selected-date-panel");
    const title = document.getElementById("selected-date-title");
    const subt = document.getElementById("selected-date-subtitle");
    const list = document.getElementById("selected-date-task-list");

    const d = fromISODate(isoDate);
    title.textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
    subt.textContent = "Tasks on this day";
    panel.classList.remove("hidden");

    renderSelectedDateTasks(list, isoDate);
  }

  function closeSelectedDatePanel() {
    openDateIso = null;
    const panel = document.getElementById("selected-date-panel");
    panel.classList.add("hidden");
  }

  function renderSelectedDateTasks(listEl, isoDate) {
    clearChildren(listEl);
    const tasks = loadTasks().filter(t => t.scheduledDate === isoDate);
    const sorted = tasks.slice().sort((a, b) => Number(a.completed) - Number(b.completed));
    for (const t of sorted) listEl.appendChild(renderTaskItem(t));
  }

  // ---------- Add forms ----------
  function handleAddTaskFormSubmit(e) {
    e.preventDefault();
    const textInput = document.getElementById("task-text");
    const daySelect = document.getElementById("task-day");
    const dateInput = document.getElementById("task-date");
    const prioritySelect = document.getElementById("task-priority");

    const text = textInput.value.trim();
    if (!text) return;

    const chosenDate = dateInput.value || null;
    let chosenDow = null;
    if (daySelect.value !== "auto") {
      chosenDow = clamp(parseInt(daySelect.value, 10), 1, 7);
    } else if (chosenDate) {
      chosenDow = getMondayFirstDowFromISODate(chosenDate);
    } else {
      chosenDow = getMondayFirstDowFromDate(new Date());
    }

    createTask({ text, dayOfWeek: chosenDow, scheduledDate: chosenDate, priority: prioritySelect.value });

    textInput.value = "";
    // keep other selections

    renderAll();
  }

  function handleAddDateTaskFormSubmit(e) {
    e.preventDefault();
    if (!openDateIso) return;
    const textInput = document.getElementById("date-task-text");
    const prioritySelect = document.getElementById("date-task-priority");

    const text = textInput.value.trim();
    if (!text) return;

    const dow = getMondayFirstDowFromISODate(openDateIso);
    createTask({ text, dayOfWeek: dow, scheduledDate: openDateIso, priority: prioritySelect.value });

    textInput.value = "";
    renderAll();
    openSelectedDatePanel(openDateIso);
  }

  // ---------- View switcher ----------
  function showWeekView() {
    document.getElementById("week-view").classList.remove("hidden");
    document.getElementById("calendar-view").classList.add("hidden");
    document.getElementById("btn-view-week").classList.add("active");
    document.getElementById("btn-view-week").setAttribute("aria-pressed", "true");
    document.getElementById("btn-view-calendar").classList.remove("active");
    document.getElementById("btn-view-calendar").setAttribute("aria-pressed", "false");
  }

  function showCalendarView() {
    document.getElementById("calendar-view").classList.remove("hidden");
    document.getElementById("week-view").classList.add("hidden");
    document.getElementById("btn-view-calendar").classList.add("active");
    document.getElementById("btn-view-calendar").setAttribute("aria-pressed", "true");
    document.getElementById("btn-view-week").classList.remove("active");
    document.getElementById("btn-view-week").setAttribute("aria-pressed", "false");
  }

  // ---------- Render all ----------
  function renderAll() {
    renderWeekView();
    renderCalendar();
    if (openDateIso) openSelectedDatePanel(openDateIso);
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", () => {
    // Week/Calendar buttons
    document.getElementById("btn-view-week").addEventListener("click", showWeekView);
    document.getElementById("btn-view-calendar").addEventListener("click", showCalendarView);

    // Add task forms
    document.getElementById("add-task-form").addEventListener("submit", handleAddTaskFormSubmit);
    document.getElementById("add-date-task-form").addEventListener("submit", handleAddDateTaskFormSubmit);

    // Calendar navigation
    document.getElementById("btn-prev-month").addEventListener("click", () => {
      currentMonthDate.setMonth(currentMonthDate.getMonth() - 1);
      renderCalendar();
    });
    document.getElementById("btn-next-month").addEventListener("click", () => {
      currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
      renderCalendar();
    });

    // Panel close
    document.getElementById("btn-close-panel").addEventListener("click", closeSelectedDatePanel);

    // First render
    renderAll();
  });
})();