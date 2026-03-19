/**
 * script.js — Daily Task Manager PWA
 * ────────────────────────────────────────────────────────────────
 *  Features:
 *    ✦ Add / complete / delete tasks with animations
 *    ✦ LocalStorage persistence + midnight auto-reset
 *    ✦ Carry-forward modal for incomplete tasks
 *    ✦ Progress bar
 *    ✦ Dark mode (system preference + toggle)
 *    ✦ Confetti on all-complete
 *    ✦ PWA: Service Worker + manifest (installable, works offline)
 *    ✦ First-visit onboarding (3-step: welcome → install → notifs)
 *    ✦ Install banner for returning visitors
 *    ✦ Web Notifications alarm at task time (30-second polling)
 *    ✦ PDF generation (jsPDF) + native Web Share API
 *    ✦ Copy plain text to clipboard as fallback
 * ────────────────────────────────────────────────────────────────
 */

/* ══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
/** @type {{ id:string, name:string, time:string, done:boolean, createdAt:number, notified:boolean }[]} */
let tasks     = [];
let savedDate = '';

/* ══════════════════════════════════════════
   KEYS
═══════════════════════════════════════════ */
const LS_TASKS       = 'dtm_tasks_v4';
const LS_DATE        = 'dtm_date_v4';
const LS_THEME       = 'dtm_theme_v1';
const LS_ONBOARDED   = 'dtm_onboarded_v1';
const LS_INSTALL_DIS = 'dtm_install_dismissed';

/* ══════════════════════════════════════════
   DOM
═══════════════════════════════════════════ */
const $date          = document.getElementById('today-date');
const $taskName      = document.getElementById('task-name');
const $taskTime      = document.getElementById('task-time');
const $addBtn        = document.getElementById('add-task-btn');
const $pendingList   = document.getElementById('pending-list');
const $doneList      = document.getElementById('done-list');
const $pendingEmpty  = document.getElementById('pending-empty');
const $doneEmpty     = document.getElementById('done-empty');
const $pendingCount  = document.getElementById('pending-count');
const $doneCount     = document.getElementById('done-count');
const $clearAll      = document.getElementById('clear-all-btn');
const $clearDone     = document.getElementById('clear-done-btn');
const $progFill      = document.getElementById('progress-fill');
const $progLabel     = document.getElementById('progress-label');
const $progPct       = document.getElementById('progress-pct');
const $progTrack     = document.getElementById('progress-track');
const $themeBtn      = document.getElementById('theme-toggle');
const $bellBtn       = document.getElementById('bell-btn');
const $bellDot       = document.getElementById('bell-dot');
const $carryModal    = document.getElementById('carry-modal');
const $carryCount    = document.getElementById('carry-count');
const $modalDiscard  = document.getElementById('modal-discard');
const $modalCarry    = document.getElementById('modal-carry');
const $confetti      = document.getElementById('confetti-canvas');
const $installBanner = document.getElementById('install-banner');
const $installBtn    = document.getElementById('install-btn');
const $installDismiss= document.getElementById('install-dismiss');
const $shareBtn      = document.getElementById('share-btn');
const $shareModal    = document.getElementById('share-modal');
const $shareClose    = document.getElementById('share-modal-close');
const $pdfDatePrev   = document.getElementById('pdf-date-preview');
const $pdfTasksPrev  = document.getElementById('pdf-tasks-preview');
const $pdfFooter     = document.getElementById('pdf-footer-preview');
const $copyBtn       = document.getElementById('share-copy-btn');
const $copyLabel     = document.getElementById('copy-label');
const $dlPdfBtn      = document.getElementById('download-pdf-btn');
const $pdfBtnLabel   = document.getElementById('pdf-btn-label');
const $shareNative   = document.getElementById('share-native-btn');
const $toast         = document.getElementById('toast');

// Onboarding
const $onboardModal  = document.getElementById('onboard-modal');
const $step1         = document.getElementById('onboard-step-1');
const $step2         = document.getElementById('onboard-step-2');
const $step3         = document.getElementById('onboard-step-3');
const $next1         = document.getElementById('onboard-next-1');
const $onboardInstall= document.getElementById('onboard-install-btn');
const $skip2         = document.getElementById('onboard-skip');
const $allowNotif    = document.getElementById('onboard-allow-notif');
const $skipNotif     = document.getElementById('onboard-skip-notif');
const $$dots         = document.querySelectorAll('.onboard-dot');

/* ══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function pad(n){ return String(n).padStart(2,'0'); }

function formatDate(d = new Date()) {
  return d.toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

/** "14:05" → "2:05 PM" */
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h%12||12}:${pad(m)} ${h>=12?'PM':'AM'}`;
}

function uid() {
  return Math.random().toString(36).slice(2,10) + Date.now().toString(36);
}

function hhMM() {
  const n = new Date();
  return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
}

/* ── Toast helper ── */
let toastTimer;
function showToast(msg, dur = 2800) {
  $toast.removeAttribute('hidden');
  $toast.textContent = msg;
  requestAnimationFrame(() => requestAnimationFrame(() => $toast.classList.add('show')));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $toast.classList.remove('show');
    setTimeout(() => $toast.setAttribute('hidden',''), 300);
  }, dur);
}

/* ── Shake ── */
(function(){
  const s = document.createElement('style');
  s.textContent=`@keyframes shake{0%,100%{transform:translateX(0);}20%{transform:translateX(-6px);}40%{transform:translateX(6px);}60%{transform:translateX(-4px);}80%{transform:translateX(4px);}}.shake{animation:shake .45s ease;}`;
  document.head.appendChild(s);
})();

/* ══════════════════════════════════════════
   LOCAL STORAGE
═══════════════════════════════════════════ */

function saveTasks() {
  localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
  localStorage.setItem(LS_DATE,  todayISO());
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(LS_TASKS);
    tasks     = raw ? JSON.parse(raw) : [];
    savedDate = localStorage.getItem(LS_DATE) || todayISO();
  } catch { tasks = []; savedDate = todayISO(); }
}

/* ══════════════════════════════════════════
   MIDNIGHT RESET
═══════════════════════════════════════════ */

function checkRollover() {
  const today = todayISO();
  if (savedDate && savedDate !== today) {
    const inc = tasks.filter(t => !t.done);
    if (inc.length) { $carryCount.textContent = inc.length; openModal($carryModal); }
    else resetDay(false);
  }
}

function resetDay(keepPending) {
  tasks = keepPending
    ? tasks.filter(t=>!t.done).map(t=>({...t, notified:false, createdAt:Date.now()}))
    : [];
  saveTasks(); renderAll();
}

setInterval(() => {
  const today = todayISO();
  if (savedDate !== today) {
    savedDate = today;
    const inc = tasks.filter(t=>!t.done);
    if (inc.length) { $carryCount.textContent = inc.length; openModal($carryModal); }
    else resetDay(false);
  }
}, 60_000);

/* Carry-forward */
$modalCarry.addEventListener('click',   () => { closeModal($carryModal); resetDay(true);  });
$modalDiscard.addEventListener('click', () => { closeModal($carryModal); resetDay(false); });
$carryModal.addEventListener('click', e => { if(e.target===$carryModal){ closeModal($carryModal); resetDay(false); } });

/* ══════════════════════════════════════════
   TASK CRUD
═══════════════════════════════════════════ */

function addTask() {
  const name = $taskName.value.trim();
  if (!name) {
    $taskName.classList.add('shake');
    setTimeout(()=>$taskName.classList.remove('shake'), 500);
    $taskName.focus(); return;
  }
  tasks.unshift({ id:uid(), name, time:$taskTime.value, done:false, createdAt:Date.now(), notified:false });
  saveTasks(); renderAll();
  $taskName.value = ''; $taskTime.value = '';
  $taskName.focus();
  showToast('Task added ✓');
}

function toggleTask(id) {
  const t = tasks.find(t=>t.id===id);
  if (!t) return;
  t.done = !t.done;
  saveTasks();
  if (tasks.length && tasks.every(t=>t.done)) launchConfetti();
  renderAll();
}

function deleteTask(id, el) {
  el.classList.add('task-item--removing');
  el.addEventListener('animationend', () => {
    tasks = tasks.filter(t=>t.id!==id);
    saveTasks(); renderAll();
  }, { once:true });
}

/* ══════════════════════════════════════════
   RENDER
═══════════════════════════════════════════ */

function renderAll() {
  const pending   = tasks.filter(t=>!t.done);
  const completed = tasks.filter(t=> t.done);
  renderList($pendingList, pending,   false);
  renderList($doneList,    completed, true);
  $pendingEmpty.classList.toggle('visible', !pending.length);
  $doneEmpty.classList.toggle('visible',    !completed.length);
  $pendingCount.textContent = pending.length;
  $doneCount.textContent    = completed.length;
  updateProgress(tasks.length, completed.length);
}

function renderList(ul, list, isDone) {
  ul.innerHTML = '';
  [...list].sort((a,b)=>{
    if (!isDone) {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1; if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    }
    return b.createdAt - a.createdAt;
  }).forEach(t => ul.appendChild(buildItem(t)));
}

function buildItem(task) {
  const li = document.createElement('li');
  li.className = 'task-item'
    + (task.done ? ' task-item--done' : '')
    + (task.time ? ' task-item--has-alarm' : '');
  li.dataset.id = task.id;

  // Check
  const chk = document.createElement('button');
  chk.className = 'task-check';
  chk.setAttribute('aria-label', task.done ? 'Mark pending' : 'Mark complete');
  chk.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12"/></svg>`;
  chk.addEventListener('click', () => toggleTask(task.id));

  // Body
  const body = document.createElement('div');
  body.className = 'task-body';
  const nm = document.createElement('span'); nm.className='task-name'; nm.textContent=task.name; nm.title=task.name;
  const tm = document.createElement('span'); tm.className='task-time'; tm.textContent=task.time?fmtTime(task.time):'No time set';
  body.appendChild(nm); body.appendChild(tm);

  // Delete
  const del = document.createElement('button');
  del.className = 'task-delete';
  del.setAttribute('aria-label','Delete task');
  del.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
  del.addEventListener('click', () => deleteTask(task.id, li));

  li.appendChild(chk); li.appendChild(body); li.appendChild(del);
  return li;
}

function updateProgress(total, done) {
  const pct = total ? Math.round((done/total)*100) : 0;
  $progFill.style.width = pct+'%';
  $progLabel.textContent = `${done} of ${total} task${total!==1?'s':''} complete`;
  $progPct.textContent   = pct+'%';
  $progTrack.setAttribute('aria-valuenow', pct);
}

/* ══════════════════════════════════════════
   THEME
═══════════════════════════════════════════ */

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(LS_THEME, t);
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.content = t==='dark' ? '#241508' : '#c0622a';
}
function loadTheme() {
  const s = localStorage.getItem(LS_THEME);
  if (s) { applyTheme(s); return; }
  if (window.matchMedia?.('(prefers-color-scheme:dark)').matches) applyTheme('dark');
}
$themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark');
});

/* ══════════════════════════════════════════
   PWA — SERVICE WORKER
═══════════════════════════════════════════ */

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(r => console.log('[SW] registered', r.scope))
      .catch(e => console.warn('[SW] failed', e));
  }
}

/* ══════════════════════════════════════════
   PWA — INSTALL PROMPT
═══════════════════════════════════════════ */

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  // Only show install banner if onboarding is already done
  if (localStorage.getItem(LS_ONBOARDED) && !localStorage.getItem(LS_INSTALL_DIS)) {
    showBanner($installBanner);
  }
});

async function triggerInstall() {
  if (!deferredPrompt) return false;
  hideBanner($installBanner);
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

$installBtn.addEventListener('click', triggerInstall);
$installDismiss.addEventListener('click', () => {
  hideBanner($installBanner);
  localStorage.setItem(LS_INSTALL_DIS,'1');
});
window.addEventListener('appinstalled', () => { hideBanner($installBanner); deferredPrompt=null; });

/* ── Banner show/hide ── */
function showBanner(el) {
  el.removeAttribute('hidden');
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('visible')));
}
function hideBanner(el) {
  el.classList.remove('visible'); el.classList.add('hiding');
  el.addEventListener('animationend',()=>{ el.setAttribute('hidden',''); el.classList.remove('hiding'); },{once:true});
}

/* ══════════════════════════════════════════
   ONBOARDING (first visit)
═══════════════════════════════════════════ */

let onboardStep = 1;

function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

function openOnboarding() {
  $onboardModal.removeAttribute('hidden');
  showOnboardStep(1);
}

function showOnboardStep(n) {
  onboardStep = n;
  [$step1,$step2,$step3].forEach((s,i)=>s.hidden = i+1!==n);
  $$dots.forEach((d,i)=>{
    d.classList.toggle('onboard-dot--active', i+1===n);
  });

  if (n===2) {
    const platform = detectPlatform();
    document.getElementById('install-android').hidden = (platform!=='android' && platform!=='desktop');
    document.getElementById('install-ios').hidden     = (platform!=='ios');
    // Show direct install button if prompt is available
    $onboardInstall.hidden = !deferredPrompt;
  }
}

function finishOnboarding() {
  $onboardModal.setAttribute('hidden','');
  localStorage.setItem(LS_ONBOARDED,'1');
}

$next1.addEventListener('click', ()=>showOnboardStep(2));

$onboardInstall.addEventListener('click', async () => {
  const accepted = await triggerInstall();
  if (accepted) showToast('App installed! 🎉');
  showOnboardStep(3);
});

$skip2.addEventListener('click', ()=>showOnboardStep(3));

$allowNotif.addEventListener('click', async ()=>{
  await requestNotifPermission();
  finishOnboarding();
});

$skipNotif.addEventListener('click', ()=>finishOnboarding());

/* ══════════════════════════════════════════
   NOTIFICATIONS
═══════════════════════════════════════════ */

function notifGranted() {
  return 'Notification' in window && Notification.permission === 'granted';
}

function updateBell() {
  $bellDot.hidden = !notifGranted();
  $bellBtn.title  = notifGranted() ? 'Notifications ON' : 'Enable notifications';
}

$bellBtn.addEventListener('click', ()=>{
  if (!('Notification' in window)) { showToast('Notifications not supported by this browser.'); return; }
  if (notifGranted()) {
    showToast('To disable: update site settings in your browser.');
  } else {
    requestNotifPermission();
  }
});

async function requestNotifPermission() {
  if (!('Notification' in window)) return;
  const perm = await Notification.requestPermission();
  updateBell();
  if (perm==='granted') {
    new Notification('Daily Task Manager 🔔',{
      body:"You'll be reminded when tasks are due.",
      icon:'./icons/icon-192.png',
      badge:'./icons/icon-72.png',
    });
    showToast('Notifications enabled! 🔔');
  } else {
    showToast('Notifications blocked. You can allow them in browser settings.');
  }
}

function startAlarmPoller() {
  function check() {
    if (!notifGranted()) return;
    const now = hhMM();
    tasks.forEach(t => {
      if (!t.done && t.time && t.time===now && !t.notified) {
        t.notified = true; saveTasks();
        const n = new Notification('⏰ Task Reminder', {
          body: `"${t.name}" is scheduled for ${fmtTime(t.time)}`,
          icon: './icons/icon-192.png',
          badge:'./icons/icon-72.png',
          tag:  `task-${t.id}`,
          requireInteraction: true,
          vibrate:[200,100,200],
        });
        n.addEventListener('click',()=>{ window.focus(); n.close(); });
      }
    });
  }
  check();
  setInterval(check, 30_000);
}

/* ══════════════════════════════════════════
   SHARE / PDF
═══════════════════════════════════════════ */

let currentFmt = 'full';   // 'full' | 'pending' | 'done'

/** Filter tasks by current format tab */
function getFilteredTasks(fmt) {
  if (fmt==='pending') return tasks.filter(t=>!t.done);
  if (fmt==='done')    return tasks.filter(t=> t.done);
  return tasks;
}

/** Sorted by time for pending, by completion for done */
function sortedTasks(list) {
  return [...list].sort((a,b)=>{
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1; if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}

/* ── Build PDF preview in modal ── */
function buildPreview(fmt) {
  $pdfDatePrev.textContent = formatDate();
  $pdfTasksPrev.innerHTML  = '';

  const all       = tasks;
  const pending   = all.filter(t=>!t.done);
  const completed = all.filter(t=> t.done);

  function renderSection(label, list) {
    if (!list.length) return;
    const lbl = document.createElement('div');
    lbl.className   = 'pdf-section-label';
    lbl.textContent = label + ` (${list.length})`;
    $pdfTasksPrev.appendChild(lbl);

    sortedTasks(list).forEach(t => {
      const row = document.createElement('div');
      row.className = 'pdf-task-row';

      const chk = document.createElement('div');
      chk.className = 'pdf-task-check' + (t.done?' pdf-task-check--done':'');
      if (t.done) chk.innerHTML=`<svg viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12"/></svg>`;
      
      const nm = document.createElement('div');
      nm.className = 'pdf-task-name' + (t.done?' pdf-task-name--done':'');
      nm.textContent = t.name;

      const tm = document.createElement('div');
      tm.className   = 'pdf-task-time';
      tm.textContent = t.time ? fmtTime(t.time) : '—';

      row.appendChild(chk); row.appendChild(nm); row.appendChild(tm);
      $pdfTasksPrev.appendChild(row);
    });
  }

  if (fmt==='full' || fmt==='pending') renderSection('📌 PENDING', pending);
  if (fmt==='full' || fmt==='done')    renderSection('✅ COMPLETED', completed);

  if (!$pdfTasksPrev.children.length) {
    $pdfTasksPrev.innerHTML='<div style="text-align:center;padding:.75rem;color:var(--clr-text-muted);font-size:.82rem;">No tasks to show.</div>';
  }

  const total = all.length;
  const done  = completed.length;
  const pct   = total ? Math.round((done/total)*100) : 0;
  $pdfFooter.textContent = `Progress: ${done}/${total} tasks completed (${pct}%)  ·  Generated by Daily Task Manager`;
}

/* ── Open share modal ── */
function openShareModal() {
  currentFmt = 'full';
  document.querySelectorAll('.share-tab').forEach(b=>{
    const a = b.dataset.fmt==='full';
    b.classList.toggle('share-tab--active', a);
    b.setAttribute('aria-selected', String(a));
  });
  buildPreview('full');
  $pdfBtnLabel.textContent = 'Download PDF';
  $copyLabel.textContent   = 'Copy Text';
  $shareModal.removeAttribute('hidden');
}

function closeShareModal() { $shareModal.setAttribute('hidden',''); }

$shareBtn.addEventListener('click', openShareModal);
$shareClose.addEventListener('click', closeShareModal);
$shareModal.addEventListener('click', e=>{ if(e.target===$shareModal) closeShareModal(); });

/* Tabs */
document.querySelectorAll('.share-tab').forEach(btn => {
  btn.addEventListener('click', ()=>{
    currentFmt = btn.dataset.fmt;
    document.querySelectorAll('.share-tab').forEach(b=>{
      const a = b===btn;
      b.classList.toggle('share-tab--active',a);
      b.setAttribute('aria-selected',String(a));
    });
    buildPreview(currentFmt);
    $copyLabel.textContent   = 'Copy Text';
    $pdfBtnLabel.textContent = 'Download PDF';
  });
});

/* ── Generate PDF with jsPDF ── */
function generatePDF() {
  // jsPDF is loaded via CDN
  if (typeof window.jspdf === 'undefined') {
    showToast('PDF library not loaded yet. Please wait.'); return null;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const MARGIN = 20;
  const CONTENT_W = W - MARGIN*2;
  let y = MARGIN;

  // ── Helper: add page if needed ──
  function checkPage(needed=10) {
    if (y + needed > H - MARGIN) {
      doc.addPage();
      y = MARGIN;
      drawPageHeader();
    }
  }

  // ── Header band ──
  doc.setFillColor(192, 98, 42);
  doc.rect(0, 0, W, 38, 'F');

  // Logo circle
  doc.setFillColor(255,255,255,0.25);
  doc.setDrawColor(255,255,255);
  doc.setLineWidth(0);
  doc.circle(MARGIN+7, 19, 7, 'F');
  doc.setTextColor(192,98,42);
  doc.setFontSize(9);
  doc.setFont('helvetica','bold');
  doc.text('✓', MARGIN+7, 22, { align:'center' });

  // Title
  doc.setTextColor(255,255,255);
  doc.setFontSize(18);
  doc.setFont('helvetica','bold');
  doc.text('Daily Task Manager', MARGIN+18, 16);

  doc.setFontSize(9);
  doc.setFont('helvetica','normal');
  doc.text(formatDate(), MARGIN+18, 24);

  // Tab label
  const tabLabel = currentFmt==='pending'?'Pending Tasks'
                 : currentFmt==='done'   ?'Completed Tasks'
                 : 'Full Day Report';
  doc.setFontSize(8);
  doc.setTextColor(255,220,190);
  doc.text(tabLabel, W-MARGIN, 30, { align:'right' });

  y = 48;

  // ── Sub-header on subsequent pages ──
  function drawPageHeader() {
    doc.setFillColor(245,222,206);
    doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
    doc.setTextColor(192,98,42);
    doc.setFontSize(7);
    doc.setFont('helvetica','bold');
    doc.text('Daily Task Manager · ' + formatDate(), MARGIN+2, y+4.5);
    y += 11;
  }

  // ── Divider ──
  function divider(color=[230,210,195]) {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, W-MARGIN, y);
    y += 4;
  }

  // ── Section heading ──
  function sectionHead(label, count, r,g,b) {
    checkPage(12);
    doc.setFillColor(r,g,b);
    doc.roundedRect(MARGIN, y, CONTENT_W, 8, 1.5, 1.5, 'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(8.5);
    doc.setFont('helvetica','bold');
    doc.text(label + `  (${count})`, MARGIN+4, y+5.2);
    y += 11;
  }

  // ── Task row ──
  function taskRow(t, accent) {
    checkPage(12);
    const ROW_H = 10;

    // Row bg (alternating)
    doc.setFillColor(252,248,244);
    doc.roundedRect(MARGIN, y, CONTENT_W, ROW_H, 1, 1, 'F');

    // Checkbox
    const cx = MARGIN+5, cy = y+5;
    if (t.done) {
      doc.setFillColor(58,125,90);
      doc.circle(cx, cy, 2.8, 'F');
      doc.setTextColor(255,255,255);
      doc.setFontSize(6);
      doc.text('✓', cx, cy+1, {align:'center'});
    } else {
      doc.setDrawColor(...accent);
      doc.setLineWidth(0.4);
      doc.circle(cx, cy, 2.8);
    }

    // Task name
    doc.setFont('helvetica', t.done?'normal':'bold');
    doc.setFontSize(9);
    doc.setTextColor(t.done?150:43, t.done?130:31, t.done?110:20);

    const name = t.name.length>52 ? t.name.slice(0,52)+'…' : t.name;
    if (t.done) {
      // Strikethrough simulation
      doc.text(name, MARGIN+11, y+5.8);
      const tw = doc.getTextWidth(name);
      doc.setDrawColor(150,130,110);
      doc.setLineWidth(0.3);
      doc.line(MARGIN+11, y+5, MARGIN+11+tw, y+5);
    } else {
      doc.text(name, MARGIN+11, y+5.8);
    }

    // Time badge
    if (t.time) {
      const timeStr = fmtTime(t.time);
      const TW = doc.getTextWidth(timeStr)+4;
      const tx = W-MARGIN-TW-1;
      doc.setFillColor(...accent, 30);
      doc.setFillColor(245,222,206);
      doc.roundedRect(tx, y+2, TW, 5.5, 1, 1, 'F');
      doc.setTextColor(...accent);
      doc.setFontSize(7);
      doc.setFont('helvetica','normal');
      doc.text('🕐 '+timeStr, tx+2, y+5.8);
    } else {
      doc.setTextColor(185,155,125);
      doc.setFontSize(7);
      doc.setFont('helvetica','normal');
      doc.text('No time set', W-MARGIN-20, y+5.8);
    }

    y += ROW_H + 2;
  }

  // ── Render sections ──
  const pending   = tasks.filter(t=>!t.done);
  const completed = tasks.filter(t=> t.done);

  if (currentFmt==='full'||currentFmt==='pending') {
    sectionHead('📌  PENDING TASKS', pending.length, 192,98,42);
    if (!pending.length) {
      checkPage(10);
      doc.setTextColor(185,155,125); doc.setFontSize(9); doc.setFont('helvetica','italic');
      doc.text('No pending tasks — great job! 🎉', MARGIN+4, y+5); y+=12;
    } else {
      sortedTasks(pending).forEach(t=>taskRow(t,[192,98,42]));
    }
    y += 4;
  }

  if (currentFmt==='full'||currentFmt==='done') {
    checkPage(12);
    sectionHead('✅  COMPLETED TASKS', completed.length, 58,125,90);
    if (!completed.length) {
      checkPage(10);
      doc.setTextColor(185,155,125); doc.setFontSize(9); doc.setFont('helvetica','italic');
      doc.text('No completed tasks yet.', MARGIN+4, y+5); y+=12;
    } else {
      sortedTasks(completed).forEach(t=>taskRow(t,[58,125,90]));
    }
    y += 4;
  }

  // ── Progress summary ──
  checkPage(28);
  y += 4;
  divider();

  const total = tasks.length;
  const done  = completed.length;
  const pct   = total ? Math.round((done/total)*100) : 0;

  doc.setTextColor(122,92,66); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text('Progress Summary', MARGIN, y); y+=6;

  // Progress bar
  doc.setFillColor(240,226,212);
  doc.roundedRect(MARGIN, y, CONTENT_W, 5, 2, 2, 'F');
  if (pct>0) {
    doc.setFillColor(192,98,42);
    doc.roundedRect(MARGIN, y, (CONTENT_W*pct)/100, 5, 2, 2, 'F');
  }
  doc.setTextColor(192,98,42); doc.setFontSize(8); doc.setFont('helvetica','bold');
  doc.text(`${pct}%`, W-MARGIN, y+3.8, {align:'right'}); y+=9;

  doc.setTextColor(122,92,66); doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`${done} of ${total} task${total!==1?'s':''} completed`, MARGIN, y); y+=10;

  // ── Footer ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i=1;i<=pageCount;i++) {
    doc.setPage(i);
    doc.setFillColor(245,222,206);
    doc.rect(0, H-10, W, 10, 'F');
    doc.setTextColor(192,98,42); doc.setFontSize(7); doc.setFont('helvetica','normal');
    doc.text('Generated by Daily Task Manager', MARGIN, H-4);
    doc.text(`${formatDate()}  ·  Page ${i} of ${pageCount}`, W-MARGIN, H-4, {align:'right'});
  }

  return doc;
}

/* ── Download PDF button ── */
$dlPdfBtn.addEventListener('click', async () => {
  $pdfBtnLabel.textContent = 'Generating…';
  $dlPdfBtn.disabled = true;

  // Small delay for UX
  await new Promise(r=>setTimeout(r,100));

  try {
    const doc = generatePDF();
    if (!doc) { $pdfBtnLabel.textContent='Download PDF'; $dlPdfBtn.disabled=false; return; }
    const fileName = `tasks-${todayISO()}.pdf`;
    doc.save(fileName);
    showToast('PDF downloaded! 📄');
    $pdfBtnLabel.textContent = '✓ Downloaded!';
    setTimeout(()=>{ $pdfBtnLabel.textContent='Download PDF'; }, 3000);
  } catch(e) {
    console.error('PDF error:', e);
    showToast('PDF generation failed. Try copying text instead.');
    $pdfBtnLabel.textContent = 'Download PDF';
  }
  $dlPdfBtn.disabled = false;
});

/* ── Copy plain text ── */
function buildPlainText(fmt) {
  const dateStr = formatDate();
  const pending   = tasks.filter(t=>!t.done);
  const completed = tasks.filter(t=> t.done);
  const fmtItem   = t => `  ${t.done?'☑':'☐'} ${t.name}${t.time?' ['+fmtTime(t.time)+']':''}`;

  const lines = [
    '══════════════════════════',
    '  📋 Daily Task Manager',
    `  ${dateStr}`,
    '══════════════════════════',''
  ];

  if (fmt==='full'||fmt==='pending') {
    lines.push(`📌 PENDING (${pending.length})`);
    if (!pending.length) lines.push('  — None! 🎉');
    else sortedTasks(pending).forEach(t=>lines.push(fmtItem(t)));
    lines.push('');
  }
  if (fmt==='full'||fmt==='done') {
    lines.push(`✅ COMPLETED (${completed.length})`);
    if (!completed.length) lines.push('  — None yet.');
    else sortedTasks(completed).forEach(t=>lines.push(fmtItem(t)));
    lines.push('');
  }

  const total = tasks.length, done = completed.length;
  const pct   = total ? Math.round((done/total)*100) : 0;
  lines.push(`📊 Progress: ${done}/${total} done (${pct}%)`);
  lines.push('— Sent from Daily Task Manager');
  return lines.join('\n');
}

$copyBtn.addEventListener('click', async ()=>{
  const text = buildPlainText(currentFmt);
  try {
    await navigator.clipboard.writeText(text);
    $copyLabel.textContent='✓ Copied!';
    showToast('Copied to clipboard!');
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText='position:fixed;opacity:0;';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    $copyLabel.textContent='✓ Copied!';
    showToast('Copied to clipboard!');
  }
  setTimeout(()=>{ $copyLabel.textContent='Copy Text'; }, 3000);
});

/* ── Native share (PDF file if supported, else text) ── */
$shareNative.addEventListener('click', async ()=>{
  const text  = buildPlainText(currentFmt);
  const title = `My Tasks — ${formatDate()}`;

  // Try to share PDF file via native share
  try {
    const doc = generatePDF();
    if (doc && navigator.canShare) {
      const pdfBlob = doc.output('blob');
      const file    = new File([pdfBlob], `tasks-${todayISO()}.pdf`, { type:'application/pdf' });
      if (navigator.canShare({ files:[file] })) {
        await navigator.share({ title, files:[file] });
        closeShareModal();
        return;
      }
    }
  } catch(e) { /* fall through to text share */ }

  // Text share fallback
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      closeShareModal(); return;
    } catch(e) { if(e.name!=='AbortError') console.warn(e); return; }
  }

  // Email fallback
  window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`,'_blank');
});

/* ══════════════════════════════════════════
   CLEAR BUTTONS
═══════════════════════════════════════════ */

$clearAll.addEventListener('click', ()=>{
  if (!tasks.filter(t=>!t.done).length) return;
  if (!confirm('Delete all pending tasks?')) return;
  tasks = tasks.filter(t=>t.done); saveTasks(); renderAll();
});
$clearDone.addEventListener('click', ()=>{
  if (!tasks.filter(t=>t.done).length) return;
  tasks = tasks.filter(t=>!t.done); saveTasks(); renderAll();
});

/* ══════════════════════════════════════════
   KEYBOARD
═══════════════════════════════════════════ */

$taskName.addEventListener('keydown', e=>{ if(e.key==='Enter') addTask(); });
$addBtn.addEventListener('click', addTask);
document.addEventListener('keydown', e=>{
  if (e.key==='Escape') { closeShareModal(); closeModal($carryModal); }
});

/* ══════════════════════════════════════════
   MODAL HELPERS
═══════════════════════════════════════════ */
function openModal(el)  { el.removeAttribute('hidden'); }
function closeModal(el) { el.setAttribute('hidden',''); }

/* ══════════════════════════════════════════
   CONFETTI
═══════════════════════════════════════════ */

function launchConfetti() {
  const canvas = $confetti, ctx = canvas.getContext('2d');
  canvas.width=innerWidth; canvas.height=innerHeight;
  const COLS=['#c0622a','#e07a48','#f5a060','#3a7d5a','#5aad7a','#fce4cc','#fad2d2'];
  const P=Array.from({length:180},()=>({
    x:Math.random()*canvas.width, y:Math.random()*canvas.height-canvas.height,
    r:Math.random()*8+4, d:Math.random()*180,
    color:COLS[Math.floor(Math.random()*COLS.length)],
    tA:0, tI:Math.random()*.07+.05,
    vx:Math.random()*3-1.5, vy:Math.random()*3+2,
  }));
  let a=0; const t0=Date.now();
  (function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height); a+=.01;
    P.forEach(p=>{
      p.tA+=p.tI; p.y+=p.vy; p.x+=p.vx+Math.sin(a+p.d)*1.5;
      const tilt=Math.sin(p.tA-p.d/3)*15;
      ctx.beginPath(); ctx.lineWidth=p.r/2; ctx.strokeStyle=p.color;
      ctx.moveTo(p.x+tilt+p.r/4,p.y); ctx.lineTo(p.x+tilt,p.y+tilt+p.r/4); ctx.stroke();
    });
    if(Date.now()-t0<3500) requestAnimationFrame(draw);
    else ctx.clearRect(0,0,canvas.width,canvas.height);
  })();
}

/* ══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */

function init() {
  $date.textContent = formatDate();
  loadTheme();
  registerSW();
  loadTasks();
  checkRollover();
  renderAll();
  updateBell();
  startAlarmPoller();

  // Show onboarding on first visit
  if (!localStorage.getItem(LS_ONBOARDED)) {
    setTimeout(openOnboarding, 400);
  }

  $taskName.focus();
}

document.addEventListener('DOMContentLoaded', init);