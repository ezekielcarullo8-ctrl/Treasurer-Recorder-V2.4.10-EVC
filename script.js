/* =========================================================================
    APP LOCK / OFFLINE DEVICE ACTIVATION
    -------------------------------------------------------------------------
    How this works:
    1. On first launch on a phone, the app reads a unique Device ID (from the
        Capacitor Device plugin when running as the built Android app).
    2. The buyer sends you that Device ID (text/chat/etc — no internet needed
        inside the app itself).
    3. You run the separate "keygen" tool (kept privately, NOT shipped inside
        this app) to turn that Device ID into an Activation Code.
    4. The buyer types the code in. It's checked using the exact same formula
        that generated it. If it matches, the app unlocks and remembers it.
    5. If someone copies the APK/app data to a different phone (e.g. via
        Share It / Quick Share), that phone has a DIFFERENT Device ID, so the
        old activation code will not work there. They'd need to contact you
        and pay for their own code.

    IMPORTANT: Change LICENSE_SALT below to your own private secret before
    you build/sell this app, and keep it out of anything you share publicly.
    The GitHub Actions workflow obfuscates this file during the build so the
    salt/algorithm isn't sitting around in plain, readable text inside the
    APK — but a determined person could still eventually extract it. This is
    a deterrent against casual sharing, not an unbreakable lock.
    ========================================================================= */

  const LICENSE_SALT = "CHANGE-THIS-TO-YOUR-OWN-SECRET-2026";
  const PIN_SALT = "CHANGE-THIS-PIN-SALT-TOO-2026";

  function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash * 33) ^ str.charCodeAt(i)) >>> 0;
    }
    return hash.toString(16).toUpperCase().padStart(8, "0");
  }

  function generateActivationCode(deviceId) {
    return simpleHash(deviceId + LICENSE_SALT);
  }

  function hashPin(pin) {
    return simpleHash(pin + PIN_SALT);
  }

  function isAndroidApp() {
    return !!(window.Capacitor && window.Capacitor.getPlatform() === "android");
  }

  async function getDeviceId() {
    if (isAndroidApp() && window.Capacitor.Plugins.Device) {
      try {
        const info = await window.Capacitor.Plugins.Device.getId();
        return info.identifier;
      } catch (e) {
        console.error("Device ID error:", e);
      }
    }
    // Fallback used only when testing in a regular PC browser (not the built app)
    let fallback = localStorage.getItem("dev_fallback_device_id");
    if (!fallback) {
      fallback = "DEV-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem("dev_fallback_device_id", fallback);
    }
    return fallback;
  }

  async function checkActivation() {
    const overlay = document.getElementById("activation-overlay");
    const androidApp = isAndroidApp();
    const deviceId = await getDeviceId();
    document.getElementById("device-id-display").innerText = deviceId;

    // Skip the lock while you're developing/testing in a regular browser.
    // The lock only activates inside the actual built Android app.
    if (!androidApp) {
      overlay.classList.add("hidden");
      checkPinLock();
      return;
    }

    const activatedFlag = localStorage.getItem("app_activated");
    const activatedDeviceId = localStorage.getItem("activated_device_id");

    if (activatedFlag === "true" && activatedDeviceId === deviceId) {
      overlay.classList.add("hidden");
      checkPinLock();
      return;
    }

    overlay.classList.remove("hidden");
    // checkPinLock() runs after a successful submitActivationCode() instead
  }

  function submitActivationCode() {
    const input = document.getElementById("activation-code-input").value.trim().toUpperCase();
    const deviceId = document.getElementById("device-id-display").innerText.trim();
    const errorEl = document.getElementById("activation-error");
    const expected = generateActivationCode(deviceId);

    if (!input) {
      errorEl.innerText = "Please enter the activation code.";
      return;
    }

    if (input === expected) {
      localStorage.setItem("app_activated", "true");
      localStorage.setItem("activated_device_id", deviceId);
      errorEl.innerText = "";
      document.getElementById("activation-overlay").classList.add("hidden");
      checkPinLock();
    } else {
      errorEl.innerText = "Invalid code for this device. Double-check with the seller.";
    }
  }

  /* =========================================================================
    PIN LOCK — a second, lighter-weight lock that guards the app every time
    it's opened (protects the treasurer's records from anyone who picks up
    the phone, separate from the one-time device activation above).
    ========================================================================= */

  async function checkPinLock() {
    if (!isAndroidApp()) return; // only enforced in the real built app

    const overlay = document.getElementById("pin-overlay");
    const storedHash = localStorage.getItem("treasurer_pin_hash");
    const titleEl = document.getElementById("pin-title");
    const subEl = document.getElementById("pin-subtext");

    if (!storedHash) {
      titleEl.innerText = "SET UP A PIN";
      subEl.innerText = "Create a 4-digit PIN to protect your records. You'll need it every time you open the app.";
      overlay.dataset.mode = "create";
    } else {
      titleEl.innerText = "ENTER PIN";
      subEl.innerText = "Enter your 4-digit PIN to continue.";
      overlay.dataset.mode = "verify";
    }
    overlay.classList.remove("hidden");
  }

  function submitPin() {
    const overlay = document.getElementById("pin-overlay");
    const inputEl = document.getElementById("pin-input");
    const input = inputEl.value.trim();
    const errorEl = document.getElementById("pin-error");

    if (!/^\d{4}$/.test(input)) {
      errorEl.innerText = "PIN must be exactly 4 digits.";
      return;
    }

    if (overlay.dataset.mode === "create") {
      localStorage.setItem("treasurer_pin_hash", hashPin(input));
      overlay.classList.add("hidden");
      inputEl.value = "";
      errorEl.innerText = "";
      return;
    }

    const storedHash = localStorage.getItem("treasurer_pin_hash");
    if (hashPin(input) === storedHash) {
      overlay.classList.add("hidden");
      inputEl.value = "";
      errorEl.innerText = "";
    } else {
      errorEl.innerText = "Incorrect PIN.";
      inputEl.value = "";
    }
  }

  function forgotPin() {
    const deviceId = document.getElementById("device-id-display").innerText.trim();
    const code = prompt("Forgot PIN — enter this device's Activation Code to reset it:");
    if (!code) return;
    const expected = generateActivationCode(deviceId);
    if (code.trim().toUpperCase() === expected) {
      localStorage.removeItem("treasurer_pin_hash");
      eveAlert("PIN reset. Please set a new PIN now.");
      checkPinLock();
    } else {
      eveAlert("That code doesn't match this device's activation code.", true);
    }
  }

  window.addEventListener("DOMContentLoaded", checkActivation);

  /* =========================================================================
    THEME + STYLE TOGGLES
    -------------------------------------------------------------------------
    Two independent preferences, each remembered in localStorage:
    - uiTheme: "light" | "dark"       → toggled by the moon/sun button
    - uiStyle: "default" | "cyberpunk" → toggled by the diamond/bolt button

    Cyberpunk mode overrides the palette to a fixed neon-on-dark look
    regardless of the light/dark choice, since the aesthetic depends on
    high-contrast glow effects.
    ========================================================================= */

  function applyThemeAndStyle() {
    const theme = localStorage.getItem("uiTheme") || "light";
    const style = localStorage.getItem("uiStyle") || "default";

    document.body.classList.toggle("theme-dark", theme === "dark");
    document.body.classList.toggle("style-cyberpunk", style === "cyberpunk");

    const themeBtn = document.getElementById("theme-toggle");
    const styleBtn = document.getElementById("style-toggle");
    if (themeBtn) {
      themeBtn.innerText = theme === "dark" ? "☀️" : "🌙";
      themeBtn.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    }
    if (styleBtn) {
      styleBtn.innerText = style === "cyberpunk" ? "⚡" : "◈";
      styleBtn.title = style === "cyberpunk" ? "Switch to default style" : "Switch to cyberpunk style";
    }
  }

function toggleTheme() {
  const current = localStorage.getItem("uiTheme") || "light";
  const next = current === "light" ? "dark" : "light";
  localStorage.setItem("uiTheme", next);
  applyThemeAndStyle();

  if (window.EveAssistant && typeof EveAssistant.showMsg === 'function') {
    const text = next === 'dark'
      ? "Did the lights turn off?"
      : "Oh look! The light came back!";
    const reaction = next === 'light' ? 'smile' : 'lookup';
    EveAssistant.showMsg(text, false, reaction);   // ← smile on light, lookup on dark
  }
}
  window.addEventListener("DOMContentLoaded", applyThemeAndStyle);

  /* =========================================================================
    MAIN APP
    ========================================================================= */


  /* =========================================================================
   MODE SYSTEM — Org Treasurer vs Class Treasurer
   ========================================================================= */
const MODE_KEY = "treasurerMode";

function getMode()  { return localStorage.getItem(MODE_KEY) || ""; }
function isOrg()    { return getMode() === "org"; }
function isClass()  { return getMode() === "class"; }

function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
  location.reload();
}

function switchMode() {
  const modal = document.getElementById("mode-switch-confirm-modal");
  if (modal) {
    modal.classList.remove("hidden");
  } else {
    // Fallback in case the confirm modal markup is missing for some reason
    setMode(isOrg() ? "class" : "org");
  }
}

function closeSwitchModeConfirm() {
  const modal = document.getElementById("mode-switch-confirm-modal");
  if (modal) modal.classList.add("hidden");
}

function confirmSwitchMode() {
  closeSwitchModeConfirm();
  setMode(isOrg() ? "class" : "org");
}

function checkMode() {
  const overlay = document.getElementById("mode-overlay");
  const btn = document.getElementById("mode-toggle");
  if (!getMode()) {
    overlay.classList.remove("hidden");
    if (btn) btn.style.display = "none";
    return;
  }
  overlay.classList.add("hidden");
  if (btn) {
    btn.style.display = "flex";
    btn.innerText = isOrg() ? "ORG" : "CLASS";
  }
  applyMode();
}

/* Label helper: pass the org-mode text, get back the correct text */
function lbl(orgText) {
  if (isOrg()) return orgText;
  // Class-mode dictionary
  const map = {
    "Program Year Level": "Student",
    "Program Year Levels": "Students",
    "program year level": "student",
    "program year levels": "students",
    "Year Level": "Student",
    "Year Levels": "Students",
    "year level": "student",
    "year levels": "students",
    "Add Program & Year Level (Permanent)": "Add Student (Permanent)",
    "Search Year Level...": "Search Student...",
    "Search year level in this collection...": "Search student in this collection...",
    "Search or Select Year Level...": "Search or Select Students...",
    "Tap a program year level to view their balance across all collections": "Tap a student to view their balance across all collections",
    "Tap program year level to add a payment or edit": "Tap student to add a payment or edit",
    "Add All Year Level": "Add All Students",
    "Add Year Levels": "Add Students",
    "Select which year levels to enroll": "Select which students to enroll",
    "No year level added to this collection yet.": "No student added to this collection yet.",
    "No year levels in the database yet.": "No students in the database yet.",
    "No remaining year levels match your search.": "No remaining students match your search.",
    "Organization Info": "Class Info",
    "Organization Name": "Class/Section Name",
    "Treasurer Name": "Class Treasurer Name",
    "President / Adviser Name": "Adviser Name",
    "Save Organization Info": "Save Class Info",
    "Digital Ledger": "Class Ledger",
    "This copy of the app is not activated on this device yet.": "This copy of the app is not activated on this device yet.",
    "0 program year level in the database": "0 student in the database",
    "1 program year level in the database": "1 student in the database",
    "They will also be removed from all collections.": "They will also be removed from all collections.",
    "Payment from": "Payment from",
    "Cash Book": "Class Fund",
    "Projects & Events": "Class Activities"
  };
  return map[orgText] || orgText;
}

function applyMode() {
  // Nav label
const navStudents = document.querySelector('#nav-students');
if (navStudents) navStudents.innerHTML = `<span>🎓</span>${lbl("Year Level")}`;

// Modal title & description
const addAllTitle = document.querySelector('#add-all-modal h3');
if (addAllTitle) addAllTitle.innerText = lbl("Add Year Levels");
const addAllDesc = document.querySelector('#add-all-modal .note');
if (addAllDesc) addAllDesc.innerHTML = `Select which ${lbl("year levels").toLowerCase()} to enroll in <b id="add-all-cat-name">this collection</b>. Search to filter the list.`;

// Student input placeholder
// Student input placeholder
const newStudentInput = document.getElementById('new-student-name');
if (newStudentInput) newStudentInput.placeholder = isOrg() ? "e.g. BSIT 2" : "e.g. Gon Freecs";

// Student count input is org-mode only (a "year level" has an enrolled
// headcount; individual class-mode students don't)
const countWrapper = document.getElementById('new-student-count-wrapper');
if (countWrapper) countWrapper.classList.toggle('hidden', !isOrg());
    // Nav visibility
  const cashbookNav = document.getElementById("nav-cashbook");
  const classfundNav = document.getElementById("nav-classfund");
  if (cashbookNav) cashbookNav.classList.toggle("hidden", isClass());
  if (classfundNav) classfundNav.classList.toggle("hidden", isOrg());
  
  // Static header relabeling
  const dbAdd = document.getElementById("db-add-header");
  if (dbAdd) dbAdd.innerText = lbl("Add Program & Year Level (Permanent)");

  const dbList = document.getElementById("db-list-header");
  if (dbList) dbList.innerText = isOrg() ? "Year Levels Database" : "Student Database"; // same text, but keeps pattern

  // Placeholders
  const sSearch = document.getElementById("search-students-db");
  if (sSearch) sSearch.placeholder = lbl("Search Year Level...");

  const iSearch = document.getElementById("item-search");
  if (iSearch) iSearch.placeholder = lbl("Search year level in this collection...");

  const stSearch = document.getElementById("student-search");
  if (stSearch) stSearch.placeholder = lbl("Search or Select Year Level...");

  // Add-tab tip
  const tip = document.querySelector(".add-tab-note");
  if (tip) {
    tip.innerHTML = `<b>💡 Tip:</b> ${lbl("Year Levels")} must be added permanently in the <b>${lbl("Year Level")}</b> tab before they appear in dropdowns. Payments recorded here automatically sync to your ${isOrg() ? 'Cash Book ledger' : 'class record'}.`;
  }

  // Add-all button text
  const addAllBtn = document.querySelector(".mode-add-all-btn");
  if (addAllBtn) addAllBtn.innerText = lbl("Add All Year Level");

  // Org-only sections in Summary: Organization/Class Info + Financial Statement
  // are both wrapped in their own container so they can be shown/hidden as a
  // whole block instead of fragile sibling-walking (which used to leave
  // stray dividers/labels behind).
  const orgInfoSection = document.getElementById("org-info-section");
  if (orgInfoSection) {
    orgInfoSection.classList.toggle("hidden", isClass());
    const orgHeader = orgInfoSection.querySelector("h3");
    if (orgHeader) orgHeader.innerText = lbl("Organization Info");
  }
  const finStmtSection = document.getElementById("financial-statement-section");
  if (finStmtSection) {
    finStmtSection.classList.toggle("hidden", isClass());
  }

  // Fix Add Student / Add Year Level button text
  const addStudentBtn = document.querySelector('#database-section button[onclick="addStudent()"]');
  if (addStudentBtn) addStudentBtn.innerText = isOrg() ? "Add Year Level" : "Add Student";

  // Input placeholders in Summary / Org Info
  const orgName = document.getElementById("org-name");
  if (orgName) orgName.placeholder = lbl("Organization Name") + " (e.g. ITO - PUP UNISAN)";
  const orgTreas = document.getElementById("org-treasurer");
  if (orgTreas) orgTreas.placeholder = lbl("Treasurer Name");
  const orgPres = document.getElementById("org-president");
  if (orgPres) orgPres.placeholder = lbl("President / Adviser Name");

  // Re-render dynamic views so labels update
  renderStudents();
  renderCategories();
  renderSummary();
}

  const STORAGE_KEY = "treasurerRecorderEzekiel";
  let db = JSON.parse(localStorage.getItem(STORAGE_KEY)) || { students: [], categories: {} };

  // Bring any old or new-format backup up to the current data shape.
  // Safe to call repeatedly (on load and after importing a backup).
    function migrateDb() {
    db.students = (db.students || []).map(s =>
      typeof s === "string" ? { name: s } : { name: s.name || "Unknown" }
    );
    db.categories = db.categories || {};

    db.cashbook = db.cashbook || { openingBalance: 0, transactions: [] };
    db.cashbook.openingBalance = db.cashbook.openingBalance || 0;
    db.cashbook.transactions = db.cashbook.transactions || [];

    db.projects = db.projects || [];
    db.orgSettings = db.orgSettings || { orgName: "", treasurerName: "", presidentName: "", schoolYear: "" };

        db.classFund = db.classFund || { weeklyDue: 20, startDate: new Date().toISOString().slice(0, 10), records: {}, transactions: [] };
    db.classFund.weeklyDue = db.classFund.weeklyDue || 20;
    db.classFund.startDate = db.classFund.startDate || new Date().toISOString().slice(0, 10);
    db.classFund.records = db.classFund.records || {};
    db.classFund.transactions = db.classFund.transactions || [];
    db.transfers = db.transfers || [];
    db.notepad = db.notepad || { notes: [] };
// Migrate old folder-based notepad to flat notes
if (db.notepad.folders && Array.isArray(db.notepad.folders)) {
  db.notepad.notes = [];
  db.notepad.folders.forEach(f => {
    if (f.notes && Array.isArray(f.notes)) {
      f.notes.forEach(n => {
        db.notepad.notes.push({
          id: n.id || Date.now() + "-" + Math.random().toString(36).slice(2, 7),
          title: (n.title && n.title !== 'Untitled') ? n.title : (f.name || 'Note'),
          content: n.content || '',
          updated: n.updated || new Date().toISOString().slice(0, 10)
        });
      });
    }
  });
  delete db.notepad.folders;
}
db.notepad.notes = db.notepad.notes || [];
  }

    function recordClassFundExpense() {
    const date = document.getElementById("cf-expense-date").value || new Date().toISOString().slice(0, 10);
    const desc = document.getElementById("cf-expense-desc").value.trim();
    const amount = round2(parseFloat(document.getElementById("cf-expense-amount").value) || 0);
    const note = document.getElementById("cf-expense-note").value.trim();

    if (!desc) return eveAlert("Please enter what the expense was for.", true);
    if (amount <= 0) return eveAlert("Please enter a valid amount.", true);

    db.classFund.transactions.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      type: "expense",
      date,
      description: desc,
      amount,
      note
    });

    saveData();
    renderClassFund();
    eveAlert(`Expense of ${peso(amount)} recorded.`);
  }

  function deleteClassFundTxn(id) {
    if (!confirm("Delete this expense?")) return;
    db.classFund.transactions = db.classFund.transactions.filter(t => String(t.id) !== String(id));
    saveData();
    renderClassFund();
  }

  migrateDb();

  let currentCategory = "";
  let editingIndex = null;
  let paidFilter = "all";
let addAllSelected = new Set();
  let quickPaySelected = new Set();
  let undoStack = [];
  let redoStack = [];
  const MAX_UNDO_HISTORY = 50;
  let editingHistory = { recIdx: null, histIdx: null };
  let cfLedgerEditing = { type: null, student: null, histIdx: null, id: null };

  // ---------- HELPERS ----------

  /**
   * Escape a string for safe insertion into HTML text content and attributes.
   * Handles &, <, >, ", and ' to prevent XSS and broken markup.
   */
  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function saveData() {
    // Capture the state as it was *before* this change so it can be
    // restored on Undo. Any new action clears the Redo history, since
    // it's now a divergent timeline from whatever was undone.
    const prevRaw = localStorage.getItem(STORAGE_KEY);
    if (prevRaw !== null) {
      undoStack.push({ state: prevRaw, time: Date.now() });
      if (undoStack.length > MAX_UNDO_HISTORY) undoStack.shift();
    }
    redoStack = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;

    const undoBtnLogs = document.getElementById('undo-btn-logs');
    const redoBtnLogs = document.getElementById('redo-btn-logs');
    if (undoBtnLogs) undoBtnLogs.disabled = undoStack.length === 0;
    if (redoBtnLogs) redoBtnLogs.disabled = redoStack.length === 0;

    const undoCount = document.getElementById('undo-count-logs');
    const redoCount = document.getElementById('redo-count-logs');
    if (undoCount) undoCount.innerText = undoStack.length;
    if (redoCount) redoCount.innerText = redoStack.length;
  }

  function performUndo() {
    if (undoStack.length === 0) return eveAlert("Nothing to undo.", true);
    const entry = undoStack.pop();
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    redoStack.push({ state: currentRaw, time: Date.now() });
    if (redoStack.length > MAX_UNDO_HISTORY) redoStack.shift();

    db = JSON.parse(entry.state);
    migrateDb();
    localStorage.setItem(STORAGE_KEY, entry.state);
    refreshAllViews();
    eveAlert("Undone.");
  }

  function performRedo() {
    if (redoStack.length === 0) return eveAlert("Nothing to redo.", true);
    const entry = redoStack.pop();
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    undoStack.push({ state: currentRaw, time: Date.now() });
    if (undoStack.length > MAX_UNDO_HISTORY) undoStack.shift();

    db = JSON.parse(entry.state);
    migrateDb();
    localStorage.setItem(STORAGE_KEY, entry.state);
    refreshAllViews();
    eveAlert("Redone.");
  }

  // Re-renders every view after an Undo/Redo, since the whole database
  // may have jumped to a very different state than what's on screen.
  function refreshAllViews() {
    editingIndex = null;
    editingHistory = { recIdx: null, histIdx: null };
    addAllSelected.clear();
    quickPaySelected.clear();

    renderStudents();
    renderCategories();
    renderSummary();

    if (isOrg()) {
      renderCashbookSummary();
      renderCashbookList();
      renderProjects();
    }
    if (isClass()) {
      renderClassFund();
    }

    loadOrgSettingsForm();
    updateAppHeader();

    const itemView = document.getElementById('item-view');
    if (itemView && !itemView.classList.contains('hidden')) {
      if (currentCategory && db.categories[currentCategory]) {
        renderItemList();
      } else {
        backToCategories();
      }
    }

    const profileView = document.getElementById('student-profile-view');
    if (profileView && !profileView.classList.contains('hidden')) {
      const nameEl = document.getElementById('profile-student-name');
      const name = nameEl ? nameEl.innerText : '';
      if (name && db.students.some(s => s.name === name)) {
        renderStudentProfile(name);
      } else {
        backToStudentList();
      }
    }

    const logsView = document.getElementById('eve-logs-view');
    if (logsView && !logsView.classList.contains('hidden')) renderEveLogs();

    const summaryView = document.getElementById('eve-summary-view');
    if (summaryView && !summaryView.classList.contains('hidden')) renderEveSummary();

    updateUndoRedoButtons();
  }

  function peso(n) {
    return `₱${(n || 0).toFixed(2)}`;
  }

  // Rounds to 2 decimal places to avoid floating-point drift from repeated
  // addition (e.g. 0.1 + 0.2 style errors) building up over many payments.
  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // Finds an existing category name case-insensitively (so "Field Trip" and
  // "field trip" are treated as the same collection instead of duplicates).
  function findCategoryKeyCI(name) {
    const lower = name.toLowerCase();
    return Object.keys(db.categories).find(k => k.toLowerCase() === lower) || null;
  }

  // ---------- PAGE SWITCH ----------
  function switchTab(id, btn) {
  if (id === 'cashbook-section' && isClass()) return;
  if (id === 'classfund-section' && isOrg()) return;

  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (id === 'inventory-section') {
    backToCategories();
  } else if (id === 'database-section') {
    backToStudentList();
    renderStudents();
  } else if (id === 'cashbook-section') {
    document.getElementById('project-detail-view').classList.add('hidden');
    document.getElementById('projects-view').classList.add('hidden');
    document.getElementById('cashbook-main-view').classList.remove('hidden');
    renderCashbookSummary();
    renderCashbookList();
    renderProjects();
  } else if (id === 'classfund-section') {
    renderClassFund();
  } else if (id === 'summary-section') {
    loadOrgSettingsForm();
    renderSummary();
  }
}
  

  // ================= STUDENTS (PERMANENT DATABASE) =================

function addStudent() {
  const input = document.getElementById("new-student-name");
  const countInput = document.getElementById("new-student-count");
  const name = input.value.trim();
  if (!name) return eveAlert("Please enter a " + lbl("year level").toLowerCase() + " name", true);
  if (db.students.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    return eveAlert("This " + lbl("year level").toLowerCase() + " is already in the database", true);
  }

  const entry = { name };
  if (isOrg() && countInput && countInput.value !== "") {
    const count = Math.max(0, Math.round(parseFloat(countInput.value) || 0));
    entry.studentCount = count;
  }

  db.students.push(entry);
  saveData();
  renderStudents();
  input.value = "";
  if (countInput) countInput.value = "";
}

  /* =========================================================================
    CLASS FUND — Independent Weekly Tracker (Class Mode)
    ========================================================================= */

  function getExpectedWeeks(startDateStr) {
    if (!startDateStr) return 0;
    const start = new Date(startDateStr + "T00:00:00");
    const now = new Date();
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    if (now < start) return 0;
    const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7) + 1;
  }

  function getClassFundExpected(studentName) {
    const cf = db.classFund;
    if (!cf.weeklyDue || !cf.startDate) return 0;
    return round2(getExpectedWeeks(cf.startDate) * cf.weeklyDue);
  }

  function getMissedWeeks(studentName) {
    const cf = db.classFund;
    if (!cf.weeklyDue || cf.weeklyDue <= 0) return 0;
    const expected = getClassFundExpected(studentName);
    const paid = cf.records[studentName] ? cf.records[studentName].paid : 0;
    if (paid >= expected) return 0;
    return Math.ceil((expected - paid) / cf.weeklyDue);
  }

  function getLastPaymentDate(studentName) {
    const rec = db.classFund.records[studentName];
    if (!rec || !rec.history || rec.history.length === 0) return null;
    return rec.history[rec.history.length - 1].date;
  }

  function saveClassFundSettings() {
    const weekly = round2(parseFloat(document.getElementById("cf-weekly-due").value) || 0);
    const startDate = document.getElementById("cf-start-date").value;
    if (weekly <= 0) return eveAlert("Please enter a valid weekly amount.", true);
    if (!startDate) return eveAlert("Please select a collection start date.", true);
    db.classFund.weeklyDue = weekly;
    db.classFund.startDate = startDate;
    saveData();
    renderClassFund();
    eveAlert("Class Fund settings saved.");
  }

  function addAllToClassFund() {
    const cf = db.classFund;
    let added = 0, skipped = 0;
    db.students.forEach(s => {
      if (!cf.records[s.name]) {
        cf.records[s.name] = { paid: 0, history: [] };
        added++;
      } else {
        skipped++;
      }
    });
    if (added === 0) return eveAlert(skipped > 0 ? "All students are already enrolled." : "No students in the database. Add them in the Students tab first.");
    saveData();
    renderClassFund();
    eveAlert(`${added} student(s) enrolled.${skipped > 0 ? ' (' + skipped + ' already enrolled)' : ''}`);
  }

    function resetClassFundData() {
    if (!confirm("Reset all Class Fund records? This clears every payment, expense, and student enrollment.")) return;
    db.classFund.records = {};
    db.classFund.transactions = [];
    saveData();
    renderClassFund();
  }

  function recordClassFundPayment(studentName) {
  const safeId = studentName.replace(/\s+/g, '-');
  const dateVal = document.getElementById(`cf-date-${safeId}`).value;
  const amount = round2(parseFloat(document.getElementById(`cf-pay-${safeId}`).value) || 0);
  const note = document.getElementById(`cf-note-${safeId}`).value.trim();
  if (amount <= 0) return eveAlert("Please enter a valid amount.", true);

  const cf = db.classFund;
  if (!cf.records[studentName]) cf.records[studentName] = { paid: 0, history: [] };
  const rec = cf.records[studentName];

  rec.paid = round2(rec.paid + amount);
  rec.history.push({
    amount,
    date: dateVal || new Date().toISOString().slice(0, 10),
    note: note || "Class Fund",
    time: new Date().toLocaleTimeString()
  });

  saveData();
  renderClassFund();
}

  function deleteClassFundPayment(studentName, idx) {
    const rec = db.classFund.records[studentName];
    if (!rec || !rec.history[idx]) return;
    if (!confirm("Delete this payment entry?")) return;
    const removed = rec.history.splice(idx, 1)[0];
    rec.paid = round2(Math.max(0, rec.paid - removed.amount));
    saveData();
    renderClassFund();
  }

  function deleteClassFundStudent(name) {
    if (!confirm(`Remove ${name} from Class Fund tracking? Their history will be deleted.`)) return;
    delete db.classFund.records[name];
    saveData();
    renderClassFund();
  }

function editClassFundPayment(studentName, histIdx) {
  openCfLedgerEdit('income', studentName, histIdx);
}

  /* -------------------------------------------------------------------------
    CLASS FUND LEDGER — FULL SCREEN TRANSACTION EDITOR
    -------------------------------------------------------------------------
    Every row in the Class Fund Ledger (both student payments/income and
    manual expenses) opens this full-screen panel so it can be edited or
    deleted in one place, instead of only being editable from inside an
    individual student's expanded card.
    ------------------------------------------------------------------------- */

  function openCfLedgerEdit(type, a, b) {
    const modal = document.getElementById('cf-ledger-edit-modal');
    if (!modal) return;
    const typeLabel = document.getElementById('cf-ledger-edit-type');
    const descLabel = document.getElementById('cf-ledger-edit-desc-label');
    const descInput = document.getElementById('cf-ledger-edit-desc');
    const dateInput = document.getElementById('cf-ledger-edit-date');
    const amountInput = document.getElementById('cf-ledger-edit-amount');
    const noteInput = document.getElementById('cf-ledger-edit-note');

    if (type === 'income') {
      const name = a, histIdx = b;
      const rec = db.classFund.records[name];
      if (!rec || !rec.history[histIdx]) return eveAlert("Couldn't find that payment entry.", true);
      const entry = rec.history[histIdx];

      cfLedgerEditing = { type: 'income', student: name, histIdx, id: null };
      typeLabel.innerText = "Income • Student Payment";
      typeLabel.style.color = "var(--success)";
      descLabel.innerText = "Student";
      descInput.value = name;
      descInput.disabled = true;
      dateInput.value = entry.date || "";
      amountInput.value = entry.amount;
      noteInput.value = entry.note || "";
    } else {
      const id = a;
      const txn = (db.classFund.transactions || []).find(t => String(t.id) === String(id));
      if (!txn) return eveAlert("Couldn't find that expense entry.", true);

      cfLedgerEditing = { type: 'expense', student: null, histIdx: null, id };
      typeLabel.innerText = "Expense";
      typeLabel.style.color = "var(--danger)";
      descLabel.innerText = "Description";
      descInput.value = txn.description || "";
      descInput.disabled = false;
      dateInput.value = txn.date || "";
      amountInput.value = txn.amount;
      noteInput.value = txn.note || "";
    }

    modal.classList.remove('hidden');
  }

  function closeCfLedgerEdit() {
    const modal = document.getElementById('cf-ledger-edit-modal');
    if (modal) modal.classList.add('hidden');
    cfLedgerEditing = { type: null, student: null, histIdx: null, id: null };
  }

  function saveCfLedgerEdit() {
    if (!cfLedgerEditing.type) return;
    const dateVal = document.getElementById('cf-ledger-edit-date').value;
    const amount = round2(parseFloat(document.getElementById('cf-ledger-edit-amount').value) || 0);
    const note = document.getElementById('cf-ledger-edit-note').value.trim();
    const desc = document.getElementById('cf-ledger-edit-desc').value.trim();

    if (!dateVal) return eveAlert("Please select a date.", true);
    if (amount <= 0) return eveAlert("Please enter a valid amount.", true);

    if (cfLedgerEditing.type === 'income') {
      const rec = db.classFund.records[cfLedgerEditing.student];
      if (!rec || !rec.history[cfLedgerEditing.histIdx]) return eveAlert("That payment entry no longer exists.", true);
      const entry = rec.history[cfLedgerEditing.histIdx];
      rec.paid = round2(rec.paid - entry.amount + amount);
      if (rec.paid < 0) rec.paid = 0;
      entry.amount = amount;
      entry.date = dateVal;
      entry.note = note;
    } else {
      const txn = (db.classFund.transactions || []).find(t => String(t.id) === String(cfLedgerEditing.id));
      if (!txn) return eveAlert("That expense entry no longer exists.", true);
      if (!desc) return eveAlert("Please enter a description.", true);
      txn.date = dateVal;
      txn.amount = amount;
      txn.note = note;
      txn.description = desc;
    }

    saveData();
    closeCfLedgerEdit();
    renderClassFund();
    eveAlert("Transaction updated.");
  }

  function deleteCfLedgerEdit() {
    if (!cfLedgerEditing.type) return;
    if (!confirm("Delete this transaction? This cannot be undone.")) return;

    if (cfLedgerEditing.type === 'income') {
      const rec = db.classFund.records[cfLedgerEditing.student];
      if (rec && rec.history[cfLedgerEditing.histIdx]) {
        const removed = rec.history.splice(cfLedgerEditing.histIdx, 1)[0];
        rec.paid = round2(Math.max(0, rec.paid - removed.amount));
      }
    } else {
      db.classFund.transactions = (db.classFund.transactions || []).filter(t => String(t.id) !== String(cfLedgerEditing.id));
    }

    saveData();
    closeCfLedgerEdit();
    renderClassFund();
  }

  /* -------------------------------------------------------------------------
   WEEKLY BREAKDOWN — derives per-week payment status from history
   ------------------------------------------------------------------------- */
function getWeeklyBreakdown(history, weeklyDue) {
  const sorted = [...(history || [])].sort((a, b) =>
    (a.date || "").localeCompare(b.date || "")
  );
  const weeks = [];
  let currentWeek = 0;
  let weekPaid = 0;
  let weekDate = null;

  for (const entry of sorted) {
    let remaining = entry.amount;
    while (remaining > 0) {
      const space = weeklyDue - weekPaid;
      const alloc = Math.min(remaining, space);
      weekPaid += alloc;
      if (!weekDate) weekDate = entry.date;
      remaining -= alloc;

      if (weekPaid >= weeklyDue) {
        weeks[currentWeek] = { amount: weekPaid, date: weekDate, status: "full" };
        currentWeek++;
        weekPaid = 0;
        weekDate = null;
      }
    }
  }

  if (weekPaid > 0) {
    weeks[currentWeek] = { amount: weekPaid, date: weekDate, status: "partial" };
  }
  return weeks;
}

function getWeekRangeLabel(startDateStr, weekIndex) {
  const start = new Date(startDateStr + "T00:00:00");
  start.setDate(start.getDate() + (weekIndex * 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const day = start.toLocaleDateString('en-US', { weekday: 'long' });
  return {
    label: `Week ${weekIndex + 1} (${fmt(start)} - ${fmt(end)})`,
    startFmt: fmt(start),
    endFmt: fmt(end),
    dayName: day
  };
}

async function exportClassFundWeeklyCSV() {
  const cf = db.classFund;
  if (!cf.startDate || !cf.weeklyDue) {
    return eveAlert("Please set the weekly due amount and start date first.");
  }

  const totalWeeks = getExpectedWeeks(cf.startDate);
  if (totalWeeks === 0) return eveAlert("No collection weeks to export yet.");

  let csv = "";

  for (let w = 0; w < totalWeeks; w++) {
    const range = getWeekRangeLabel(cf.startDate, w);
    csv += `${w ? "\r\n" : ""}${range.label}\r\n`;
    csv += `Name,Date / Day,Payment Status\r\n`;

    const students = Object.keys(cf.records).sort();
    for (const name of students) {
      const rec = cf.records[name];
      const breakdown = getWeeklyBreakdown(rec.history || [], cf.weeklyDue);
      const weekInfo = breakdown[w] || { amount: 0, date: null, status: "unpaid" };

      let dateStr = "-";
      if (weekInfo.date) {
        const d = new Date(weekInfo.date + "T00:00:00");
        dateStr = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${d.toLocaleDateString('en-US', { weekday: 'long' })})`;
      }

      let statusStr = "Not Paid";
      if (weekInfo.status === "full") {
        statusStr = "Fully Paid";
      } else if (weekInfo.status === "partial") {
        const short = round2(cf.weeklyDue - weekInfo.amount);
        statusStr = `Short by ${peso(short)}`;
      }

      csv += `"${name.replace(/"/g, '""')}","${dateStr.replace(/"/g, '""')}","${statusStr.replace(/"/g, '""')}"\r\n`;
    }
  }

  // Optional trailing summary sheet
  csv += `\r\nSUMMARY\r\nName,Total Paid,Total Expected,Overall Status\r\n`;
  for (const name of Object.keys(cf.records).sort()) {
    const rec = cf.records[name];
    const expected = getClassFundExpected(name);
    const paid = rec.paid || 0;
    const balance = round2(expected - paid);
    let status = "Fully Paid";
    if (balance > 0) status = `Short by ${peso(balance)}`;
    else if (balance < 0) status = `Overpaid by ${peso(Math.abs(balance))}`;
    csv += `"${name.replace(/"/g, '""')}",${paid.toFixed(2)},${expected.toFixed(2)},"${status.replace(/"/g, '""')}"\r\n`;
  }

  const fileName = `class-fund-weekly-${new Date().toISOString().slice(0, 10)}.csv`;
  await exportFileCrossPlatform(csv, fileName, "text/csv", "Export Weekly Class Fund");
}

     function renderClassFund() {
    const box = document.getElementById("classfund-list");
    const summary = document.getElementById("classfund-summary");
   const alertBox = document.getElementById("cf-missed-alert");
    const weekInfo = document.getElementById("cf-week-info");
    const txnBox = document.getElementById("cf-txn-log");
    if (!box || !summary) return;

    // Remember expanded cards
    const expandedIds = new Set();
    document.querySelectorAll('.cf-student-card.expanded').forEach(el => expandedIds.add(el.id));

    const cf = db.classFund;
    const weekly = cf.weeklyDue || 0;

    // Sync settings inputs
    const wInput = document.getElementById("cf-weekly-due");
    const sInput = document.getElementById("cf-start-date");
    if (wInput && (!wInput.value || wInput.value == "0")) wInput.value = weekly > 0 ? weekly : "";
    if (sInput && !sInput.value && cf.startDate) sInput.value = cf.startDate;

    const currentWeek = getExpectedWeeks(cf.startDate);
    if (weekInfo) {
      weekInfo.innerText = cf.startDate
        ? `Current Collection Week: Week ${currentWeek} • Weekly Due: ${peso(weekly)}`
        : "Set your weekly due and start date above to begin tracking.";
      weekInfo.style.color = cf.startDate ? "var(--accent)" : "var(--muted)";
    }

    // Totals (Total Collected / Expected / Missed / Enrolled) are computed
    // from ALL enrolled students, independent of the search box below —
    // otherwise typing a search term would silently change the summary cards.
    const allStudents = Object.keys(cf.records).sort();
    let totalExpected = 0, totalPaid = 0, missedCount = 0;
    allStudents.forEach(name => {
      totalExpected += getClassFundExpected(name);
      totalPaid += cf.records[name].paid;
      missedCount += getMissedWeeks(name);
    });
    const totalUnpaid = round2(totalExpected - totalPaid);

    let students = allStudents;
    const searchInput = document.getElementById("cf-search");
    const searchTerm = searchInput ? (searchInput.value || "").toLowerCase() : "";
    if (searchTerm) students = students.filter(n => n.toLowerCase().includes(searchTerm));

    // Expenses from class fund transactions
    const totalExpenses = round2((cf.transactions || [])
      .filter(t => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0));
    const netBalance = round2(totalPaid - totalExpenses);

    // Summary cards: Collected | Expenses | Net Balance | Enrolled
    summary.innerHTML = `
      <div class="summary-card"><h4>Total Collected</h4><p style="color:var(--success)">${peso(totalPaid)}</p></div>
      <div class="summary-card"><h4>Total Expenses</h4><p style="color:var(--danger)">${peso(totalExpenses)}</p></div>
      <div class="summary-card"><h4>Net Balance</h4><p style="color:${netBalance < 0 ? 'var(--danger)' : 'var(--accent-dark)'}">${peso(netBalance)}</p></div>
      <div class="summary-card"><h4>Enrolled</h4><p>${allStudents.length}</p></div>
    `;

    if (missedCount > 0 && totalUnpaid > 0) {
      alertBox.innerHTML = `
        <div class="missed-box">
          <h4>⚠ Collection Alert</h4>
          <p>${missedCount} total missed week(s) across all students</p>
          <span class="note">Unpaid student balance: ${peso(totalUnpaid)}</span>
        </div>
      `;
    } else {
      alertBox.innerHTML = "";
    }

    const countEl = document.getElementById("cf-count");
    if (countEl) countEl.innerText = `${students.length} student(s) shown • ${allStudents.length} enrolled in Class Fund`;

    // --- Student Cards (collapsed by default) ---
    if (students.length === 0) {
      box.innerHTML = `<p class="note">No students enrolled yet. Tap <b>+ Add All Students</b> above, or make sure students exist in the <b>Students</b> tab.</p>`;
    } else {
      box.innerHTML = students.map(name => {
        const rec = cf.records[name];
        const expected = getClassFundExpected(name);
        const missed = getMissedWeeks(name);
        const balance = round2(expected - rec.paid);
        const lastPay = getLastPaymentDate(name);
        const isActiveStudent = db.students.some(s => s.name === name);
        const safeId = name.replace(/\s+/g, '-');
        const isExpanded = expandedIds.has(`cf-card-${safeId}`);

        let statusBadge = "";
        if (missed > 2) statusBadge = `<span class="cf-badge cf-badge-danger">${missed} weeks missed</span>`;
        else if (missed > 0) statusBadge = `<span class="cf-badge cf-badge-warn">${missed} week${missed > 1 ? 's' : ''} missed</span>`;
        else if (balance < 0) statusBadge = `<span class="cf-badge cf-badge-info">Overpaid</span>`;
        else statusBadge = `<span class="cf-badge cf-badge-success">All Paid</span>`;

        const lastPayText = lastPay ? `Last paid: ${formatDisplayDate(lastPay)}` : "Never paid";
        const progressPct = expected > 0 ? Math.min(100, (rec.paid / expected) * 100) : 0;
        const progressColor = balance > 0
          ? 'linear-gradient(90deg, var(--warning), var(--danger))'
          : 'linear-gradient(90deg, var(--success), var(--accent))';

        return `
          <div class="cf-student-card ${isExpanded ? 'expanded' : ''}" id="cf-card-${safeId}" onclick="toggleClassFundDetail('${safeId}')">
            <div class="cf-student-header">
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:4px;">
                  <b>${esc(name)}</b>
                  ${!isActiveStudent ? '<span class="cf-badge cf-badge-info">Not in DB</span>' : ''}
                  ${statusBadge}
                </div>
                <div class="note">${lastPayText}</div>
              </div>
              <div style="display:flex; align-items:center; margin-left:auto;">
                <div style="text-align:right; flex-shrink:0; margin-left:12px;">
                  <div style="font-family:'IBM Plex Mono',monospace; font-weight:600; font-size:18px; color:${balance > 0 ? 'var(--danger)' : 'var(--success)'}">${peso(rec.paid)}</div>
                  <div class="note">of ${peso(expected)}</div>
                  ${balance > 0 ? `<div style="color:var(--danger); font-size:12px; font-weight:600;">-${peso(balance)}</div>` : ''}
                </div>
                <div class="cf-chevron">▼</div>
              </div>
            </div>

            <div class="cf-details" id="cf-details-${safeId}" onclick="event.stopPropagation()">
              
              <div class="progress-bar">
                <div class="progress-fill" style="width:${progressPct}%; background: ${progressColor};"></div>
              </div>
              <div class="cf-payment-row" style="flex-wrap:wrap;">
  <input type="date" id="cf-date-${safeId}" value="${new Date().toISOString().slice(0, 10)}" style="flex:1 1 110px; margin-bottom:0;">
  <input type="number" id="cf-pay-${safeId}" placeholder="Amount" step="0.01" style="flex:1 1 110px; margin-bottom:0;">
  <input type="text" id="cf-note-${safeId}" placeholder="Note (optional)" style="flex:2 1 150px; margin-bottom:0;">
  <button onclick="recordClassFundPayment('${esc(name)}')" style="width:auto; padding:0 18px; white-space:nowrap; flex:0 0 auto;">Record</button>
</div>
                              ${rec.history.length > 0 ? `
                <div class="cf-history">
                  <p class="note" style="margin-bottom:8px;"><b>Payment History</b></p>
                                   ${rec.history.slice().reverse().map((h, hIdx) => {
                    const realIdx = rec.history.length - 1 - hIdx;
                    return `
                      <div class="history-entry">
                        <span>${peso(h.amount)} on ${esc(formatDisplayDate(h.date))}${h.note ? ' • ' + esc(h.note) : ''}</span>
                        <div class="history-actions">
                          <button class="mini-btn" onclick="editClassFundPayment('${esc(name)}', ${realIdx})">EDIT</button>
                          <button class="mini-btn mini-delete" onclick="deleteClassFundPayment('${esc(name)}', ${realIdx})">DEL</button>
                        </div>
                      </div>
                    `;
                  }).join("")}  
                </div>
              ` : ''}
              <button class="del-btn" onclick="deleteClassFundStudent('${esc(name)}')" style="margin-top:10px; width:100%;">Remove from Class Fund</button>
            </div>
          </div>
        `;
      }).join("");
    }

    // --- Class Fund Ledger (running balance, every row tap-to-edit full screen) ---
    if (txnBox) {
      // Build income entries from student histories
      const incomeEntries = [];
      Object.entries(cf.records).forEach(([name, rec]) => {
        rec.history.forEach((h, idx) => {
          incomeEntries.push({
            sortKey: `${h.date || "0000-00-00"}-INC-${String(idx).padStart(4, '0')}-${name}`,
            type: "income",
            date: h.date,
            description: `Payment from ${name}`,
            amount: h.amount,
            note: h.note || "",
            student: name,
            histIdx: idx,
            deletable: false
          });
        });
      });

      // Expense entries
      const expenseEntries = (cf.transactions || [])
        .filter(t => t.type === "expense")
        .map(t => ({
          sortKey: `${t.date || "0000-00-00"}-EXP-${t.id}`,
          ...t,
          deletable: true
        }));

      const allTxns = [...incomeEntries, ...expenseEntries].sort((a, b) =>
        a.sortKey.localeCompare(b.sortKey)
      );

      // Compute running balance chronologically, then reverse for display
      let running = 0;
      const withBal = allTxns.map(t => {
        running = round2(running + (t.type === "income" ? t.amount : -t.amount));
        return { ...t, balance: running };
      }).reverse();

      if (withBal.length === 0) {
        txnBox.innerHTML = `<p class="note">No transactions yet. Record student payments or expenses above.</p>`;
      } else {
        txnBox.innerHTML = withBal.map(t => {
          const sign = t.type === "income" ? "+" : "−";
          const color = t.type === "income" ? "var(--success)" : "var(--danger)";
          const typeLabel = `<span style="font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:var(--muted); margin-left:6px;">${t.type}</span>`;
          const clickAttrs = t.type === "income"
            ? `data-cf-type="income" data-cf-student="${esc(t.student)}" data-cf-histidx="${t.histIdx}"`
            : `data-cf-type="expense" data-cf-id="${esc(t.id)}"`;

          return `
            <div class="item-row" ${clickAttrs}>
              <div>
                <b>${esc(t.description)}</b>${typeLabel}<br>
                <span class="note">${esc(t.date)}${t.note ? ' • ' + esc(t.note) : ''}</span>
              </div>
              <div style="text-align:right;">
                <span style="color:${color}; font-weight:900;">${sign}${peso(t.amount)}</span><br>
                <span class="note">Bal: ${peso(t.balance)}</span>
              </div>
            </div>
          `;
        }).join("");

        txnBox.querySelectorAll('[data-cf-type]').forEach(el => {
          el.addEventListener('click', () => {
            if (el.dataset.cfType === 'income') {
              openCfLedgerEdit('income', el.dataset.cfStudent, parseInt(el.dataset.cfHistidx, 10));
            } else {
              openCfLedgerEdit('expense', el.dataset.cfId);
            }
          });
        });
      }
    }

    // Default expense date to today
    const expDateInput = document.getElementById("cf-expense-date");
    if (expDateInput && !expDateInput.value) {
      expDateInput.value = new Date().toISOString().slice(0, 10);
    }

    syncCfStudentsOverlay();
    syncCfLedgerOverlay();
  }

function openCfStudentsOverlay() {
  const overlay = document.getElementById("cf-students-overlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  renderCfOverlayList();
}

function closeCfStudentsOverlay() {
  document.getElementById("cf-students-overlay")?.classList.add("hidden");
}

function renderCfOverlayList() {
  renderClassFund();
  syncCfStudentsOverlay();
}

function syncCfStudentsOverlay() {
  const overlay = document.getElementById("cf-students-overlay");
  const source = document.getElementById("classfund-list");
  const target = document.getElementById("cf-overlay-list");
  if (!overlay || overlay.classList.contains("hidden") || !source || !target) return;
  target.innerHTML = source.innerHTML;
}

function openCfLedgerOverlay() {
  const overlay = document.getElementById("cf-ledger-overlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  renderCfLedgerOverlay();
}

function closeCfLedgerOverlay() {
  document.getElementById("cf-ledger-overlay")?.classList.add("hidden");
}

function renderCfLedgerOverlay() {
  renderClassFund();
  syncCfLedgerOverlay();
}

function syncCfLedgerOverlay() {
  const overlay = document.getElementById("cf-ledger-overlay");
  const source = document.getElementById("cf-txn-log");
  const target = document.getElementById("cf-ledger-overlay-list");
  if (!overlay || overlay.classList.contains("hidden") || !source || !target) return;
  const filter = document.getElementById("cf-ledger-filter")?.value || "all";
  const rows = [...source.children].filter(row => filter === "all" || row.dataset.cfType === filter);
  target.innerHTML = rows.length ? rows.map(row => row.outerHTML).join("") : `<p class="note">No ${filter === "all" ? "" : filter + " "}transactions yet.</p>`;
  target.querySelectorAll('[data-cf-type]').forEach(row => {
    row.addEventListener("click", () => {
      if (row.dataset.cfType === "income") openCfLedgerEdit("income", row.dataset.cfStudent, parseInt(row.dataset.cfHistidx, 10));
      else openCfLedgerEdit("expense", row.dataset.cfId);
    });
  });
}

  function toggleClassFundDetail(safeId) {
  const card = document.getElementById(`cf-card-${safeId}`);
  if (card) card.classList.toggle('expanded');
}

  function deleteStudent(name) {
  const label = lbl("year level").toLowerCase();
  if (!confirm(`Remove "${name}" from the database? They will also be removed from all collections.`)) return;
  Object.keys(db.categories).forEach(cat => {
    db.categories[cat].records = db.categories[cat].records.filter(r => r.name !== name);
  });
  db.students = db.students.filter(s => s.name !== name);
  saveData();
  renderStudents();
  renderSummary();
}

  function renderStudents() {
    const list = document.getElementById("student-db-list");
    const searchTerm = (document.getElementById("search-students-db").value || "").toLowerCase();
    const matches = [...db.students]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter(s => s.name.toLowerCase().includes(searchTerm));

      const countLabel = db.students.length === 1
    ? `1 ${lbl("year level").toLowerCase()} in the database`
    : `${db.students.length} ${lbl("year levels").toLowerCase()} in the database`;
  document.getElementById("student-count").innerText = countLabel;

  // ... inside the if (matches.length === 0) block:
  if (matches.length === 0) {
    list.innerHTML = `<p class="note">${db.students.length === 0 ? 'No ' + lbl("year level").toLowerCase() + ' added yet.' : 'No matching ' + lbl("year level").toLowerCase() + '.'}</p>`;
    return;
  }

    list.innerHTML = matches.map(s => {
      const countLabel = (isOrg() && typeof s.studentCount === "number")
        ? ` <span class="note" style="font-weight:600;">(${s.studentCount} student${s.studentCount === 1 ? '' : 's'})</span>`
        : "";
      return `
      <div class="card" data-student-name="${esc(s.name)}">
        <span>${esc(s.name)}${countLabel}</span>
        <button class="del-btn" data-action="delete-student" data-name="${esc(s.name)}">X</button>
      </div>`;
    }).join("");

    // Attach event listeners instead of inline onclick
    list.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="delete-student"]')) return;
        showStudentProfile(card.dataset.studentName);
      });
    });
    list.querySelectorAll('[data-action="delete-student"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteStudent(btn.dataset.name);
      });
    });
  }

  // ================= STUDENT PROFILE (BALANCE ACROSS ALL COLLECTIONS) =================
  function showStudentProfile(name) {
    const student = db.students.find(s => s.name === name);
      if (!student) {
    eveAlert(lbl("Year Level") + " not found. They may have been deleted.", true);
    return;
  }

    document.getElementById("student-list-view").classList.add("hidden");
    document.getElementById("student-profile-view").classList.remove("hidden");
    document.getElementById("profile-student-name").innerText = esc(name);

    const countEditor = document.getElementById("profile-count-editor");
    if (countEditor) {
      countEditor.classList.toggle("hidden", !isOrg());
      const countInput = document.getElementById("profile-student-count");
      if (countInput) countInput.value = (typeof student.studentCount === "number") ? student.studentCount : "";
    }

    renderStudentProfile(name);
  }

  function saveStudentCount() {
    const nameEl = document.getElementById("profile-student-name");
    const name = nameEl ? nameEl.innerText : "";
    const student = db.students.find(s => s.name === name);
    if (!student) return;

    const countInput = document.getElementById("profile-student-count");
    const val = countInput ? countInput.value.trim() : "";

    if (val === "") {
      delete student.studentCount;
    } else {
      student.studentCount = Math.max(0, Math.round(parseFloat(val) || 0));
    }

    saveData();
    renderStudents();
    eveAlert("Student count saved.");
  }

  function backToStudentList() {
    document.getElementById("student-profile-view").classList.add("hidden");
    document.getElementById("student-list-view").classList.remove("hidden");
  }

  function renderStudentProfile(name) {
    const cats = Object.keys(db.categories).sort((a, b) => a.localeCompare(b));
    let totalDue = 0, totalPaid = 0;

    const rows = cats.map(cat => {
      const c = db.categories[cat];
      const rec = c.records.find(r => r.name === name);
      if (!rec) return "";
      totalDue += rec.due;
      totalPaid += rec.paid;
      const balance = round2(rec.due - rec.paid);

      let statusLabel, statusColor;
      if (balance < 0) { statusLabel = "OVERPAID"; statusColor = "#3B6E8F"; }
      else if (balance === 0) { statusLabel = "PAID"; statusColor = "#2F7D53"; }
      else if (rec.paid > 0) { statusLabel = "PARTIAL"; statusColor = "#B8872F"; }
      else { statusLabel = "UNPAID"; statusColor = "#B3423B"; }

      return `
        <div class="breakdown-card">
          <div class="breakdown-top"><b>${esc(cat)}</b><span style="color:${statusColor};">${peso(rec.paid)} / ${peso(rec.due)} — ${statusLabel}</span></div>
        </div>`;
    }).filter(Boolean).join("");

    const overallBalance = round2(totalDue - totalPaid);

    document.getElementById("profile-summary").innerHTML = `
      <div class="summary-card"><h4>Total Due</h4><p>${peso(totalDue)}</p></div>
      <div class="summary-card"><h4>Total Paid</h4><p>${peso(totalPaid)}</p></div>
      <div class="summary-card" style="grid-column: span 2;"><h4>Overall Balance</h4><p style="color:${overallBalance > 0 ? '#B3423B' : '#2F7D53'}">${peso(overallBalance)}</p></div>
    `;

     document.getElementById("profile-breakdown").innerHTML = rows || `<p class="note">This ${lbl("year level").toLowerCase()} isn't part of any collection yet.</p>`;
  }

  // ================= CATEGORY (COLLECTION) PICKER — used in ADD tab =================
  function addCategory() {
    const catInput = document.getElementById("new-category");
    const dueInput = document.getElementById("new-category-due");
    const cat = catInput.value.trim();
    const due = round2(parseFloat(dueInput.value) || 0);

    if (!cat) return eveAlert("Please enter a collection name (e.g. Newsette Fee)", true);
    if (findCategoryKeyCI(cat)) return eveAlert("This collection already exists (names are not case-sensitive).", true);
    if (due <= 0) return eveAlert("Please enter the default amount due per student", true);

    db.categories[cat] = { amountDue: due, records: [] };
    catInput.value = "";
    dueInput.value = "";
    saveData();
    eveAlert("Collection Added!");
  }

function renameCategory() {
  document.getElementById("rename-old-name").innerText = currentCategory;
  document.getElementById("rename-input").value = currentCategory;
  document.getElementById("rename-error").innerText = "";
  document.getElementById("rename-modal").classList.remove("hidden");
  document.getElementById("rename-input").focus();
}

function closeRenameModal() {
  document.getElementById("rename-modal").classList.add("hidden");
}

function confirmRenameCategory() {
  const newNameRaw = document.getElementById("rename-input").value;
  const errorEl = document.getElementById("rename-error");
  const newName = newNameRaw.trim();

  if (!newName) { errorEl.innerText = "Name cannot be empty."; return; }
  if (newName === currentCategory) { closeRenameModal(); return; }

  if (newName.toLowerCase() !== currentCategory.toLowerCase() && findCategoryKeyCI(newName)) {
    errorEl.innerText = "A collection with that name already exists.";
    return;
  }

  db.categories[newName] = db.categories[currentCategory];
  delete db.categories[currentCategory];
  currentCategory = newName;
  saveData();
  document.getElementById("item-view-title").innerText = newName.toUpperCase();
  renderItemList();
  closeRenameModal();
}

function filterCategories() {
    const inputEl = document.getElementById("category-search");
    const input = inputEl.value.toLowerCase();

    // If the visible text no longer exactly matches the currently selected
    // collection, clear the hidden selection so a payment can never be
    // recorded against a stale/deleted selection.
    const selectedVal = document.getElementById("category-select").value;
    if (selectedVal && inputEl.value !== selectedVal) {
      document.getElementById("category-select").value = "";
    }

    const dropdown = document.getElementById("category-list-dropdown");
    const cats = Object.keys(db.categories).filter(c => c.toLowerCase().includes(input));
    dropdown.innerHTML = "";

    if (Object.keys(db.categories).length === 0) {
      dropdown.innerHTML = `<div style="color:#6E7A72; cursor:default;">No collections yet — add one above first.</div>`;
    } else if (cats.length === 0) {
      dropdown.innerHTML = `<div style="color:#6E7A72; cursor:default;">No collection found</div>`;
    } else {
      cats.forEach(c => {
        dropdown.innerHTML += `<div data-cat="${esc(c)}">${esc(c)} <span class="note">(Due: ${peso(db.categories[c].amountDue)})</span></div>`;
      });
      dropdown.querySelectorAll('div[data-cat]').forEach(div => {
        div.addEventListener('click', () => selectCategory(div.dataset.cat));
      });
    }
    dropdown.classList.add("show");
  }

  function selectCategory(cat) {
    document.getElementById("category-search").value = cat;
    document.getElementById("category-select").value = cat;
    document.getElementById("category-list-dropdown").classList.remove("show");
  }

  // ================= STUDENT PICKER — used in ADD tab =================
  function filterStudentPicker() {
    const input = document.getElementById("student-search").value.toLowerCase();
    const dropdown = document.getElementById("student-list-dropdown");
    const matches = db.students.filter(s => s.name.toLowerCase().includes(input));
    dropdown.innerHTML = "";

    if (db.students.length === 0) {
      dropdown.innerHTML = `<div style="color:#6E7A72; cursor:default;">No students yet — add them in the Students tab first.</div>`;
    } else if (matches.length === 0) {
      dropdown.innerHTML = `<div style="color:#6E7A72; cursor:default;">No match found</div>`;
    } else {
      matches.forEach(s => {
        dropdown.innerHTML += `<div data-student="${esc(s.name)}">${esc(s.name)}</div>`;
      });
      dropdown.querySelectorAll('div[data-student]').forEach(div => {
        div.addEventListener('click', () => selectStudent(div.dataset.student));
      });
    }
    dropdown.classList.add("show");
  }

  function selectStudent(name) {
    document.getElementById("student-search").value = name;
    document.getElementById("student-select").value = name;
    document.getElementById("student-list-dropdown").classList.remove("show");
  }

  // ================= PROJECT PICKER — used in Cashbook tab =================
  function filterProjectPicker() {
    const input = document.getElementById("txn-project-search").value.toLowerCase();
    const dropdown = document.getElementById("txn-project-dropdown");
    const matches = db.projects.filter(p => p.name.toLowerCase().includes(input));
    dropdown.innerHTML = "";

    dropdown.innerHTML += `<div data-project-id="" data-project-name="">— No Project (General Fund) —</div>`;
    if (db.projects.length === 0) {
      dropdown.innerHTML += `<div style="color:#6E7A72; cursor:default;">No projects yet — add one from "Projects &amp; Events".</div>`;
    } else {
      matches.forEach(p => {
        dropdown.innerHTML += `<div data-project-id="${esc(p.id)}" data-project-name="${esc(p.name)}">${esc(p.name)}</div>`;
      });
    }
    dropdown.querySelectorAll('div[data-project-id]').forEach(div => {
      div.addEventListener('click', () => selectProjectForTxn(div.dataset.projectId, div.dataset.projectName));
    });
    dropdown.classList.add("show");
  }

  function selectProjectForTxn(id, name) {
    document.getElementById("txn-project-search").value = id ? name : "";
    document.getElementById("txn-project-select").value = id || "";
    document.getElementById("txn-project-dropdown").classList.remove("show");
  }

  window.onclick = function (event) {
    if (!event.target.closest('#category-search')) {
      document.getElementById("category-list-dropdown").classList.remove("show");
    }
    if (!event.target.closest('#student-search')) {
      document.getElementById("student-list-dropdown").classList.remove("show");
    }
    if (!event.target.closest('#txn-project-search')) {
      const d = document.getElementById("txn-project-dropdown");
      if (d) d.classList.remove("show");
    }
  };

  // ================= RECORD A PAYMENT =================
 function recordPayment() {
  
  
    const cat = document.getElementById("category-select").value;
    const student = document.getElementById("student-select").value;
    const amountPaying = round2(parseFloat(document.getElementById("amount-paying").value) || 0);
    const note = document.getElementById("payment-note").value.trim();

    if (!cat || !db.categories[cat]) return eveAlert("Please pick a valid collection from the list", true);
    if (!student || !db.students.some(s => s.name === student)) return eveAlert("Please pick a valid student from the database", true);
    if (amountPaying <= 0) return eveAlert("Please enter a positive amount", true);

    const catObj = db.categories[cat];
    let record = catObj.records.find(r => r.name === student);

    if (!record) {
      record = { name: student, due: catObj.amountDue, paid: 0, history: [] };
      catObj.records.push(record);
    }

    record.paid = round2(record.paid + amountPaying);
      const payDate = document.getElementById("payment-date").value || new Date().toISOString().slice(0, 10);
    record.history.push({ amount: amountPaying, date: payDate, note: note || "" });

    if (isOrg()) {
    db.cashbook.transactions.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      type: "income",
      date: payDate,
      orNumber: "",
      category: "Year Levels Payment",
      description: `Payment from ${student} — ${cat}`,
      amount: amountPaying,
      projectId: null,
      notes: note || ""
    });
  }
    saveData();
    generateStatement();

    document.getElementById("payment-note").value = "";
      eveAlert(`Payment of ${peso(amountPaying)} from ${esc(student)} recorded!`);
  document.getElementById("payment-note").value = "";

      document.getElementById("payment-date").value = new Date().toISOString().slice(0, 10);
  }
  // ================= RECORDS TAB (BROWSE COLLECTIONS) =================
  function renderCategories() {
    const list = document.getElementById("category-list");
    const alphaIndex = document.getElementById("alpha-index");
    list.innerHTML = "";
    alphaIndex.innerHTML = "";

    const categories = Object.keys(db.categories).sort((a, b) => a.localeCompare(b));
    if (categories.length === 0) {
      list.innerHTML = `<p class="note">No collections yet. Add one in the ADD tab.</p>`;
      return;
    }

    const grouped = {};
    categories.forEach(cat => {
      const letter = cat[0].toUpperCase();
      (grouped[letter] = grouped[letter] || []).push(cat);
    });

    Object.keys(grouped).sort().forEach(letter => {
      list.innerHTML += `<div class="alpha-group" id="group-${letter}"><div class="alpha-header">${letter}</div>`;
      grouped[letter].forEach(cat => {
        const c = db.categories[cat];
        const totalDue = c.records.reduce((s, r) => s + r.due, 0);
        const totalPaid = c.records.reduce((s, r) => s + r.paid, 0);
        const tOutAll = (db.transfers||[]).filter(t => t.from === cat).reduce((s,t)=>s+t.amount,0);
const tInAll  = (db.transfers||[]).filter(t => t.to   === cat).reduce((s,t)=>s+t.amount,0);
const netAll  = round2(totalPaid + tInAll - tOutAll);

list.innerHTML += `
          <div class="card" data-cat="${esc(cat)}">
            <span>${esc(cat)} (${c.records.length} ${lbl("Year Level")})<br>
            <span class="note">Collected ${peso(totalPaid)} / ${peso(totalDue)}${(tInAll||tOutAll)?` • Net: ${peso(netAll)}`:''}</span></span>
            <button class="del-btn" data-action="delete-cat" data-cat="${esc(cat)}">X</button>
          </div>`;
      });
      list.innerHTML += `</div>`;
      alphaIndex.innerHTML += `<div data-letter="${letter}">${letter}</div>`;
    });

    // Attach event listeners
    list.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="delete-cat"]')) return;
        showItems(card.dataset.cat);
      });
    });
    list.querySelectorAll('[data-action="delete-cat"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCat(btn.dataset.cat);
      });
    });
    alphaIndex.querySelectorAll('div[data-letter]').forEach(div => {
      div.addEventListener('click', () => scrollToLetter(div.dataset.letter));
    });
  }

  function scrollToLetter(letter) {
    const element = document.getElementById(`group-${letter}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelectorAll('.alpha-index div').forEach(el => el.classList.remove('active'));
      const clicked = document.querySelector(`.alpha-index div[data-letter="${letter}"]`);
      if (clicked) clicked.classList.add('active');
    }
  }

  function deleteCat(cat) {
    if (confirm(`Delete collection "${cat}" and ALL its payment records? This cannot be undone.`)) {
      delete db.categories[cat];
      saveData();
      renderCategories();
    }
  }

  // ---------- ITEM (STUDENT RECORD) VIEW ----------
  function showItems(cat) {
    currentCategory = cat;
    editingIndex = null;
    paidFilter = "all";
    document.getElementById("category-view").classList.add("hidden");
    document.getElementById("item-view").classList.remove("hidden");
    document.getElementById("item-view-title").innerText = cat.toUpperCase();
    document.getElementById("item-search").value = "";
    renderItemList();
  }

  function backToCategories() {
    editingIndex = null;
    document.getElementById("item-view").classList.add("hidden");
    document.getElementById("category-view").classList.remove("hidden");
    renderCategories();
  }

  function addAllStudents() {
    const catObj = db.categories[currentCategory];
    const existingNames = new Set(catObj.records.map(r => r.name));
    const available = db.students.filter(s => !existingNames.has(s.name));

      if (available.length === 0) return eveAlert("All " + lbl("year levels").toLowerCase() + " are already in this collection.");

    document.getElementById("add-all-cat-name").innerText = currentCategory;
    addAllSelected.clear();
    document.getElementById("add-all-search").value = "";
    document.getElementById("add-all-status").innerText = "";
    renderAddAllList();
    document.getElementById("add-all-modal").classList.remove("hidden");
  }

  function closeAddAllModal() {
    document.getElementById("add-all-modal").classList.add("hidden");
    addAllSelected.clear();
  }

  function selectAllAddAll() {
  const search = (document.getElementById("add-all-search").value || "").toLowerCase();
  const catObj = db.categories[currentCategory];
  const existingNames = new Set(catObj.records.map(r => r.name));
  const visible = db.students
    .filter(s => !existingNames.has(s.name) && s.name.toLowerCase().includes(search));

  visible.forEach(s => addAllSelected.add(s.name));
  renderAddAllList();
}

function deselectAllAddAll() {
  addAllSelected.clear();
  renderAddAllList();
}

  function renderAddAllList() {
    const search = (document.getElementById("add-all-search").value || "").toLowerCase();
    const catObj = db.categories[currentCategory];
    const existingNames = new Set(catObj.records.map(r => r.name));
    const available = db.students
      .filter(s => !existingNames.has(s.name) && s.name.toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name));

    const box = document.getElementById("add-all-list");

       if (available.length === 0) {
      box.innerHTML = `<p class="note">${db.students.length === 0 ? 'No ' + lbl("year levels").toLowerCase() + ' in the database yet.' : 'No remaining ' + lbl("year levels").toLowerCase() + ' match your search.'}</p>`;
      return;
    }

    box.innerHTML = available.map(s => `
      <div class="add-all-item ${addAllSelected.has(s.name) ? 'selected' : ''}" data-name="${esc(s.name)}">
        <span style="font-weight:500;">${esc(s.name)}</span>
        <div class="check-indicator">${addAllSelected.has(s.name) ? '✓' : ''}</div>
      </div>
    `).join("");

    box.querySelectorAll('.add-all-item').forEach(el => {
      el.addEventListener('click', () => toggleAddAllCheckbox(el.dataset.name));
    });

    const statusEl = document.getElementById("add-all-status");
    if (addAllSelected.size > 0) {
      statusEl.innerText = `${addAllSelected.size} selected`;
      statusEl.style.color = "var(--success)";
    } else {
      statusEl.innerText = "Tap an item to select it";
      statusEl.style.color = "var(--muted)";
    }
  }

  function toggleAddAllCheckbox(name) {
    if (addAllSelected.has(name)) {
      addAllSelected.delete(name);
    } else {
      addAllSelected.add(name);
    }
    renderAddAllList();
  }

  function confirmAddAll() {
    const catObj = db.categories[currentCategory];
    if (addAllSelected.size === 0) return eveAlert("Please select at least one year level.", true);

      if (!confirm(`Add ${addAllSelected.size} ${lbl("year level").toLowerCase()}(s) to "${currentCategory}" with default due of ${peso(catObj.amountDue)}?`)) return;
    addAllSelected.forEach(name => {
      catObj.records.push({ name, due: catObj.amountDue, paid: 0, history: [] });
    });

    saveData();
    closeAddAllModal();
    renderItemList();
  }

  function openQuickPayModal() {
  const catObj = db.categories[currentCategory];
  if (!catObj || catObj.records.length === 0) {
    return eveAlert(`No ${lbl("year levels").toLowerCase()} in this collection yet. Add some first (or use "${lbl("Add All Year Level")}").`, true);
  }

  document.getElementById("quick-pay-noun").innerText = lbl("year levels").toLowerCase();
  document.getElementById("quick-pay-cat-label").innerText = currentCategory;
  document.getElementById("quick-pay-modal-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("quick-pay-modal-amount").value = "";
  document.getElementById("quick-pay-modal-note").value = "";
  document.getElementById("quick-pay-search").value = "";
  document.getElementById("quick-pay-status").innerText = "";
  quickPaySelected.clear();
  renderQuickPayList();
  document.getElementById("quick-pay-modal").classList.remove("hidden");
}

function closeQuickPayModal() {
  document.getElementById("quick-pay-modal").classList.add("hidden");
  quickPaySelected.clear();
}

function selectAllQuickPay() {
  const search = (document.getElementById("quick-pay-search").value || "").toLowerCase();
  const catObj = db.categories[currentCategory];
  if (!catObj) return;
  catObj.records
    .filter(r => r.name.toLowerCase().includes(search))
    .forEach(r => quickPaySelected.add(r.name));
  renderQuickPayList();
}

function deselectAllQuickPay() {
  quickPaySelected.clear();
  renderQuickPayList();
}

function renderQuickPayList() {
  const search = (document.getElementById("quick-pay-search").value || "").toLowerCase();
  const catObj = db.categories[currentCategory];
  const box = document.getElementById("quick-pay-list");
  if (!catObj || !box) return;

  const matches = catObj.records
    .filter(r => r.name.toLowerCase().includes(search))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (matches.length === 0) {
    box.innerHTML = `<p class="note">No matching ${lbl("year level").toLowerCase()}.</p>`;
    return;
  }

  box.innerHTML = matches.map(r => {
    const balance = round2(r.due - r.paid);
    return `
      <div class="add-all-item ${quickPaySelected.has(r.name) ? 'selected' : ''}" data-name="${esc(r.name)}">
        <span style="font-weight:500;">${esc(r.name)}<br><span class="note">Balance: ${peso(balance)}</span></span>
        <div class="check-indicator">${quickPaySelected.has(r.name) ? '✓' : ''}</div>
      </div>
    `;
  }).join("");

  box.querySelectorAll('.add-all-item').forEach(el => {
    el.addEventListener('click', () => toggleQuickPayCheckbox(el.dataset.name));
  });

  const statusEl = document.getElementById("quick-pay-status");
  if (quickPaySelected.size > 0) {
    statusEl.innerText = `${quickPaySelected.size} selected`;
    statusEl.style.color = "var(--success)";
  } else {
    statusEl.innerText = `Tap a ${lbl("year level").toLowerCase()} to select it`;
    statusEl.style.color = "var(--muted)";
  }
}

function toggleQuickPayCheckbox(name) {
  if (quickPaySelected.has(name)) quickPaySelected.delete(name);
  else quickPaySelected.add(name);
  renderQuickPayList();
}

function confirmQuickPayModal() {
  const catObj = db.categories[currentCategory];
  if (!catObj) return;

  if (quickPaySelected.size === 0) {
    return eveAlert(`Please select at least one ${lbl("year level").toLowerCase()}.`, true);
  }

  const amount = round2(parseFloat(document.getElementById("quick-pay-modal-amount").value) || 0);
  if (amount <= 0) return eveAlert("Please enter a valid amount.", true);

  const dateVal = document.getElementById("quick-pay-modal-date").value || new Date().toISOString().slice(0, 10);
  const note = document.getElementById("quick-pay-modal-note").value.trim();

  if (!confirm(`Record a payment of ${peso(amount)} for ${quickPaySelected.size} ${lbl("year level").toLowerCase()}(s) in "${currentCategory}"?`)) return;

  let recorded = 0;
  quickPaySelected.forEach(name => {
    const rec = catObj.records.find(r => r.name === name);
    if (!rec) return;

    rec.paid = round2(rec.paid + amount);
    rec.history.push({ amount, date: dateVal, note: note || "Quick Pay" });
    recorded++;

    if (isOrg()) {
      db.cashbook.transactions.push({
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        type: "income",
        date: dateVal,
        orNumber: "",
        category: "Year Levels Payment",
        description: `Payment from ${name} — ${currentCategory}`,
        amount,
        projectId: null,
        notes: note || ""
      });
    }
  });

  saveData();
  closeQuickPayModal();
  renderItemList();
  eveAlert(`Recorded ${peso(amount)} payment for ${recorded} ${lbl("year level").toLowerCase()}(s).`);
}

  async function exportCategoryCSV() {
    const catObj = db.categories[currentCategory];
    if (!catObj || catObj.records.length === 0) return eveAlert("No records to export yet.");

    let csv = "Name,Due,Paid,Balance,Status\r\n";
    [...catObj.records].sort((a, b) => a.name.localeCompare(b.name)).forEach(r => {
      const balance = round2(r.due - r.paid);
      const status = balance < 0 ? "OVERPAID" : balance === 0 ? "PAID" : r.paid > 0 ? "PARTIAL" : "UNPAID";
      // Escape quotes in names for proper CSV
        const safeName = r.name.replace(/"/g, '""');
        csv += `"${safeName}",${r.due.toFixed(2)},${r.paid.toFixed(2)},${balance.toFixed(2)},${status}\r\n`;
    });

    const cleanFileName = `${currentCategory.replace(/[^a-z0-9]/gi, "_")}-report.csv`;
    await exportFileCrossPlatform(csv, cleanFileName, "text/csv", `Export ${currentCategory} Report`);
  }

  async function exportBackup() {
    const jsonStr = JSON.stringify(db, null, 2);
    const fileName = `treasurer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const success = await exportFileCrossPlatform(jsonStr, fileName, "application/json", "Export Backup");
    if (success) {
      localStorage.setItem("lastBackupTime", String(Date.now()));
      renderSummary();
    }
  }

  // Shared export helper: works both in a regular PC browser (dev/testing)
  // and inside the built Android app (via Filesystem + Share plugins).
  // Returns true if the export completed without error.
  async function exportFileCrossPlatform(content, fileName, mimeType, shareTitle) {
    if (!isAndroidApp()) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    }

    try {
      const plugins = window.Capacitor.Plugins || {};
      const { Filesystem, Share } = plugins;

      if (!Filesystem || !Share) {
        eveAlert(
          "Export needs the Filesystem and Share plugins, but they aren't installed in this build." +
  "Make sure @capacitor/filesystem and @capacitor/share are installed and synced before building the APK."
        , true);
        return false;
      }

      const writeResult = await Filesystem.writeFile({
        path: fileName,
        data: content,
        directory: "CACHE",
        encoding: "utf8"
      });

      await Share.share({
        title: shareTitle,
        url: writeResult.uri,
        dialogTitle: "Save File"
      });
      return true;
    } catch (e) {
      eveAlert("Mobile Export Error: " + e.message, true);
      return false;
    }
  }

function renderItemList() {
  const catObj = db.categories[currentCategory];
  const box = document.getElementById("item-list");
  const searchTerm = (document.getElementById("item-search").value || "").toLowerCase();

  const totalDue = catObj.records.reduce((s, r) => s + r.due, 0);
  const totalPaid = catObj.records.reduce((s, r) => s + r.paid, 0);
  const totalBalance = round2(totalDue - totalPaid);
  const paidStudents = catObj.records.filter(r => r.paid >= r.due && r.due > 0).length;
  const partialStudents = catObj.records.filter(r => r.paid > 0 && r.paid < r.due).length;
  const unpaidStudents = catObj.records.filter(r => r.paid <= 0).length;

const tOut = (db.transfers||[]).filter(t => t.from === currentCategory).reduce((s,t)=>s+t.amount,0);
const tIn  = (db.transfers||[]).filter(t => t.to   === currentCategory).reduce((s,t)=>s+t.amount,0);
const netCollected = round2(totalPaid + tIn - tOut);

document.getElementById("item-summary").innerHTML = `
    Collected <b>${peso(totalPaid)}</b> &nbsp;|&nbsp;
    Expected <b>${peso(totalDue)}</b> &nbsp;|&nbsp;
    Balance <b style="color:${totalBalance > 0 ? '#B3423B' : '#2F7D53'}">${peso(totalBalance)}</b>
  <br><span class="collection-status-line"><span class="status-paid">PAID: ${paidStudents}</span><span class="status-partial">PARTIALLY PAID: ${partialStudents}</span><span class="status-unpaid">UNPAID: ${unpaidStudents}</span></span>
    ${(tIn||tOut) ? `<br><span class="note">Net after transfers: <b>${peso(netCollected)}</b> (In ${peso(tIn)} / Out ${peso(tOut)})</span>` : ''}
  `;

if (catObj.records.length === 0) {
    box.innerHTML = `<p class="note">No ${lbl("year level").toLowerCase()} added to this collection yet. Use "${lbl("Add All Year Level")}" above, or record a payment from the ADD tab.</p>`;
  }
  /* ── TRANSFER TRANSACTION LOGS ──
     Every fund movement between collections is permanently logged here
     with date, direction (From → To), amount, and optional note.        */
  const txfers = (db.transfers||[]).filter(t => t.from === currentCategory || t.to === currentCategory).sort((a,b)=>a.date.localeCompare(b.date));
  if (txfers.length) {
   const txferHtml = txfers.map(t => {
      const isOutgoing = t.from === currentCategory;
      const directionLabel = isOutgoing ? 'Sent to' : 'Received from';
      const otherParty = isOutgoing ? t.to : t.from;
      const sign = isOutgoing ? '−' : '+';
      const color = isOutgoing ? 'var(--danger)' : 'var(--success)';
      return `
        <div class="history-entry" style="padding:10px 0; border-bottom:1px solid rgba(233,240,235,0.08);">
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-weight:600; color:#e9f0eb;">${esc(directionLabel)} <b>${esc(otherParty)}</b></span>
            <span class="note">${esc(t.date)}${t.note ? ' • ' + esc(t.note) : ''}</span>
          </div>
          <div style="display:flex; align-items:center; gap:10px; margin-left:12px;">
            <span style="color:${color}; font-weight:700; font-family:'IBM Plex Mono',monospace; white-space:nowrap;">
              ${sign}${peso(t.amount)}
            </span>
            <button class="mini-btn mini-delete" data-action="delete-transfer" data-id="${esc(t.id)}">DEL</button>
          </div>
        </div>`;
    }).join('');

    box.innerHTML += `
      <div style="margin-top:22px; background:linear-gradient(135deg, #141c18, #1a2420); border:1px solid rgba(233,240,235,0.10); border-radius:var(--radius); padding:16px 18px; box-shadow:0 2px 8px rgba(0,0,0,0.35);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; padding-bottom:10px; border-bottom:1.5px dashed rgba(233,240,235,0.10);">
          <span style="font-size:16px;">⇄</span>
          <h4 style="margin:0; padding:0; font-size:14px; color:#e9f0eb;">Transfer Transaction Logs</h4>
          <span class="note" style="margin-left:auto; font-size:11px;">${txfers.length} record(s)</span>
        </div>
        ${txferHtml}
      </div>`;
  }
  if (catObj.records.length === 0) return;

  const sorted = [...catObj.records]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(r => r.name.toLowerCase().includes(searchTerm))
    .filter(r => {
      if (paidFilter === "paid") return r.paid >= r.due && r.due > 0;
      if (paidFilter === "partial") return r.paid > 0 && r.paid < r.due;
      if (paidFilter === "unpaid") return r.paid <= 0;
      return true;
    });

  if (sorted.length === 0) {
    box.innerHTML = `<p class="note">No matching student.</p>`;
    return;
  }

  // Safety reset if the stored index is now out of bounds
  if (editingIndex !== null && (editingIndex < 0 || editingIndex >= catObj.records.length)) {
    editingIndex = null;
  }

  box.innerHTML = sorted.map(rec => {
    const idx = catObj.records.indexOf(rec);
    const balance = round2(rec.due - rec.paid);
    let statusLabel, statusColor;
    if (balance < 0) { statusLabel = "OVERPAID"; statusColor = "#3B6E8F"; }
    else if (balance === 0) { statusLabel = "PAID"; statusColor = "#2F7D53"; }
    else if (rec.paid > 0) { statusLabel = "PARTIAL"; statusColor = "#B8872F"; }
    else { statusLabel = "UNPAID"; statusColor = "#B3423B"; }

    if (isClass()) {
      return `
        <div class="item-row" data-action="edit-item" data-idx="${idx}">
          <div><b>${esc(rec.name)}</b><br><span class="note">Paid: ${peso(rec.paid)} / ${peso(rec.due)}</span></div>
          <div style="display:flex; align-items:center; gap:10px; text-align:right;">
            <span style="color:${statusColor}; font-weight:900;">${peso(balance)}<br><small class="record-status-label">${statusLabel}</small></span>
            <button class="row-x-btn" data-action="delete-item" data-idx="${idx}" title="Remove student from this collection">X</button>
          </div>
        </div>`;
    }

    if (editingIndex === idx) {
      const historyHtml = rec.history.length
        ? rec.history.map((h, hIdx) => `
            <div class="history-entry">
              <span>${peso(h.amount)} on ${esc(h.date)}${h.note ? ' • ' + esc(h.note) : ''}</span>
              <div class="history-actions">
                <button class="mini-btn" data-action="edit-hist" data-rec="${idx}" data-hist="${hIdx}">EDIT</button>
                <button class="mini-btn mini-delete" data-action="del-hist" data-rec="${idx}" data-hist="${hIdx}">DEL</button>
              </div>
            </div>`).join("")
        : `<div class="note">No payments logged yet.</div>`;

      return `
        <div class="item-row editing" id="item-${idx}">
          <b>${esc(rec.name)}</b>
          <div class="edit-note">
            💡 <b>Tip:</b> You can edit <b>Amount Due</b> and <b>Total Paid</b> directly, or use <b>Add Payment</b> to log a new installment. Deleting a history entry recalculates the total automatically.
          </div>
          
          <input type="number" id="edit-due-${idx}" value="${rec.due}" step="0.01" placeholder="Amount Due">
          <input type="number" id="edit-paid-${idx}" value="${rec.paid}" step="0.01" placeholder="Total Paid">
                    <div class="row" style="margin-bottom:8px;">
            <input type="date" id="quick-pay-date-${idx}" value="${new Date().toISOString().slice(0,10)}">
            <input type="text" id="quick-pay-note-${idx}" placeholder="Note (optional)">
          </div>
          <div class="row" style="margin-bottom:0;">
            <input type="number" id="quick-pay-${idx}" placeholder="Add new payment">
            <button class="btn-save" data-action="quick-pay" data-idx="${idx}">ADD PAYMENT</button>
          </div>
          <div class="history-box">
            <p class="note"><b>Payment History:</b> (editing/deleting an entry recalculates Total Paid)</p>
            ${historyHtml}
          </div>
          <div class="item-actions">
            <button class="btn-save" data-action="save-edit" data-idx="${idx}">SAVE</button>
            <button class="btn-delete-item" data-action="delete-item" data-idx="${idx}">REMOVE FROM LIST</button>
            <button class="btn-cancel" data-action="cancel-edit">CANCEL</button>
          </div>
        </div>`;
    }

    return `
      <div class="item-row" data-action="edit-item" data-idx="${idx}">
        <div><b>${esc(rec.name)}</b><br><span class="note">Paying: ${peso(rec.paid)}</span></div>
        <div style="text-align:right;">
          <span style="color:${statusColor}; font-weight:900;">${peso(balance)}</span><br>
          <span class="record-status-label" style="color:${statusColor};">${statusLabel}</span>
        </div>
      </div>`;
  }).join("");

/* ── SINGLE CONTAINER CLICK HANDLER ── */
  box.onclick = function (e) {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return; // clicked on empty space / inputs / text

    const action = actionEl.dataset.action;

    // Tap a student row to enter edit mode
    if (action === 'edit-item') {
      e.stopPropagation();
      editItem(parseInt(actionEl.dataset.idx, 10));
      return;
    }

    // Everything below is a button inside the editing form
    e.stopPropagation();

    // Cancel has no data-idx/data-rec, so it must be handled before the idx parse below
// Cancel has no data-idx/data-rec, so it must be handled before the idx parse below
    if (action === 'cancel-edit') {
      cancelEdit();
      return;
    }

    // Transfer log entries use a string id, not a numeric row index
    if (action === 'delete-transfer') {
      deleteTransfer(actionEl.dataset.id);
      return;
    }

    const idx = parseInt(actionEl.dataset.idx || actionEl.dataset.rec, 10);
    if (isNaN(idx)) return;

    const histIdx = parseInt(actionEl.dataset.hist, 10);

    switch (action) {
      case 'quick-pay':
        quickPay(idx);
        break;
      case 'save-edit':
        saveItemEdit(idx);
        break;
      case 'delete-item':
        deleteItem(idx);
        break;
      case 'edit-hist':
        openEditHistoryModal(idx, histIdx);
        break;
      case 'del-hist':
        deleteHistoryEntry(idx, histIdx);
        break;
    }
  };
}

function setPaidFilter(filter) {
  paidFilter = paidFilter === filter ? "all" : filter;
  renderItemList();
}

  function editItem(index) {
    if (isClass()) {
      openCollectionEdit(index);
      return;
    }
    editingIndex = index;
    renderItemList();
  }

function openCollectionEdit(index) {
  const record = db.categories[currentCategory]?.records[index];
  if (!record) return;
  editingIndex = index;
  document.getElementById("collection-edit-student-name").innerText = record.name;
  document.getElementById("collection-edit-due").value = record.due;
  document.getElementById("collection-edit-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("collection-edit-note").value = "";
  document.getElementById("collection-edit-pay").value = "";
  renderCollectionEditHistory(record);
  document.getElementById("collection-edit-modal").classList.remove("hidden");
}

function renderCollectionEditHistory(record) {
  const box = document.getElementById("collection-edit-history");
  if (!box) return;
  box.innerHTML = record.history.length
    ? record.history.slice().reverse().map((entry, reverseIndex) => {
        const index = record.history.length - 1 - reverseIndex;
        return `<div class="history-entry"><span>${peso(entry.amount)} on ${esc(entry.date)}${entry.note ? " • " + esc(entry.note) : ""}</span><button class="mini-btn mini-delete" onclick="deleteCollectionEditHistory(${index})">DEL</button></div>`;
      }).join("")
    : `<p class="note">No payments logged yet.</p>`;
}

function closeCollectionEdit() {
  document.getElementById("collection-edit-modal").classList.add("hidden");
  editingIndex = null;
}

function saveCollectionEdit() {
  const record = db.categories[currentCategory]?.records[editingIndex];
  if (!record) return closeCollectionEdit();
  const due = round2(parseFloat(document.getElementById("collection-edit-due").value) || 0);
  if (due < 0) return eveAlert("Amount Due cannot be negative.", true);
  record.due = due;
  saveData();
  closeCollectionEdit();
  renderItemList();
}

function collectionQuickPay() {
  const record = db.categories[currentCategory]?.records[editingIndex];
  if (!record) return;
  const amount = round2(parseFloat(document.getElementById("collection-edit-pay").value) || 0);
  if (amount <= 0) return eveAlert("Please enter a valid payment amount.", true);
  const date = document.getElementById("collection-edit-date").value || new Date().toISOString().slice(0, 10);
  const note = document.getElementById("collection-edit-note").value.trim();
  record.paid = round2(record.paid + amount);
  record.history.push({ amount, date, note });
  if (isOrg()) {
    db.cashbook.transactions.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), type: "income", date, orNumber: "", category: "Year Levels Payment", description: `Payment from ${record.name} — ${currentCategory}`, amount, projectId: null, notes: note });
  }
  saveData();
  document.getElementById("collection-edit-pay").value = "";
  document.getElementById("collection-edit-note").value = "";
  renderCollectionEditHistory(record);
}

function deleteCollectionEditHistory(index) {
  const record = db.categories[currentCategory]?.records[editingIndex];
  if (!record || !record.history[index] || !confirm("Delete this payment entry?")) return;
  record.history.splice(index, 1);
  record.paid = round2(record.history.reduce((sum, entry) => sum + entry.amount, 0));
  saveData();
  renderCollectionEditHistory(record);
}

  function cancelEdit() {
    editingIndex = null;
    renderItemList();
  }

  function quickPay(idx) {
    const val = round2(parseFloat(document.getElementById(`quick-pay-${idx}`).value));
    if (!val || val <= 0) return eveAlert("Enter a valid payment amount", true);
    const rec = db.categories[currentCategory].records[idx];
    const dateVal = document.getElementById(`quick-pay-date-${idx}`).value;
    const noteVal = document.getElementById(`quick-pay-note-${idx}`).value.trim();
    rec.paid = round2(rec.paid + val);
    rec.history.push({ amount: val, date: dateVal || new Date().toISOString().slice(0, 10), note: noteVal });

    // Also log this payment in the Cash Book so the ledger stays in sync
    db.cashbook.transactions.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      type: "income",
      date: new Date().toISOString().slice(0, 10),
      orNumber: "",
      category: "Year Levels Payment",
      description: `Payment from ${rec.name} — ${currentCategory}`,
      amount: val,
      projectId: null,
      notes: ""
    });

    saveData();
    renderItemList();
  }

function saveItemEdit(idx) {
    const due = round2(parseFloat(document.getElementById(`edit-due-${idx}`).value) || 0);
    const paid = round2(parseFloat(document.getElementById(`edit-paid-${idx}`).value) || 0);
    if (due < 0 || paid < 0) return eveAlert("Values cannot be negative", true);
    const rec = db.categories[currentCategory].records[idx];
    rec.due = due;
    rec.paid = paid;
    editingIndex = null;
    saveData();
    renderItemList();
  }

  function openEditHistoryModal(recIdx, histIdx) {
    const rec = db.categories[currentCategory].records[recIdx];
    const entry = rec.history[histIdx];
    let dateVal = entry.date || "";
    if (dateVal && !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) dateVal = d.toISOString().slice(0, 10);
    }
    document.getElementById("edit-hist-date").value = dateVal || new Date().toISOString().slice(0, 10);
    document.getElementById("edit-hist-amount").value = entry.amount;
    document.getElementById("edit-hist-note").value = entry.note || "";
    editingHistory = { recIdx, histIdx };
    document.getElementById("edit-history-modal").classList.remove("hidden");
  }

  function closeEditHistoryModal() {
    document.getElementById("edit-history-modal").classList.add("hidden");
    editingHistory = { recIdx: null, histIdx: null };
  }

  function confirmEditHistory() {
    const { recIdx, histIdx } = editingHistory;
    if (recIdx === null) return;
    const rec = db.categories[currentCategory].records[recIdx];
    const entry = rec.history[histIdx];
    const newDate = document.getElementById("edit-hist-date").value;
    const newAmount = round2(parseFloat(document.getElementById("edit-hist-amount").value) || 0);
    const newNote = document.getElementById("edit-hist-note").value.trim();
    if (newAmount <= 0) return eveAlert("Please enter a valid amount.", true);
    rec.paid = round2(rec.paid - entry.amount + newAmount);
    if (rec.paid < 0) rec.paid = 0;
    entry.amount = newAmount;
    entry.date = newDate || entry.date;
    entry.note = newNote;
    saveData();
    closeEditHistoryModal();
    renderItemList();
  }

  function deleteHistoryEntry(recIdx, histIdx) {
    const rec = db.categories[currentCategory].records[recIdx];
    if (!confirm("Delete this payment entry? This will also reduce the student's Total Paid accordingly.")) return;

    rec.history.splice(histIdx, 1);
    rec.paid = round2(rec.history.reduce((s, h) => s + h.amount, 0));
    saveData();
    renderItemList();
  }

  function deleteItem(idx) {
    const rec = db.categories[currentCategory].records[idx];
    if (confirm(`Remove ${rec.name} from "${currentCategory}"? (They stay in the student database.)`)) {
      db.categories[currentCategory].records.splice(idx, 1);
      editingIndex = null;
      saveData();
      renderItemList();
    }
  }

  /* =========================================================================
    CASHBOOK (ORGANIZATION-WIDE INCOME & EXPENSE LEDGER)
    -------------------------------------------------------------------------
    Separate from the per-student fee Collections above. This is the core
    general ledger an org treasurer keeps: every peso in (dues, sponsorship,
    event income) and every peso out (supplies, food, printing, etc.), with
    a running balance, OR/Voucher numbers for accountability, and optional
    linking to a Project/Event for liquidation reporting.
    ========================================================================= */

  const INCOME_CATEGORIES = [
    "Membership Dues", "Event Income", "Sponsorship / Donation",
    "Fundraising", "Reimbursement", "Other Income"
  ];
  const EXPENSE_CATEGORIES = [
    "Supplies & Materials", "Food & Refreshments", "Printing & Documentation",
    "Transportation", "Permits & Fees", "Honorarium / Token",
    "Venue / Rentals", "Other Expense"
  ];

  function setTxnType(type) {
    document.getElementById("txn-type").value = type;
    document.getElementById("type-income-btn").classList.toggle("selected-income", type === "income");
    document.getElementById("type-expense-btn").classList.toggle("selected-expense", type === "expense");

    const catSelect = document.getElementById("txn-category");
    const prevValue = catSelect.value;
    const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    catSelect.innerHTML = cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    if (cats.includes(prevValue)) catSelect.value = prevValue;
  }

  function resetTxnForm() {
    document.getElementById("txn-edit-id").value = "";
    document.getElementById("txn-date").value = new Date().toISOString().slice(0, 10);
    document.getElementById("txn-or").value = "";
    document.getElementById("txn-description").value = "";
    document.getElementById("txn-amount").value = "";
    document.getElementById("txn-project-search").value = "";
    document.getElementById("txn-project-select").value = "";
    document.getElementById("txn-notes").value = "";
    document.getElementById("txn-cancel-btn").style.display = "none";
    document.getElementById("txn-delete-btn").style.display = "none";
    document.getElementById("txn-form-title").innerText = "Record Transaction";
    setTxnType("income");
  }

  function saveTransaction() {
    const type = document.getElementById("txn-type").value;
    const dateInput = document.getElementById("txn-date").value;
    const date = dateInput || new Date().toISOString().slice(0, 10);
    const orNumber = document.getElementById("txn-or").value.trim();
    const category = document.getElementById("txn-category").value;
    const description = document.getElementById("txn-description").value.trim();
    const amount = round2(parseFloat(document.getElementById("txn-amount").value) || 0);
    const projectId = document.getElementById("txn-project-select").value || null;
    const notes = document.getElementById("txn-notes").value.trim();
    const editId = document.getElementById("txn-edit-id").value;

    if (!description) return eveAlert("Please enter a description for this transaction.", true);
    if (!category) return eveAlert("Please select a category.", true);
    if (amount <= 0) return eveAlert("Please enter a valid amount greater than zero.", true);

    if (editId) {
      const txn = db.cashbook.transactions.find(t => String(t.id) === String(editId));
      if (txn) Object.assign(txn, { type, date, orNumber, category, description, amount, projectId, notes });
    } else {
      db.cashbook.transactions.push({
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        type, date, orNumber, category, description, amount, projectId, notes
      });
    }

    saveData();
    const wasEdit = !!editId;
    resetTxnForm();
    renderCashbookSummary();
    renderCashbookList();
    renderProjects();
    eveAlert(wasEdit ? "Transaction updated." : "Transaction recorded.");
  }

  function editTransactionRow(id) {
    const txn = db.cashbook.transactions.find(t => String(t.id) === String(id));
    if (!txn) return;

    setTxnType(txn.type);
    document.getElementById("txn-edit-id").value = txn.id;
    document.getElementById("txn-date").value = txn.date;
    document.getElementById("txn-or").value = txn.orNumber || "";
    document.getElementById("txn-category").value = txn.category;
    document.getElementById("txn-description").value = txn.description;
    document.getElementById("txn-amount").value = txn.amount;
    document.getElementById("txn-notes").value = txn.notes || "";

    if (txn.projectId) {
      const p = db.projects.find(pr => String(pr.id) === String(txn.projectId));
      if (p) {
        document.getElementById("txn-project-search").value = p.name;
        document.getElementById("txn-project-select").value = p.id;
      }
    } else {
      document.getElementById("txn-project-search").value = "";
      document.getElementById("txn-project-select").value = "";
    }

    document.getElementById("txn-cancel-btn").style.display = "block";
    document.getElementById("txn-delete-btn").style.display = "block";
    document.getElementById("txn-form-title").innerText = "Edit Transaction";
    document.getElementById("txn-form-title").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function cancelTxnEdit() {
    resetTxnForm();
  }

  function deleteCurrentTxn() {
    const id = document.getElementById("txn-edit-id").value;
    if (!id) return;
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    db.cashbook.transactions = db.cashbook.transactions.filter(t => String(t.id) !== String(id));
    saveData();
    resetTxnForm();
    renderCashbookSummary();
    renderCashbookList();
    renderProjects();
  }

  function openOpeningBalanceModal() {
    const current = db.cashbook.openingBalance || 0;
    const val = prompt("Set Opening / Beginning Cash Balance for the Cash Book:", current);
    if (val === null) return;
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return eveAlert("Please enter a valid non-negative amount.", true);
    db.cashbook.openingBalance = round2(num);
    saveData();
    renderCashbookSummary();
    renderCashbookList();
  }

  function computeCashbookTotals() {
    const opening = db.cashbook.openingBalance || 0;
    const totalIncome = round2(db.cashbook.transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0));
    const totalExpense = round2(db.cashbook.transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0));
    const cashOnHand = round2(opening + totalIncome - totalExpense);
    return { opening, totalIncome, totalExpense, cashOnHand };
  }

  function renderCashbookSummary() {
    const el = document.getElementById("cashbook-summary");
    if (!el) return;
    const { opening, totalIncome, totalExpense, cashOnHand } = computeCashbookTotals();
    el.innerHTML = `
      <div class="summary-card"><h4>Opening Balance</h4><p>${peso(opening)}</p></div>
      <div class="summary-card"><h4>Total Income</h4><p style="color:var(--success)">${peso(totalIncome)}</p></div>
      <div class="summary-card"><h4>Total Expenses</h4><p style="color:var(--danger)">${peso(totalExpense)}</p></div>
      <div class="summary-card"><h4>Cash On Hand</h4><p style="color:${cashOnHand < 0 ? 'var(--danger)' : 'var(--accent-dark)'}">${peso(cashOnHand)}</p></div>
    `;
  }

  function renderCashbookList() {
    const box = document.getElementById("cashbook-list");
    if (!box) return;
    const search = (document.getElementById("cashbook-search").value || "").toLowerCase();
    const typeFilter = document.getElementById("cashbook-filter-type").value;

    // Compute a running balance in chronological order first...
    const sortedAsc = [...db.cashbook.transactions].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "") || String(a.id).localeCompare(String(b.id))
    );
    let running = db.cashbook.openingBalance || 0;
    const withBalance = sortedAsc.map(t => {
      running = round2(running + (t.type === "income" ? t.amount : -t.amount));
      return { ...t, balance: running };
    });

    // ...then filter and show most-recent-first.
    let filtered = withBalance.filter(t => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (!search) return true;
      const projName = t.projectId ? ((db.projects.find(p => String(p.id) === String(t.projectId)) || {}).name || "") : "";
      return t.description.toLowerCase().includes(search) ||
            t.category.toLowerCase().includes(search) ||
            (t.orNumber || "").toLowerCase().includes(search) ||
            projName.toLowerCase().includes(search);
    }).reverse();

    document.getElementById("cashbook-count").innerText =
      `${filtered.length} of ${db.cashbook.transactions.length} transaction${db.cashbook.transactions.length !== 1 ? 's' : ''} shown`;

    if (filtered.length === 0) {
      box.innerHTML = `<p class="note">${db.cashbook.transactions.length === 0 ? 'No transactions recorded yet. Use the form above to log your first income or expense.' : 'No transaction matches your search/filter.'}</p>`;
      return;
    }

    box.innerHTML = filtered.map(t => {
      const projName = t.projectId ? (db.projects.find(p => String(p.id) === String(t.projectId)) || {}).name : null;
      const sign = t.type === "income" ? "+" : "−";
      const color = t.type === "income" ? "var(--success)" : "var(--danger)";
      return `
        <div class="item-row" data-action="edit-txn" data-id="${t.id}">
          <div>
            <b>${esc(t.description)}</b><br>
            <span class="note">${esc(t.category)}${t.orNumber ? ' • OR#' + esc(t.orNumber) : ''}${projName ? ' • 📁 ' + esc(projName) : ''} • ${esc(t.date)}</span>
          </div>
          <div style="text-align:right;">
            <span style="color:${color}; font-weight:900;">${sign}${peso(t.amount)}</span><br>
            <span class="note">Bal: ${peso(t.balance)}</span>
          </div>
        </div>`;
    }).join("");

    box.querySelectorAll('[data-action="edit-txn"]').forEach(el => {
      el.addEventListener('click', () => editTransactionRow(el.dataset.id));
    });
  }

  async function exportCashbookCSV() {
    if (db.cashbook.transactions.length === 0) return eveAlert("No transactions to export yet.");

    const sortedAsc = [...db.cashbook.transactions].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "") || String(a.id).localeCompare(String(b.id))
    );
    let running = db.cashbook.openingBalance || 0;

    let csv = "Date,Type,Category,Description,OR/Voucher No.,Project,Amount,Running Balance";
    sortedAsc.forEach(t => {
      running = round2(running + (t.type === "income" ? t.amount : -t.amount));
      const projName = t.projectId ? ((db.projects.find(p => String(p.id) === String(t.projectId)) || {}).name || "") : "";
      const safeDesc = t.description.replace(/"/g, '""');
      const safeProj = projName.replace(/"/g, '""');
      csv += `
  ${t.date},${t.type === "income" ? "Income" : "Expense"},"${t.category}","${safeDesc}","${t.orNumber || ""}","${safeProj}",${t.amount.toFixed(2)},${running.toFixed(2)}`;
    });

    await exportFileCrossPlatform(csv, `cashbook-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv", "Export Cash Book");
  }

  /* ---------------- PROJECTS / EVENTS (budget + liquidation) ---------------- */

  function addProject() {
    const nameInput = document.getElementById("new-project-name");
    const budgetInput = document.getElementById("new-project-budget");
    const name = nameInput.value.trim();
    const budget = round2(parseFloat(budgetInput.value) || 0);

    if (!name) return eveAlert("Please enter a project or event name.", true);
    if (db.projects.some(p => p.name.toLowerCase() === name.toLowerCase())) return eveAlert("A project with that name already exists.", true);

    db.projects.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), name, budget, status: "active" });
    saveData();
    nameInput.value = "";
    budgetInput.value = "";
    renderProjects();
  }

  function deleteProject(id) {
    const hasLinked = db.cashbook.transactions.some(t => String(t.projectId) === String(id));
    const msg = hasLinked
      ? "This project has linked transactions. They will stay in the Cash Book but will no longer be linked to a project. Continue?"
      : "Delete this project?";
    if (!confirm(msg)) return;

    db.cashbook.transactions.forEach(t => { if (String(t.projectId) === String(id)) t.projectId = null; });
    db.projects = db.projects.filter(p => String(p.id) !== String(id));
    saveData();
    renderProjects();
    renderCashbookList();
  }

  function renderProjects() {
    const box = document.getElementById("projects-list");
    if (!box) return;

    if (db.projects.length === 0) {
      box.innerHTML = `<p class="note">No projects/events yet. Add one above to track its budget, income raised, and expenses separately from the general fund.</p>`;
      return;
    }

    box.innerHTML = [...db.projects].sort((a, b) => a.name.localeCompare(b.name)).map(p => {
      const spent = round2(db.cashbook.transactions.filter(t => String(t.projectId) === String(p.id) && t.type === "expense").reduce((s, t) => s + t.amount, 0));
      const income = round2(db.cashbook.transactions.filter(t => String(t.projectId) === String(p.id) && t.type === "income").reduce((s, t) => s + t.amount, 0));
      const remaining = round2(p.budget - spent);
      const remainingStr = p.budget > 0 ? ` • Remaining: ${peso(remaining)}` : "";
      const incomeStr = income > 0 ? ` • Income: ${peso(income)}` : "";
      return `
        <div class="card" data-action="view-project" data-id="${p.id}">
          <span>${esc(p.name)}<br>
          <span class="note">Budget: ${peso(p.budget)} • Spent: ${peso(spent)}${incomeStr}${remainingStr}</span></span>
          <button class="del-btn" data-action="delete-project" data-id="${p.id}">X</button>
        </div>`;
    }).join("");

    box.querySelectorAll('[data-action="view-project"]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="delete-project"]')) return;
        showProjectDetail(el.dataset.id);
      });
    });
    box.querySelectorAll('[data-action="delete-project"]').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); deleteProject(el.dataset.id); });
    });
  }

  function showProjectsView() {
    document.getElementById("cashbook-main-view").classList.add("hidden");
    document.getElementById("project-detail-view").classList.add("hidden");
    document.getElementById("projects-view").classList.remove("hidden");
    renderProjects();
  }

  function hideProjectsView() {
    document.getElementById("projects-view").classList.add("hidden");
    document.getElementById("project-detail-view").classList.add("hidden");
    document.getElementById("cashbook-main-view").classList.remove("hidden");
  }

  function backToProjectsList() {
    document.getElementById("project-detail-view").classList.add("hidden");
    document.getElementById("projects-view").classList.remove("hidden");
  }

  function showProjectDetail(id) {
    const p = db.projects.find(pr => String(pr.id) === String(id));
    if (!p) return;

    document.getElementById("projects-view").classList.add("hidden");
    document.getElementById("project-detail-view").classList.remove("hidden");
    document.getElementById("project-detail-name").innerText = p.name.toUpperCase();

    const txns = db.cashbook.transactions
      .filter(t => String(t.projectId) === String(id))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const spent = round2(txns.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0));
    const income = round2(txns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0));
    const remaining = round2(p.budget - spent);

    document.getElementById("project-detail-summary").innerHTML = `
      <div class="summary-card"><h4>Budget</h4><p>${peso(p.budget)}</p></div>
      <div class="summary-card"><h4>Spent</h4><p style="color:var(--danger)">${peso(spent)}</p></div>
      <div class="summary-card"><h4>Income Raised</h4><p style="color:var(--success)">${peso(income)}</p></div>
      <div class="summary-card"><h4>Remaining Budget</h4><p style="color:${remaining < 0 ? 'var(--danger)' : 'var(--accent-dark)'}">${peso(remaining)}</p></div>
    `;

    document.getElementById("project-detail-txns").innerHTML = txns.length ? txns.map(t => {
      const sign = t.type === "income" ? "+" : "−";
      const color = t.type === "income" ? "var(--success)" : "var(--danger)";
      return `<div class="breakdown-card">
        <div class="breakdown-top"><b>${esc(t.description)}</b><span style="color:${color};">${sign}${peso(t.amount)}</span></div>
        <span class="note">${esc(t.category)} • ${esc(t.date)}${t.orNumber ? ' • OR#' + esc(t.orNumber) : ''}</span>
      </div>`;
    }).join("") : `<p class="note">No transactions linked to this project yet. Link one by picking it in the Cash Book form.</p>`;
  }

  /* =========================================================================
    ORGANIZATION INFO
    ========================================================================= */

  function saveOrgSettings() {
    db.orgSettings.orgName = document.getElementById("org-name").value.trim();
    db.orgSettings.treasurerName = document.getElementById("org-treasurer").value.trim();
    db.orgSettings.presidentName = document.getElementById("org-president").value.trim();
    db.orgSettings.schoolYear = document.getElementById("org-sy").value.trim();
    saveData();
    updateAppHeader();
    eveAlert("Organization info saved.");
  }

  function loadOrgSettingsForm() {
    document.getElementById("org-name").value = db.orgSettings.orgName || "";
    document.getElementById("org-treasurer").value = db.orgSettings.treasurerName || "";
    document.getElementById("org-president").value = db.orgSettings.presidentName || "";
    document.getElementById("org-sy").value = db.orgSettings.schoolYear || "";
  }

  function updateAppHeader() {
    const eyebrow = document.querySelector(".eyebrow");
    if (eyebrow) eyebrow.innerText = db.orgSettings.orgName ? db.orgSettings.orgName : "Digital Ledger";
  }

  /* =========================================================================
    FINANCIAL STATEMENT (Statement of Receipts and Disbursements)
    ========================================================================= */

  function formatDisplayDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function formatStatement(htmlContent) {
      // Create a temporary div to parse HTML
      const div = document.createElement('div');
      div.innerHTML = htmlContent;

      // Replace <br> tags with newlines
      div.innerHTML = div.innerHTML.replace(/<br\s*\/?>/gi, '\n');

      // Get the plain text
      let text = div.innerText;

      // Optional: further formatting (e.g., aligning values)
      // For simplicity, you can process 'text' as needed here

      return text;
  }


  function generateStatement() {
    const startVal = document.getElementById("stmt-start").value;
    const endVal = document.getElementById("stmt-end").value;

    const all = [...db.cashbook.transactions].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "") || String(a.id).localeCompare(String(b.id))
    );
    const before = startVal ? all.filter(t => t.date < startVal) : [];
    const beginningBalance = round2(
      (db.cashbook.openingBalance || 0) +
      before.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0) -
      before.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0)
    );

    const inRange = all.filter(t => {
      if (startVal && t.date < startVal) return false;
      if (endVal && t.date > endVal) return false;
      return true;
    });

    const incomeTxns = inRange.filter(t => t.type === "income");
    const expenseTxns = inRange.filter(t => t.type === "expense");

    const incomeByCategory = {};
    incomeTxns.forEach(t => { incomeByCategory[t.category] = round2((incomeByCategory[t.category] || 0) + t.amount); });
    const expenseByCategory = {};
    expenseTxns.forEach(t => { expenseByCategory[t.category] = round2((expenseByCategory[t.category] || 0) + t.amount); });

    const totalReceipts = round2(incomeTxns.reduce((s, t) => s + t.amount, 0));
    const totalDisbursements = round2(expenseTxns.reduce((s, t) => s + t.amount, 0));
    const endingBalance = round2(beginningBalance + totalReceipts - totalDisbursements);

    const periodLabel = (startVal || endVal)
      ? `${startVal ? formatDisplayDate(startVal) : 'Beginning'} to ${endVal ? formatDisplayDate(endVal) : 'Present'}`
      : "All Recorded Transactions";

    const org = db.orgSettings || {};

    // Helper function to replace category label
function replaceCategoryLabel(category) {
  if (category === "Year Levels Payment") return "All Year Levels Payment";
  if (category === "All Year Levels Payment") return "All Year Levels Payment";
  return category;
}

    // Generate income rows with label replacement
    const incomeRows = Object.keys(incomeByCategory).sort().map(c => {
      const displayCat = replaceCategoryLabel(c);
      return `<div class="statement-row"><span>${esc(displayCat)}</span><span>${peso(incomeByCategory[c])}</span></div>`;
    }).join("") || '<p class="note">No receipts recorded for this period.</p>';

    // Generate expense rows (no label change needed)
    const expenseRows = Object.keys(expenseByCategory).sort().map(c =>
      `<div class="statement-row"><span>${esc(c)}</span><span>${peso(expenseByCategory[c])}</span></div>`
    ).join("") || '<p class="note">No disbursements recorded for this period.</p>';

    // ... rest of your generateStatement code remains unchanged ...
    document.getElementById("statement-output").innerHTML = `
      <div class="statement-print-area">
        <div class="statement-header">
          <h3>${esc(org.orgName || "Organization Name")}</h3>
          <p class="note">PUP Unisan Campus${org.schoolYear ? ' • S.Y. ' + esc(org.schoolYear) : ''}</p>
          <h4>STATEMENT OF RECEIPTS AND DISBURSEMENTS</h4>
          <p class="note">For the period: ${esc(periodLabel)}</p>
        </div>

        <div class="statement-row statement-subtotal"><span>Beginning Cash Balance</span><b>${peso(beginningBalance)}</b></div>

        <h4 style="margin-top:18px;">Receipts</h4>
        ${incomeRows}
        <div class="statement-row statement-subtotal"><span>Total Receipts</span><b style="color:var(--success)">${peso(totalReceipts)}</b></div>

        <h4 style="margin-top:18px;">Disbursements</h4>
        ${expenseRows}
        <div class="statement-row statement-subtotal"><span>Total Disbursements</span><b style="color:var(--danger)">${peso(totalDisbursements)}</b></div>

        <div class="statement-row statement-final"><span>Ending Cash Balance</span><b>${peso(endingBalance)}</b></div>

        <div class="statement-signatures">
          <div><p class="note">Prepared by:</p><p class="sig-line">${esc(org.treasurerName || '_______________________')}</p><p class="note">Treasurer</p></div>
          <div><p class="note">Noted by:</p><p class="sig-line">${esc(org.presidentName || '_______________________')}</p><p class="note">President / Adviser</p></div>
        </div>
        <p class="note" style="margin-top:16px; text-align:center;">Generated on ${new Date().toLocaleDateString()} via Treasurer Recorder</p>
      </div>
      <div class="row" style="margin-top:16px;">
        <button onclick="exportStatementText()">Export as Text</button>
        <button onclick="exportStatementImage()">Export as Image</button>
      </div>
    `;
    document.getElementById("statement-output").scrollIntoView({ behavior: "smooth" });
  }

  async function exportStatementText() {
    const area = document.querySelector(".statement-print-area");
    if (!area) return;
    const text = area.innerText;
    await exportFileCrossPlatform(text, `statement-${new Date().toISOString().slice(0, 10)}.txt`, "text/plain", "Export Statement");
  }

async function exportStatementImage() {
  const startVal = document.getElementById("stmt-start").value;
  const endVal = document.getElementById("stmt-end").value;
  const org = db.orgSettings || {};

  const all = [...db.cashbook.transactions].sort((a, b) =>
    (a.date || "").localeCompare(b.date || "") || String(a.id).localeCompare(String(b.id))
  );
  const before = startVal ? all.filter(t => t.date < startVal) : [];
  const beginningBalance = round2(
    (db.cashbook.openingBalance || 0) +
    before.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0) -
    before.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0)
  );
  const inRange = all.filter(t => {
    if (startVal && t.date < startVal) return false;
    if (endVal && t.date > endVal) return false;
    return true;
  });
  const incomeTxns = inRange.filter(t => t.type === "income");
  const expenseTxns = inRange.filter(t => t.type === "expense");
  const incomeByCategory = {};
  incomeTxns.forEach(t => { incomeByCategory[t.category] = round2((incomeByCategory[t.category] || 0) + t.amount); });
  const expenseByCategory = {};
  expenseTxns.forEach(t => { expenseByCategory[t.category] = round2((expenseByCategory[t.category] || 0) + t.amount); });
  const totalReceipts = round2(incomeTxns.reduce((s, t) => s + t.amount, 0));
  const totalDisbursements = round2(expenseTxns.reduce((s, t) => s + t.amount, 0));
  const endingBalance = round2(beginningBalance + totalReceipts - totalDisbursements);
  const periodLabel = (startVal || endVal)
    ? `${startVal ? formatDisplayDate(startVal) : 'Beginning'} to ${endVal ? formatDisplayDate(endVal) : 'Present'}`
    : "All Recorded Transactions";

  const incomeRows = Object.keys(incomeByCategory).sort().map(c => {
    const displayCat = c === "Year Levels Payment" ? "All Year Levels Payment" : c;
    return `<div class="statement-row"><span>${esc(displayCat)}</span><span>${peso(incomeByCategory[c])}</span></div>`;
  }).join("") || '<p class="note">No receipts recorded for this period.</p>';

  const expenseRows = Object.keys(expenseByCategory).sort().map(c =>
    `<div class="statement-row"><span>${esc(c)}</span><span>${peso(expenseByCategory[c])}</span></div>`
  ).join("") || '<p class="note">No disbursements recorded for this period.</p>';

  const html = `
    <div style="background:#fff; padding:32px 24px; max-width:720px; margin:0 auto; font-family:Inter,sans-serif; color:#1F2A24; min-height:100vh; box-sizing:border-box;">
      <div style="text-align:center; margin-bottom:18px; padding-bottom:12px; border-bottom:1.5px dashed #ddd;">
        <h3 style="font-size:17px; margin-bottom:4px; font-weight:bold;">${esc(org.orgName || "Organization Name")}</h3>
        <p style="font-size:12px; color:#6E7A72; margin-bottom:4px;">PUP Unisan Campus${org.schoolYear ? ' • S.Y. ' + esc(org.schoolYear) : ''}</p>
        <h4 style="font-size:14px; margin-bottom:4px; font-weight:bold;">STATEMENT OF RECEIPTS AND DISBURSEMENTS</h4>
        <p style="font-size:12px; color:#6E7A72;">For the period: ${esc(periodLabel)}</p>
      </div>

      <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:14px; font-family:'IBM Plex Mono',monospace; border-top:1px solid #ddd; margin-top:2px; padding-top:10px; font-weight:600;">
        <span>Beginning Cash Balance</span><b>${peso(beginningBalance)}</b>
      </div>

      <h4 style="margin-top:20px; font-size:13px; font-weight:bold; color:#163F2D;">Receipts</h4>
      ${incomeRows}
      <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:14px; font-family:'IBM Plex Mono',monospace; border-top:1px solid #ddd; margin-top:2px; padding-top:10px; font-weight:600;">
        <span>Total Receipts</span><b style="color:#2F7D53;">${peso(totalReceipts)}</b>
      </div>

      <h4 style="margin-top:20px; font-size:13px; font-weight:bold; color:#163F2D;">Disbursements</h4>
      ${expenseRows}
      <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:14px; font-family:'IBM Plex Mono',monospace; border-top:1px solid #ddd; margin-top:2px; padding-top:10px; font-weight:600;">
        <span>Total Disbursements</span><b style="color:#B3423B;">${peso(totalDisbursements)}</b>
      </div>

      <div style="display:flex; justify-content:space-between; padding:8px 0; font-size:15px; font-family:'IBM Plex Mono',monospace; border-top:2px solid #1F5D42; margin-top:12px; padding-top:12px; font-weight:700;">
        <span>Ending Cash Balance</span><b>${peso(endingBalance)}</b>
      </div>

      <div style="display:flex; justify-content:space-between; margin-top:32px; gap:16px; text-align:center;">
        <div style="flex:1; min-width:0;">
          <p style="font-size:12px; color:#6E7A72; margin-bottom:4px;">Prepared by:</p>
          <p style="margin-top:24px; border-top:1px solid #1F2A24; padding-top:4px; font-weight:600; font-size:12px;">${esc(org.treasurerName || '_______________________')}</p>
          <p style="font-size:11px; color:#6E7A72;">Treasurer</p>
        </div>
        <div style="flex:1; min-width:0;">
          <p style="font-size:12px; color:#6E7A72; margin-bottom:4px;">Noted by:</p>
          <p style="margin-top:24px; border-top:1px solid #1F2A24; padding-top:4px; font-weight:600; font-size:12px;">${esc(org.presidentName || '_______________________')}</p>
          <p style="font-size:11px; color:#6E7A72;">President / Adviser</p>
        </div>
      </div>
      <p style="margin-top:18px; text-align:center; font-size:11px; color:#6E7A72;">Generated on ${new Date().toLocaleDateString()} via Treasurer Recorder</p>
    </div>
  `;

  // ── NATIVE SCREENSHOT PATH (Android) ──
  if (isAndroidApp()) {
    try {
      const plugins = window.Capacitor.Plugins || {};
      const { Screenshot, Filesystem, Share } = plugins;

      if (!Screenshot) {
        eveAlert("Screenshot plugin not found. Make sure @capawesome/capacitor-screenshot is installed and synced.", true);
        return;
      }

      // Create fullscreen overlay
      let overlay = document.getElementById('screenshot-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'screenshot-overlay';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.zIndex = '99999';
        overlay.style.background = '#ffffff';
        overlay.style.overflow = 'auto';
        overlay.style.display = 'none';
        document.body.appendChild(overlay);
      }
      overlay.innerHTML = html;
      overlay.style.display = 'block';

      // Let the WebView render it
      await new Promise(r => setTimeout(r, 600));

      // Take native screenshot
      const result = await Screenshot.take();

      // Hide overlay immediately
      overlay.style.display = 'none';
      overlay.innerHTML = '';

      if (!result || !result.uri) {
        throw new Error("Screenshot returned no image");
      }

      // ── FIX: Copy screenshot to app CACHE so Share plugin can read it ──
      const fileName = `statement-${Date.now()}.png`;
      let base64Data;

      // Try reading the screenshot file directly
      try {
        const readRes = await Filesystem.readFile({
          path: result.uri,
          encoding: 'base64'
        });
        base64Data = readRes.data;
      } catch (e1) {
        // If direct read fails, fetch it via the WebView
        const response = await fetch(result.uri);
        const blob = await response.blob();
        base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      // Write to app cache (Share plugin can definitely access this)
      const writeResult = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: "CACHE",
        encoding: "base64"
      });

      // Share using files array (required for images on Android)
      await Share.share({
        title: "Financial Statement",
        text: `Statement for ${org.orgName || 'Organization'} (${periodLabel})`,
        files: [writeResult.uri],
        dialogTitle: "Share Statement"
      });

    } catch (e) {
      eveAlert("Screenshot export failed: " + e.message, true);
    }
    return;
  }

  // ── DESKTOP FALLBACK (html2canvas via script tag) ──
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '720px';
  document.body.appendChild(container);

  try {
    if (!window.html2canvas) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    const canvas = await window.html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false
    });

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `statement-${new Date().toISOString().slice(0,10)}.png`;
    link.click();
  } catch (e) {
    eveAlert("Desktop export failed: " + e.message, true);
  } finally {
    document.body.removeChild(container);
  }
}

  // ================= SUMMARY TAB =================
  function renderSummary() {
  // Backup reminder
  const statusEl = document.getElementById("backup-status");
  const lastBackup = localStorage.getItem("lastBackupTime");
  if (!lastBackup) {
    statusEl.innerText = "⚠ You have never backed up your data yet.";
    statusEl.style.color = "#B3423B";
  } else {
    const days = Math.floor((Date.now() - parseInt(lastBackup, 10)) / (1000 * 60 * 60 * 24));
    if (days <= 0) {
      statusEl.innerText = "✓ Last backup: today";
      statusEl.style.color = "#2F7D53";
    } else if (days === 1) {
      statusEl.innerText = "Last backup: 1 day ago";
      statusEl.style.color = "#2F7D53";
    } else if (days <= 7) {
      statusEl.innerText = `Last backup: ${days} days ago`;
      statusEl.style.color = days <= 3 ? "#2F7D53" : "#B8872F";
    } else {
      statusEl.innerText = `⚠ Last backup: ${days} days ago — back up soon!`;
      statusEl.style.color = "#B3423B";
    }
  }
  }

  // ================= BACKUP / RESTORE =================
  function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported.students) || typeof imported.categories !== "object" || imported.categories === null) {
          throw new Error("Invalid file");
        }
        if (confirm("This will REPLACE all current data with this backup. Continue?")) {
          db = imported;
          migrateDb();
          saveData();
          renderStudents();
          renderSummary();
          renderCashbookSummary();
          renderCashbookList();
          renderProjects();
          loadOrgSettingsForm();
          updateAppHeader();
          eveAlert("Backup restored!");
        }
      } catch (err) {
        eveAlert("Invalid backup file.", true);
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  }

  function resetAllData() {
    if (confirm("This will permanently erase ALL students, collections, cash book transactions, and projects. Continue?")) {
      if (confirm("Are you absolutely sure? This cannot be undone.")) {
        db = { students: [], categories: {} };
        migrateDb();
        saveData();
        renderStudents();
        renderSummary();
        renderCashbookSummary();
        renderCashbookList();
        renderProjects();
        loadOrgSettingsForm();
        updateAppHeader();
      }
    }
  }

  // Initial render on page load
window.addEventListener("DOMContentLoaded", () => {
  checkMode();          // <-- NEW: mode must be checked first
  if (!getMode()) return; // Don't render until mode is chosen

  renderStudents();
  renderCategories();
  renderSummary();
  renderCashbookSummary();
  renderCashbookList();
  renderProjects();
  loadOrgSettingsForm();
  updateAppHeader();
  resetTxnForm();
  updateUndoRedoButtons();
});

/* =========================================================================
   EVE SMART ASSISTANT — Idle Toggle + Alert Replacement
   ========================================================================= */
(function() {
  const nativeAlert = window.alert.bind(window);

  const eveBot      = document.getElementById('eveBot');
  const eveHead     = document.getElementById('eveHead');
  const speechBubble= document.getElementById('speechBubble');
  const msgEl       = document.getElementById('eveMsg');
  const actionsEl   = document.getElementById('eveActions');
  const allEyes     = document.querySelectorAll('.eve-eye');

  let isInteracting = false;
  let ambientTimer  = null;
  let bubbleTimer   = null;
  let msgQueue      = [];
  let msgIndex      = 0;
  let hasShownUrgent= false;
  let idleCycleTimer= null;
  let idleTipIndex  = 0;
  let idleCycleActive = true;
  let lastBubbleShow = 0;          // ← NEW: grace-period tracker
  const BUBBLE_GRACE_MS = 300;     // ← NEW

  const IDLE_TIPS = [
    `💡 Try Dark mode in the top bar!`,
    `💡 All data stays offline. Back it up regularly!`,
    `💡 Switch between Org and Class mode anytime.`,
    `💡 Am I annoying? Tap the green button below.`,
    `💡 Export CSVs from any collection for easy reporting.`,
    `💡 Set an Opening Balance in Cashbook for accurate statements.`,
    `💡 Deleting a classfund payment history also deletes its transaction.`,
    `💡 Tap a student's card in Records to edit their due or paid amount directly.`,
    `💡 Use the search box in any tab to filter long lists instantly.`,
    `💡 Link Cash Book transactions to Projects for auto-generated liquidation reports.`,
    `💡 In Class mode, set the weekly due and start date before recording payments.`,
    `💡 Forgot your PIN? Use your device's Activation Code to reset it safely.`,
    `💡 Add all students to a collection at once with the "Add All" button.`,
    `💡 Student payments recorded in the ADD tab automatically sync to the Cash Book.`,
    `💡 Generate a Financial Statement anytime from the Summary tab for GA or audit.`,
    `💡 Keep your backup JSON file safe — it contains all your records!`,
    `💡 Use OR / Voucher numbers in Cash Book for easier tracking during audits.`,
    `💡 Rename a collection anytime by opening it and tapping "Rename".`,
    `💡 Your data lives in this browser only — clearing cache will erase everything!`,
    `💡 The Activation Code locks this app to your device. It won't work on another phone.`,
    `💡 Switching from Org to Class mode relabels every button and header automatically.`,
    `💡 You can edit or delete any payment history entry — totals recalculate instantly.`,
    `💡 Projects let you track event budgets separately from your main Cash Book.`,
    `💡 The "Quick Pay" button inside a student's edit card logs payment without leaving the page.`,
    `💡 Class Fund tracks missed weeks automatically once you set a start date.`,
    `💡 You can print the Financial Statement directly — it hides the rest of the page automatically.`,
    `💡 The A-Z index on the right of Collections lets you jump to any letter instantly.`,
    `💡 Collection names are case-insensitive, so "Field Trip" and "field trip" are treated as the same.`,
    `💡 Tap any student name in the Database tab to see their balance across every collection.`
  ];

  const extremeGlances = [
    { x: 0, y: 22 }, { x: 0, y: -22 }, { x: -18, y: 0 }, { x: 18, y: 0 },
    { x: -14, y: -15 }, { x: 14, y: 15 }, { x: -14, y: 15 }, { x: 14, y: -15 }, { x: 0, y: 0 }
  ];
  let currentTransform = "translate(0px, 0px)";

  function ambientBehavior() {
    if (isInteracting) return;
    if (Math.random() < 0.25) {
      allEyes.forEach(eye => { eye.style.transform = currentTransform; eye.classList.add('blink'); });
      setTimeout(() => allEyes.forEach(eye => eye.classList.remove('blink')), 150);
    } else {
      const p = extremeGlances[Math.floor(Math.random() * extremeGlances.length)];
      currentTransform = `translate(${p.x}px, ${p.y}px)`;
      allEyes.forEach(eye => { eye.style.transform = currentTransform; });
    }
    ambientTimer = setTimeout(ambientBehavior, Math.random() * 500 + 600);
  }

  function triggerJump(reactionType) {
    if (isInteracting) return;
    isInteracting = true;
    clearTimeout(ambientTimer);
    allEyes.forEach(eye => eye.classList.remove('blink'));
    eveHead.classList.add('is-stretching');

    const reactionClass = reactionType === 'lookup' ? 'is-looking-up' : 'is-smiling';

    setTimeout(() => { eveHead.classList.add(reactionClass); }, 250);
    setTimeout(() => {
      eveHead.classList.remove('is-stretching', reactionClass);

      if (reactionType === 'lookup') {
        /* ---- "nevermind" side-to-side eye dart ---- */
        allEyes.forEach(eye => {
          eye.style.transform = '';
          eye.classList.add('is-neverminding');
        });
        setTimeout(() => {
          allEyes.forEach(eye => {
            eye.classList.remove('is-neverminding');
            eye.style.transform = '';
          });
          isInteracting = false;
          currentTransform = "translate(0px, 0px)";
          ambientBehavior();
        }, 500);
      } else {
        setTimeout(() => {
          isInteracting = false;
          currentTransform = "translate(0px, 0px)";
          ambientBehavior();
        }, 200);
      }
    }, 1200);
  }
  
  function buildQueue() {
    const queue = [];
    const mode = (typeof getMode === 'function') ? getMode() : '';
    const activePage = document.querySelector('.page:not(.hidden)');
    const tabId = activePage ? activePage.id : '';

    if (mode === 'class' && db.classFund && db.classFund.records && db.classFund.weeklyDue) {
      let missedCount = 0;
      Object.keys(db.classFund.records).forEach(name => {
        if (typeof getMissedWeeks === 'function' && getMissedWeeks(name) > 0) missedCount++;
      });
      if (missedCount > 0) {
        queue.push({ text: `⚠ ${missedCount} student(s) missed class fund payments!`, action: 'goClassFund', label: 'View' });
      }
    }

    if (mode === 'org' && typeof computeCashbookTotals === 'function') {
      const cb = computeCashbookTotals();
      if (cb.cashOnHand < 0) {
        queue.push({ text: `⚠ Cash balance is ${peso(cb.cashOnHand)}. Review expenses!`, action: 'goCashbook', label: 'Fix' });
      }
    }

    const lastBackup = localStorage.getItem('lastBackupTime');
    if (!lastBackup) {
      queue.push({ text: `💾 You haven't backed up yet. Protect your records!`, action: 'backup', label: 'Back Up' });
    } else {
      const days = Math.floor((Date.now() - parseInt(lastBackup)) / 86400000);
      if (days > 7) queue.push({ text: `💾 Last backup was ${days} days ago. Back up soon!`, action: 'backup', label: 'Back Up' });
    }

    if (tabId === 'add-section') {
      if (db.students.length === 0) queue.push({ text: `👋 Add students in the Year Level tab first!`, action: 'goDatabase', label: 'Go' });
      else if (Object.keys(db.categories).length === 0) queue.push({ text: `💡 Create a collection category first.` });
      else queue.push({ text: `💡 Use the dropdowns to quickly find students and collections.` });
    }
    else if (tabId === 'database-section') {
      if (db.students.length === 0) queue.push({ text: `👋 Start by adding your first student or year level here.` });
      else queue.push({ text: `💡 Tap any student to see their balance across all collections.` });
    }
    else if (tabId === 'inventory-section') queue.push({ text: `📁 Browse collections A-Z. Tap one to add students or export CSV.` });
    else if (tabId === 'cashbook-section') {
      if (!db.cashbook.transactions.length) queue.push({ text: `💵 Log income & expenses to generate Financial Statements.` });
      else queue.push({ text: `💡 Link transactions to Projects for easier liquidation reports.` });
    }
    else if (tabId === 'classfund-section') {
      if (!db.classFund.startDate || !db.classFund.weeklyDue) queue.push({ text: `⚙️ Set weekly due & start date to begin tracking.` });
      else queue.push({ text: `💡 Tap a student card to expand and record their payment.` });
    }
    else if (tabId === 'summary-section') queue.push({ text: `📊 Generate Statements and export backups from here.` });

    return queue;
  }

  const ACTIONS = {
    goClassFund: () => { dismiss(); if (typeof switchTab === 'function') switchTab('classfund-section', document.getElementById('nav-classfund')); },
    goCashbook:  () => { dismiss(); if (typeof switchTab === 'function') switchTab('cashbook-section', document.getElementById('nav-cashbook')); },
    goDatabase:  () => { dismiss(); if (typeof switchTab === 'function') switchTab('database-section', document.getElementById('nav-students')); },
    goSummary:   () => { dismiss(); if (typeof switchTab === 'function') switchTab('summary-section', document.getElementById('nav-summary')); },
    backup:      () => { dismiss(); if (typeof exportBackup === 'function') exportBackup(); },
    exportCSV:   () => { dismiss(); if (typeof exportClassFundWeeklyCSV === 'function') exportClassFundWeeklyCSV(); }
  };

  function renderBubble(item) {
    if (!item || !msgEl || !speechBubble) return;
    lastBubbleShow = Date.now();                       // ← NEW
    msgEl.textContent = item.text;
    let html = '';
    if (item.action && ACTIONS[item.action]) {
      html += `<button class="eve-action-btn" onclick="EveAssistant.act('${item.action}')">${esc(item.label || 'Go')}</button>`;
    }
    
    if (actionsEl) actionsEl.innerHTML = html;
    speechBubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => dismiss(), 12000);
  }

  function show() {
    msgQueue = buildQueue();
    msgIndex = 0;
    if (msgQueue.length) renderBubble(msgQueue[0]);
  }

  function next() {
    if (!msgQueue.length) msgQueue = buildQueue();
    if (!msgQueue.length) return;
    msgIndex = (msgIndex + 1) % msgQueue.length;
    renderBubble(msgQueue[msgIndex]);
  }

function dismiss() {
  if (speechBubble) {
    speechBubble.classList.remove('show');
    speechBubble.classList.remove('alert-active');
  }
  clearTimeout(bubbleTimer);
  idleCycleTimer = null;
  
  /* ── FIX: reset EVE head so she never gets stuck smiling ── */
  if (eveHead) {
    eveHead.classList.remove('is-stretching', 'is-smiling');
    const overlay = document.getElementById("eve-inventory-overlay");
    if (overlay && !overlay.classList.contains("hidden")) {
      eveHead.classList.add('is-looking-inventory');
    }
  }
  
  if (idleCycleActive) idleCycleTimer = setTimeout(runIdleCycle, 10000);
}
  function checkUrgent() {
    msgQueue = buildQueue();
    const urgent = msgQueue.find(m => m.text && m.text.startsWith('⚠'));
    if (urgent && !hasShownUrgent) {
      msgIndex = msgQueue.indexOf(urgent);
      renderBubble(urgent);
      hasShownUrgent = true;
    }
  }

function runIdleCycle() {
  idleCycleTimer = null;
  // Idle tips disabled — EVE only speaks when tapped or on alerts
}

  function pauseIdleCycle() {
    clearTimeout(idleCycleTimer);
    idleCycleTimer = null;
  }

function toggleEveIdle() {
  idleCycleActive = !idleCycleActive;
  const btn = document.getElementById('eve-idle-toggle');
  const zipper = document.getElementById('eveZipper');
  const bot   = document.getElementById('eveBot');   // ← ADD THIS LINE

  if (btn) {
    btn.classList.toggle('stopped', !idleCycleActive);
    btn.classList.toggle('running', idleCycleActive);
    btn.title = idleCycleActive ? 'Idle tips running — tap to stop' : 'Idle tips paused — tap to resume';
  }

  /* ── NEW: shrink EVE into the button or pop her back out ── */
  if (bot) {
    bot.classList.toggle('eve-silenced', !idleCycleActive);
  }

  /* ---- brief zipper flash, then back to normal ---- */
  if (zipper) {
    zipper.classList.remove('zipping', 'unzipping');
    void zipper.offsetWidth; // force reflow
    zipper.classList.add(!idleCycleActive ? 'zipping' : 'unzipping');
    setTimeout(() => {
      zipper.classList.remove('zipping', 'unzipping');
    }, 600);
  }

  if (idleCycleActive) {
    runIdleCycle();
  } else {
    clearTimeout(idleCycleTimer);
    idleCycleTimer = null;
    if (speechBubble && speechBubble.classList.contains('show') && !msgQueue[msgIndex]?.action) dismiss();
  }
}
/* --- showMsg: displays alerts through EVE's bubble --- */
function showMsg(msg, isError = false, reaction = 'lookup') {
  clearTimeout(idleCycleTimer);
  idleCycleTimer = null;
  lastBubbleShow = Date.now();

  triggerJump(reaction);   // ← was hardcoded 'lookup'

  if (msgEl) msgEl.textContent = msg;
  if (actionsEl) actionsEl.innerHTML = '';
  if (speechBubble) {
    speechBubble.classList.add('show');
    if (isError) speechBubble.classList.add('alert-active');
    else speechBubble.classList.remove('alert-active');
  }
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => dismiss(), 4000);
}

  /* --- eveAlert: replaces native eveAlert() --- */
/* --- eveAlert: replaces native alert() --- */
function eveAlert(msg, isError = false) {
  if (speechBubble && msgEl) {
    showMsg(msg, isError, isError ? 'lookup' : 'smile');  // ← CHANGED
  } else {
    nativeAlert(msg);
  }
}

  /* --- Attach toggle button listener --- */
  const idleToggleBtn = document.getElementById('eve-idle-toggle');
  if (idleToggleBtn) {
    idleToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEveIdle();
    });
  }

  /* --- Head tap --- */
  if (eveHead) {
    eveHead.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      pauseIdleCycle();
      if (speechBubble && speechBubble.classList.contains('show')) dismiss();

      const overlay = document.getElementById("eve-inventory-overlay");
      if (overlay && !overlay.classList.contains("hidden")) {
        eveInventoryTapInteraction();
      } else {
        openEveInventory();
      }
    });
    eveHead.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      pauseIdleCycle();
      if (speechBubble && speechBubble.classList.contains('show')) dismiss();

      const overlay = document.getElementById("eve-inventory-overlay");
      if (overlay && !overlay.classList.contains("hidden")) {
        eveInventoryTapInteraction();
      } else {
        openEveInventory();
      }
    }, { passive: false });
  }

  /* --- Click outside to dismiss --- */
  document.addEventListener('click', (e) => {
    if (speechBubble && speechBubble.classList.contains('show') && !speechBubble.contains(e.target) && !eveHead.contains(e.target) && !e.target.closest('#eve-idle-toggle')) {
      if (Date.now() - lastBubbleShow < BUBBLE_GRACE_MS) return;   // ← NEW
      dismiss();
    }
  });

  /* --- Hook tab switches --- */
  if (typeof switchTab === 'function') {
    const _origSwitchTab = switchTab;
    window.switchTab = function(id, btn) {
      _origSwitchTab(id, btn);
      setTimeout(() => { msgQueue = buildQueue(); }, 300);
    };
  }

      window.EveAssistant = {
    show, next, dismiss, checkUrgent, toggleEveIdle, showMsg,
    react: (mode) => triggerJump(mode),   // ← this line
    act: (key) => { if (ACTIONS[key]) ACTIONS[key](); }
  };

  /* --- Expose eveAlert globally --- */
  window.eveAlert = eveAlert;

  /* --- Inventory-open tap: Wall-E easter egg --- */
function eveInventoryTapInteraction() {
  if (!eveHead || !speechBubble || !msgEl) return;

  clearTimeout(bubbleTimer);

  // Temporarily remove inventory-look so it doesn't fight the smile transform
  eveHead.classList.remove('is-looking-inventory');

  // Reset any previous animation
  eveHead.classList.remove('is-stretching', 'is-smiling');
  void eveHead.offsetWidth; // force reflow

  // Stretch then smile
  eveHead.classList.add('is-stretching');
  setTimeout(() => {
    eveHead.classList.add('is-smiling');
  }, 250);

  // Show message
  msgEl.textContent = "tap the CLOSE button above to close.";
  if (actionsEl) actionsEl.innerHTML = '';
  speechBubble.classList.remove('alert-active');
  speechBubble.classList.add('show');

  // Auto-dismiss after 5s
  bubbleTimer = setTimeout(() => {
    dismiss();
    eveHead.classList.remove('is-stretching', 'is-smiling');
    // Restore inventory look if still open
    const overlay = document.getElementById("eve-inventory-overlay");
    if (overlay && !overlay.classList.contains("hidden")) {
      eveHead.classList.add('is-looking-inventory');
    }
  }, 5000);
}

  /* --- Ignition --- */
function initEve() {
  if (eveHead && speechBubble) {
    ambientBehavior();
    setTimeout(checkUrgent, 2500);
    // setTimeout(runIdleCycle, 10000);  // ← REMOVED: no more auto tips
  }
}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEve);
  } else {
    initEve();
  }
})();



/* ═══════════════════════════════════════════════════════════════
   EVE HEX INVENTORY LOGIC
   ═══════════════════════════════════════════════════════════════ */
let eveBlinkInterval = null;
let calcExpression = "";

function openEveInventory() {
  const overlay = document.getElementById("eve-inventory-overlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");

  // EVE looks toward lower-right where the hexes appear
  const head = document.getElementById("eveHead");
  if (head) head.classList.add("is-looking-inventory");

  // Continuous blink so she doesn't look like a statue
  eveBlinkInterval = setInterval(() => {
    document.querySelectorAll(".eve-eye").forEach(eye => {
      eye.classList.add("blink");
      setTimeout(() => eye.classList.remove("blink"), 140);
    });
  }, 2200);

  openEveGuide(); // default view
}


function _hideAllInventoryViews() {
  const ids = ['eve-calc-view','eve-guide-view','eve-summary-view','eve-logs-view','eve-notes-view','notes-plus-btn'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

function openEveCalc() {
  _hideAllInventoryViews();
  document.getElementById("eve-calc-view").classList.remove("hidden");

  const head = document.getElementById("eveHead");
  if (head) {
    head.classList.remove('is-stretching', 'is-smiling');
    head.classList.add('is-looking-inventory');
  }
}

function openEveGuide() {
  _hideAllInventoryViews();
  document.getElementById("eve-guide-view").classList.remove("hidden");

  const head = document.getElementById("eveHead");
  if (head) {
    head.classList.remove('is-stretching', 'is-smiling');
    head.classList.add('is-looking-inventory');
  }
  renderEveGuide();
}

function openEveSummary() {
  _hideAllInventoryViews();
  document.getElementById("eve-summary-view").classList.remove("hidden");

  const head = document.getElementById("eveHead");
  if (head) {
    head.classList.remove('is-stretching', 'is-smiling');
    head.classList.add('is-looking-inventory');
  }
  renderEveSummary();
}

function closeEveInventory() {
  const overlay = document.getElementById("eve-inventory-overlay");
  if (overlay) overlay.classList.add("hidden");

  const head = document.getElementById("eveHead");
  if (head) head.classList.remove("is-looking-inventory");

  if (eveBlinkInterval) {
    clearInterval(eveBlinkInterval);
    eveBlinkInterval = null;
  }
  // Hide all inner views so it's fresh next time
  _hideAllInventoryViews();
}
function renderEveGuide() {
  const box = document.getElementById("eve-guide-view");
  const mode = (typeof isOrg === 'function' && isOrg()) ? "org" : "class";

  const orgHTML = `
    <div style="width:100%;">

      <div class="eve-guide-section">
        <h4>➕ Add Tab</h4>
        <p><b>Add Collection Category</b> — Enter a collection name (e.g. "Newsette Fee") and the default amount every year level must pay. Tap <b>Add Collection</b> to create the bucket. This does not enroll year levels yet; it only creates the category.</p>
        <p><b>Record A Payment</b> — Use the searchable dropdowns to pick an existing <b>Collection</b> and a <b>Year Level</b> from your permanent database. Set the <b>Payment Date</b>, add an optional <b>Note</b>, enter the <b>Amount Paying Now</b>, then tap <b>Record Payment</b>. The Year Level is auto-enrolled into that collection if they weren't already, and the payment instantly syncs to your <b>Cash Book</b> as income.</p>
        <p class="note" style="margin-top:6px;">💡 Year Levels must be added permanently in the <b>Year Level</b> tab before they appear in these dropdowns.</p>
      </div>

      <div class="eve-guide-section">
        <h4>🎓 Year Level Tab</h4>
        <p><b>Add Program & Year Level (Permanent)</b> — Type the name (e.g. "BSIT 2") and optionally enter the <b>Number of Students</b> in that year level, then tap <b>Add Year Level</b>. This adds the entry to the master database so they can be selected across all collections and the Cash Book.</p>
        <p><b>Student Database</b> — A searchable list of every year level you have added. The count badge shows how many exist. If a year level has a student count set, it appears right next to its name, e.g. <b>"BSIT 2 (67 students)"</b> — handy for seeing enrollment size at a glance. Tap any card to open their <b>Profile</b>.</p>
        <p><b>Student Profile</b> — Shows a summary grid (Total Due, Total Paid, Overall Balance) and a <b>Breakdown By Collection</b> listing every collection that year level belongs to, their paid/due amounts, and status: <span style="color:var(--success)">PAID</span>, <span style="color:var(--warning)">PARTIAL</span>, <span style="color:var(--danger)">UNPAID</span>, or <span style="color:var(--info)">OVERPAID</span>.</p>
        <p><b>Number of Students</b> — At the top of the Profile, edit the <b>Number of Students in this Year Level</b> field anytime and tap <b>Save</b> to add, update, or clear the headcount. This is separate from the payment records — it's just a reference figure to know how many students belong to that year level.</p>
        <p class="note" style="margin-top:6px;">💡 The student count field is only available in Organization mode, since Class mode tracks individual named students rather than year-level groups.</p>
      </div>

      <div class="eve-guide-section">
        <h4>📁 Records Tab</h4>
        <p><b>Collections A-Z</b> — All collection categories sorted alphabetically. Tap a letter in the right-side alpha index to jump instantly. Tap a collection card to open its detail view.</p>
        <p><b>Collection Detail</b> — Header shows the collection name. The toolbar has three actions:
          <br>• <b>+ Add All Year Level</b> — Bulk-enroll Year Level from the database who aren't in this collection yet.
          <br>• <b>Rename</b> — Change the collection name without losing data.
          <br>• <b>Export CSV</b> — Download a spreadsheet of all Year Level, dues, paid amounts, balances, and statuses.
        </p>
        <p><b>Item Summary</b> — Live totals: Collected, Expected, and Remaining Balance for the whole collection.</p>
        <p><b>Year Level Rows</b> — Tap any row to enter <b>Edit Mode</b>. Inside edit mode you can:
          <br>• Adjust <b>Amount Due</b> or <b>Total Paid</b> manually.
          <br>• Use <b>Quick Pay</b> (date + note + amount) to log a new installment without leaving the page.
          <br>• View <b>Payment History</b> — every past payment is listed. Tap <b>EDIT</b> to change date/amount/note, or <b>DEL</b> to remove it (Total Paid recalculates automatically).
          <br>• <b>SAVE</b> commits changes. <b>REMOVE FROM LIST</b> deletes the Year Level from this collection only (they stay in the database). <b>CANCEL</b> closes edit mode without saving.
        </p>
      </div>

      <div class="eve-guide-section">
        <h4>⚡ Quick Pay</h4>
        <p>Inside any collection's detail view, tap the <b>⚡ Quick Pay</b> button below the Collected/Expected/Balance summary to record the <b>same payment for multiple year levels at once</b> — handy when a whole batch pays the same amount on the same day (e.g. everyone paying the ₱50 Newsette Fee together).</p>
        <p>A full-screen picker opens showing every year level already enrolled in that collection, with their current balance. Use <b>Select All</b>, <b>Deselect All</b>, or the search box to narrow the list, then tap individual entries to check them.</p>
        <p>Set one <b>Date</b>, one <b>Amount</b>, and an optional <b>Note</b> — this same payment is applied to <b>every selected</b> year level. Tap <b>Record Payment</b> to confirm.</p>
        <p>Each selected year level gets its own payment history entry (so their individual Payment History still shows it correctly), and in Organization mode every payment is also logged to the <b>Cash Book</b> automatically, just like a normal payment.</p>
        <p class="note" style="margin-top:6px;">💡 Only year levels already added to that collection appear in the list. Use "Add All Year Level" first if someone is missing.</p>
      </div>

      <div class="eve-guide-section">
        <h4>💵 Cashbook Tab</h4>
        <p><b>Summary Cards</b> — Opening Balance, Total Income, Total Expenses, and Cash On Hand. These update live as you add transactions.</p>
        <p><b>Set Opening Balance</b> — Declare how much cash you started with so the running balance is accurate.</p>
        <p><b>Projects & Events</b> — Switch to the project tracker where you can budget and liquidate per-event finances separately from the general fund.</p>
        <p><b>Record Transaction</b> — Toggle between <b>Income</b> and <b>Expense</b>. Fields include:
          <br>• <b>Date</b> — transaction date.
          <br>• <b>OR / Voucher No.</b> — for audit trails (optional).
          <br>• <b>Category</b> — pre-set list (Membership Dues, Event Income, Supplies, Food, etc.).
          <br>• <b>Description</b> — what the transaction is for.
          <br>• <b>Amount</b> — numeric value.
          <br>• <b>Link to Project/Event</b> — optional; ties this entry to a project for liquidation reports.
          <br>• <b>Notes</b> — extra details.
          <br>Tap <b>Save Transaction</b> to log it. If you tapped a ledger row to edit, <b>Cancel Edit</b> and <b>Delete This Transaction</b> appear instead.
        </p>
        <p><b>Cash Book Ledger</b> — Chronological list with a running balance on every row. Use the <b>Search</b> and <b>Type Filter</b> (All / Income / Expense) to narrow results. Tap any row to load it back into the form for editing. <b>Export CSV</b> downloads the full ledger.</p>
        <p><b>Projects & Events view</b> — Add a project name and optional budget. The list shows Budget, Spent, Income Raised, and Remaining. Tap a project to see every linked transaction, or tap <b>X</b> to delete the project (linked transactions return to the general fund).</p>
      </div>

      <div class="eve-guide-section">
        <h4>⇄ Transfer Funds</h4>
        <p>Inside any collection's detail view, tap <b>⇄ Transfer</b> to move money from that collection into another. This is useful when you need to reallocate collected funds (e.g., moving leftover money from one project to another, or sending pooled contributions to a central remittance collection).</p>
        <p>Each transfer is logged with:
          <br>• <b>Date</b> — when the transfer happened.
          <br>• <b>From / To</b> — source and destination collections.
          <br>• <b>Amount</b> — how much was moved.
          <br>• <b>Note</b> — optional reason (e.g., "Remittance completion").
        </p>
        <p>The collection's <b>Net after transfers</b> is shown in the summary bar at the top of the detail view. A full transfer history also appears at the bottom of every collection, showing every incoming and outgoing movement with +/− indicators and full dates.</p>
        <p class="note" style="margin-top:6px;">💡 You cannot transfer more than the net available balance (total paid in minus previous transfers out plus transfers in). Transfers are permanent and reflected instantly across both collections.</p>
      </div>

      <div class="eve-guide-section">
        <h4>⇄ Transfer Funds</h4>
        <p>Inside any collection's detail view, tap <b>⇄ Transfer</b> to move collected money from that collection into another. This is helpful when reallocating class funds between different fee categories (e.g., moving excess field-trip money into the graduation fund).</p>
        <p>Every transfer records:
          <br>• <b>Date</b> — when the transfer occurred.
          <br>• <b>From / To</b> — the source and destination collections.
          <br>• <b>Amount</b> — the exact sum moved.
          <br>• <b>Note</b> — optional explanation.
        </p>
        <p>A complete transaction log appears at the bottom of each collection view, listing all incoming (+) and outgoing (−) transfers with full dates and notes.</p>
        <p class="note" style="margin-top:6px;">💡 Transfers are limited to the collection's net available balance and are saved permanently in your backup.</p>
      </div>

      <div class="eve-guide-section">
        <h4>📊 Summary Tab</h4>
        <p><b>Overview Cards</b> — At-a-glance stats: Total Year Levels, Collection Categories, Total Collected, Total Unpaid Balances, Cash Book Balance, and Active Projects.</p>
        <p><b>Collections Breakdown</b> — Visual progress bars showing collection completion (paid vs. expected).</p>
        <p><b>Organization Info</b> — Fill in Organization Name, Treasurer Name, President / Adviser Name, and School Year. Tap <b>Save</b>. These names auto-fill the printed Financial Statement.</p>
        <p><b>Financial Statement</b> — Pick a <b>Start Date</b> and <b>End Date</b>, then tap <b>Generate Statement</b>. It produces a <b>Statement of Receipts and Disbursements</b> with Beginning Balance, categorized Receipts, Total Receipts, categorized Disbursements, Total Disbursements, Ending Balance, and signature lines. You can <b>Export as Text</b> or <b>Export as Image</b> for printing or submission.</p>
        <p><b>Backup & Restore</b> — <b>Export Backup (JSON)</b> saves all data to a file. <b>Import Backup</b> replaces all current data (use with caution). The status line warns you if your last backup is old. <b>Reset All Data</b> permanently erases everything after double confirmation.</p>
      </div>

    </div>
  `;

  const classHTML = `
    <div style="max-width:640px; margin:0 auto;">

      <div class="eve-guide-section">
        <h4>➕ Add Tab</h4>
        <p><b>Add Collection Category</b> — Enter a collection name (e.g. "Field Trip Fee") and the default amount due per student. Tap <b>Add Collection</b> to create the category bucket.</p>
        <p><b>Record A Payment</b> — Select a <b>Collection</b> and a <b>Student</b> from the searchable dropdowns. Set the <b>Payment Date</b>, add an optional <b>Note</b>, enter the <b>Amount Paying Now</b>, then tap <b>Record Payment</b>. The student is auto-enrolled in that collection if they weren't already, and the payment is recorded in the class ledger.</p>
        <p class="note" style="margin-top:6px;">💡 Students must be added permanently in the <b>Students</b> tab before they appear in these dropdowns.</p>
      </div>

      <div class="eve-guide-section">
        <h4>🎓 Students Tab</h4>
        <p><b>Add Student (Permanent)</b> — Type the student's full name (e.g. "Juan Dela Cruz") and tap <b>Add Student</b>. This adds them to the master roster so they can be selected in collections and the Class Fund.</p>
        <p><b>Student Database</b> — Searchable list of all students. The count badge shows total enrolled. Tap any card to open their <b>Profile</b>.</p>
        <p><b>Student Profile</b> — Displays a summary grid (Total Due, Total Paid, Overall Balance) and a breakdown of every collection that student is part of, showing paid/due amounts and status: <span style="color:var(--success)">PAID</span>, <span style="color:var(--warning)">PARTIAL</span>, <span style="color:var(--danger)">UNPAID</span>, or <span style="color:var(--info)">OVERPAID</span>.</p>
      </div>

      <div class="eve-guide-section">
        <h4>📁 Records Tab</h4>
        <p><b>Collections A-Z</b> — All class collections sorted alphabetically. Use the right-side letter index to jump quickly. Tap a collection to manage it.</p>
        <p><b>Collection Detail</b> — Shows the collection name and three toolbar actions:
          <br>• <b>+ Add All Students</b> — Bulk-enroll every student in the database who isn't already in this collection.
          <br>• <b>Rename</b> — Change the collection name while keeping all records.
          <br>• <b>Export CSV</b> — Download a report of all students, dues, paid amounts, balances, and payment statuses.
        </p>
        <p><b>Item Summary</b> — Live totals for the entire collection: Collected, Expected, and Balance.</p>
        <p><b>Student Rows</b> — Tap any student to enter <b>Edit Mode</b>:
          <br>• Adjust <b>Amount Due</b> or <b>Total Paid</b> directly.
          <br>• <b>Quick Pay</b> lets you log a new installment (date, note, amount) without leaving the page.
          <br>• <b>Payment History</b> lists every installment. Tap <b>EDIT</b> to modify, or <b>DEL</b> to delete (Total Paid recalculates automatically).
          <br>• <b>SAVE</b> commits your changes. <b>REMOVE FROM LIST</b> removes the student from this collection only (they remain in the database). <b>CANCEL</b> exits without saving.
        </p>
      </div>

      <div class="eve-guide-section">
        <h4>⚡ Quick Pay</h4>
        <p>Inside any collection's detail view, tap the <b>⚡ Quick Pay</b> button below the Collected/Expected/Balance summary to record the <b>same payment for multiple students at once</b> — great for batches paying the same amount on the same day (e.g. everyone paying the ₱50 Field Trip Fee together).</p>
        <p>A full-screen picker opens showing every student already enrolled in that collection, with their current balance. Use <b>Select All</b>, <b>Deselect All</b>, or search to narrow the list, then tap students to check them.</p>
        <p>Set one <b>Date</b>, one <b>Amount</b>, and an optional <b>Note</b> — applied to <b>every selected</b> student. Tap <b>Record Payment</b> to confirm.</p>
        <p>Each selected student gets their own payment history entry, so their individual Payment History still shows the payment correctly.</p>
        <p class="note" style="margin-top:6px;">💡 Only students already added to that collection appear in the list. Use "Add All Students" first if someone is missing.</p>
      </div>

      <div class="eve-guide-section">
        <h4>💰 Class Fund Tab</h4>
        <p><b>Settings</b> — Enter the <b>Weekly Due</b> amount (e.g. ₱20) and the <b>Collection Start Date</b>, then tap <b>Save Settings</b>. The app calculates how many weeks have passed and how much each student should have paid.</p>
        <p><b>Summary Cards</b> — Total Collected, Total Expenses, Net Balance, and number of Enrolled students.</p>
        <p><b>Missed Payment Alert</b> — If any student is behind, a red banner shows the total missed weeks across the class and the total unpaid balance.</p>
        <p><b>Toolbar</b> — <b>+ Add All Students</b> enrolls the entire database into Class Fund. <b>Reset Class Fund</b> clears all payments, expenses, and enrollments. <b>Export Weekly CSV</b> generates a per-week payment status sheet.</p>
        <p><b>Record Expense</b> — Log what the class fund was spent on (supplies, printing, food, etc.). Enter date, description, amount, and an optional note. Expenses deduct from the Net Balance.</p>
        <p><b>Student Collections</b> — Each student appears as a card showing paid/expected, missed weeks, last payment date, and a status badge. Tap a card to expand it:
          <br>• A <b>progress bar</b> shows completion.
          <br>• <b>Payment inputs</b> (date, amount, note) let you record new weekly payments.
          <br>• <b>Payment History</b> appears below with EDIT and DEL actions.
          <br>• <b>Remove from Class Fund</b> deletes that student's tracking and history.
        </p>
        <p><b>Class Fund Ledger</b> — A complete running-balance log of all income (student payments) and expenses. Tap any transaction to open a full-screen editor where you can change the date, amount, description, and note, or delete the entry entirely.</p>
      </div>

      <div class="eve-guide-section">
        <h4>📊 Summary Tab</h4>
        <p><b>Overview Cards</b> — Total Students, Collection Categories, Total Collected, Total Unpaid Balances, Total Paid Students, and Expected.</p>
        <p><b>Collections Breakdown</b> — Visual progress bars for each collection showing how much has been collected versus the total expected.</p>
        <p><b>Backup & Restore</b> — <b>Export Backup (JSON)</b> saves your entire database to a file. <b>Import Backup</b> restores from a JSON file (replaces current data). The status line warns if your last backup is old. <b>Reset All Data</b> permanently wipes everything after double confirmation.</p>
        <p class="note" style="margin-top:6px;">💡 Class mode hides the Organization Info and Financial Statement sections because those are designed for org-wide GA/audit reporting.</p>
      </div>

    </div>
  `;

  box.innerHTML = (mode === "org") ? orgHTML : classHTML;
}

function renderEveSummary() {
  const box = document.getElementById("eve-summary-view");
  if (!box) return;

  const mode = (typeof isOrg === 'function' && isOrg()) ? "org" : "class";
  const cats = Object.keys(db.categories || {}).sort((a, b) => a.localeCompare(b));
  let totalDue = 0, totalPaid = 0;
  cats.forEach(cat => {
    const c = db.categories[cat];
    totalDue += c.records.reduce((s, r) => s + r.due, 0);
    totalPaid += c.records.reduce((s, r) => s + r.paid, 0);
  });

  let html = '<div style="width:100%;">';

  /* ═══════ SUMMARY SECTION ═══════ */
  html += `<div class="eve-guide-section" style="border-left:3px solid var(--accent);">`;
  html += `<h4 style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">`;
  html += `<span class="eve-summary-badge" style="background:var(--accent);">Summary</span> Overview</h4>`;
  html += `<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; margin-bottom:12px;">`;
  html += `<div class="eve-summary-card"><h4>Total ${esc(lbl("Year Levels"))}</h4><p>${db.students.length}</p></div>`;
  html += `<div class="eve-summary-card"><h4>Collections</h4><p>${cats.length}</p></div>`;
  html += `<div class="eve-summary-card"><h4>Total Collected</h4><p style="color:var(--success);">${peso(totalPaid)}</p></div>`;
  html += `<div class="eve-summary-card"><h4>Total Balance</h4><p style="color:var(--danger);">${peso(round2(totalDue - totalPaid))}</p></div>`;

  if (mode === "org" && typeof computeCashbookTotals === 'function') {
    const cb = computeCashbookTotals();
    html += `<div class="eve-summary-card"><h4>Cash Book Balance</h4><p style="color:${cb.cashOnHand < 0 ? 'var(--danger)' : '#E9F0EB'};">${peso(cb.cashOnHand)}</p></div>`;
    html += `<div class="eve-summary-card"><h4>Active Projects</h4><p>${db.projects.length}</p></div>`;
  } else if (mode === "class") {
    const cf = db.classFund || {};
    const totalExpected = round2(Object.keys(cf.records || {}).reduce((sum, name) => sum + getClassFundExpected(name), 0));
    const fullyPaidStudents = Object.entries(cf.records || {}).filter(([name, record]) => {
      const expected = getClassFundExpected(name);
      return expected > 0 && (record.paid || 0) >= expected;
    }).length;
    const partiallyPaidStudents = Object.entries(cf.records || {}).filter(([name, record]) => {
      const expected = getClassFundExpected(name);
      return (record.paid || 0) > 0 && (record.paid || 0) < expected;
    }).length;
    const unpaidStudents = Object.entries(cf.records || {}).filter(([name, record]) => {
      const expected = getClassFundExpected(name);
      return expected > 0 && (record.paid || 0) <= 0;
    }).length;
    html += `<div class="eve-summary-card"><h4>Fully Paid Students</h4><p style="color:var(--success);">${fullyPaidStudents}</p></div>`;
    html += `<div class="eve-summary-card"><h4>Partially Paid Students</h4><p style="color:var(--warning);">${partiallyPaidStudents}</p></div>`;
    html += `<div class="eve-summary-card"><h4>Unpaid Students</h4><p style="color:var(--danger);">${unpaidStudents}</p></div>`;
    html += `<div class="eve-summary-card"><h4>Expected</h4><p>${peso(totalExpected)}</p></div>`;
  }
  html += `</div></div>`;

  /* ═══════ CASHBOOK SECTION (Org only) ═══════ */
  if (mode === "org" && typeof computeCashbookTotals === 'function') {
    const cb = computeCashbookTotals();
    html += `<div class="eve-guide-section" style="border-left:3px solid var(--success);">`;
    html += `<h4 style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">`;
    html += `<span class="eve-summary-badge" style="background:var(--success);">Cashbook</span> Ledger</h4>`;
    html += `<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; margin-bottom:12px;">`;
    html += `<div class="eve-summary-card"><h4>Opening Balance</h4><p>${peso(cb.opening)}</p></div>`;
    html += `<div class="eve-summary-card"><h4>Total Income</h4><p style="color:var(--success);">${peso(cb.totalIncome)}</p></div>`;
    html += `<div class="eve-summary-card"><h4>Total Expenses</h4><p style="color:var(--danger);">${peso(cb.totalExpense)}</p></div>`;
    html += `<div class="eve-summary-card"><h4>Cash On Hand</h4><p style="color:${cb.cashOnHand < 0 ? 'var(--danger)' : '#E9F0EB'};">${peso(cb.cashOnHand)}</p></div>`;
    html += `</div>`;

    const recent = [...(db.cashbook.transactions || [])]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 5);
    if (recent.length) {
      html += `<p class="note" style="margin-bottom:8px; font-weight:600; color:#8FA096;">Recent Transactions</p>`;
      html += `<div style="display:flex; flex-direction:column; gap:6px;">`;
      recent.forEach(t => {
        const sign = t.type === "income" ? "+" : "−";
        const color = t.type === "income" ? "var(--success)" : "var(--danger)";
        html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:rgba(255,255,255,0.03); border:1px solid rgba(233,240,235,0.08); border-radius:var(--radius-sm); font-size:12px;">`;
        html += `<span style="font-weight:500; color:#E9F0EB;">${esc(t.description)} <span style="color:var(--muted); font-size:11px;">${esc(t.date)}</span></span>`;
        html += `<span style="color:${color}; font-weight:700; font-family:'IBM Plex Mono',monospace;">${sign}${peso(t.amount)}</span>`;
        html += `</div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  }

  /* ═══════ CLASS FUND SECTION (Class only) ═══════ */
  if (mode === "class") {
    const cf = db.classFund || {};
    const weekly = cf.weeklyDue || 0;
    const currentWeek = getExpectedWeeks(cf.startDate);
    const allNames = Object.keys(cf.records || {}).sort();
    let cfPaid = 0, cfExpected = 0, missed = 0;
    allNames.forEach(n => {
      cfPaid += cf.records[n].paid || 0;
      cfExpected += getClassFundExpected(n);
      missed += getMissedWeeks(n);
    });
    const cfExp = round2((cf.transactions || []).filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0));
    const net = round2(cfPaid - cfExp);

    html += `<div class="eve-guide-section" style="border-left:3px solid var(--warning);">`;
    html += `<h4 style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">`;
    html += `<span class="eve-summary-badge" style="background:var(--warning); color:#1F2A24;">Class Fund</span> Weekly Tracker</h4>`;
    html += `<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; margin-bottom:12px;">`;
    html += `<div class="eve-summary-card"><h4>Weekly Due</h4><p>${peso(weekly)}</p></div>`;
    html += `<div class="eve-summary-card"><h4>Current Week</h4><p>${cf.startDate ? 'Week ' + currentWeek : '—'}</p></div>`;
    html += `<div class="eve-summary-card"><h4>Total Collected</h4><p style="color:var(--success);">${peso(cfPaid)}</p></div>`;
    html += `<div class="eve-summary-card"><h4>Total Expenses</h4><p style="color:var(--danger);">${peso(cfExp)}</p></div>`;
    html += `<div class="eve-summary-card"><h4>Net Balance</h4><p style="color:${net < 0 ? 'var(--danger)' : '#E9F0EB'};">${peso(net)}</p></div>`;
    html += `<div class="eve-summary-card"><h4>Enrolled</h4><p>${allNames.length}</p></div>`;
    html += `</div>`;

    if (missed > 0) {
      html += `<div style="background:linear-gradient(135deg, rgba(179,66,59,0.12), rgba(184,135,47,0.06)); border:1.5px dashed var(--danger); border-radius:var(--radius); padding:10px; text-align:center; margin-bottom:12px;">`;
      html += `<p style="font-family:'IBM Plex Mono',monospace; font-size:16px; font-weight:700; color:var(--danger); margin:0;">${missed} total missed week(s)</p>`;
      html += `</div>`;
    }

    html += `</div>`;
  }

  /* ═══════ COLLECTIONS BREAKDOWN ═══════ */
  if (cats.length > 0) {
    html += `<div class="eve-guide-section" style="border-left:3px solid var(--accent-2);">`;
    html += `<h4 style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">`;
    html += `<span class="eve-summary-badge" style="background:var(--accent-2);">Collections</span> All Categories</h4>`;
    html += `<div style="display:flex; flex-direction:column; gap:8px;">`;
    cats.forEach(cat => {
      const c = db.categories[cat];
      const due = c.records.reduce((s, r) => s + r.due, 0);
      const paid = c.records.reduce((s, r) => s + r.paid, 0);
      const paidStudents = c.records.filter(r => r.paid >= r.due && r.due > 0).length;
      const partialStudents = c.records.filter(r => r.paid > 0 && r.paid < r.due).length;
      const unpaidStudents = c.records.filter(r => r.paid <= 0).length;
      const balance = round2(due - paid);
      const pct = due > 0 ? Math.min(100, (paid / due) * 100) : 0;
      const color = balance > 0 ? 'var(--danger)' : 'var(--success)';
      html += `<div style="padding:10px 12px; background:rgba(255,255,255,0.03); border:1px solid rgba(233,240,235,0.08); border-radius:var(--radius-sm);">`;
      html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">`;
      html += `<b style="font-size:13px; color:#E9F0EB;">${esc(cat)}</b>`;
      html += `<span style="font-family:'IBM Plex Mono',monospace; font-size:12px; font-weight:600; color:${color};">${peso(paid)} / ${peso(due)}</span>`;
      html += `</div>`;
      html += `<div class="progress-bar" style="height:6px; margin-bottom:4px; background:rgba(255,255,255,0.05);"><div class="progress-fill" style="width:${pct}%;"></div></div>`;
      html += `<div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted);">`;
      html += `<span class="collection-status-line"><span class="status-paid">PAID: ${paidStudents}</span><span class="status-partial">PARTIALLY PAID: ${partialStudents}</span><span class="status-unpaid">UNPAID: ${unpaidStudents}</span></span>`;
      html += `<span>Balance: ${peso(balance)}</span>`;
      html += `</div>`;
      html += `</div>`;
    });
    html += `</div></div>`;
  }

  /* ═══════ SYSTEM / BACKUP STATUS ═══════ */
  const lastBackup = localStorage.getItem("lastBackupTime");
  html += `<div class="eve-guide-section" style="border-left:3px solid var(--info);">`;
  html += `<h4 style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">`;
  html += `<span class="eve-summary-badge" style="background:var(--info);">System</span> Status</h4>`;
  if (!lastBackup) {
    html += `<p style="color:var(--danger); font-size:12px; font-weight:600; margin:0;">⚠ You have never backed up your data yet.</p>`;
  } else {
    const days = Math.floor((Date.now() - parseInt(lastBackup, 10)) / (1000 * 60 * 60 * 24));
    if (days <= 0) html += `<p style="color:var(--success); font-size:12px; font-weight:600; margin:0;">✓ Last backup: today</p>`;
    else if (days <= 7) html += `<p style="color:${days <= 3 ? 'var(--success)' : 'var(--warning)'}; font-size:12px; font-weight:600; margin:0;">Last backup: ${days} day(s) ago</p>`;
    else html += `<p style="color:var(--danger); font-size:12px; font-weight:600; margin:0;">⚠ Last backup: ${days} days ago — back up soon!</p>`;
  }
  html += `<p class="note" style="margin-top:6px; color:var(--muted);">Mode: <b style="color:#E9F0EB;">${mode === 'org' ? 'Organization Treasurer' : 'Class Treasurer'}</b></p>`;
  html += `</div>`;

  html += '</div>';
  box.innerHTML = html;
}

/* Calculator helpers */
function calcInput(v) {
  if (calcExpression === "0" && v !== ".") calcExpression = "";
  calcExpression += v;
  document.getElementById("calc-display").innerText = calcExpression || "0";
}
function calcClear() { calcExpression = ""; document.getElementById("calc-display").innerText = "0"; }
function calcBack() { calcExpression = calcExpression.slice(0, -1); document.getElementById("calc-display").innerText = calcExpression || "0"; }
function calcEqual() {
  try {
    const safe = calcExpression.replace(/[^0-9+\-*/.]/g, "");
    const res = Function('"use strict"; return (' + safe + ')')();
    calcExpression = String(Math.round((res + Number.EPSILON) * 100) / 100);
    document.getElementById("calc-display").innerText = calcExpression;
  } catch (e) { document.getElementById("calc-display").innerText = "Err"; }
}

/* ================= COLLECTION TRANSFERS ================= */
function openTransferModal() {
  const modal = document.getElementById("transfer-modal");
  const select = document.getElementById("transfer-to-select");
  document.getElementById("transfer-from-name").innerText = currentCategory;
  document.getElementById("transfer-amount").value = "";
  document.getElementById("transfer-date").value = new Date().toISOString().slice(0,10);
  document.getElementById("transfer-note").value = "";
  document.getElementById("transfer-error").innerText = "";

  const others = Object.keys(db.categories).filter(c => c !== currentCategory).sort();
  select.innerHTML = others.length
    ? others.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")
    : `<option disabled>No other collections</option>`;

  modal.classList.remove("hidden");
}

function closeTransferModal() {
  document.getElementById("transfer-modal").classList.add("hidden");
}

function confirmTransfer() {
  const to = document.getElementById("transfer-to-select").value;
  const amount = round2(parseFloat(document.getElementById("transfer-amount").value) || 0);
  const date = document.getElementById("transfer-date").value || new Date().toISOString().slice(0,10);
  const note = document.getElementById("transfer-note").value.trim();
  const err = document.getElementById("transfer-error");

  if (!to || !db.categories[to]) { err.innerText = "Pick a destination collection."; return; }
  if (amount <= 0) { err.innerText = "Enter a valid amount."; return; }

  const catObj = db.categories[currentCategory];
  const gross = catObj.records.reduce((s,r) => s + r.paid, 0);
  const out   = (db.transfers||[]).filter(t => t.from === currentCategory).reduce((s,t)=>s+t.amount,0);
  const inn   = (db.transfers||[]).filter(t => t.to   === currentCategory).reduce((s,t)=>s+t.amount,0);
  const net   = gross + inn - out;

  if (amount > net) { err.innerText = `Available after prior transfers is only ${peso(net)}.`; return; }

  db.transfers.push({
    id: Date.now()+"-"+Math.random().toString(36).slice(2,7),
    from: currentCategory, to, amount, date, note
  });
  saveData();
  closeTransferModal();
  renderItemList();
  renderCategories();
  eveAlert(`Transferred ${peso(amount)} to "${to}".`);
}

function deleteTransfer(id) {
  if (!confirm("Delete this transfer record? This restores the amount to both collections' available balance.")) return;
  db.transfers = (db.transfers || []).filter(t => String(t.id) !== String(id));
  saveData();

  // Refresh whichever view(s) are currently showing this data
  const itemView = document.getElementById('item-view');
  if (itemView && !itemView.classList.contains('hidden') && currentCategory) {
    renderItemList();
  }
  renderCategories();

  const logsView = document.getElementById('eve-logs-view');
  if (logsView && !logsView.classList.contains('hidden')) {
    renderEveLogs();
  }

  eveAlert("Transfer deleted.");
}

/* ================= EVE NOTEPAD ================= */
function openEveNotes() {
  _hideAllInventoryViews();
  const view = document.getElementById("eve-notes-view");
  if (view) view.classList.remove("hidden");
  const btn = document.getElementById("notes-plus-btn");
  if (btn) btn.classList.remove("hidden");
  
  renderNotesList();
  
  const head = document.getElementById("eveHead");
  if (head) {
    head.classList.remove('is-stretching', 'is-smiling');
    head.classList.add('is-looking-inventory');
  }
}

function openEveLogs() {
  _hideAllInventoryViews();
  const view = document.getElementById("eve-logs-view");
  if (view) view.classList.remove("hidden");

  const head = document.getElementById("eveHead");
  if (head) {
    head.classList.remove('is-stretching', 'is-smiling');
    head.classList.add('is-looking-inventory');
  }
  renderEveLogs();
}

function renderEveLogs() {
  const box = document.getElementById("eve-logs-view");
  if (!box) return;

  const txfers = (db.transfers || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  let html = '<div style="width:100%;">';

  // ═══ UNDO / REDO ═══
  html += `<div class="eve-guide-section" style="border-left:3px solid var(--warning); text-align:center;">`;
  html += `<h4 style="justify-content:center; display:flex; align-items:center; gap:8px; margin-bottom:12px;">`;
  html += `<span class="eve-summary-badge" style="background:var(--warning); color:#1F2A24;">History</span> Undo / Redo</h4>`;
  html += `<div style="display:flex; gap:12px; justify-content:center; margin-bottom:10px; flex-wrap:wrap;">`;
  html += `<button id="undo-btn-logs" onclick="performUndo()" ${undoStack.length === 0 ? 'disabled' : ''} style="width:auto; padding:10px 20px; opacity:${undoStack.length === 0 ? '0.4' : '1'};">↺ Undo (<span id="undo-count-logs">${undoStack.length}</span>)</button>`;
  html += `<button id="redo-btn-logs" onclick="performRedo()" ${redoStack.length === 0 ? 'disabled' : ''} style="width:auto; padding:10px 20px; background:var(--surface); color:var(--ink); border:1.5px solid var(--hairline); opacity:${redoStack.length === 0 ? '0.4' : '1'};">↻ Redo (<span id="redo-count-logs">${redoStack.length}</span>)</button>`;
  html += `</div>`;
  html += `<p class="note">Reverts or replays your most recent actions — payments, additions, deletions, transfers, and more. History resets when the app is reloaded.</p>`;
  html += `</div>`;

  // Header stats
  const totalTransferred = round2(txfers.reduce((s, t) => s + t.amount, 0));
  const uniqueCollections = new Set();
  txfers.forEach(t => { uniqueCollections.add(t.from); uniqueCollections.add(t.to); });

  html += `<div class="eve-guide-section" style="border-left:3px solid var(--accent-2);">`;
  html += `<h4 style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">`;
  html += `<span class="eve-summary-badge" style="background:var(--accent-2);">⇄ Transfers</span> Transaction Logs</h4>`;
  html += `<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:12px;">`;
  html += `<div class="eve-summary-card"><h4>Total Transfers</h4><p>${txfers.length}</p></div>`;
  html += `<div class="eve-summary-card"><h4>Total Amount Moved</h4><p style="color:var(--accent-2);">${peso(totalTransferred)}</p></div>`;
  html += `<div class="eve-summary-card"><h4>Collections Involved</h4><p>${uniqueCollections.size}</p></div>`;
  html += `</div></div>`;

  if (txfers.length === 0) {
    html += `<div class="eve-guide-section" style="text-align:center; padding:40px 20px; background:linear-gradient(135deg, #141c18, #1a2420); border:1px solid rgba(233,240,235,0.10);">`;
    html += `<p style="font-size:28px; margin-bottom:10px;">📭</p>`;
    html += `<p style="font-weight:600; color:var(--ink); margin-bottom:6px;">No transfers yet</p>`;
    html += `<p class="note">Transfer funds between collections from the Records tab and they will appear here automatically.</p>`;
    html += `</div>`;
  } else {
    html += `<div class="eve-guide-section" style="border-left:3px solid var(--accent);">`;
    html += `<h4 style="margin-bottom:12px; font-size:13px; color:var(--muted); text-transform:uppercase; letter-spacing:1px;">All Transfer Records</h4>`;
    html += `<div style="display:flex; flex-direction:column; gap:8px;">`;

    txfers.forEach(t => {
      html += `<div style="background:linear-gradient(135deg, #141c18, #1a2420); border:1px solid rgba(233,240,235,0.10); border-radius:var(--radius); padding:14px 16px; box-shadow:0 2px 8px rgba(0,0,0,0.35); transition:all 0.2s ease;">`;
      html += `<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; flex-wrap:wrap; gap:6px;">`;
      html += `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">`;
      html += `<span style="font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--muted); background:var(--surface-alt); padding:3px 8px; border-radius:6px; border:1px solid var(--hairline);">${esc(t.date)}</span>`;
      html += `</div>`;
      html += `<span style="font-family:'IBM Plex Mono',monospace; font-size:18px; font-weight:700; color:var(--accent-2);">${peso(t.amount)}</span>`;
      html += `</div>`;

      html += `<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:${t.note ? '6px' : '0'};">`;
      html += `<div style="display:flex; align-items:center; gap:6px; background:rgba(179,66,59,0.15); border:1px solid rgba(179,66,59,0.25); padding:5px 10px; border-radius:6px;">`;
      html += `<span style="font-size:10px; text-transform:uppercase; color:var(--danger); font-weight:700; letter-spacing:0.5px;">From</span>`;
      html += `<span style="font-weight:600; color:#e9f0eb; font-size:13px;">${esc(t.from)}</span>`;
      html += `</div>`;

      html += `<span style="color:var(--muted); font-size:14px;">→</span>`;

      html += `<div style="display:flex; align-items:center; gap:6px; background:rgba(47,125,83,0.15); border:1px solid rgba(47,125,83,0.25); padding:5px 10px; border-radius:6px;">`;
      html += `<span style="font-size:10px; text-transform:uppercase; color:var(--success); font-weight:700; letter-spacing:0.5px;">To</span>`;
      html += `<span style="font-weight:600; color:#e9f0eb; font-size:13px;">${esc(t.to)}</span>`;
      html += `</div>`;
      html += `</div>`;

     if (t.note) {
        html += `<p class="note" style="margin-top:4px; padding-top:6px; border-top:1px solid var(--hairline);">📝 ${esc(t.note)}</p>`;
      }
      html += `<div style="text-align:right; margin-top:8px;">`;
      html += `<button class="mini-btn mini-delete" data-action="delete-transfer-log" data-id="${esc(t.id)}">DEL</button>`;
      html += `</div>`;
      html += `</div>`;
    });

    html += `</div></div>`;
  }

  html += '</div>';
  box.innerHTML = html;

  box.querySelectorAll('[data-action="delete-transfer-log"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTransfer(btn.dataset.id);
    });
  });
}


let currentNoteId = null;

function renderNotesList() {
  document.getElementById("notes-folder-list").classList.remove("hidden");
  document.getElementById("notes-note-list").classList.add("hidden");
  document.getElementById("notes-editor").classList.add("hidden");
  currentNoteId = null;

  const box = document.getElementById("notes-folder-list");
  const np = db.notepad || { notes: [] };
  
  if (!np.notes || np.notes.length === 0) {
    box.innerHTML = `<p class="note" style="text-align:center; margin-top:40px;">No notes yet.<br>Tap the <b>+</b> button to create your first note.</p>`;
    return;
  }
  
  box.innerHTML = `<div style="display:flex; flex-direction:column; gap:10px;">` +
    np.notes
      .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))
      .map(n => `
        <div class="add-all-item" style="cursor:default;">
          <div style="flex:1; cursor:pointer;" onclick="openNoteEditor('${esc(n.id)}')">
            <span style="font-weight:600;">📝 ${esc(n.title || 'Untitled')}</span><br>
            <span class="note">${esc(n.updated || '')}</span>
          </div>
          <button class="del-btn" onclick="deleteNote('${esc(n.id)}')" style="margin-left:10px; width:auto; height:auto; padding:6px 12px;">Delete</button>
        </div>
      `).join('') + `</div>`;
}

function createNewNoteFlow() {
  const raw = prompt("Note title:", "New Note");
  if (raw === null) return;                 // Cancelled — do nothing
  const title = raw.trim();
  if (!title) return;                       // Empty title — do nothing
  
  if (!db.notepad) db.notepad = { notes: [] };
  const id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  db.notepad.notes.push({
    id,
    title,
    content: "",
    updated: new Date().toISOString().slice(0, 10)
  });
  saveData();
  renderNotesList();
  openNoteEditor(id);
}

function openNoteEditor(noteId) {
  const note = (db.notepad?.notes || []).find(n => n.id === noteId);
  if (!note) return;
  currentNoteId = noteId;
  
  document.getElementById("notes-folder-list").classList.add("hidden");
  document.getElementById("notes-note-list").classList.add("hidden");
  document.getElementById("notes-editor").classList.remove("hidden");
  document.getElementById("notes-plus-btn").classList.add("hidden");
  
  document.getElementById("note-editor-title").value = note.title || "";
  document.getElementById("note-editor-body").value = note.content || "";
}

function saveCurrentNote() {
  const note = (db.notepad?.notes || []).find(n => n.id === currentNoteId);
  if (!note) return;
  
  note.title = document.getElementById("note-editor-title").value.trim() || "Untitled";
  note.content = document.getElementById("note-editor-body").value;
  note.updated = new Date().toISOString().slice(0, 10);
  
  saveData();
  backToNoteList();
}

function backToNoteList() {
  document.getElementById("notes-editor").classList.add("hidden");
  document.getElementById("notes-folder-list").classList.remove("hidden");
  document.getElementById("notes-plus-btn").classList.remove("hidden");
  renderNotesList();
}

function deleteNote(noteId) {
  if (!confirm("Delete this note?")) return;
  if (!db.notepad || !db.notepad.notes) return;
  db.notepad.notes = db.notepad.notes.filter(n => n.id !== noteId);
  saveData();
  renderNotesList();
}