const titleInput = document.getElementById("note-title");
const bodyEl = document.getElementById("note-body");
const listEl = document.getElementById("note-list");
const searchInput = document.getElementById("search");
const statusEl = document.getElementById("status");
const noteCountEl = document.getElementById("note-count");
const toggleListBtn = document.getElementById("toggle-list");
const newNoteBtn = document.getElementById("new-note");
const sidebar = document.querySelector(".sidebar");
const root = document.documentElement;

const storageKey = "ares.notes.app";

const defaultNotes = [
  {
    id: crypto.randomUUID(),
    title: "Ideas for ARES UI",
    body: "- Keep the editor stable on mobile\n- Avoid layout jumps\n- Make lists easy to scroll",
    updatedAt: Date.now(),
  },
  {
    id: crypto.randomUUID(),
    title: "Reading list",
    body: "Barty Beauregard chapter summaries and relation notes.",
    updatedAt: Date.now() - 1000 * 60 * 60,
  },
];

let notes = loadNotes();
let activeId = notes[0]?.id;
let isSidebarOpen = false;

function loadNotes() {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) return JSON.parse(stored);
  } catch (error) {
    console.warn("Unable to load notes", error);
  }
  return defaultNotes;
}

function persist() {
  localStorage.setItem(storageKey, JSON.stringify(notes));
}

function setStatus(text) {
  statusEl.textContent = text;
  statusEl.classList.add("flash");
  setTimeout(() => statusEl.classList.remove("flash"), 250);
}

function selectNote(id) {
  activeId = id;
  const note = notes.find((n) => n.id === id);
  if (!note) return;
  titleInput.value = note.title;
  bodyEl.innerText = note.body;
  renderList();
  setStatus("Saved locally");
  closeSidebar();
  focusBody();
}

function renderList(filterText = "") {
  listEl.innerHTML = "";
  const filtered = notes.filter((note) => {
    if (!filterText) return true;
    const query = filterText.toLowerCase();
    return (
      note.title.toLowerCase().includes(query) ||
      note.body.toLowerCase().includes(query)
    );
  });
  noteCountEl.textContent = `${filtered.length} note${
    filtered.length === 1 ? "" : "s"
  }`;

  filtered
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((note) => {
      const card = document.createElement("button");
      card.className = `note-card ${note.id === activeId ? "active" : ""}`;
      card.setAttribute("role", "listitem");
      card.innerHTML = `
        <div class="title">${note.title || "Untitled"}</div>
        <div class="preview">${note.body.slice(0, 140)}</div>
      `;
      card.addEventListener("click", () => selectNote(note.id));
      listEl.appendChild(card);
    });
}

function saveActiveNote() {
  const idx = notes.findIndex((n) => n.id === activeId);
  if (idx === -1) return;
  notes[idx] = {
    ...notes[idx],
    title: titleInput.value.trim(),
    body: bodyEl.innerText,
    updatedAt: Date.now(),
  };
  persist();
  setStatus("Saved locally");
  renderList(searchInput.value.trim());
}

function createNote() {
  const id = crypto.randomUUID();
  const newNote = {
    id,
    title: "New Note",
    body: "",
    updatedAt: Date.now(),
  };
  notes = [newNote, ...notes];
  persist();
  renderList(searchInput.value.trim());
  selectNote(id);
}

function ensureCaretVisible() {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const containerRect = bodyEl.getBoundingClientRect();
  const offset = 16;
  if (rect.bottom > containerRect.bottom - offset) {
    bodyEl.scrollTop += rect.bottom - containerRect.bottom + offset;
  } else if (rect.top < containerRect.top + offset) {
    bodyEl.scrollTop -= containerRect.top - rect.top + offset;
  }
}

function updateViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  root.style.setProperty("--vvh", `${height}px`);
}

function openSidebar() {
  isSidebarOpen = true;
  sidebar.classList.add("open");
  toggleListBtn.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  isSidebarOpen = false;
  sidebar.classList.remove("open");
  toggleListBtn.setAttribute("aria-expanded", "false");
}

function toggleSidebar() {
  if (window.innerWidth >= 768) return;
  if (isSidebarOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

function focusBody() {
  bodyEl.focus({ preventScroll: true });
  ensureCaretVisible();
}

function debounce(fn, delay = 180) {
  let handle;
  return (...args) => {
    clearTimeout(handle);
    handle = setTimeout(() => fn(...args), delay);
  };
}

function init() {
  renderList();
  if (notes.length) selectNote(activeId);

  titleInput.addEventListener("input", debounce(saveActiveNote, 60));
  bodyEl.addEventListener("input", debounce(() => {
    saveActiveNote();
    ensureCaretVisible();
  }, 80));

  bodyEl.addEventListener("keyup", ensureCaretVisible);
  bodyEl.addEventListener("click", ensureCaretVisible);
  bodyEl.addEventListener("focus", ensureCaretVisible);

  searchInput.addEventListener("input", (event) => {
    renderList(event.target.value.trim());
  });

  toggleListBtn.addEventListener("click", toggleSidebar);
  newNoteBtn.addEventListener("click", () => {
    createNote();
    openSidebar();
  });

  window.addEventListener("resize", updateViewportHeight);
  window.visualViewport?.addEventListener("resize", updateViewportHeight);
  updateViewportHeight();

  document.addEventListener("keydown", (event) => {
    if (event.metaKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
    }
  });
}

init();
