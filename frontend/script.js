/* NeuroOps Phase 2 frontend - vanilla JS + Three.js.
   Connects to Flask backend via REST + Socket.IO for real-time
   multi-agent workflow visualization. */

const API = window.location.origin + "/api";
let socket = null;
let eventCount = 0;
let threeScene = null;

/* =========================================================== Helpers */
function el(id) { return document.getElementById(id); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
async function api(path, opts = {}) {
  const r = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.status === 204 ? null : r.json();
}

/* =========================================================== Three.js viz */
function initThree() {
  const container = el("three-canvas");
  const w = container.clientWidth, h = container.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050810);
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
  camera.position.set(0, 0, 30);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // Lights
  scene.add(new THREE.AmbientLight(0x404060, 1.5));
  const dl = new THREE.DirectionalLight(0x3b82f6, 1);
  dl.position.set(10, 10, 10);
  scene.add(dl);

  // Central CEO node
  const ceoGeo = new THREE.SphereGeometry(2.5, 32, 32);
  const ceoMat = new THREE.MeshPhongMaterial({ color: 0x3b82f6, emissive: 0x1a3a8a, shininess: 80 });
  const ceoNode = new THREE.Mesh(ceoGeo, ceoMat);
  scene.add(ceoNode);

  // Agent nodes orbiting the CEO
  const agentNodes = {};
  const agentCount = 11;
  for (let i = 0; i < agentCount; i++) {
    const angle = (i / agentCount) * Math.PI * 2;
    const radius = 12;
    const geo = new THREE.SphereGeometry(1.2, 20, 20);
    const mat = new THREE.MeshPhongMaterial({ color: 0x2a3a5a, emissive: 0x0a1020, shininess: 40 });
    const node = new THREE.Mesh(geo, mat);
    node.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.6, 0);
    scene.add(node);

    // Connection line CEO -> agent
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), node.position]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x1a2540, transparent: true, opacity: 0.4 });
    scene.add(new THREE.Line(lineGeo, lineMat));

    agentNodes[i] = { mesh: node, angle, baseColor: 0x2a3a5a };
  }

  threeScene = { scene, camera, renderer, ceoNode, agentNodes, container };
  animateThree();
  window.addEventListener("resize", resizeThree);
}

function resizeThree() {
  if (!threeScene) return;
  const { container, camera, renderer } = threeScene;
  const w = container.clientWidth, h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

let frame = 0;
function animateThree() {
  requestAnimationFrame(animateThree);
  if (!threeScene) return;
  frame += 0.005;
  threeScene.ceoNode.rotation.y += 0.008;
  threeScene.ceoNode.scale.setScalar(1 + Math.sin(frame * 2) * 0.05);

  Object.values(threeScene.agentNodes).forEach((a, i) => {
    a.angle += 0.003;
    const radius = 12;
    a.mesh.position.x = Math.cos(a.angle) * radius;
    a.mesh.position.y = Math.sin(a.angle) * radius * 0.6;
    a.mesh.rotation.y += 0.01;
  });

  threeScene.renderer.render(threeScene.scene, threeScene.camera);
}

const STATE_COLORS = {
  sleeping: 0x2a3a5a, thinking: 0x06b6d4, working: 0xf59e0b,
  completed: 0x10b981, waiting_approval: 0x8b5cf6, failed: 0xef4444,
};
const STATE_EMISSIVE = {
  sleeping: 0x0a1020, thinking: 0x044a5a, working: 0x5a3a04,
  completed: 0x055a3a, waiting_approval: 0x3a2055, failed: 0x5a1010,
};

function updateAgentViz(agentIndex, state) {
  if (!threeScene || !threeScene.agentNodes[agentIndex]) return;
  const node = threeScene.agentNodes[agentIndex].mesh;
  const color = STATE_COLORS[state] || 0x2a3a5a;
  const emissive = STATE_EMISSIVE[state] || 0x0a1020;
  node.material.color.setHex(color);
  node.material.emissive.setHex(emissive);
  if (state === "working" || state === "thinking") {
    node.scale.setScalar(1.3 + Math.sin(frame * 4 + agentIndex) * 0.15);
  } else if (state === "completed") {
    node.scale.setScalar(1.1);
  } else {
    node.scale.setScalar(1.0);
  }
}

/* Map agent_type -> viz index */
const AGENT_VIZ_INDEX = {
  code_writer: 0, debugger: 1, reviewer: 2, documentation: 3,
  ui_suggestion: 4, wireframe: 5, document_search: 6, summarizer: 7,
  task_planner: 8, notification: 9, memory: 10,
};

/* =========================================================== Event log */
function logEvent(event) {
  const log = el("event-log");
  const time = new Date(event.timestamp).toLocaleTimeString();
  const line = document.createElement("div");
  line.className = "event-line";
  const srcClass = "event-src-" + (event.source || "").replace(/[^A-Za-z]/g, "");
  line.innerHTML = `<span class="event-time">${time}</span>` +
                   `<span class="event-src ${srcClass}">${escapeHtml(event.source || "")}</span>` +
                   `<span class="event-msg"></span>`;
  line.querySelector(".event-msg").textContent = event.message || "";
  log.prepend(line);
  eventCount++;
  el("stat-events").textContent = eventCount;
  while (log.children.length > 120) log.removeChild(log.lastChild);
}

/* =========================================================== Agent grid */
function renderAgentGrid(states, registry) {
  const grid = el("agent-grid");
  if (!registry || !registry.length) { grid.innerHTML = '<p class="empty">No agents in registry.</p>'; return; }
  grid.innerHTML = "";
  registry.forEach(agent => {
    const state = states[agent.agent_type] || "sleeping";
    const card = document.createElement("div");
    card.className = "agent-card";
    card.id = `agent-card-${agent.agent_type}`;
    card.innerHTML = `<div class="name"><span class="agent-dot dot-${state}"></span>${escapeHtml(agent.name)}</div>` +
                     `<div class="dept">${escapeHtml(agent.department)}</div>`;
    grid.appendChild(card);
  });
}

function updateAgentCard(agentType, state) {
  const card = el(`agent-card-${agentType}`);
  if (!card) return;
  const dot = card.querySelector(".agent-dot");
  if (dot) dot.className = `agent-dot dot-${state}`;
}

/* =========================================================== Task pipeline */
function renderTasks(tasks) {
  const pipe = el("task-pipeline");
  if (!tasks.length) { pipe.innerHTML = '<p class="empty">Submit a request to see the task DAG.</p>'; return; }
  pipe.innerHTML = "";
  tasks.forEach(t => {
    const card = document.createElement("div");
    card.className = "task-card";
    card.id = `task-${t.task_id}`;
    const badgeClass = `tbadge-${t.status}`;
    card.innerHTML = `<span class="tid">${escapeHtml(t.task_id)}</span>` +
                     `<span class="ttitle">${escapeHtml(t.title)}</span>` +
                     `<span class="task-badge ${badgeClass}">${t.status}</span>`;
    pipe.appendChild(card);
  });
  el("stat-tasks").textContent = tasks.length;
}

function updateTaskCard(taskId, status) {
  const card = el(`task-${taskId}`);
  if (!card) return;
  const badge = card.querySelector(".task-badge");
  if (badge) { badge.className = `task-badge tbadge-${status}`; badge.textContent = status; }
}

/* =========================================================== Stats / session */
async function refreshStats() {
  try {
    const [session, agents] = await Promise.all([api("/workflow/session"), api("/workflow/agents")]);
    el("stat-tasks").textContent = session.session.task_count;
    el("stat-agents").textContent = Object.values(agents.states).filter(s => s !== "sleeping").length;
    el("stat-memory").textContent = session.memory_summaries.length;
    el("stat-events").textContent = session.session.event_count || eventCount;

    const ws = session.session.workflow_status;
    const pill = el("workflow-status");
    pill.className = "pill pill-" + ws;
    pill.textContent = "Workflow: " + ws.charAt(0).toUpperCase() + ws.slice(1);

    if (session.session.final_response) {
      renderReport(session.session.final_response);
    }
  } catch (e) { /* ignore */ }
}

async function loadInitial() {
  try {
    const [tasks, agents, timeline, registry] = await Promise.all([
      api("/workflow/tasks"), api("/workflow/agents"), api("/workflow/timeline"), api("/workflow/registry"),
    ]);
    renderTasks(tasks);
    renderAgentGrid(agents.states, registry);
    timeline.slice(-30).reverse().forEach(logEvent);
    eventCount = timeline.length;
    el("stat-events").textContent = eventCount;
  } catch (e) { console.error("load failed", e); }
}

/* =========================================================== Report */
function renderReport(markdown) {
  el("report-status").textContent = "Complete";
  el("report-status").style.color = "var(--success)";
  el("final-report").innerHTML = renderMarkdown(markdown);
}

function renderMarkdown(md) {
  let html = escapeHtml(md);
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n\n/g, '<br><br>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

/* =========================================================== Socket.IO */
function connectSocket() {
  socket = io({ transports: ["websocket", "polling"] });

  socket.on("connect", () => {
    el("ws-status").className = "pill pill-online";
    el("ws-status").textContent = "Socket: Connected";
  });

  socket.on("disconnect", () => {
    el("ws-status").className = "pill pill-offline";
    el("ws-status").textContent = "Socket: Disconnected";
  });

  socket.on("neuroops:event", (event) => {
    logEvent(event);
    handleEvent(event);
  });
}

function handleEvent(event) {
  const d = event.data || {};
  // Agent state changes
  if (event.event_type && event.event_type.startsWith("agent:")) {
    if (d.agent_id && d.new_state) {
      updateAgentCard(d.agent_type || mapAgentType(d.agent_id), d.new_state);
      const vizIdx = AGENT_VIZ_INDEX[d.agent_type || mapAgentType(d.agent_id)];
      if (vizIdx !== undefined) updateAgentViz(vizIdx, d.new_state);
    }
  }
  // Task updates
  if (event.event_type === "task:created" && d.task_id) {
    api("/workflow/tasks").then(renderTasks).catch(() => {});
  }
  if (event.event_type === "task:finished" && d.task_id) {
    updateTaskCard(d.task_id, "completed");
  }
  if (event.event_type === "task:failed" && d.task_id) {
    updateTaskCard(d.task_id, "failed");
  }
  // Workflow status
  if (event.event_type === "workflow:completed" || event.event_type === "workflow:failed") {
    refreshStats();
  }
}

function mapAgentType(agentId) {
  const map = { CodeWriter: "code_writer", Debugger: "debugger", Reviewer: "reviewer",
    Documentation: "documentation", UISuggestion: "ui_suggestion", Wireframe: "wireframe",
    DocumentSearch: "document_search", Summarizer: "summarizer", TaskPlanner: "task_planner",
    Notification: "notification", Memory: "memory" };
  for (const [k, v] of Object.entries(map)) if (agentId.startsWith(k)) return v;
  return null;
}

/* =========================================================== Actions */
el("request-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = el("request-input");
  const req = input.value.trim();
  if (!req) return;
  el("submit-btn").disabled = true;
  el("submit-btn").textContent = "Running...";
  el("report-status").textContent = "Running";
  el("report-status").style.color = "var(--warning)";
  el("final-report").innerHTML = '<p class="empty">Workflow in progress... watch the event stream.</p>';
  try {
    await api("/workflow/submit", { method: "POST", body: JSON.stringify({ request: req }) });
    input.value = "";
  } catch (err) {
    logEvent({ timestamp: new Date().toISOString(), source: "API", message: "Submit failed: " + err.message });
  } finally {
    setTimeout(() => {
      el("submit-btn").disabled = false;
      el("submit-btn").textContent = "Deploy Workforce";
    }, 2000);
  }
});

el("reset-btn").addEventListener("click", async () => {
  try {
    await api("/workflow/reset", { method: "POST" });
    el("event-log").innerHTML = "";
    el("final-report").innerHTML = '<p class="empty">Session reset. Submit a new request.</p>';
    el("report-status").textContent = "Awaiting workflow";
    el("report-status").style.color = "var(--text-dim)";
    eventCount = 0;
    el("stat-events").textContent = "0";
    loadInitial();
  } catch (e) { /* ignore */ }
});

el("btn-clear-log").addEventListener("click", () => {
  el("event-log").innerHTML = "";
  eventCount = 0;
  el("stat-events").textContent = "0";
});

/* =========================================================== Clock */
function tickClock() { el("clock").textContent = new Date().toISOString().slice(11, 19) + " UTC"; }

/* =========================================================== Boot */
window.addEventListener("DOMContentLoaded", () => {
  initThree();
  connectSocket();
  loadInitial();
  refreshStats();
  setInterval(refreshStats, 5000);
  setInterval(tickClock, 1000);
  tickClock();
});
