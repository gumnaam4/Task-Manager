/**
 * script.js — Daily Task Manager
 * ─────────────────────────────────────────────────────────────
 * Features:
 *   • Add / complete / delete tasks
 *   • LocalStorage persistence
 *   • Auto-reset at midnight with carry-forward modal
 *   • Progress bar
 *   • Dark mode toggle
 *   • Confetti animation on all-tasks-complete
 * ─────────────────────────────────────────────────────────────
 */

/* ════════════════════════════════════════════
   STATE
════════════════════════════════════════════ */
/** @type {{ id:string, name:string, time:string, done:boolean, createdAt:number }[]} */
let tasks = [];

/** Stored ISO date string (YYYY-MM-DD) of when tasks were last saved */
let savedDate = '';

/* ════════════════════════════════════════════
   CONSTANTS
════════════════════════════════════════════ */
const LS_TASKS = 'dtm_tasks_v2';
const LS_DATE  = 'dtm_date_v2';
const LS_THEME = 'dtm_theme_v1';

/* ════════════════════════════════════════════
   DOM REFERENCES
════════════════════════════════════════════ */
const $todayDate    = document.getElementById('today-date');
const $taskName     = document.getElementById('task-name');
const $taskTime     = document.getElementById('task-time');
const $addBtn       = document.getElementById('add-task-btn');
const $pendingList  = document.getElementById('pending-list');
const $doneList     = document.getElementById('done-list');
const $pendingEmpty = document.getElementById('pending-empty');
const $doneEmpty    = document.getElementById('done-empty');
const $pendingCount = document.getElementById('pending-count');
const $doneCount    = document.getElementById('done-count');
const $clearAll     = document.getElementById('clear-all-btn');
const $clearDone    = document.getElementById('clear-done-btn');
const $progressFill = document.getElementById('progress-fill');
const $progressLabel= document.getElementById('progress-label');
const $progressPct  = document.getElementById('progress-pct');
const $progressTrack= document.getElementById('progress-track');
const $themeToggle  = document.getElementById('theme-toggle');
const $carryModal   = document.getElementById('carry-modal');
const $carryCount   = document.getElementById('carry-count');
const $modalDiscard = document.getElementById('modal-discard');
const $modalCarry   = document.getElementById('modal-carry');
const $confettiCanvas = document.getElementById('confetti-canvas');

/* ════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════ */

/** Returns today's date as "YYYY-MM-DD" */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns a nicely formatted date string e.g. "Thursday, 19 March 2026" */
function formatDate(date = new Date()) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Format a 24-h "HH:MM" time value to "12:30 PM" style */
function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm   = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Generate a short unique ID */
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ════════════════════════════════════════════
   LOCAL STORAGE
════════════════════════════════════════════ */

function saveTasks() {
  localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
  localStorage.setItem(LS_DATE,  todayISO());
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(LS_TASKS);
    tasks = raw ? JSON.parse(raw) : [];
    savedDate = localStorage.getItem(LS_DATE) || todayISO();
  } catch {
    tasks = [];
    savedDate = todayISO();
  }
}

/* ════════════════════════════════════════════
   MIDNIGHT / NEW-DAY LOGIC
════════════════════════════════════════════ */

/**
 * Called on page load.
 * If a new day has started since tasks were last saved,
 * show the carry-forward modal (or silently reset).
 */
function checkDayRollover() {
  const today = todayISO();
  if (savedDate && savedDate !== today) {
    // A new day has arrived
    const incompleteTasks = tasks.filter(t => !t.done);

    if (incompleteTasks.length > 0) {
      // Show modal so user can choose
      $carryCount.textContent = incompleteTasks.length;
      openCarryModal();
    } else {
      // Nothing to carry — just reset
      resetForNewDay(false);
    }
  }
}

/** Clear completed tasks; optionally keep or drop incomplete ones */
function resetForNewDay(keepIncomplete) {
  if (keepIncomplete) {
    // Keep incomplete tasks, strip completed ones
    tasks = tasks
      .filter(t => !t.done)
      .map(t => ({ ...t, createdAt: Date.now() })); // refresh timestamp
  } else {
    tasks = [];
  }
  saveTasks();
  renderAll();
}

/* ════════════════════════════════════════════
   CARRY-FORWARD MODAL
════════════════════════════════════════════ */

function openCarryModal() {
  $carryModal.removeAttribute('hidden');
  $modalCarry.focus();
}

function closeCarryModal() {
  $carryModal.setAttribute('hidden', '');
}

$modalCarry.addEventListener('click', () => {
  closeCarryModal();
  resetForNewDay(true);   // keep pending tasks
});

$modalDiscard.addEventListener('click', () => {
  closeCarryModal();
  resetForNewDay(false);  // start fresh
});

// Close on overlay click
$carryModal.addEventListener('click', (e) => {
  if (e.target === $carryModal) {
    closeCarryModal();
    resetForNewDay(false);
  }
});

/* ════════════════════════════════════════════
   TASK CRUD
════════════════════════════════════════════ */

/** Add a new pending task */
function addTask() {
  const name = $taskName.value.trim();
  if (!name) {
    // Shake the input to indicate error
    $taskName.classList.add('shake');
    setTimeout(() => $taskName.classList.remove('shake'), 500);
    $taskName.focus();
    return;
  }

  const task = {
    id:        uid(),
    name,
    time:      $taskTime.value,
    done:      false,
    createdAt: Date.now(),
  };

  tasks.unshift(task); // prepend so newest is at top
  saveTasks();
  renderAll();

  // Reset inputs
  $taskName.value = '';
  $taskTime.value = '';
  $taskName.focus();
}

/** Toggle task done/pending */
function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  task.done = !task.done;
  saveTasks();

  // Check for all-complete celebration
  const total   = tasks.length;
  const doneNum = tasks.filter(t => t.done).length;
  if (total > 0 && doneNum === total) {
    launchConfetti();
  }

  renderAll();
}

/** Delete a task by id */
function deleteTask(id, itemEl) {
  // Animate removal
  itemEl.classList.add('task-item--removing');
  itemEl.addEventListener('animationend', () => {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    renderAll();
  }, { once: true });
}

/* ════════════════════════════════════════════
   RENDER
════════════════════════════════════════════ */

/** Re-render both lists and all stats */
function renderAll() {
  const pending   = tasks.filter(t => !t.done);
  const completed = tasks.filter(t =>  t.done);

  renderList($pendingList, pending,   false);
  renderList($doneList,    completed, true);

  // Empty states
  toggleEmptyState($pendingEmpty, pending.length === 0);
  toggleEmptyState($doneEmpty,   completed.length === 0);

  // Counts
  $pendingCount.textContent = pending.length;
  $doneCount.textContent    = completed.length;

  updateProgress(tasks.length, completed.length);
}

/** Render a list of task objects into a <ul> element */
function renderList(ul, list, isDoneList) {
  ul.innerHTML = '';

  // Sort: pending by time, done by completion time
  const sorted = [...list].sort((a, b) => {
    if (!isDoneList) {
      // Sort pending by time (tasks with no time go to the bottom)
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    }
    return b.createdAt - a.createdAt;
  });

  sorted.forEach(task => {
    const li = buildTaskItem(task);
    ul.appendChild(li);
  });
}

/** Build a single task <li> element */
function buildTaskItem(task) {
  const li = document.createElement('li');
  li.className  = 'task-item' + (task.done ? ' task-item--done' : '');
  li.dataset.id = task.id;
  li.setAttribute('role', 'listitem');

  // ── Check button
  const checkBtn = document.createElement('button');
  checkBtn.className  = 'task-check';
  checkBtn.setAttribute('aria-label', task.done ? 'Mark as pending' : 'Mark as complete');
  checkBtn.title = task.done ? 'Mark as pending' : 'Mark as complete';
  checkBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none">
      <polyline points="20 6 9 17 4 12" />
    </svg>`;
  checkBtn.addEventListener('click', () => toggleTask(task.id));

  // ── Body
  const body = document.createElement('div');
  body.className = 'task-body';

  const nameSpan = document.createElement('span');
  nameSpan.className   = 'task-name';
  nameSpan.textContent = task.name;
  nameSpan.title       = task.name;

  const timeSpan = document.createElement('span');
  timeSpan.className   = 'task-time';
  timeSpan.textContent = task.time ? `⏰ ${formatTime(task.time)}` : '⏰ No time set';

  body.appendChild(nameSpan);
  body.appendChild(timeSpan);

  // ── Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'task-delete';
  delBtn.setAttribute('aria-label', 'Delete task');
  delBtn.title = 'Delete task';
  delBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>`;
  delBtn.addEventListener('click', () => deleteTask(task.id, li));

  li.appendChild(checkBtn);
  li.appendChild(body);
  li.appendChild(delBtn);

  return li;
}

/** Show or hide an empty-state placeholder */
function toggleEmptyState(el, show) {
  if (show) {
    el.classList.add('visible');
  } else {
    el.classList.remove('visible');
  }
}

/* ════════════════════════════════════════════
   PROGRESS BAR
════════════════════════════════════════════ */

function updateProgress(total, done) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  $progressFill.style.width = `${pct}%`;
  $progressLabel.textContent = `${done} of ${total} task${total !== 1 ? 's' : ''} complete`;
  $progressPct.textContent   = `${pct}%`;
  $progressTrack.setAttribute('aria-valuenow', pct);
}

/* ════════════════════════════════════════════
   DARK MODE
════════════════════════════════════════════ */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(LS_THEME, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function loadTheme() {
  const saved = localStorage.getItem(LS_THEME);
  if (saved) {
    applyTheme(saved);
  } else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
  }
}

$themeToggle.addEventListener('click', toggleTheme);

/* ════════════════════════════════════════════
   CONFETTI
════════════════════════════════════════════ */

/**
 * Lightweight canvas-based confetti burst.
 * Runs for ~3 seconds then clears itself.
 */
function launchConfetti() {
  const canvas = $confettiCanvas;
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const COLORS = ['#c0622a','#e07a48','#f5a060','#3a7d5a','#5aad7a','#fce4cc','#fad2d2','#c9e4d8'];
  const COUNT  = 180;

  const particles = Array.from({ length: COUNT }, () => ({
    x:    Math.random() * canvas.width,
    y:    Math.random() * canvas.height - canvas.height,
    r:    Math.random() * 8 + 4,
    d:    Math.random() * COUNT,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    tilt:  Math.random() * 10 - 10,
    tiltAngleIncrementor: Math.random() * 0.07 + 0.05,
    tiltAngle: 0,
    vx:   Math.random() * 3 - 1.5,
    vy:   Math.random() * 3 + 2,
  }));

  let angle  = 0;
  let frameId;
  const startTime = Date.now();

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    angle += 0.01;

    particles.forEach(p => {
      p.tiltAngle += p.tiltAngleIncrementor;
      p.y  += p.vy;
      p.x  += p.vx + Math.sin(angle + p.d) * 1.5;
      p.tilt = Math.sin(p.tiltAngle - p.d / 3) * 15;

      ctx.beginPath();
      ctx.lineWidth = p.r / 2;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
      ctx.stroke();
    });

    const elapsed = Date.now() - startTime;
    if (elapsed < 3500) {
      frameId = requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(frameId);
    }
  }

  draw();
}

/* ════════════════════════════════════════════
   CLEAR BUTTONS
════════════════════════════════════════════ */

$clearAll.addEventListener('click', () => {
  if (!tasks.filter(t => !t.done).length) return;
  if (!confirm('Delete all pending tasks?')) return;
  tasks = tasks.filter(t => t.done); // keep completed
  saveTasks();
  renderAll();
});

$clearDone.addEventListener('click', () => {
  if (!tasks.filter(t => t.done).length) return;
  tasks = tasks.filter(t => !t.done); // keep pending
  saveTasks();
  renderAll();
});

/* ════════════════════════════════════════════
   KEYBOARD SHORTCUT — Enter to add task
════════════════════════════════════════════ */

$taskName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});

$addBtn.addEventListener('click', addTask);

/* ════════════════════════════════════════════
   SHAKE ANIMATION (inline via style)
════════════════════════════════════════════ */
(function injectShakeStyle() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      20%      { transform: translateX(-6px); }
      40%      { transform: translateX(6px); }
      60%      { transform: translateX(-4px); }
      80%      { transform: translateX(4px); }
    }
    .shake { animation: shake 0.45s ease; }
  `;
  document.head.appendChild(style);
})();

/* ════════════════════════════════════════════
   MIDNIGHT POLLING — check every minute
════════════════════════════════════════════ */

function scheduleMidnightCheck() {
  setInterval(() => {
    const today = todayISO();
    if (savedDate !== today) {
      savedDate = today;
      const incompleteTasks = tasks.filter(t => !t.done);
      if (incompleteTasks.length > 0) {
        $carryCount.textContent = incompleteTasks.length;
        openCarryModal();
      } else {
        resetForNewDay(false);
      }
    }
  }, 60_000); // check every 60 seconds
}

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */

function init() {
  // Show date in header
  $todayDate.textContent = formatDate();

  // Load persisted theme
  loadTheme();

  // Load persisted tasks
  loadTasks();

  // Handle new-day rollover
  checkDayRollover();

  // Render initial UI
  renderAll();

  // Start midnight polling
  scheduleMidnightCheck();

  // Focus task input
  $taskName.focus();
}

// Kick everything off once DOM is ready
document.addEventListener('DOMContentLoaded', init);