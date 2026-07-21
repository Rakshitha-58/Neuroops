/* NeuroOps Phase 3 frontend - vanilla JS + Three.js.
   Connects to Flask backend via REST + Socket.IO for real-time
   multi-agent workflow visualization with dynamic agent selection. */

const API = window.location.origin + "/api";
let socket = null;
let eventCount = 0;
let threeScene = null;
let registryData = [];
let pluginData = [];
let showAgentNames = false;
let agentNameToType = new Map();
let raycaster = null;
let pointer = new THREE.Vector2();
let hoveredNode = null;
let tooltipEl = null;
let speechRecognition = null;
let activeHoldMs = 60000;
let settings = { provider: "stub", apiKey: "", modelName: "" };

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
const AGENT_VIZ = {};  // agent_type -> { mesh, angle, baseColor, deptColor }
const DEPT_COLORS = {
  engineering: 0x3b82f6, design: 0x8b5cf6, testing: 0xf59e0b,
  research: 0x06b6d4, management: 0x10b981, communication: 0xec4899, memory: 0x6366f1,
};
const STATE_COLORS = {
  working: 0xff9800,
  completed: 0x4caf50,
  failed: 0xf44336,
  inactive: 0x7f8c8d,
};
const STATE_EMISSIVE = {
  working: 0x5a2d02,
  completed: 0x0d3a0f,
  failed: 0x4a0b0b,
  inactive: 0x2f3338,
};
const MIN_STATE_DISPLAY_MS = 60000;

function initThree() {
  const container = el("three-canvas");
  const w = container.clientWidth, h = container.clientHeight;

  tooltipEl = document.createElement("div");
  tooltipEl.className = "viz-tooltip";
  tooltipEl.style.display = "none";
  container.appendChild(tooltipEl);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050810);
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
  camera.position.set(0, 2, 32);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x404060, 1.5));
  const dl = new THREE.DirectionalLight(0x3b82f6, 1);
  dl.position.set(10, 10, 10);
  scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0x06b6d4, 0.5);
  dl2.position.set(-10, -5, 8);
  scene.add(dl2);

  // Central CEO node
  const ceoGeo = new THREE.SphereGeometry(3, 32, 32);
  const ceoMat = new THREE.MeshPhongMaterial({ color: 0x3b82f6, emissive: 0x1a3a8a, shininess: 80 });
  const ceoNode = new THREE.Mesh(ceoGeo, ceoMat);
  scene.add(ceoNode);

  // Ring around CEO
  const ringGeo = new THREE.RingGeometry(14, 14.3, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x1a2540, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  raycaster = new THREE.Raycaster();
  threeScene = { scene, camera, renderer, ceoNode, ring, container, connections: [] };
  animateThree();
  window.addEventListener("resize", resizeThree);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);
}

function resizeThree() {
  if (!threeScene) return;
  const { container, camera, renderer } = threeScene;
  const w = container.clientWidth, h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function createAgentNode(agentType, index, total, department) {
  if (!threeScene) return;
  const angle = (index / total) * Math.PI * 2;
  const radius = 14;
  const deptColor = DEPT_COLORS[department] || 0x4a5578;

  const geo = new THREE.SphereGeometry(1.4, 20, 20);
  const mat = new THREE.MeshPhongMaterial({ color: 0xff69b4, emissive: 0x1a1020, shininess: 40 });
  const node = new THREE.Mesh(geo, mat);
  node.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.5, 0);
  node.userData.agentType = agentType;
  threeScene.scene.add(node);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), node.position.clone()]);
  const lineMat = new THREE.LineBasicMaterial({ color: deptColor, transparent: true, opacity: 0.25 });
  const line = new THREE.Line(lineGeo, lineMat);
  threeScene.scene.add(line);

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.font = "bold 24px Inter, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(agentType, 12, 36);
  const texture = new THREE.CanvasTexture(canvas);
  const labelMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const label = new THREE.Sprite(labelMaterial);
  label.scale.set(4.8, 1.2, 1);
  label.position.set(0, 2.3, 0);
  label.visible = false;
  threeScene.scene.add(label);

  AGENT_VIZ[agentType] = {
    mesh: node,
    angle,
    baseColor: deptColor,
    line,
    lineMat,
    label,
    labelMaterial,
    currentColor: new THREE.Color(0xff69b4),
    targetColor: new THREE.Color(0xff69b4),
    currentEmissive: new THREE.Color(0x1a1020),
    targetEmissive: new THREE.Color(0x1a1020),
    currentState: "sleeping",
    transitionStart: 0,
    transitionDuration: 300,
    stateHoldUntil: 0,
    hoverPulse: 0,
    taskTitle: "Idle",
    confidence: 0.0,
    executionTime: 0,
    department,
    displayName: agentType,
  };
}

let frame = 0;
function animateThree() {
  requestAnimationFrame(animateThree);
  if (!threeScene) return;
  frame += 0.005;
  const now = performance.now();
  threeScene.ceoNode.rotation.y += 0.008;
  threeScene.ceoNode.scale.setScalar(1 + Math.sin(frame * 2) * 0.05);
  threeScene.ring.rotation.z += 0.002;

  Object.values(AGENT_VIZ).forEach((a) => {
    a.angle += 0.002;
    const radius = 14;
    a.mesh.position.x = Math.cos(a.angle) * radius;
    a.mesh.position.y = Math.sin(a.angle) * radius * 0.5;
    a.mesh.rotation.y += 0.01;
    if (a.label) {
      a.label.position.set(a.mesh.position.x, a.mesh.position.y + 2.3, a.mesh.position.z);
      a.label.visible = showAgentNames;
      if (showAgentNames) {
        a.label.lookAt(threeScene.camera.position);
        const distance = threeScene.camera.position.distanceTo(a.mesh.position);
        const scaleFactor = Math.max(0.75, Math.min(2.2, distance / 24));
        a.label.scale.set(4.8 * scaleFactor, 1.2 * scaleFactor, 1);
      }
    }
    if (a.line) {
      const positions = a.line.geometry.attributes.position;
      positions.setXYZ(1, a.mesh.position.x, a.mesh.position.y, a.mesh.position.z);
      positions.needsUpdate = true;
    }

    const elapsed = now - a.transitionStart;
    if (elapsed < a.transitionDuration) {
      const t = Math.min(1, elapsed / a.transitionDuration);
      a.currentColor.lerp(a.targetColor, 0.16);
      a.currentEmissive.lerp(a.targetEmissive, 0.16);
      a.mesh.material.color.copy(a.currentColor);
      a.mesh.material.emissive.copy(a.currentEmissive);
    } else {
      a.mesh.material.color.copy(a.targetColor);
      a.mesh.material.emissive.copy(a.targetEmissive);
    }

    if (a.currentState !== "sleeping" && now >= a.stateHoldUntil) {
      updateAgentViz(a.displayName, "sleeping", { task_title: "Idle" });
    }

    const pulse = a.currentState === "thinking" ? 1 + Math.sin(frame * 6 + a.angle * 3) * 0.14 :
      a.currentState === "working" ? 1 + Math.sin(frame * 8 + a.angle * 2) * 0.1 :
      a.currentState === "waiting_approval" ? 1 + Math.sin(frame * 14) * 0.18 :
      a.currentState === "completed" ? 1.08 : 1;
    a.mesh.scale.setScalar(pulse);
    a.mesh.material.emissiveIntensity = a.currentState === "waiting_approval" ? 1.2 : a.currentState === "thinking" ? 0.95 : a.currentState === "working" ? 0.9 : 0.45;
    a.lineMat.opacity = a.currentState === "working" || a.currentState === "thinking" ? 0.7 : a.currentState === "completed" ? 0.4 : a.currentState === "waiting_approval" ? 0.55 : a.currentState === "failed" ? 0.45 : 0.18;

    if (hoveredNode && hoveredNode === a.mesh) {
      a.mesh.scale.setScalar(1.28 + Math.sin(frame * 8) * 0.04);
    }
  });

  threeScene.renderer.render(threeScene.scene, threeScene.camera);
}

function updateAgentViz(agentType, state, payload = {}) {
  const a = AGENT_VIZ[agentType];
  if (!a) return;
  const derivedState = state || "sleeping";
  if (payload.department) a.department = payload.department;
  if (payload.task_title) a.taskTitle = payload.task_title;
  if (payload.task_id) a.taskTitle = payload.task_id;
  if (payload.confidence !== undefined) a.confidence = payload.confidence;
  if (payload.execution_time_ms !== undefined) a.executionTime = payload.execution_time_ms;
  if (payload.task_title === undefined && payload.task_id === undefined && payload.message) a.taskTitle = payload.message;

  const normalizedState = derivedState === "working" ? "working" : derivedState === "completed" ? "completed" : derivedState === "failed" ? "failed" : "inactive";
  const color = STATE_COLORS[normalizedState] || STATE_COLORS.inactive;
  const emissive = STATE_EMISSIVE[normalizedState] || STATE_EMISSIVE.inactive;
  a.currentState = derivedState;
  a.currentColor = a.mesh.material.color.clone();
  a.targetColor = new THREE.Color(color);
  a.currentEmissive = a.mesh.material.emissive.clone();
  a.targetEmissive = new THREE.Color(emissive);
  a.transitionStart = performance.now();
  a.transitionDuration = derivedState === "completed" ? 500 : 280;
  a.stateHoldUntil = derivedState === "sleeping" ? 0 : performance.now() + MIN_STATE_DISPLAY_MS;
  a.mesh.material.color.setHex(color);
  a.mesh.material.emissive.setHex(emissive);
  a.mesh.material.opacity = 1;

  if (derivedState === "completed") {
    a.taskTitle = a.taskTitle || "Completed";
  }
  if (derivedState === "failed") {
    a.taskTitle = a.taskTitle || "Failed";
  }
}

function persistSettings() {
  try {
    localStorage.setItem("neuroops-settings", JSON.stringify(settings));
  } catch (e) { /* ignore */ }
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("neuroops-settings") || "{}");
    settings = { provider: saved.provider || "stub", apiKey: saved.apiKey || "", modelName: saved.modelName || "" };
  } catch (e) {
    settings = { provider: "stub", apiKey: "", modelName: "" };
  }
  if (el("provider-select")) el("provider-select").value = settings.provider;
  if (el("api-key-input")) el("api-key-input").value = settings.apiKey;
  if (el("model-input")) el("model-input").value = settings.modelName;
}

function applySettingsFromForm() {
  settings.provider = el("provider-select")?.value || "stub";
  settings.apiKey = el("api-key-input")?.value || "";
  settings.modelName = el("model-input")?.value || "";
  persistSettings();
}

function setPromptOutput(text, provider = settings.provider, modelName = settings.modelName) {
  const body = el("prompt-body");
  if (!body) return;
  el("prompt-title").textContent = `Prompt Output • ${provider || "stub"}${modelName ? ` / ${modelName}` : ""}`;
  body.innerHTML = `<pre>${escapeHtml(text || "No output generated.")}</pre>`;
  showModal("prompt-modal");
}

function setActiveVisualizationState(state, payload = {}) {
  Object.keys(AGENT_VIZ).forEach(agentType => {
    updateAgentViz(agentType, state, payload);
  });
}

function showModal(id) {
  const modal = el(id);
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function hideModal(id) {
  const modal = el(id);
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function needsDetailFollowUp(promptText) {
  const actionKeywords = /\b(build|create|make|design|develop|launch|setup|construct|assemble|generate|produce|write|plan|craft)\b/i;
  const detailTerms = /\b(goal|purpose|pages?|features?|style|tone|audience|platform|scope|requirements|content|sections?|details?|layout|navigation)\b/i;
  const cleanedText = promptText.trim();
  const words = cleanedText.split(/\s+/).filter(Boolean);
  const detailMatches = cleanedText.match(detailTerms) || [];

  if (!actionKeywords.test(cleanedText)) {
    return false;
  }
  if (detailMatches.length >= 2 || words.length >= 18) {
    return false;
  }

  return true;
}

function openDetailFlow(promptText) {
  el("detail-goal").value = "";
  el("detail-scope").value = "";
  el("detail-style").value = "";
  el("detail-features").value = "";
  showModal("detail-modal");
  el("detail-save").onclick = async () => {
    const details = {
      goal: el("detail-goal").value.trim(),
      scope: el("detail-scope").value.trim(),
      style: el("detail-style").value.trim(),
      features: el("detail-features").value.trim(),
    };
    hideModal("detail-modal");
    await submitWorkflowRequest(`${promptText}\n\nRequest details:\nGoal: ${details.goal}\nScope: ${details.scope}\nStyle: ${details.style}\nExtra: ${details.features}`, { skipDetailFollowUp: true });
  };
}

/* =========================================================== Event log */
function logEvent(event) {
  const log = el("event-log");
  const time = new Date(event.timestamp).toLocaleTimeString();
  const line = document.createElement("div");
  line.className = "event-line";
  const srcClass = "event-src-" + (event.source || "").replace(/[^A-Za-z]/g, "");
  line.innerHTML = `<span class="event-time">${time}</span>` +
                   `<span class="event-type">${escapeHtml(event.event_type || "")}</span>` +
                   `<span class="event-src ${srcClass}">${escapeHtml(event.source || "")}</span>` +
                   `<span class="event-msg"></span>`;
  line.querySelector(".event-msg").textContent = event.message || "";
  log.prepend(line);
  eventCount++;
  el("stat-events").textContent = eventCount;
  while (log.children.length > 150) log.removeChild(log.lastChild);
}

/* =========================================================== Agent Registry */
function buildAgentNameLookup(registry) {
  const lookup = new Map();
  registry.forEach(agent => {
    const variants = [];
    if (agent.name) variants.push(String(agent.name).toLowerCase());
    if (agent.agent_type) variants.push(String(agent.agent_type).toLowerCase());
    variants.forEach(value => {
      lookup.set(value, agent.agent_type);
      lookup.set(value.replace(/agent$/, ""), agent.agent_type);
      lookup.set(value.replace(/agent$/, ""), agent.agent_type);
    });
  });
  return lookup;
}

function resolveAgentTypeFromEvent(event, data) {
  const candidates = [];
  if (data && data.agent_type) candidates.push(String(data.agent_type).toLowerCase());
  if (data && data.agent_name) candidates.push(String(data.agent_name).toLowerCase());
  if (event && event.source) candidates.push(String(event.source).toLowerCase());
  if (event && event.agent_id) candidates.push(String(event.agent_id).toLowerCase());
  if (data && data.agent_id) candidates.push(String(data.agent_id).toLowerCase());

  for (const candidate of candidates) {
    const normalized = candidate.split("-")[0].replace(/agent$/, "");
    if (agentNameToType.has(normalized)) return agentNameToType.get(normalized);
    if (agentNameToType.has(candidate)) return agentNameToType.get(candidate);
    if (candidate.includes("voice")) return "voice_assistant";
    if (candidate.includes("softwareengineer")) return "software_engineer";
    if (candidate.includes("backend")) return "backend";
    if (candidate.includes("frontend")) return "frontend";
    if (candidate.includes("debug")) return "debugging";
    if (candidate.includes("ui")) return "ui_ux_designer";
    if (candidate.includes("access")) return "accessibility";
    if (candidate.includes("qa")) return "qa";
    if (candidate.includes("security")) return "security_testing";
    if (candidate.includes("research")) return "research";
    if (candidate.includes("documentation")) return "documentation";
    if (candidate.includes("knowledge")) return "knowledge_manager";
    if (candidate.includes("notification")) return "notification";
  }
  return null;
}

function renderRegistry(registry, states) {
  registryData = registry;
  agentNameToType = buildAgentNameLookup(registry);
  el("registry-count").textContent = registry.length + " agents";
  if (Object.keys(AGENT_VIZ).length === 0 && threeScene) {
    registry.forEach((agent, i) => {
      createAgentNode(agent.agent_type, i, registry.length, agent.department);
    });
  }
  registry.forEach(agent => {
    const state = (states && states[agent.agent_type]) || "sleeping";
    if (AGENT_VIZ[agent.agent_type]) {
      AGENT_VIZ[agent.agent_type].displayName = agent.name || agent.agent_type;
      AGENT_VIZ[agent.agent_type].department = agent.department;
      updateAgentViz(agent.agent_type, state, { department: agent.department, task_title: "Ready" });
    }
  });
  const grid = el("agent-grid");
  grid.innerHTML = "";
  registry.forEach(agent => {
    const state = (states && states[agent.agent_type]) || "sleeping";
    const card = document.createElement("div");
    card.className = "agent-card" + (state !== "sleeping" ? " active" : "");
    card.id = `agent-card-${agent.agent_type}`;
    const perf = agent.success_rate !== undefined ? `${(agent.success_rate * 100).toFixed(0)}% success` : "";
    card.innerHTML = `<div class="name"><span class="dot dot-${state}" style="margin-right:6px"></span>${escapeHtml(agent.name)}</div>` +
                     `<div class="dept">${escapeHtml(agent.department)}</div>` +
                     `<div class="caps">${(agent.capabilities || []).slice(0, 3).join(", ")}</div>` +
                     (perf ? `<div class="perf">${perf}</div>` : "");
    grid.appendChild(card);
  });
}

function updateAgentCard(agentType, state) {
  const card = el(`agent-card-${agentType}`);
  if (!card) return;
  const dot = card.querySelector(".dot");
  if (dot) dot.className = `dot dot-${state}`;
  card.classList.toggle("active", state !== "sleeping");
}

/* =========================================================== Tasks */
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
                     `<span class="tag">${escapeHtml((t.required_skills || []).join(", "))}</span>` +
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

/* =========================================================== Memory */
function renderMemory(entries) {
  const tl = el("memory-timeline");
  el("memory-count").textContent = entries.length + " entries";
  el("stat-memory").textContent = entries.length;
  if (!entries.length) { tl.innerHTML = '<p class="empty">No memory stored yet.</p>'; return; }
  tl.innerHTML = "";
  entries.slice(-20).reverse().forEach(m => {
    const row = document.createElement("div");
    row.className = "memory-entry";
    row.innerHTML = `<span class="mtype mtype-${m.memory_type}">${m.memory_type}</span>` +
                    `<span class="mcontent">${escapeHtml(m.content.slice(0, 100))}</span>` +
                    `<span class="mtime">${new Date(m.timestamp).toLocaleTimeString()}</span>`;
    tl.appendChild(row);
  });
}

/* =========================================================== Performance */
function renderPerformance(data) {
  const dash = el("performance-dashboard");
  const sys = data.system || {};
  el("stat-success").textContent = sys.system_success_rate !== undefined ? (sys.system_success_rate * 100).toFixed(0) + "%" : "-";
  el("stat-confidence").textContent = sys.system_avg_confidence !== undefined ? sys.system_avg_confidence.toFixed(2) : "-";
  el("model-provider").textContent = `Model: ${sys.model_usage ? Object.keys(sys.model_usage).join(", ") : "stub"}`;

  const agents = data.agents || {};
  const entries = Object.entries(agents);
  if (!entries.length) { dash.innerHTML = '<p class="empty">No performance data yet.</p>'; return; }
  dash.innerHTML = "";
  entries.forEach(([aid, p]) => {
    const row = document.createElement("div");
    row.className = "perf-row";
    const pct = (p.success_rate || 0) * 100;
    const color = pct >= 80 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--error)";
    row.innerHTML = `<span class="pagent">${escapeHtml(aid.split("-")[0])}</span>` +
                    `<div class="pbar"><div class="pfill" style="width:${pct}%;background:${color}"></div></div>` +
                    `<span class="pstats">${p.tasks_completed} done, ${(p.avg_confidence || 0).toFixed(2)} conf</span>`;
    dash.appendChild(row);
  });
}

/* =========================================================== Approvals */
function renderApprovals(approvals) {
  const section = el("approval-section");
  const queue = el("approval-queue");
  if (!approvals.length) { section.style.display = "none"; return; }
  section.style.display = "";
  queue.innerHTML = "";
  approvals.forEach(a => {
    const card = document.createElement("div");
    card.className = "approval-card";
    card.innerHTML = `<div class="arow"><span class="atitle">Task: ${escapeHtml(a.task_id)}</span></div>` +
                     `<div class="arow"><span class="areason">${escapeHtml(a.reason)}</span></div>` +
                     `<div class="arow"><span>Confidence: ${a.confidence.toFixed(2)}</span></div>` +
                     `<div class="abtns">` +
                     `<button class="btn btn-success btn-sm" onclick="resolveApproval('${a.approval_id}','approved')">Approve</button>` +
                     `<button class="btn btn-danger btn-sm" onclick="resolveApproval('${a.approval_id}','rejected')">Reject</button>` +
                     `<button class="btn btn-sm" onclick="resolveApproval('${a.approval_id}','modification')">Modify</button>` +
                     `</div>`;
    queue.appendChild(card);
  });
}

window.resolveApproval = async function(id, decision) {
  try {
    await api(`/approvals/${id}/resolve`, { method: "POST", body: JSON.stringify({ decision }) });
    refreshApprovals();
  } catch (e) { console.error(e); }
};

/* =========================================================== Plugins */
function renderPlugins(plugins) {
  pluginData = plugins;
  const container = el("plugin-list");
  if (!plugins.length) { container.innerHTML = '<p class="empty">No plugins registered yet.</p>'; return; }
  container.innerHTML = "";
  plugins.forEach(plugin => {
    const row = document.createElement("div");
    row.className = "plugin-row";
    row.innerHTML = `<span class="plugin-name">${escapeHtml(plugin.name)}</span>` +
      `<span class="plugin-meta">${escapeHtml(plugin.category)}</span>` +
      `<span class="plugin-cap">${(plugin.capabilities || []).slice(0, 2).join(", ")}</span>`;
    container.appendChild(row);
  });
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
  const stateFromEvent = d.new_state || d.state || (event.event_type === "agent:thinking" ? "thinking" : event.event_type === "agent:working" ? "working" : event.event_type === "agent:completed" ? "completed" : event.event_type === "agent:failed" ? "failed" : event.event_type === "agent:waiting_approval" ? "waiting_approval" : event.event_type === "agent:assigned" ? "assigned" : event.event_type === "agent:available" ? "available" : null);
  const resolvedAgentType = resolveAgentTypeFromEvent(event, d);

  if (event.event_type && event.event_type.startsWith("agent:")) {
    if (resolvedAgentType && stateFromEvent) {
      updateAgentCard(resolvedAgentType, stateFromEvent);
      updateAgentViz(resolvedAgentType, stateFromEvent, {
        department: d.department || null,
        task_title: d.title || d.task_id || null,
        task_id: d.task_id || null,
        confidence: d.confidence || null,
        execution_time_ms: d.execution_time_ms || null,
      });
    }
  }
  if (event.event_type === "agent:selected" && d.agent_type) {
    updateAgentCard(d.agent_type, "assigned");
    updateAgentViz(d.agent_type, "assigned", { task_title: d.task_id || "Assigned" });
  }
  if (event.event_type === "agent:registered" && registryData.length) {
    api("/workflow/agents").then(data => renderRegistry(data.registry, data.states)).catch(() => {});
  }
  if (event.event_type === "task:created") { api("/workflow/tasks").then(renderTasks).catch(() => {}); }
  if (event.event_type === "task:finished" && d.task_id) { updateTaskCard(d.task_id, "completed"); }
  if (event.event_type === "task:failed" && d.task_id) { updateTaskCard(d.task_id, "failed"); }
  if (event.event_type === "human:approval_required") { refreshApprovals(); }
  if (event.event_type === "memory:accessed") { refreshMemory(); }
  if (event.event_type === "workflow:prompt_output_ready" && d.prompt_output) {
    setPromptOutput(d.prompt_output, d.provider || settings.provider, d.model_name || settings.modelName);
  }
  if (event.event_type === "workflow:completed" || event.event_type === "workflow:failed") {
    refreshAll();
  }
}

/* =========================================================== Refresh */
async function refreshAll() {
  await Promise.all([refreshStats(), refreshTasks(), refreshAgents(), refreshMemory(), refreshAnalytics(), refreshApprovals(), refreshPlugins()]);
}

async function refreshStats() {
  try {
    const session = await api("/workflow/session");
    el("stat-tasks").textContent = session.session.task_count;
    el("stat-events").textContent = session.session.event_count || eventCount;
    const ws = session.session.workflow_status;
    const pill = el("workflow-status");
    pill.className = "pill pill-" + ws;
    pill.textContent = "Workflow: " + ws.charAt(0).toUpperCase() + ws.slice(1);
    if (session.session.final_response) renderReport(session.session.final_response);
  } catch (e) { /* ignore */ }
}

async function refreshTasks() {
  try { renderTasks(await api("/workflow/tasks")); } catch (e) {}
}

async function refreshAgents() {
  try {
    const data = await api("/workflow/agents");
    renderRegistry(data.registry, data.states);
    el("stat-agents").textContent = Object.values(data.states).filter(s => s !== "sleeping").length;
  } catch (e) {}
}

async function refreshMemory() {
  try { renderMemory(await api("/memory")); } catch (e) {}
}

async function refreshAnalytics() {
  try { renderPerformance(await api("/analytics")); } catch (e) {}
}

async function refreshPlugins() {
  try { renderPlugins(await api("/plugins")); } catch (e) {}
}

async function refreshApprovals() {
  try { renderApprovals(await api("/approvals")); } catch (e) {}
}

function onPointerMove(event) {
  if (!threeScene || !raycaster) return;
  const rect = threeScene.renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, threeScene.camera);
  const intersects = raycaster.intersectObjects(Object.values(AGENT_VIZ).map(a => a.mesh));
  if (intersects.length) {
    const hit = intersects[0].object;
    const agentType = hit.userData.agentType;
    const entry = AGENT_VIZ[agentType];
    hoveredNode = hit;
    if (entry) {
      const rect2 = threeScene.renderer.domElement.getBoundingClientRect();
      tooltipEl.style.display = "block";
      tooltipEl.innerHTML = `<strong>${escapeHtml(entry.displayName || agentType)}</strong><br>${escapeHtml(entry.department || "Unknown")}<br>State: ${escapeHtml(entry.currentState || "sleeping")}<br>Task: ${escapeHtml(entry.taskTitle || "Idle")}<br>Confidence: ${(entry.confidence || 0).toFixed(2)}<br>Exec: ${Math.round(entry.executionTime || 0)}ms`;
      tooltipEl.style.left = `${Math.min(rect2.width - 180, Math.max(16, event.clientX - rect2.left + 16))}px`;
      tooltipEl.style.top = `${Math.min(rect2.height - 120, Math.max(16, event.clientY - rect2.top + 16))}px`;
    }
  } else {
    onPointerLeave();
  }
}

function onPointerLeave() {
  hoveredNode = null;
  if (tooltipEl) tooltipEl.style.display = "none";
}

/* =========================================================== Actions */
async function submitWorkflowRequest(req, options = {}) {
  const input = el("request-input");
  const normalized = (req || "").trim();
  if (!normalized) return;
  const { fromVoice = false } = options;
  applySettingsFromForm();
  if (needsDetailFollowUp(normalized) && !options.skipDetailFollowUp) {
    openDetailFlow(normalized);
    return;
  }
  setActiveVisualizationState("thinking", { task_title: "Processing request" });
  const assistantHint = fromVoice
    ? "Voice request captured. The CEO is routing your task to the workforce."
    : (normalized.toLowerCase().includes("voice") || normalized.toLowerCase().includes("talk")
      ? "Voice-style interaction detected. The CEO is routing your request through the OS workflow."
      : "Autonomous OS workflow engaged.");
  el("final-report").innerHTML = `<p class="empty">${assistantHint}</p>`;
  el("submit-btn").disabled = true;
  el("submit-btn").textContent = "Running...";
  el("report-status").textContent = "Running";
  el("report-status").style.color = "var(--warning)";
  el("final-report").innerHTML = '<p class="empty">Workflow in progress... watch the event stream.</p>';
  try {
    const result = await api("/workflow/submit", { method: "POST", body: JSON.stringify({ request: normalized, provider: settings.provider, api_key: settings.apiKey, model_name: settings.modelName }) });
    if (result && result.prompt_output) {
      setPromptOutput(result.prompt_output, result.provider || settings.provider, result.model_name || settings.modelName);
    } else {
      setPromptOutput(`No direct prompt output was returned.`, settings.provider, settings.modelName);
    }
    input.value = "";
  } catch (err) {
    logEvent({ timestamp: new Date().toISOString(), event_type: "error", source: "API", message: "Submit failed: " + err.message });
  } finally {
    setTimeout(() => {
      el("submit-btn").disabled = false;
      el("submit-btn").textContent = "Deploy Workforce";
    }, 2000);
  }
}

function initVoiceAssistant() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = el("voice-btn");
  const status = el("voice-status");
  if (!SpeechRecognition || !button || !status) return;

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    button.classList.add("listening");
    button.textContent = "⏹";
    status.textContent = "Listening... speak your task to the voice agent.";
  };
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results).map(r => r[0].transcript).join(" ").trim();
    if (transcript) {
      el("request-input").value = transcript;
      status.textContent = `Heard: ${transcript}`;
      setTimeout(() => submitWorkflowRequest(transcript, { fromVoice: true }), 300);
    } else {
      status.textContent = "No speech detected. Try again.";
    }
  };
  recognition.onerror = (event) => {
    status.textContent = `Voice input error: ${event.error}`;
    button.classList.remove("listening");
    button.textContent = "🎙️";
  };
  recognition.onend = () => {
    button.classList.remove("listening");
    button.textContent = "🎙️";
  };

  button.addEventListener("click", () => {
    if (button.classList.contains("listening")) {
      recognition.stop();
      return;
    }
    recognition.start();
  });

  speechRecognition = recognition;
}

el("request-form").addEventListener("submit", (e) => {
  e.preventDefault();
  submitWorkflowRequest(el("request-input").value);
});

el("settings-btn").addEventListener("click", () => {
  loadSettings();
  showModal("settings-modal");
});

el("settings-close").addEventListener("click", () => hideModal("settings-modal"));

el("save-settings-btn").addEventListener("click", () => {
  applySettingsFromForm();
  hideModal("settings-modal");
});

el("detail-close").addEventListener("click", () => hideModal("detail-modal"));

el("prompt-close").addEventListener("click", () => hideModal("prompt-modal"));
el("prompt-dismiss").addEventListener("click", () => hideModal("prompt-modal"));

el("reset-btn").addEventListener("click", async () => {
  try {
    await api("/workflow/reset", { method: "POST" });
    el("event-log").innerHTML = "";
    el("final-report").innerHTML = '<p class="empty">Session reset. Submit a new request.</p>';
    el("report-status").textContent = "Awaiting workflow";
    el("report-status").style.color = "var(--text-dim)";
    eventCount = 0;
    el("stat-events").textContent = "0";
    refreshAll();
  } catch (e) {}
});

el("btn-clear-log").addEventListener("click", () => {
  el("event-log").innerHTML = "";
  eventCount = 0;
  el("stat-events").textContent = "0";
});

el("toggle-names").addEventListener("click", () => {
  showAgentNames = !showAgentNames;
  el("toggle-names").textContent = showAgentNames ? "Hide Agent Names" : "Show Agent Names";
});

/* =========================================================== Clock */
function tickClock() { el("clock").textContent = new Date().toISOString().slice(11, 19) + " UTC"; }

/* =========================================================== Boot */
window.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  initThree();
  initVoiceAssistant();
  connectSocket();
  refreshAll();
  setInterval(refreshAll, 5000);
  setInterval(() => {
    if (threeScene) {
      refreshAgents();
    }
  }, 1500);
  setInterval(tickClock, 1000);
  tickClock();
});
