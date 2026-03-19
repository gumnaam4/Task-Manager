/**
 * script.js — Daily Task Manager (PWA Edition)
 * ─────────────────────────────────────────────────────────────
 * Features:
 *   • Add / complete / delete tasks
 *   • LocalStorage persistence
 *   • Auto-reset at midnight with carry-forward modal
 *   • Progress bar
 *   • Dark mode toggle
 *   • Confetti animation on all-tasks-complete
 *   • PWA install prompt (service worker + manifest)
 *   • Web Notifications / Alarm at task time
 *   • Share tasks as structured text (native share + clipboard)
 * ─────────────────────────────────────────────────────────────
 */

/* ════════════════════════════════════════════
   STATE
════════════════════════════════════════════ */
/** @type {{ id:string, name:string, time:string, done:boolean, createdAt:number, notified:boolean }[]} */
let tasks = [];
let savedDate = '';

/* ════════════════════════════════════════════
   CONSTANTS
════════════════════════════════════════════ */
const LS_TASKS        = 'dtm_tasks_v3';
const LS_DATE         = 'dtm_date_v3';
const LS_THEME        = 'dtm_theme_v1';
const LS_NOTIF_DENIED = 'dtm_notif_denied';
const LS_INSTALL_DISMISSED = 'dtm_install_dismissed';

/* ════════════════════════════════════════════
   DOM REFERENCES
════════════════════════════════════════════ */
const $todayDate        = document.getElementById('today-date');
const $taskName         = document.getElementById('task-name');
const $taskTime         = document.getElementById('task-time');
const $addBtn           = document.getElementById('add-task-btn');
const $pendingList      = document.getElementById('pending-list');
const $doneList         = document.getElementById('done-list');
const $pendingEmpty     = document.getElementById('pending-empty');
const $doneEmpty        = document.getElementById('done-empty');
const $pendingCount     = document.getElementById('pending-count');
const $doneCount        = document.getElementById('done-count');
const $clearAll         = document.getElementById('clear-all-btn');
const $clearDone        = document.getElementById('clear-done-btn');
const $progressFill     = document.getElementById('progress-fill');
const $progressLabel    = document.getElementById('progress-label');
const $progressPct      = document.getElementById('progress-pct');
const $progressTrack    = document.getElementById('progress-track');
const $themeToggle      = document.getElementById('theme-toggle');
const $carryModal       = document.getElementById('carry-modal');
const $carryCount       = document.getElementById('carry-count');
const $modalDiscard     = document.getElementById('modal-discard');
const $modalCarry       = document.getElementById('modal-carry');
const $confettiCanvas   = document.getElementById('confetti-canvas');
const $installBanner    = document.getElementById('install-banner');
const $installBtn       = document.getElementById('install-btn');
const $installDismiss   = document.getElementById('install-dismiss');
const $notifBanner      = document.getElementById('notif-banner');
const $notifAllowBtn    = document.getElementById('notif-allow-btn');
const $notifDenyBtn     = document.getElementById('notif-deny-btn');
const $bellBtn          = document.getElementById('bell-btn');
const $bellDot          = document.getElementById('bell-dot');
const $shareBtn         = document.getElementById('share-btn');
const $shareModal       = document.getElementById('share-modal');
const $shareModalClose  = document.getElementById('share-modal-close');
const $sharePreview     = document.getElementById('share-preview');
const $shareCopyBtn     = document.getElementById('share-copy-btn');
const $shareNativeBtn   = document.getElementById('share-native-btn');
const $copyLabel        = document.getElementById('copy-label');

/* ════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════ */

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

/** "14:30" → "2:30 PM" */
function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function uid() {
  return Math.random().toString(36).slice(2,10) + Date.now().toString(36);
}

/** Returns current time as "HH:MM" */
function currentTimeHHMM() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
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
    tasks = []; savedDate = todayISO();
  }
}

/* ════════════════════════════════════════════
   MIDNIGHT RESET
════════════════════════════════════════════ */

function checkDayRollover() {
  const today = todayISO();
  if (savedDate && savedDate !== today) {
    const incomplete = tasks.filter(t => !t.done);
    if (incomplete.length > 0) {
      $carryCount.textContent = incomplete.length;
      openCarryModal();
    } else {
      resetForNewDay(false);
    }
  }
}

function resetForNewDay(keepIncomplete) {
  tasks = keepIncomplete
    ? tasks.filter(t => !t.done).map(t => ({ ...t, notified: false, createdAt: Date.now() }))
    : [];
  saveTasks();
  renderAll();
}

function scheduleMidnightCheck() {
  setInterval(() => {
    const today = todayISO();
    if (savedDate !== today) {
      savedDate = today;
      const incomplete = tasks.filter(t => !t.done);
      if (incomplete.length > 0) {
        $carryCount.textContent = incomplete.length;
        openCarryModal();
      } else {
        resetForNewDay(false);
      }
    }
  }, 60_000);
}

/* ════════════════════════════════════════════
   CARRY-FORWARD MODAL
════════════════════════════════════════════ */

function openCarryModal()  { $carryModal.removeAttribute('hidden'); $modalCarry.focus(); }
function closeCarryModal() { $carryModal.setAttribute('hidden', ''); }

$modalCarry.addEventListener('click',   () => { closeCarryModal(); resetForNewDay(true);  });
$modalDiscard.addEventListener('click', () => { closeCarryModal(); resetForNewDay(false); });
$carryModal.addEventListener('click', (e) => {
  if (e.target === $carryModal) { closeCarryModal(); resetForNewDay(false); }
});

/* ════════════════════════════════════════════
   TASK CRUD
════════════════════════════════════════════ */

function addTask() {
  const name = $taskName.value.trim();
  if (!name) {
    $taskName.classList.add('shake');
    setTimeout(() => $taskName.classList.remove('shake'), 500);
    $taskName.focus(); return;
  }
  const task = { id: uid(), name, time: $taskTime.value, done: false, createdAt: Date.now(), notified: false };
  tasks.unshift(task);
  saveTasks();
  renderAll();
  $taskName.value = '';
  $taskTime.value = '';
  $taskName.focus();
}

function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  saveTasks();
  const doneNum = tasks.filter(t => t.done).length;
  if (tasks.length > 0 && doneNum === tasks.length) launchConfetti();
  renderAll();
}

function deleteTask(id, itemEl) {
  itemEl.classList.add('task-item--removing');
  itemEl.addEventListener('animationend', () => {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks(); renderAll();
  }, { once: true });
}

/* ════════════════════════════════════════════
   RENDER
════════════════════════════════════════════ */

function renderAll() {
  const pending   = tasks.filter(t => !t.done);
  const completed = tasks.filter(t =>  t.done);
  renderList($pendingList, pending,   false);
  renderList($doneList,    completed, true);
  toggleEmptyState($pendingEmpty, pending.length   === 0);
  toggleEmptyState($doneEmpty,   completed.length  === 0);
  $pendingCount.textContent = pending.length;
  $doneCount.textContent    = completed.length;
  updateProgress(tasks.length, completed.length);
}

function renderList(ul, list, isDoneList) {
  ul.innerHTML = '';
  const sorted = [...list].sort((a, b) => {
    if (!isDoneList) {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    }
    return b.createdAt - a.createdAt;
  });
  sorted.forEach(task => ul.appendChild(buildTaskItem(task)));
}

function buildTaskItem(task) {
  const li = document.createElement('li');
  li.className  = 'task-item' + (task.done ? ' task-item--done' : '') + (task.time ? ' task-item--has-alarm' : '');
  li.dataset.id = task.id;

  // Check button
  const checkBtn = document.createElement('button');
  checkBtn.className = 'task-check';
  checkBtn.setAttribute('aria-label', task.done ? 'Mark as pending' : 'Mark as complete');
  checkBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12"/></svg>`;
  checkBtn.addEventListener('click', () => toggleTask(task.id));

  // Body
  const body = document.createElement('div');
  body.className = 'task-body';
  const nameSpan = document.createElement('span');
  nameSpan.className   = 'task-name';
  nameSpan.textContent = task.name;
  nameSpan.title       = task.name;
  const timeSpan = document.createElement('span');
  timeSpan.className   = 'task-time';
  timeSpan.textContent = task.time ? formatTime(task.time) : 'No time set';
  body.appendChild(nameSpan);
  body.appendChild(timeSpan);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'task-delete';
  delBtn.setAttribute('aria-label', 'Delete task');
  delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  delBtn.addEventListener('click', () => deleteTask(task.id, li));

  li.appendChild(checkBtn);
  li.appendChild(body);
  li.appendChild(delBtn);
  return li;
}

function toggleEmptyState(el, show) {
  show ? el.classList.add('visible') : el.classList.remove('visible');
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
  // Update PWA theme-color meta tag
  const metaTheme = document.getElementById('meta-theme-color');
  if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#241508' : '#c0622a');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function loadTheme() {
  const saved = localStorage.getItem(LS_THEME);
  if (saved) { applyTheme(saved); return; }
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) applyTheme('dark');
}

$themeToggle.addEventListener('click', toggleTheme);

/* ════════════════════════════════════════════
   PWA SERVICE WORKER REGISTRATION
════════════════════════════════════════════ */

let deferredInstallPrompt = null;   // stored beforeinstallprompt event

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .then(reg => console.log('[PWA] Service worker registered, scope:', reg.scope))
      .catch(err => console.warn('[PWA] SW registration failed:', err));
  }
}

/* Listen for the browser's install prompt */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();                     // prevent mini-infobar on mobile Chrome
  deferredInstallPrompt = e;

  // Only show if user hasn't dismissed before
  if (!localStorage.getItem(LS_INSTALL_DISMISSED)) {
    showBanner($installBanner);
  }
});

/* "Install" button in banner */
$installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  hideBanner($installBanner);
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  console.log('[PWA] Install outcome:', outcome);
  deferredInstallPrompt = null;
});

/* Dismiss banner */
$installDismiss.addEventListener('click', () => {
  hideBanner($installBanner);
  localStorage.setItem(LS_INSTALL_DISMISSED, '1');
});

/* Hide banner once app is installed */
window.addEventListener('appinstalled', () => {
  hideBanner($installBanner);
  deferredInstallPrompt = null;
  console.log('[PWA] App installed!');
});

/* ── Banner helpers ── */
function showBanner(el) {
  el.removeAttribute('hidden');
  // Use rAF to allow display:flex before animation class
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('visible'));
  });
}

function hideBanner(el) {
  el.classList.remove('visible');
  el.classList.add('hiding');
  el.addEventListener('animationend', () => {
    el.setAttribute('hidden', '');
    el.classList.remove('hiding');
  }, { once: true });
}

/* ════════════════════════════════════════════
   NOTIFICATIONS / ALARMS
════════════════════════════════════════════ */

/**
 * Returns true if we have (or can get) notification permission.
 * Shows the banner if permission hasn't been granted or blocked.
 */
function notificationsSupported() {
  return 'Notification' in window;
}

function notificationsGranted() {
  return notificationsSupported() && Notification.permission === 'granted';
}

/* Update the bell-dot indicator */
function updateBellUI() {
  if (notificationsGranted()) {
    $bellDot.removeAttribute('hidden');
    $bellBtn.title = 'Notifications are ON';
  } else {
    $bellDot.setAttribute('hidden', '');
    $bellBtn.title = 'Enable notifications';
  }
}

/* Bell button: toggle — if granted disable / if not, request */
$bellBtn.addEventListener('click', () => {
  if (!notificationsSupported()) {
    alert('Your browser does not support notifications.');
    return;
  }
  if (notificationsGranted()) {
    // Can't programmatically revoke — direct user to browser settings
    alert('To turn off notifications, please update your browser site settings for this page.');
  } else {
    requestNotificationPermission();
  }
});

/* Notification permission banner */
function maybeShowNotifBanner() {
  if (!notificationsSupported()) return;
  if (notificationsGranted()) return;
  if (Notification.permission === 'denied') return;
  if (localStorage.getItem(LS_NOTIF_DENIED)) return;
  // Show after 2 s so it doesn't compete with install banner
  setTimeout(() => showBanner($notifBanner), 2000);
}

$notifAllowBtn.addEventListener('click', () => {
  hideBanner($notifBanner);
  requestNotificationPermission();
});

$notifDenyBtn.addEventListener('click', () => {
  hideBanner($notifBanner);
  localStorage.setItem(LS_NOTIF_DENIED, '1');
});

async function requestNotificationPermission() {
  if (!notificationsSupported()) return;
  const permission = await Notification.requestPermission();
  updateBellUI();
  if (permission === 'granted') {
    // Fire a quick welcome notification
    new Notification('Daily Task Manager 🔔', {
      body: 'Great! You\'ll be notified when tasks are due.',
      icon: './icons/icon-192.png',
      badge: './icons/icon-72.png',
    });
  }
}

/**
 * Main alarm polling — runs every 30 seconds.
 * Fires a notification the first time the current minute matches a task's time.
 */
function startAlarmPoller() {
  function checkAlarms() {
    if (!notificationsGranted()) return;
    const now = currentTimeHHMM();

    tasks.forEach(task => {
      if (!task.done && task.time && task.time === now && !task.notified) {
        task.notified = true;   // mark so we don't re-fire in the same minute
        saveTasks();
        fireTaskNotification(task);
      }
    });
  }

  checkAlarms();                           // check immediately on page load
  setInterval(checkAlarms, 30_000);        // then every 30 s
}

function fireTaskNotification(task) {
  const n = new Notification(`⏰ Task Reminder`, {
    body: `"${task.name}" is scheduled for ${formatTime(task.time)}`,
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    tag: `task-${task.id}`,               // prevents duplicate toasts for the same task
    requireInteraction: true,             // stays until dismissed on desktop
    vibrate: [200, 100, 200],             // mobile vibration pattern
  });

  n.addEventListener('click', () => {
    window.focus();
    n.close();
  });
}

/* Reset notified flags at midnight so next-day tasks can fire again */
function resetNotifiedFlags() {
  tasks.forEach(t => { t.notified = false; });
  saveTasks();
}

/* ════════════════════════════════════════════
   SHARE TASKS
════════════════════════════════════════════ */

let currentShareFmt = 'full';   // 'full' | 'pending' | 'done'

/** Build the structured share text based on selected format */
function buildShareText(fmt) {
  const date = formatDate();
  const pending   = tasks.filter(t => !t.done);
  const completed = tasks.filter(t =>  t.done);

  const formatItem = (t, prefix) => {
    const time = t.time ? ` [${formatTime(t.time)}]` : '';
    return `  ${prefix} ${t.name}${time}`;
  };

  let lines = [];
  lines.push('╔══════════════════════════════╗');
  lines.push('   📋 Daily Task Manager');
  lines.push(`   ${date}`);
  lines.push('╚══════════════════════════════╝');
  lines.push('');

  if (fmt === 'full' || fmt === 'pending') {
    lines.push(`📌 PENDING TASKS (${pending.length})`);
    if (pending.length === 0) {
      lines.push('  — None! 🎉');
    } else {
      // Sort pending by time
      const sorted = [...pending].sort((a,b) => {
        if (!a.time && !b.time) return 0;
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
      });
      sorted.forEach(t => lines.push(formatItem(t, '☐')));
    }
    lines.push('');
  }

  if (fmt === 'full' || fmt === 'done') {
    lines.push(`✅ COMPLETED TASKS (${completed.length})`);
    if (completed.length === 0) {
      lines.push('  — None yet.');
    } else {
      completed.forEach(t => lines.push(formatItem(t, '☑')));
    }
    lines.push('');
  }

  // Summary footer
  const total = tasks.length;
  const pct   = total === 0 ? 0 : Math.round((completed.length / total) * 100);
  lines.push(`📊 Progress: ${completed.length}/${total} tasks done (${pct}%)`);
  lines.push('');
  lines.push('— Sent from Daily Task Manager');

  return lines.join('\n');
}

/** Open the share modal */
function openShareModal() {
  currentShareFmt = 'full';
  // Reset tabs
  document.querySelectorAll('.share-tab').forEach(btn => {
    const active = btn.dataset.fmt === 'full';
    btn.classList.toggle('share-tab--active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  $sharePreview.textContent = buildShareText('full');
  $shareModal.removeAttribute('hidden');
  $copyLabel.textContent = 'Copy Text';
}

function closeShareModal() { $shareModal.setAttribute('hidden', ''); }

$shareBtn.addEventListener('click', openShareModal);

$shareModalClose.addEventListener('click', closeShareModal);

$shareModal.addEventListener('click', (e) => {
  if (e.target === $shareModal) closeShareModal();
});

/* Tab switching */
document.querySelectorAll('.share-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    currentShareFmt = btn.dataset.fmt;
    document.querySelectorAll('.share-tab').forEach(b => {
      const active = b === btn;
      b.classList.toggle('share-tab--active', active);
      b.setAttribute('aria-selected', String(active));
    });
    $sharePreview.textContent = buildShareText(currentShareFmt);
    $copyLabel.textContent = 'Copy Text';
  });
});

/* Copy to clipboard */
$shareCopyBtn.addEventListener('click', async () => {
  const text = buildShareText(currentShareFmt);
  try {
    await navigator.clipboard.writeText(text);
    $copyLabel.textContent = '✓ Copied!';
    setTimeout(() => { $copyLabel.textContent = 'Copy Text'; }, 2500);
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    $copyLabel.textContent = '✓ Copied!';
    setTimeout(() => { $copyLabel.textContent = 'Copy Text'; }, 2500);
  }
});

/* Native Web Share API */
$shareNativeBtn.addEventListener('click', async () => {
  const text = buildShareText(currentShareFmt);
  const title = `My Tasks — ${formatDate()}`;

  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      closeShareModal();
    } catch (err) {
      // User cancelled or share failed — don't throw
      if (err.name !== 'AbortError') console.warn('[Share] Error:', err);
    }
  } else {
    // Fallback: open mail client
    const subject = encodeURIComponent(title);
    const body    = encodeURIComponent(text);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  }
});

/* ════════════════════════════════════════════
   CLEAR BUTTONS
════════════════════════════════════════════ */

$clearAll.addEventListener('click', () => {
  if (!tasks.filter(t => !t.done).length) return;
  if (!confirm('Delete all pending tasks?')) return;
  tasks = tasks.filter(t => t.done);
  saveTasks(); renderAll();
});

$clearDone.addEventListener('click', () => {
  if (!tasks.filter(t => t.done).length) return;
  tasks = tasks.filter(t => !t.done);
  saveTasks(); renderAll();
});

/* ════════════════════════════════════════════
   KEYBOARD SHORTCUTS
════════════════════════════════════════════ */

$taskName.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
$addBtn.addEventListener('click', addTask);

// Escape closes any open modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeShareModal();
    closeCarryModal();
  }
});

/* ════════════════════════════════════════════
   SHAKE STYLE INJECTION
════════════════════════════════════════════ */
(function injectShakeStyle() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%,100% { transform:translateX(0); }
      20%      { transform:translateX(-6px); }
      40%      { transform:translateX(6px); }
      60%      { transform:translateX(-4px); }
      80%      { transform:translateX(4px); }
    }
    .shake { animation:shake 0.45s ease; }
  `;
  document.head.appendChild(style);
})();

/* ════════════════════════════════════════════
   CONFETTI
════════════════════════════════════════════ */

function launchConfetti() {
  const canvas = $confettiCanvas;
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const COLORS = ['#c0622a','#e07a48','#f5a060','#3a7d5a','#5aad7a','#fce4cc','#fad2d2','#c9e4d8'];
  const COUNT  = 180;
  const particles = Array.from({ length: COUNT }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    r: Math.random() * 8 + 4,
    d: Math.random() * COUNT,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    tiltAngleIncrementor: Math.random() * 0.07 + 0.05,
    tiltAngle: 0,
    vx: Math.random() * 3 - 1.5,
    vy: Math.random() * 3 + 2,
  }));
  let angle = 0;
  const startTime = Date.now();
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    angle += 0.01;
    particles.forEach(p => {
      p.tiltAngle += p.tiltAngleIncrementor;
      p.y += p.vy;
      p.x += p.vx + Math.sin(angle + p.d) * 1.5;
      const tilt = Math.sin(p.tiltAngle - p.d / 3) * 15;
      ctx.beginPath();
      ctx.lineWidth   = p.r / 2;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + tilt + p.r / 4, p.y);
      ctx.lineTo(p.x + tilt, p.y + tilt + p.r / 4);
      ctx.stroke();
    });
    if (Date.now() - startTime < 3500) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */

function init() {
  $todayDate.textContent = formatDate();

  // Theme
  loadTheme();

  // Register service worker (PWA)
  registerServiceWorker();

  // Tasks
  loadTasks();
  checkDayRollover();
  renderAll();

  // Midnight polling
  scheduleMidnightCheck();

  // Notifications
  updateBellUI();
  maybeShowNotifBanner();
  startAlarmPoller();

  // Focus input
  $taskName.focus();
}

document.addEventListener('DOMContentLoaded', init);