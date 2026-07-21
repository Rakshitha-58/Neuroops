/* NeuroOps frontend - vanilla JS client.
   Connects to the Flask backend via REST + Socket.IO. */

const API_BASE = window.location.origin + "/api";
let socket = null;
let eventCount = 0;

/* ---------- Helpers ---------- */
async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

function el(id) { return document.getElementById(id); }

function logEvent(tag, message) {
  const log = el("event-log");
  const time = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  line.className = "event-line";
  line.innerHTML = `<span class="event-time">${time}</span>` +
                   `<span class="event-tag ${tag}">[${tag}]</span>` +
                   `<span class="event-msg"></span>`;
  line.querySelector(".event-msg").textContent = message;
  log.prepend(line);
  eventCount++;
  el("stat-events").textContent = eventCount;
  while (log.children.length > 100) log.removeChild(log.lastChild);
}

/* ---------- Stats ---------- */
async function refreshStats() {
  try {
    const s = await api("/stats");
    el("stat-agents").textContent = s.agents;
    el("stat-tasks").textContent = s.tasks;
    el("stat-schedules").textContent = s.schedules;
    setApiStatus("online");
  } catch (e) {
    setApiStatus("offline");
    logEvent("disconnect", `API error: ${e.message}`);
  }
}

function setApiStatus(state) {
  const pill = el("api-status");
  pill.className = "pill " + (state === "online" ? "pill-online" : state === "offline" ? "pill-offline" : "pill-checking");
  pill.textContent = "API: " + (state === "online" ? "Online" : state === "offline" ? "Offline" : "Checking");
}

function setWsStatus(connected) {
  const pill = el("ws-status");
  pill.className = "pill " + (connected ? "pill-online" : "pill-offline");
  pill.textContent = "Socket: " + (connected ? "Connected" : "Disconnected");
}

/* ---------- Agents ---------- */
async function refreshAgents() {
  try {
    const agents = await api("/agents");
    const list = el("agent-list");
    if (!agents.length) { list.innerHTML = '<p class="empty">No agents registered.</p>'; return; }
    list.innerHTML = "";
    agents.forEach((a) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<div class="row">
          <span class="title">${escapeHtml(a.name)}</span>
          <span class="badge badge-${a.status}">${a.status}</span>
        </div>
        <div class="meta">${escapeHtml(a.role)} · #${a.id} · hb ${a.last_heartbeat || "never"}</div>`;
      list.appendChild(card);
    });
  } catch (e) { logEvent("agent", `Failed to load agents: ${e.message}`); }
}

el("agent-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api("/agents", {
      method: "POST",
      body: JSON.stringify({ name: fd.get("name"), role: fd.get("role") }),
    });
    e.target.reset();
    refreshAgents();
    refreshStats();
    logEvent("agent", "Registered new agent");
  } catch (err) { logEvent("agent", `Register failed: ${err.message}`); }
});

el("btn-refresh-agents").addEventListener("click", refreshAgents);

/* ---------- Tasks ---------- */
async function refreshTasks() {
  try {
    const tasks = await api("/tasks");
    const list = el("task-list");
    if (!tasks.length) { list.innerHTML = '<p class="empty">No tasks yet.</p>'; return; }
    list.innerHTML = "";
    tasks.forEach((t) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<div class="row">
          <span class="title">${escapeHtml(t.title)}</span>
          <span class="badge badge-${t.status}">${t.status}</span>
        </div>
        <div class="meta">#${t.id} · ${t.priority} · ${t.created_at || ""}</div>`;
      list.appendChild(card);
    });
  } catch (e) { logEvent("task", `Failed to load tasks: ${e.message}`); }
}

el("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api("/tasks", {
      method: "POST",
      body: JSON.stringify({ title: fd.get("title"), priority: fd.get("priority") }),
    });
    e.target.reset();
    refreshTasks();
    refreshStats();
    logEvent("task", "Created new task");
  } catch (err) { logEvent("task", `Create failed: ${err.message}`); }
});

el("btn-refresh-tasks").addEventListener("click", refreshTasks);

/* ---------- Socket.IO ---------- */
function connectSocket() {
  socket = io({ transports: ["websocket", "polling"] });

  socket.on("connect", () => {
    setWsStatus(true);
    logEvent("connect", "Socket.IO connected");
  });

  socket.on("disconnect", () => {
    setWsStatus(false);
    logEvent("disconnect", "Socket.IO disconnected");
  });

  socket.on("server:hello", (data) => logEvent("connect", `Hello: ${data.message}`));
  socket.on("server:pong", (data) => logEvent("connect", `Pong: ${JSON.stringify(data)}`));
  socket.on("scheduler:fired", (data) => {
    logEvent("scheduler", `Fired '${data.schedule.name}' -> task #${data.task.id}`);
    refreshTasks();
    refreshStats();
  });

  setInterval(() => {
    if (socket && socket.connected) socket.emit("client:ping", { t: Date.now() });
  }, 15000);
}

/* ---------- Utils ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

el("btn-clear-log").addEventListener("click", () => {
  el("event-log").innerHTML = "";
  eventCount = 0;
  el("stat-events").textContent = "0";
});

function tickClock() {
  el("clock").textContent = new Date().toISOString().slice(11, 19) + " UTC";
}

/* ---------- Boot ---------- */
window.addEventListener("DOMContentLoaded", () => {
  connectSocket();
  refreshStats();
  refreshAgents();
  refreshTasks();
  setInterval(refreshStats, 10000);
  setInterval(tickClock, 1000);
  tickClock();
  logEvent("connect", "NeuroOps client started");
});
