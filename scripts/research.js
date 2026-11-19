import {
  getResearchNodes,
  setResearchNodes,
  getResearchRegions,
  setResearchRegions,
  getResearchPoints,
  setResearchPoints,
  getResearchViewState,
  setResearchViewState,
  getBuildings,
  setBuildings,
  getTransformations,
  getFactions,
  getPlacedBuildings,
  getDomains,
  setDomains,
  escapeHTML,
  BLANK_IMAGE,
  MODULE_ID
} from "./data.js";
import { registerModuleWindow, unregisterModuleWindow, refreshAllKingdomApps } from "./kingdom.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const openResearchApps = new Set();

export function refreshAllResearchApps() {
  for (const app of openResearchApps) app.render();
}

function broadcastRefresh() {
  game.socket.emit(`module.${MODULE_ID}`, { action: "refresh" });
}

const DEFAULT_NODE_SIZE = 120;
const DEFAULT_REGION_WIDTH = 320;
const DEFAULT_REGION_HEIGHT = 220;
const DEFAULT_CANVAS_WIDTH = 5000;
const DEFAULT_CANVAS_HEIGHT = 4000;
const MIN_CANVAS_SIZE = 1500;
const MAX_CANVAS_SIZE = 20000;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;

// A node's rendered size is the Tree Configuration's Node Size slider
// (this.#nodeSize — the "medium" baseline) times its own tier's
// multiplier. Every place that used to assume one shared size for
// every node (connection math, drag math, the link-preview line, the
// Start-node auto-center) now needs the SPECIFIC node's own size, not
// this.#nodeSize directly — see #sizeForNode below.
const TIER_SCALE = {
  small: 0.65,
  medium: 1,
  large: 1.35,
  huge: 1.75,
  gargantuan: 2.25
};
const DEFAULT_TIER = "medium";

// Prerequisites default to "all" (every listed prerequisite must be
// unlocked) — the only behavior that existed before this, so any node
// saved before prerequisiteMode existed keeps working identically.
// "any" satisfies the node once a SINGLE listed prerequisite is
// unlocked, for two branches that converge back into one node where
// either path should be enough, rather than requiring both. Shared by
// both places that need this check — the display-only "is this node
// available" calc in _prepareContext, and the actual unlock gate in
// #doUnlockNode — via an isUnlocked(id) predicate so each call site can
// use whatever lookup it already has (a Set vs an array find) rather
// than this helper dictating one shape for both.
function isPrereqsMet(node, isUnlocked) {
  const prereqs = node.prerequisites ?? [];
  if (!prereqs.length) return true;
  return node.prerequisiteMode === "any" ? prereqs.some(isUnlocked) : prereqs.every(isUnlocked);
}

const DEFAULT_CONFIG = {
  id: "__global_config__",
  canvasBg: "#050507",
  bgStyle: "starfield", 
  lineColor: "#54545f",
  lineActiveColor: "#f0dfa8",
  lineStyle: "solid", 
  lineWidth: 1.5,
  nodeShape: "circle", 
  nodeSize: 52,
  nodeBg: "#1c1c22",
  nodeText: "#e7e2d4",
  nodeBorderColor: "#6d6d78",
  nodeBorderWidth: 1.5,
  accentColor: "#E8B651",
  glowIntensity: 60,
  canvasWidth: DEFAULT_CANVAS_WIDTH,
  canvasHeight: DEFAULT_CANVAS_HEIGHT
};

export class ResearchTreeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "revamped-research-tree",
    classes: ["kingdom-app", "research-tree-app"],
    window: {
      title: "Kingdom Research Tree",
      resizable: true
    },
    position: {
      width: 1100,
      height: 720
    },
    actions: {
      toggleEditMode: ResearchTreeApp.#onToggleEditMode,
      newNode: ResearchTreeApp.#onNewNode,
      selectNode: ResearchTreeApp.#onSelectNode,
      deleteNode: ResearchTreeApp.#onDeleteNode,
      relockNode: ResearchTreeApp.#onRelockNode,
      saveNode: ResearchTreeApp.#onSaveNode,
      cancelNodeEdit: ResearchTreeApp.#onCancelNodeEdit,
      newBuildingFromNode: ResearchTreeApp.#onNewBuildingFromNode,
      newJobDomainFromNode: ResearchTreeApp.#onNewJobDomainFromNode,
      newRegion: ResearchTreeApp.#onNewRegion,
      newImage: ResearchTreeApp.#onNewImage,
      selectRegion: ResearchTreeApp.#onSelectRegion,
      saveRegion: ResearchTreeApp.#onSaveRegion,
      deleteRegion: ResearchTreeApp.#onDeleteRegion,
      cancelRegionEdit: ResearchTreeApp.#onCancelRegionEdit,
      toggleConfig: ResearchTreeApp.#onToggleConfig,
      saveConfig: ResearchTreeApp.#onSaveConfig,
      resetConfig: ResearchTreeApp.#onResetConfig,
      pickColorEyedropper: ResearchTreeApp.#onPickColorEyedropper,
      browseImage: ResearchTreeApp.#onBrowseImage,
      zoomIn: ResearchTreeApp.#onZoomIn,
      zoomOut: ResearchTreeApp.#onZoomOut,
      zoomReset: ResearchTreeApp.#onZoomReset,
      togglePointsEditor: ResearchTreeApp.#onTogglePointsEditor,
      savePoints: ResearchTreeApp.#onSavePoints
    }
  };

  static PARTS = {
    main: {
      template: "modules/pf2e-revamped-kingdoms/templates/research-tree.hbs"
    }
  };

  constructor(options = {}) {
    if (!options.position?.width && !options.position?.height) {
      options = {
        ...options,
        position: {
          ...options.position,
          width: Math.min(Math.round(window.innerWidth * 0.9), 1500),
          height: Math.min(Math.round(window.innerHeight * 0.85), 950)
        }
      };
    }
    super(options);
  }

  #editMode = false;
  #selectedNodeId = null;
  #editingNode = null;
  #editingRegion = null;
  #editingConfig = false;
  
  #dragNodeId = null;
  #dragOffset = { x: 0, y: 0 };
  #dragCanvasRect = null;
  #dragRegion = null;
  #zoomLevel = 1;
  #panX = 0;
  #panY = 0;
  #panState = null;
  #hasDragged = false;
  #nodeSize = DEFAULT_NODE_SIZE;
  #canvasWidth = DEFAULT_CANVAS_WIDTH;
  #canvasHeight = DEFAULT_CANVAS_HEIGHT;
  #linkState = null;
  #onKeyDown = null;
  #activeBurstRafs = new Set();
  #viewRestored = false;
  #persistViewTimer = null;
  #transformRaf = null;

  /** A node's actual rendered size: the Tree Configuration Node Size
   *  slider (this.#nodeSize, the "medium" baseline) times that specific
   *  node's own tier multiplier. Falls back to "medium" (×1, i.e. just
   *  this.#nodeSize unchanged) for any node saved before tiers existed,
   *  so old trees don't visually shift the moment this update lands. */
  #sizeForNode(node) {
    const scale = TIER_SCALE[node?.tier] ?? TIER_SCALE[DEFAULT_TIER];
    return Math.round(this.#nodeSize * scale);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const nodes = getResearchNodes();
    const allRegions = getResearchRegions();

    const savedConfig = allRegions.find(r => r.id === "__global_config__") || {};
    const configRegion = { ...DEFAULT_CONFIG, ...savedConfig };
    this.#nodeSize = configRegion.nodeSize || DEFAULT_NODE_SIZE;
    this.#canvasWidth = configRegion.canvasWidth || DEFAULT_CANVAS_WIDTH;
    this.#canvasHeight = configRegion.canvasHeight || DEFAULT_CANVAS_HEIGHT;

    const regions = allRegions.filter(r => r.id !== "__global_config__");
    const unlockedIds = new Set(nodes.filter((n) => n.unlocked).map((n) => n.id));
    const points = getResearchPoints();

    context.isGM = game.user.isGM;
    context.editMode = this.#editMode;
    context.points = points;
    context.config = configRegion;
    context.glowMult = (configRegion.glowIntensity ?? 100) / 100;

    context.regions = regions.map((r) => {
      const edgeFade = r.edgeFade ?? 0;
      const solidPct = Math.max(0, 100 - edgeFade);
      return {
        ...r,
        bgOpacityPct: r.bgOpacity ?? 12,
        opacityPct: (r.bgOpacity ?? 100) / 100,
        solidPct,
        isSelected: r.id === this.#editingRegion?.id
      };
    });

    context.nodes = nodes.map((n) => {
      const prereqsMet = isPrereqsMet(n, (id) => unlockedIds.has(id));
      return {
        ...n,
        tier: n.tier || DEFAULT_TIER,
        size: this.#sizeForNode(n),
        prereqsMet,
        isAvailable: !n.unlocked && prereqsMet,
        canAfford: points >= (n.cost ?? 0),
        isLocked: !n.unlocked,
        isSelected: n.id === this.#selectedNodeId
      };
    });

    const nodeById = new Map(context.nodes.map((n) => [n.id, n]));
    context.connections = [];
    for (const n of context.nodes) {
      for (const prereqId of n.prerequisites ?? []) {
        const from = nodeById.get(prereqId);
        if (!from) continue;
        context.connections.push({
          fromId: prereqId,
          toId: n.id,
          x1: from.x + from.size / 2,
          y1: from.y + from.size / 2,
          x2: n.x + n.size / 2,
          y2: n.y + n.size / 2,
          active: from.unlocked
        });
      }
    }

    context.canvasWidth = this.#canvasWidth;
    context.canvasHeight = this.#canvasHeight;
    context.zoomPercent = Math.round(this.#zoomLevel * 100);
    context.nodeShapeClass = `research-node--shape-${configRegion.nodeShape || "circle"}`;
    context.lineStyleClass = `research-connection--style-${configRegion.lineStyle || "engraved"}`;

    context.editingNode = this.#editingNode ? {
      tier: DEFAULT_TIER, // placed before the spread so it only applies when the saved node predates tiers entirely — see #sizeForNode
      prerequisiteMode: "all", // same reasoning — predates this field entirely on old nodes
      ...this.#editingNode,
      prerequisiteChoices: nodes
        .filter((n) => n.id !== this.#editingNode.id)
        .map((n) => ({ id: n.id, name: n.name, checked: (this.#editingNode.prerequisites ?? []).includes(n.id) })),
      buildingChoices: getBuildings().map((b) => ({ id: b.id, name: b.name, selected: this.#editingNode.grantsBuildingId === b.id })),
      transformationChoices: getTransformations().map((t) => ({ id: t.id, name: t.name, selected: this.#editingNode.grantsTransformationId === t.id })),
      domainChoices: getDomains().map((d) => ({ id: d.id, name: d.name, selected: this.#editingNode.grantsDomainId === d.id }))
    } : null;
    
    context.editingRegion = this.#editingRegion ? {
      bgOpacity: this.#editingRegion.isImage ? 100 : 12, 
      edgeFade: 0,
      zIndex: -1,
      ...this.#editingRegion 
    } : null;
    
    context.editingConfig = this.#editingConfig ? configRegion : null;

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    openResearchApps.add(this);
    registerModuleWindow(this);
    
    this.#wireNodeInteraction();
    this.#wireNodeLinking();
    this.#wireRegionInteraction();
    this.#wirePrereqSearch();
    this.#wireCanvasPanAndZoom();
    this.#wireHoldToUnlock();
    this.#wireDeleteKey();

    if (!this.#viewRestored) {
      this.#restoreInitialView();
      this.#viewRestored = true;
    }

    this.#applyTransform();

    const sliders = [
      { slider: "#region-opacity", display: "#region-opacity-display" },
      { slider: "#region-fade", display: "#region-fade-display" },
      { slider: "#config-glow", display: "#config-glow-display" }
    ];
    for (const {slider, display} of sliders) {
      const el = this.element.querySelector(slider);
      const disp = this.element.querySelector(display);
      if (el && disp) el.addEventListener("input", () => { disp.textContent = `${el.value}%`; });
    }

    if (!game.user.isGM) this.#editMode = false;
  }

  _onClose(options) {
    super._onClose(options);
    openResearchApps.delete(this);
    unregisterModuleWindow(this);
    if (this.#onKeyDown) document.removeEventListener("keydown", this.#onKeyDown);
    if (this.#transformRaf) cancelAnimationFrame(this.#transformRaf);
    this.#transformRaf = null;
    for (const rafId of this.#activeBurstRafs) cancelAnimationFrame(rafId);
    this.#activeBurstRafs.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Delete key                                                       */
  /* ---------------------------------------------------------------- */

  #wireDeleteKey() {
    if (this.#onKeyDown) document.removeEventListener("keydown", this.#onKeyDown);
    this.#onKeyDown = (event) => {
      if (event.key !== "Delete") return;
      if (!this.#editMode || !game.user.isGM) return;
      if (!this.element?.isConnected) return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") return;

      if (this.#editingNode && !this.#editingNode._isNew) {
        event.preventDefault();
        ResearchTreeApp.#onDeleteNode.call(this, event, { dataset: { nodeId: this.#editingNode.id } });
      } else if (this.#editingRegion && !this.#editingRegion._isNew) {
        event.preventDefault();
        ResearchTreeApp.#onDeleteRegion.call(this, event, { dataset: {} });
      }
    };
    document.addEventListener("keydown", this.#onKeyDown);
  }

  /* ---------------------------------------------------------------- */
  /* Hold to Unlock Logic                                             */
  /* ---------------------------------------------------------------- */

  #wireHoldToUnlock() {
    const canvasEl = this.element.querySelector(".research-canvas");
    if (!canvasEl) return;
    
    for (const btn of canvasEl.querySelectorAll(".research-node__unlock")) {
      const nodeId = btn.dataset.nodeId;
      const cost = Number(btn.dataset.cost) || 0;
      const duration = Math.max(500, cost * 500); 
      
      let start = 0;
      let raf = null;

      const endPress = () => {
        cancelAnimationFrame(raf);
        btn.style.setProperty('--progress', '0%');
        delete btn.dataset.holding;
      };

      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || btn.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        
        start = performance.now();
        btn.dataset.holding = "true";

        const tick = (now) => {
          const elapsed = now - start;
          const pct = Math.min(100, (elapsed / duration) * 100);
          btn.style.setProperty('--progress', `${pct}%`);
          
          if (elapsed >= duration) {
            endPress();
            this.#doUnlockNode(nodeId);
          } else {
            raf = requestAnimationFrame(tick);
          }
        };
        raf = requestAnimationFrame(tick);
      });

      btn.addEventListener('pointerup', endPress);
      btn.addEventListener('pointerleave', endPress);
      btn.addEventListener('pointercancel', endPress);
      btn.addEventListener('click', (e) => e.preventDefault());
    }
  }

  async #doUnlockNode(id) {
    if (!game.user.isGM) return;
    const nodes = getResearchNodes();
    const node = nodes.find((n) => n.id === id);
    if (!node || node.unlocked) return;

    const prereqsMet = isPrereqsMet(node, (pid) => nodes.find((n) => n.id === pid)?.unlocked);
    if (!prereqsMet) {
      ui.notifications.warn("Prerequisites for this node aren't unlocked yet.");
      return;
    }

    const points = getResearchPoints();
    if (points < (node.cost ?? 0)) {
      ui.notifications.warn(`Not enough research points — this costs ${node.cost}.`);
      return;
    }

    await setResearchPoints(points - (node.cost ?? 0));
    node.unlocked = true;
    await setResearchNodes(nodes);

    this.#triggerUnlockBurst(id);
    const grantedBuilding = node.grantsBuildingId ? getBuildings().find((b) => b.id === node.grantsBuildingId) : null;
    const grantedTransformation = node.grantsTransformationId ? getTransformations().find((t) => t.id === node.grantsTransformationId) : null;
    const grantedDomain = node.grantsDomainId ? getDomains().find((d) => d.id === node.grantsDomainId) : null;

    try {
      await ChatMessage.create({
        speaker: { alias: "Kingdom" },
        content: `<div class="pf2e-rk-effect-card"><h3>&#128161; Research Unlocked: ${escapeHTML(node.name)}</h3><p>${node.description ?? ""}</p>${
          grantedBuilding
            ? `<p><strong>Unlocked building:</strong> ${grantedBuilding.name} — it can now be built in Build a District.</p>`
            : grantedTransformation
              ? `<p><strong>Unlocked transformation:</strong> ${grantedTransformation.name} — it's now available via the Architect's Special Modifications.</p>`
              : grantedDomain
                ? `<p><strong>Unlocked job domain:</strong> ${grantedDomain.name} — it now appears in the Kingdom app as a leadership role.</p>`
                : node.grantsLabel
                  ? `<p><strong>Grants:</strong> ${node.grantsLabel} — add it via Kingdom Configuration if it doesn't exist yet.</p>`
                  : ""
        }</div>`
      });
    } catch (err) {
      console.warn("PF2e Revamped Kingdoms | Couldn't post research-unlock chat message", err);
    }

    // refreshAllResearchApps() renders every OTHER open research window
    // immediately (other players, if any — they never saw this client's
    // local burst, so there's nothing of theirs to protect by waiting).
    // THIS window's own render is what has to wait — see the comment
    // below on why.
    for (const app of openResearchApps) {
      if (app !== this) app.render();
    }
    refreshAllKingdomApps();
    broadcastRefresh();
    // Delayed rather than immediate: every render() here fully replaces
    // the node/canvas markup (Handlebars re-render, not a diff), which
    // was destroying the particle canvas AND the .research-node--just-
    // unlocked element #triggerUnlockBurst just set up after only a
    // fraction of a second — the actual cause of the burst looking
    // "glitchy... like it's not completing." The particles take ~0.5-
    // 0.9s to fully decay and the CSS flash is 0.6s; 950ms comfortably
    // covers both.
    setTimeout(() => {
      if (this.element?.isConnected) this.render();
    }, 950);
  }

  /* ---------------------------------------------------------------- */
  /* Prerequisite search filter                                       */
  /* ---------------------------------------------------------------- */

  #wirePrereqSearch() {
    const input = this.element.querySelector("#prereq-search");
    if (!input) return;
    input.addEventListener("input", () => {
      const term = input.value.trim().toLowerCase();
      for (const label of this.element.querySelectorAll(".research-editor__prereqs label")) {
        const name = label.dataset.nodeName?.toLowerCase() ?? "";
        label.hidden = term.length > 0 && !name.includes(term);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Pan and Zoom                                                     */
  /* ---------------------------------------------------------------- */

  /** Pointer and wheel events can arrive several times per frame; moving
   *  the canvas once per frame looks identical and does a fraction of the
   *  work, which is most of what made panning a big tree feel heavy. */
  #scheduleTransform() {
    if (this.#transformRaf) return;
    this.#transformRaf = requestAnimationFrame(() => {
      this.#transformRaf = null;
      if (this.element?.isConnected) this.#applyTransform();
    });
  }

  #applyTransform() {
    const inner = this.element.querySelector(".research-canvas__inner");
    if (inner) inner.style.transform = `translate(${this.#panX}px, ${this.#panY}px) scale(${this.#zoomLevel})`;
    const resetBtn = this.element.querySelector('[data-action="zoomReset"]');
    if (resetBtn) resetBtn.textContent = `${Math.round(this.#zoomLevel * 100)}%`;
  }

  /** Called once per app instance, on its first render only (guarded by
   *  #viewRestored in _onRender — later re-renders triggered by data
   *  changes must NOT re-run this, or panning around would keep getting
   *  reset back to the saved/Start position every time anything else
   *  updates). Restores this client's last-saved pan/zoom if one
   *  exists; if this client has never had one saved (brand new
   *  install, fresh browser profile, or a cleared setting), centers on
   *  the node named "Start" instead of defaulting to the canvas's raw
   *  (0,0) origin. Falls through to the existing 0,0/zoom-1 default if
   *  there's no saved state AND no node is literally named "Start"
   *  (case-insensitive, trimmed). */
  #restoreInitialView() {
    const saved = getResearchViewState();
    if (saved && Number.isFinite(saved.panX) && Number.isFinite(saved.panY) && Number.isFinite(saved.zoom)) {
      this.#panX = saved.panX;
      this.#panY = saved.panY;
      this.#zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, saved.zoom));
      return;
    }

    const startNode = getResearchNodes().find((n) => (n.name ?? "").trim().toLowerCase() === "start");
    const canvasEl = this.element.querySelector(".research-canvas");
    if (!startNode || !canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();
    const startSize = this.#sizeForNode(startNode);
    const targetX = startNode.x + startSize / 2;
    const targetY = startNode.y + startSize / 2;
    this.#zoomLevel = 1;
    this.#panX = rect.width / 2 - targetX * this.#zoomLevel;
    this.#panY = rect.height / 2 - targetY * this.#zoomLevel;
  }

  /** Debounced write of the current pan/zoom to the client-scoped
   *  researchViewState setting, so reopening the tree later resumes
   *  where you left it. Deliberately NOT called from #applyTransform
   *  itself — that runs on every pointermove during an active drag
   *  (dozens of times a second), and writing a Foundry setting that
   *  often would reintroduce the kind of per-frame cost that caused
   *  the node-animation performance issue fixed earlier. Called only
   *  from gesture-END points (pan release, each zoom step) and
   *  debounced on top of that, so a flurry of wheel-zoom ticks still
   *  only writes once, shortly after they stop. */
  #schedulePersistView() {
    clearTimeout(this.#persistViewTimer);
    this.#persistViewTimer = setTimeout(() => {
      setResearchViewState({ panX: this.#panX, panY: this.#panY, zoom: this.#zoomLevel });
    }, 400);
  }

  #setZoom(level) {
    const canvasEl = this.element.querySelector(".research-canvas");
    if (canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      this.#zoomAt(rect.width / 2, rect.height / 2, level);
    } else {
      this.#zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
      this.#applyTransform();
    }
  }

  #zoomAt(px, py, newLevel) {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newLevel));
    const localX = (px - this.#panX) / this.#zoomLevel;
    const localY = (py - this.#panY) / this.#zoomLevel;
    this.#panX = px - localX * clamped;
    this.#panY = py - localY * clamped;
    this.#zoomLevel = clamped;
    this.#scheduleTransform();
    this.#schedulePersistView();
  }

  #wireCanvasPanAndZoom() {
    const canvasEl = this.element.querySelector(".research-canvas");
    if (!canvasEl) return;

    canvasEl.addEventListener("pointerdown", (event) => {
      if (this.#editMode && event.target.closest(".research-node, .research-region, .research-image")) return;
      if (event.button !== undefined && event.button !== 0) return;
      this.#panState = {
        startX: event.clientX,
        startY: event.clientY,
        startPanX: this.#panX,
        startPanY: this.#panY
      };
      canvasEl.classList.add("is-panning");
      canvasEl.setPointerCapture(event.pointerId);
    });

    canvasEl.addEventListener("pointermove", (event) => {
      if (!this.#panState) return;
      this.#panX = this.#panState.startPanX + (event.clientX - this.#panState.startX);
      this.#panY = this.#panState.startPanY + (event.clientY - this.#panState.startY);
      this.#scheduleTransform();
    });

    const endPan = () => {
      if (this.#panState) this.#schedulePersistView();
      this.#panState = null;
      canvasEl.classList.remove("is-panning");
    };
    canvasEl.addEventListener("pointerup", endPan);
    canvasEl.addEventListener("pointercancel", endPan);
    canvasEl.addEventListener("pointerleave", endPan);

    canvasEl.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (event.shiftKey) {
        this.#panX -= event.deltaY;
        this.#scheduleTransform();
        this.#schedulePersistView();
        return;
      }
      const rect = canvasEl.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const step = this.#zoomLevel * (event.deltaY > 0 ? -0.12 : 0.12);
      this.#zoomAt(px, py, this.#zoomLevel + step);
    }, { passive: false });
  }

  /* ---------------------------------------------------------------- */
  /* Node interaction                                                 */
  /* ---------------------------------------------------------------- */

  #wireNodeInteraction() {
    const canvasEl = this.element.querySelector(".research-canvas");
    if (!canvasEl) return;

    for (const el of canvasEl.querySelectorAll(".research-node")) {
      const nodeId = el.dataset.nodeId;
      let pendingPos = null;
      let dragRaf = null;
      const flushDrag = () => {
        dragRaf = null;
        if (!pendingPos) return;
        const { x, y } = pendingPos;
        pendingPos = null;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        this.#redrawConnectionsFor(nodeId, x, y, parseFloat(el.style.width) || this.#nodeSize);
      };

      // Just-in-time will-change (see the CSS comment on
      // .research-node--will-scale for why this is toggled per-node via
      // JS instead of applied to every node unconditionally): only the
      // node currently under the cursor gets the extra GPU-backed
      // compositing layer, not the whole tree at once.
      el.addEventListener("pointerenter", () => el.classList.add("research-node--will-scale"));
      el.addEventListener("pointerleave", () => el.classList.remove("research-node--will-scale"));

      el.addEventListener("pointerdown", (event) => {
        if (!this.#editMode) return;
        if (event.target.closest("button, input, select, a")) return;
        event.preventDefault();
        event.stopPropagation();
        this.#dragNodeId = nodeId;
        this.#hasDragged = false;
        this.#dragCanvasRect = canvasEl.getBoundingClientRect();
        
        const localX = parseFloat(el.style.left) || 0;
        const localY = parseFloat(el.style.top) || 0;
        const screenToLocal = (sx, sy) => ({
          x: (sx - this.#dragCanvasRect.left - this.#panX) / this.#zoomLevel,
          y: (sy - this.#dragCanvasRect.top - this.#panY) / this.#zoomLevel
        });
        const clickLocal = screenToLocal(event.clientX, event.clientY);
        this.#dragOffset = { x: clickLocal.x - localX, y: clickLocal.y - localY };
        el.setPointerCapture(event.pointerId);
      });

      el.addEventListener("pointermove", (event) => {
        if (this.#dragNodeId !== nodeId) return;
        this.#hasDragged = true;
        const canvasRect = this.#dragCanvasRect ?? canvasEl.getBoundingClientRect();
        const localX = (event.clientX - canvasRect.left - this.#panX) / this.#zoomLevel - this.#dragOffset.x;
        const localY = (event.clientY - canvasRect.top - this.#panY) / this.#zoomLevel - this.#dragOffset.y;
        pendingPos = { x: Math.max(0, localX), y: Math.max(0, localY) };
        if (!dragRaf) dragRaf = requestAnimationFrame(flushDrag);
      });

      const endDrag = async (event) => {
        if (this.#dragNodeId !== nodeId) return;
        if (dragRaf) cancelAnimationFrame(dragRaf);
        flushDrag(); // land exactly where the pointer let go
        this.#dragNodeId = null;
        this.#dragCanvasRect = null;
        const x = Math.round(parseFloat(el.style.left) || 0);
        const y = Math.round(parseFloat(el.style.top) || 0);
        const nodes = getResearchNodes();
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          node.x = x;
          node.y = y;
          await setResearchNodes(nodes);
          broadcastRefresh();
        }
      };
      el.addEventListener("pointerup", endDrag);
      el.addEventListener("pointercancel", endDrag);
    }
  }

  #redrawConnectionsFor(nodeId, x, y, size) {
    const svg = this.element.querySelector(".research-connections");
    if (!svg) return;
    // size is that SPECIFIC node's own rendered width, passed in from
    // the drag handler's live DOM element (its width already reflects
    // this.#nodeSize × its tier multiplier — see #sizeForNode) — not
    // this.#nodeSize on its own, which would snap a large/huge/
    // gargantuan node's connection lines to the wrong center the
    // moment you dragged it.
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    for (const line of svg.querySelectorAll(`[data-from="${nodeId}"]`)) {
      line.setAttribute("x1", centerX);
      line.setAttribute("y1", centerY);
    }
    for (const line of svg.querySelectorAll(`[data-to="${nodeId}"]`)) {
      line.setAttribute("x2", centerX);
      line.setAttribute("y2", centerY);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Node linking                                                     */
  /* ---------------------------------------------------------------- */

  #wireNodeLinking() {
    const canvasEl = this.element.querySelector(".research-canvas");
    if (!canvasEl) return;

    for (const handle of canvasEl.querySelectorAll(".research-node__link-handle")) {
      const fromId = handle.dataset.nodeId;

      handle.addEventListener("pointerdown", (event) => {
        if (!this.#editMode) return;
        event.preventDefault();
        event.stopPropagation();
        this.#linkState = { fromId, canvasRect: canvasEl.getBoundingClientRect() };
        canvasEl.classList.add("is-linking");
        handle.setPointerCapture(event.pointerId);
        this.#updateLinkPreview(event.clientX, event.clientY);
      });

      handle.addEventListener("pointermove", (event) => {
        if (!this.#linkState || this.#linkState.fromId !== fromId) return;
        this.#updateLinkPreview(event.clientX, event.clientY);
      });

      const endLink = (event) => {
        if (!this.#linkState || this.#linkState.fromId !== fromId) return;
        const dropEl = document.elementFromPoint(event.clientX, event.clientY);
        const targetEl = dropEl?.closest(".research-node");
        this.#clearLinkPreview();
        canvasEl.classList.remove("is-linking");
        this.#linkState = null;
        if (targetEl && targetEl.dataset.nodeId && targetEl.dataset.nodeId !== fromId) {
          this.#linkNodes(fromId, targetEl.dataset.nodeId);
        }
      };
      handle.addEventListener("pointerup", endLink);
      handle.addEventListener("pointercancel", () => {
        this.#clearLinkPreview();
        canvasEl.classList.remove("is-linking");
        this.#linkState = null;
      });
    }
  }

  #updateLinkPreview(clientX, clientY) {
    if (!this.#linkState) return;
    const svg = this.element.querySelector(".research-connections");
    if (!svg) return;
    const rect = this.#linkState.canvasRect;
    const localX = (clientX - rect.left - this.#panX) / this.#zoomLevel;
    const localY = (clientY - rect.top - this.#panY) / this.#zoomLevel;
    const fromEl = this.element.querySelector(`.research-node[data-node-id="${this.#linkState.fromId}"]`);
    const fromSize = parseFloat(fromEl?.style.width) || this.#nodeSize;
    const fx = (parseFloat(fromEl?.style.left) || 0) + fromSize / 2;
    const fy = (parseFloat(fromEl?.style.top) || 0) + fromSize / 2;

    let line = svg.querySelector(".research-connection--preview");
    if (!line) {
      line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "research-connection research-connection--preview");
      svg.appendChild(line);
    }
    line.setAttribute("x1", fx);
    line.setAttribute("y1", fy);
    line.setAttribute("x2", localX);
    line.setAttribute("y2", localY);
  }

  #clearLinkPreview() {
    this.element.querySelector(".research-connections .research-connection--preview")?.remove();
  }

  async #linkNodes(fromId, toId) {
    if (!game.user.isGM || fromId === toId) return;
    const nodes = getResearchNodes();
    const from = nodes.find((n) => n.id === fromId);
    const to = nodes.find((n) => n.id === toId);
    if (!from || !to) return;

    to.prerequisites = to.prerequisites ?? [];
    if (to.prerequisites.includes(fromId)) {
      ui.notifications.info("Those nodes are already linked.");
      return;
    }

    if ((from.prerequisites ?? []).includes(toId)) {
      ui.notifications.warn("That would create a circular prerequisite (they already link the other way).");
      return;
    }

    to.prerequisites.push(fromId);
    await setResearchNodes(nodes);
    refreshAllResearchApps();
    broadcastRefresh();
    this.render();
  }

  /* ---------------------------------------------------------------- */
  /* Region & Image interaction                                       */
  /* ---------------------------------------------------------------- */

  #wireRegionInteraction() {
    const canvasEl = this.element.querySelector(".research-canvas");
    if (!canvasEl) return;

    for (const el of canvasEl.querySelectorAll(".research-region, .research-image")) {
      const regionId = el.dataset.regionId;
      const handle = el.querySelector(".research-region__handle");

      const startDrag = (mode) => (event) => {
        if (!this.#editMode) return;
        if (mode === "move" && event.target.closest(".research-region__title")) return;
        event.preventDefault();
        event.stopPropagation();
        this.#hasDragged = false;
        this.#dragRegion = {
          id: regionId,
          mode,
          startX: event.clientX,
          startY: event.clientY,
          origX: parseFloat(el.style.left) || 0,
          origY: parseFloat(el.style.top) || 0,
          origW: parseFloat(el.style.width) || DEFAULT_REGION_WIDTH,
          origH: parseFloat(el.style.height) || DEFAULT_REGION_HEIGHT
        };
        el.setPointerCapture(event.pointerId);
      };

      el.addEventListener("pointerdown", startDrag("move"));
      handle?.addEventListener("pointerdown", startDrag("resize"));

      el.addEventListener("pointermove", (event) => {
        const drag = this.#dragRegion;
        if (!drag || drag.id !== regionId) return;
        this.#hasDragged = true;
        const dx = (event.clientX - drag.startX) / this.#zoomLevel;
        const dy = (event.clientY - drag.startY) / this.#zoomLevel;
        if (drag.mode === "move") {
          el.style.left = `${Math.max(0, drag.origX + dx)}px`;
          el.style.top = `${Math.max(0, drag.origY + dy)}px`;
        } else {
          el.style.width = `${Math.max(120, drag.origW + dx)}px`;
          el.style.height = `${Math.max(80, drag.origH + dy)}px`;
        }
      });

      const endDrag = async (event) => {
        const drag = this.#dragRegion;
        if (!drag || drag.id !== regionId) return;
        this.#dragRegion = null;

        const regions = getResearchRegions();
        const region = regions.find((r) => r.id === regionId);
        if (region) {
          region.x = Math.round(parseFloat(el.style.left) || 0);
          region.y = Math.round(parseFloat(el.style.top) || 0);
          region.width = Math.round(parseFloat(el.style.width) || DEFAULT_REGION_WIDTH);
          region.height = Math.round(parseFloat(el.style.height) || DEFAULT_REGION_HEIGHT);
          await setResearchRegions(regions);
          broadcastRefresh();
        }
      };
      el.addEventListener("pointerup", endDrag);
      el.addEventListener("pointercancel", endDrag);
      handle?.addEventListener("pointerup", endDrag);
      handle?.addEventListener("pointercancel", endDrag);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Edit mode + CRUD Actions                                         */
  /* ---------------------------------------------------------------- */

  static #onToggleEditMode() {
    if (!game.user.isGM) return;
    this.#editMode = !this.#editMode;
    this.#editingNode = null;
    this.#editingRegion = null;
    this.#editingConfig = false;
    this.render();
  }

  static #onNewNode() {
    if (!game.user.isGM) return;
    
    // Default to the center of the current canvas view instead of 40,40
    let startX = 40, startY = 40;
    const canvasEl = this.element?.querySelector(".research-canvas");
    if (canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      startX = Math.max(0, Math.round((rect.width / 2 - this.#panX) / this.#zoomLevel - this.#nodeSize / 2));
      startY = Math.max(0, Math.round((rect.height / 2 - this.#panY) / this.#zoomLevel - this.#nodeSize / 2));
    }

    this.#editingNode = {
      id: foundry.utils.randomID(),
      name: "",
      description: "",
      x: startX,
      y: startY,
      cost: 1,
      tier: DEFAULT_TIER,
      prerequisites: [],
      prerequisiteMode: "all",
      grantsLabel: "",
      grantsBuildingId: null,
      grantsTransformationId: null,
      grantsDomainId: null,
      icon: "",
      unlocked: false,
      _isNew: true
    };
    this.#editingRegion = null;
    this.#editingConfig = false;
    this.render();
  }

  static #onSelectNode(event, target) {
    if (this.#hasDragged) {
      this.#hasDragged = false;
      return;
    }
    const id = target.dataset.nodeId ?? this.#selectedNodeId;
    if (!id) return;
    const node = getResearchNodes().find((n) => n.id === id);
    if (!node) return;
    this.#selectedNodeId = id;
    this.#editingNode = foundry.utils.deepClone(node);
    this.#editingRegion = null;
    this.#editingConfig = false;
    this.render();
  }

  static async #onDeleteNode(event, target) {
    if (!game.user.isGM) return;
    const id = target.dataset.nodeId ?? this.#editingNode?.id;
    if (!id) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Node" },
      content: "<p>Delete this research node? Any node that lists it as a prerequisite will need to be re-linked.</p>"
    });
    if (!confirmed) return;

    let nodes = getResearchNodes();
    nodes = nodes.filter((n) => n.id !== id);
    for (const n of nodes) {
      n.prerequisites = (n.prerequisites ?? []).filter((p) => p !== id);
    }
    await setResearchNodes(nodes);

    this.#editingNode = null;
    refreshAllResearchApps();
    broadcastRefresh();
    this.render();
  }

  /** Reverts an unlocked node back to locked — for undoing a mistaken
   *  unlock, or resetting a node while testing a tree. Refunds the
   *  points it cost, matching how unlocking spent them in the first
   *  place; the confirm dialog says so up front rather than silently
   *  deciding one way.
   *
   *  Anything the node GRANTS access to also reverts automatically —
   *  no extra state to clean up for that part, because availability was
   *  never cached anywhere: isBuildingResearchUnlocked() and
   *  isTransformationResearchUnlocked() (see data.js) check node.unlocked
   *  live, every single time something asks "can this be built/applied
   *  right now" (the Build a District picker, the Architect's Special
   *  Modifications). The instant this node's own unlocked flips back to
   *  false, those checks start returning false again on their own,
   *  unless some OTHER unlocked node also grants the same thing.
   *
   *  What genuinely does NOT revert, and can't: any copy of the granted
   *  building already standing on the map, or a transformation already
   *  applied or mid-progress. Those represent actions already taken
   *  while the grant was live — the same way spending gold on an item
   *  doesn't get undone because the shop closes later. The confirm
   *  dialog below checks for exactly this and says so explicitly,
   *  rather than silently reverting only part of it with no indication
   *  of which part. */
  static async #onRelockNode(event, target) {
    if (!game.user.isGM) return;
    const id = target.dataset.nodeId ?? this.#editingNode?.id;
    if (!id) return;

    const nodes = getResearchNodes();
    const node = nodes.find((n) => n.id === id);
    if (!node || !node.unlocked) return;

    const grantedBuilding = node.grantsBuildingId ? getBuildings().find((b) => b.id === node.grantsBuildingId) : null;
    const grantedTransformation = node.grantsTransformationId ? getTransformations().find((t) => t.id === node.grantsTransformationId) : null;
    const grantedDomain = node.grantsDomainId ? getDomains().find((d) => d.id === node.grantsDomainId) : null;
    const placed = getPlacedBuildings();

    let grantLine = "";
    if (grantedBuilding) {
      const placedCount = placed.filter((p) => p.buildingId === grantedBuilding.id).length;
      grantLine = `<p><strong>${grantedBuilding.name}</strong> will no longer be buildable once this re-locks (unless another unlocked node also grants it).`;
      if (placedCount > 0) {
        grantLine += ` ${placedCount} already-built cop${placedCount === 1 ? "y" : "ies"} on the map ${placedCount === 1 ? "isn't" : "aren't"} affected.`;
      }
      grantLine += "</p>";
    } else if (grantedTransformation) {
      const inProgress = placed.filter((p) => p.pendingTransformationId === grantedTransformation.id).length;
      grantLine = `<p><strong>${grantedTransformation.name}</strong> will no longer be applicable once this re-locks (unless another unlocked node also grants it).`;
      if (inProgress > 0) {
        grantLine += ` ${inProgress} already in progress on the map ${inProgress === 1 ? "isn't" : "aren't"} affected — ${inProgress === 1 ? "it" : "they"} will still complete.`;
      }
      grantLine += "</p>";
    } else if (grantedDomain) {
      grantLine = `<p><strong>${grantedDomain.name}</strong> will disappear from the Kingdom app again once this re-locks (unless another unlocked node also grants it). Nobody currently assigned that role is un-assigned by this — that's a separate, manual step if you want it.</p>`;
    }

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Re-lock Node" },
      content: `<p>Re-lock "${node.name}" and refund the ${node.cost ?? 0} point(s) it cost to unlock?</p>${grantLine}`
    });
    if (!confirmed) return;

    node.unlocked = false;
    await setResearchNodes(nodes);
    await setResearchPoints(getResearchPoints() + (node.cost ?? 0));

    if (this.#editingNode?.id === id) this.#editingNode.unlocked = false;
    refreshAllResearchApps();
    refreshAllKingdomApps();
    broadcastRefresh();
    this.render();
    ui.notifications.info(
      `Re-locked "${node.name}" and refunded ${node.cost ?? 0} point(s).` +
        (grantedBuilding ? ` "${grantedBuilding.name}" is locked again too.` : "") +
        (grantedTransformation ? ` "${grantedTransformation.name}" is locked again too.` : "") +
        (grantedDomain ? ` "${grantedDomain.name}" is locked again too.` : "")
    );
  }

  static #onCancelNodeEdit() {
    this.#editingNode = null;
    this.render();
  }

  /** Full building creation, from inside the research tree — not an
   *  earlier minimal name/cost/time version, per feedback that request
   *  ended up wanting full parity with the Buildings tab (traits, faction
   *  requirements, tile art, everything), reachable without leaving this
   *  window. Name/Icon/Description here aren't just for the new
   *  building record: they ALSO overwrite the currently-open node's own
   *  Name/Icon/Description fields directly (unconditionally — the point
   *  of one combined form is not typing the same identity twice), so
   *  filling this out once populates both the building (for Kingdom
   *  Configuration) and the node (for this screen). Always
   *  researchLocked: true, since a building created this way only
   *  exists to be gated by whichever node you made it from. */
  static async #onNewBuildingFromNode() {
    if (!game.user.isGM || !this.#editingNode) return;

    const factionOptions = getFactions()
      .map((f) => `<option value="${escapeHTML(f.id)}">${escapeHTML(f.name)}</option>`)
      .join("");

    // The dialog needs a live "Browse" button wired to FilePicker, which
    // means reaching into its DOM after Foundry renders it — DialogV2's
    // own content is just an HTML string, it doesn't give this static
    // method a render hook the way an Application subclass would. A
    // scoped, delegated document listener (removed in the `finally`
    // below regardless of how the dialog closes) is the simplest way to
    // handle that without depending on DialogV2 render-hook specifics
    // that could vary by Foundry version.
    const onBrowseClick = (event) => {
      const btn = event.target.closest(".quick-building-browse");
      if (!btn) return;
      const input = btn.parentElement.querySelector('input[name="tileImage"]');
      const thumb = btn.parentElement.querySelector(".quick-building-thumb");
      new FilePicker({
        type: "image",
        current: input.value,
        callback: (path) => {
          input.value = path;
          if (thumb) thumb.style.backgroundImage = `url('${path}')`;
        }
      }).render(true);
    };
    document.addEventListener("click", onBrowseClick);

    let result;
    try {
      result = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Create Building" },
        position: { width: 520 },
        content: `
          <p class="kc-hint">Name, Icon, and Description below are shared with this research node directly — everything else only affects the building record (editable later in Kingdom Configuration &rarr; Buildings).</p>
          <div class="form-group"><label>Name</label><input type="text" name="name" autofocus></div>
          <div class="form-group">
            <label>Icon / Tile Image</label>
            <div class="kc-color-row">
              <div class="quick-building-thumb kc-thumb" style="background-image:url('${BLANK_IMAGE}');"></div>
              <input type="text" name="tileImage" value="${BLANK_IMAGE}">
              <button type="button" class="kc-browse-btn quick-building-browse">Browse</button>
            </div>
          </div>
          <div class="form-group"><label>Description / Effect</label><textarea name="effect" rows="3"></textarea></div>
          <hr>
          <div class="form-group"><label>Category</label><input type="text" name="category" value="General"></div>
          <div class="form-group"><label>Traits <span class="kc-field-hint">(comma-separated)</span></label><input type="text" name="traits"></div>
          <div class="form-group"><label>Flags <span class="kc-field-hint">(comma-separated)</span></label><input type="text" name="flags"></div>
          <div class="form-group"><label>Cost (KW)</label><input type="number" name="cost" value="1"></div>
          <div class="form-group"><label>Build Time (kingdom turns)</label><input type="number" name="buildTime" value="0"></div>
          <div class="form-group"><label>Prerequisites <span class="kc-field-hint">(free text)</span></label><input type="text" name="prerequisitesText"></div>
          <div class="form-group"><label>Requires Faction</label>
            <select name="requiresFactionId"><option value="">&mdash; none &mdash;</option>${factionOptions}</select>
          </div>
          <div class="form-group"><label>Invites Faction</label>
            <select name="invitesFactionId"><option value="">&mdash; none &mdash;</option>${factionOptions}</select>
          </div>
          <div class="form-group"><label>KW Per Turn</label><input type="number" name="kwPerTurn" value="0"></div>
          <div class="form-group"><label>Escalation Per Copy</label><input type="number" name="escalationPerCopy" value="0"></div>
          <div class="form-group"><label>Placement Mode</label>
            <select name="placementMode"><option value="single">Single</option><option value="scatter">Scatter</option></select>
          </div>
          <div class="form-group"><label>Offset X</label><input type="number" name="offsetX" value="0"></div>
          <div class="form-group"><label>Offset Y</label><input type="number" name="offsetY" value="0"></div>
          <div class="form-group"><label>Scale <span class="kc-field-hint">(blank = default)</span></label><input type="number" name="scale" step="0.1"></div>
        `,
        ok: {
          label: "Create",
          callback: (event, button) => {
            const f = button.form.elements;
            return {
              name: f.name.value.trim(),
              tileImage: f.tileImage.value.trim() || BLANK_IMAGE,
              effect: f.effect.value.trim(),
              category: f.category.value.trim() || "General",
              traits: f.traits.value.split(",").map((s) => s.trim()).filter(Boolean),
              flags: f.flags.value.split(",").map((s) => s.trim()).filter(Boolean),
              cost: Number(f.cost.value) || 0,
              buildTime: Number(f.buildTime.value) || 0,
              prerequisitesText: f.prerequisitesText.value.trim(),
              requiresFactionId: f.requiresFactionId.value || null,
              invitesFactionId: f.invitesFactionId.value || null,
              kwPerTurn: Number(f.kwPerTurn.value) || 0,
              escalationPerCopy: Number(f.escalationPerCopy.value) || 0,
              placementMode: f.placementMode.value === "scatter" ? "scatter" : "single",
              offsetX: Number(f.offsetX.value) || 0,
              offsetY: Number(f.offsetY.value) || 0,
              scale: f.scale.value.trim() ? Number(f.scale.value) : null
            };
          }
        },
        rejectClose: false
      }).catch(() => null);
    } finally {
      document.removeEventListener("click", onBrowseClick);
    }

    if (!result) return;
    if (!result.name) {
      ui.notifications.warn("A building needs a name — nothing was created.");
      return;
    }

    const building = { id: foundry.utils.randomID(), researchLocked: true, ...result };

    const buildings = getBuildings();
    buildings.push(building);
    await setBuildings(buildings);
    refreshAllKingdomApps();
    broadcastRefresh();

    // Link it to whichever node's editor is currently open, and sync
    // that node's own Name/Icon/Description from the same form data —
    // both directly on the still-open form's inputs, so nothing is lost
    // if the GM keeps editing before clicking Save Node.
    this.#editingNode.grantsBuildingId = building.id;
    this.#editingNode.name = building.name;
    this.#editingNode.icon = building.tileImage;
    this.#editingNode.description = building.effect;
    this.render();

    ui.notifications.info(`Created "${building.name}" — it's live now, and linked to this node.`);
  }

  /** Same pattern as #onNewBuildingFromNode above, for a whole Domain
   *  (a "job domain" — a new leadership-style role with its own
   *  abilities) instead of a building. Name/Portrait/Note here overwrite
   *  the currently-open node's Name/Icon/Description directly, same
   *  reasoning as buildings: one combined form, not the same identity
   *  typed twice. Always researchLocked: true, and always starts with
   *  exactly one ability — a domain with zero abilities has nothing to
   *  actually do in the Kingdom app, and more can be added later in
   *  Kingdom Configuration → Domains (which now shows a 🔗 badge naming
   *  whichever node grants a locked domain, so the link stays visible
   *  from that side too). */
  static async #onNewJobDomainFromNode() {
    if (!game.user.isGM || !this.#editingNode) return;

    const onBrowseClick = (event) => {
      const btn = event.target.closest(".quick-domain-browse");
      if (!btn) return;
      const input = btn.parentElement.querySelector('input[name="portrait"]');
      const thumb = btn.parentElement.querySelector(".quick-domain-thumb");
      new FilePicker({
        type: "image",
        current: input.value,
        callback: (path) => {
          input.value = path;
          if (thumb) thumb.style.backgroundImage = `url('${path}')`;
        }
      }).render(true);
    };
    document.addEventListener("click", onBrowseClick);

    let result;
    try {
      result = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Create Job Domain" },
        position: { width: 520 },
        content: `
          <p class="kc-hint">Name, Icon, and Note below are shared with this research node directly — everything else only affects the domain record (editable later in Kingdom Configuration &rarr; Domains). A domain needs at least one ability to actually do anything in the Kingdom app, so this starts with one — add more later if needed.</p>
          <div class="form-group"><label>Name</label><input type="text" name="name" autofocus></div>
          <div class="form-group">
            <label>Icon / Portrait</label>
            <div class="kc-color-row">
              <div class="quick-domain-thumb kc-thumb" style="background-image:url('${BLANK_IMAGE}');"></div>
              <input type="text" name="portrait" value="${BLANK_IMAGE}">
              <button type="button" class="kc-browse-btn quick-domain-browse">Browse</button>
            </div>
          </div>
          <div class="form-group"><label>Note <span class="kc-field-hint">(short flavor text)</span></label><input type="text" name="note"></div>
          <div class="form-group"><label>Tags <span class="kc-field-hint">(comma-separated)</span></label><input type="text" name="tags"></div>
          <label class="kc-checkbox"><input type="checkbox" name="remote"> Hotlinked / externally hosted portrait image</label>
          <hr>
          <div class="form-group"><label>Starter Ability &mdash; Title</label><input type="text" name="abilityTitle"></div>
          <div class="form-group"><label>Starter Ability &mdash; Cost(s) <span class="kc-field-hint">(comma-separated, e.g. "1" or "1, 2")</span></label><input type="text" name="abilityCosts" value="1"></div>
          <div class="form-group"><label>Starter Ability &mdash; Description</label><textarea name="abilityDescription" rows="3" placeholder="HTML allowed: <p>, <ul><li>, <strong>, <em>"></textarea></div>
        `,
        ok: {
          label: "Create",
          callback: (event, button) => {
            const f = button.form.elements;
            return {
              name: f.name.value.trim(),
              portrait: f.portrait.value.trim() || BLANK_IMAGE,
              note: f.note.value.trim(),
              tags: f.tags.value.split(",").map((s) => s.trim()).filter(Boolean),
              remote: !!f.remote.checked,
              abilityTitle: f.abilityTitle.value.trim(),
              abilityCosts: f.abilityCosts.value
                .split(",")
                .map((s) => parseInt(s.trim(), 10))
                .filter((n) => Number.isFinite(n) && n > 0),
              abilityDescription: f.abilityDescription.value.trim()
            };
          }
        },
        rejectClose: false
      }).catch(() => null);
    } finally {
      document.removeEventListener("click", onBrowseClick);
    }

    if (!result) return;
    if (!result.name) {
      ui.notifications.warn("A job domain needs a name — nothing was created.");
      return;
    }

    const domain = {
      id: foundry.utils.randomID(),
      name: result.name,
      portrait: result.portrait,
      remote: result.remote,
      tags: result.tags,
      note: result.note,
      researchLocked: true,
      abilities: [
        {
          title: result.abilityTitle || "New Ability",
          costs: result.abilityCosts.length ? result.abilityCosts : [1],
          description: result.abilityDescription
        }
      ]
    };

    const domains = getDomains();
    domains.push(domain);
    await setDomains(domains);
    refreshAllKingdomApps();
    broadcastRefresh();

    this.#editingNode.grantsDomainId = domain.id;
    this.#editingNode.name = domain.name;
    this.#editingNode.icon = domain.portrait;
    this.#editingNode.description = domain.note;
    this.render();

    ui.notifications.info(`Created "${domain.name}" — it's live now, and linked to this node.`);
  }

  static async #onSaveNode() {
    if (!game.user.isGM) return;
    const root = this.element;
    const name = root.querySelector("#node-name")?.value.trim();
    if (!name) {
      ui.notifications.warn("A node needs a name.");
      return;
    }

    const nodes = getResearchNodes();
    const id = this.#editingNode.id;
    const existing = nodes.find((n) => n.id === id);
    const node = {
      id,
      name,
      description: root.querySelector("#node-description")?.value.trim() ?? "",
      cost: Number(root.querySelector("#node-cost")?.value) || 0,
      tier: root.querySelector("#node-tier")?.value || DEFAULT_TIER,
      grantsLabel: root.querySelector("#node-grants")?.value.trim() ?? "",
      grantsBuildingId: root.querySelector("#node-grants-building")?.value || null,
      grantsTransformationId: root.querySelector("#node-grants-transformation")?.value || null,
      grantsDomainId: root.querySelector("#node-grants-domain")?.value || null,
      icon: root.querySelector("#node-icon")?.value.trim() ?? "",
      prerequisites: [...root.querySelectorAll(".node-prereq-checkbox:checked")].map((el) => el.value),
      prerequisiteMode: root.querySelector("#node-prerequisite-mode")?.value === "any" ? "any" : "all",
      x: existing?.x ?? this.#editingNode.x ?? 40,
      y: existing?.y ?? this.#editingNode.y ?? 40,
      unlocked: existing?.unlocked ?? false
    };

    const idx = nodes.findIndex((n) => n.id === id);
    if (idx === -1) nodes.push(node);
    else nodes[idx] = node;

    await setResearchNodes(nodes);
    this.#editingNode = null;
    refreshAllResearchApps();
    broadcastRefresh();
    this.render();
  }

  static #onNewRegion() {
    if (!game.user.isGM) return;

    let startX = 40, startY = 40;
    const canvasEl = this.element?.querySelector(".research-canvas");
    if (canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      startX = Math.max(0, Math.round((rect.width / 2 - this.#panX) / this.#zoomLevel - DEFAULT_REGION_WIDTH / 2));
      startY = Math.max(0, Math.round((rect.height / 2 - this.#panY) / this.#zoomLevel - DEFAULT_REGION_HEIGHT / 2));
    }

    this.#editingRegion = {
      id: foundry.utils.randomID(),
      title: "New Region",
      isImage: false,
      x: startX, y: startY, width: DEFAULT_REGION_WIDTH, height: DEFAULT_REGION_HEIGHT,
      color: "#8A1C1C", bgOpacity: 12,
      _isNew: true
    };
    this.#editingNode = null;
    this.#editingConfig = false;
    this.render();
  }

  static #onNewImage() {
    if (!game.user.isGM) return;

    let startX = 40, startY = 40;
    const canvasEl = this.element?.querySelector(".research-canvas");
    if (canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      startX = Math.max(0, Math.round((rect.width / 2 - this.#panX) / this.#zoomLevel - 200));
      startY = Math.max(0, Math.round((rect.height / 2 - this.#panY) / this.#zoomLevel - 200));
    }

    this.#editingRegion = {
      id: foundry.utils.randomID(),
      title: "Background Image",
      isImage: true,
      imagePath: "icons/svg/mystery-man.svg",
      x: startX, y: startY, width: 400, height: 400,
      bgOpacity: 100, edgeFade: 0, zIndex: -1,
      _isNew: true
    };
    this.#editingNode = null;
    this.#editingConfig = false;
    this.render();
  }

  static #onSelectRegion(event, target) {
    if (this.#hasDragged) {
      this.#hasDragged = false;
      return;
    }
    const id = target.dataset.regionId;
    const region = getResearchRegions().find((r) => r.id === id);
    if (!region) return;
    this.#editingRegion = foundry.utils.deepClone(region);
    this.#editingNode = null;
    this.#editingConfig = false;
    this.render();
  }

  static #onCancelRegionEdit() {
    this.#editingRegion = null;
    this.render();
  }

  static async #onSaveRegion() {
    if (!game.user.isGM) return;
    const root = this.element;
    const id = this.#editingRegion.id;
    const regions = getResearchRegions();
    const existing = regions.find((r) => r.id === id);
    
    let region;
    if (this.#editingRegion.isImage) {
      region = {
        id,
        isImage: true,
        title: "Image",
        imagePath: root.querySelector("#region-image-path")?.value.trim() || "",
        bgOpacity: Math.max(0, Math.min(100, Number(root.querySelector("#region-opacity")?.value) || 100)),
        edgeFade: Math.max(0, Math.min(100, Number(root.querySelector("#region-fade")?.value) || 0)),
        zIndex: Number(root.querySelector("#region-zindex")?.value) || -1,
        x: existing?.x ?? this.#editingRegion.x ?? 40,
        y: existing?.y ?? this.#editingRegion.y ?? 40,
        width: existing?.width ?? this.#editingRegion.width ?? 400,
        height: existing?.height ?? this.#editingRegion.height ?? 400
      };
    } else {
      region = {
        id,
        isImage: false,
        title: root.querySelector("#region-title")?.value.trim() || "Region",
        color: root.querySelector("#region-color")?.value ?? "#8A1C1C",
        bgOpacity: Math.max(0, Math.min(100, Number(root.querySelector("#region-opacity")?.value) || 12)),
        x: existing?.x ?? this.#editingRegion.x ?? 40,
        y: existing?.y ?? this.#editingRegion.y ?? 40,
        width: existing?.width ?? this.#editingRegion.width ?? DEFAULT_REGION_WIDTH,
        height: existing?.height ?? this.#editingRegion.height ?? DEFAULT_REGION_HEIGHT
      };
    }

    const idx = regions.findIndex((r) => r.id === id);
    if (idx === -1) regions.push(region);
    else regions[idx] = region;

    await setResearchRegions(regions);
    this.#editingRegion = null;
    refreshAllResearchApps();
    broadcastRefresh();
    this.render();
  }

  static async #onDeleteRegion() {
    if (!game.user.isGM) return;
    const id = this.#editingRegion?.id;
    if (!id) return;
    const regions = getResearchRegions().filter((r) => r.id !== id);
    await setResearchRegions(regions);
    this.#editingRegion = null;
    refreshAllResearchApps();
    broadcastRefresh();
    this.render();
  }

  static #onToggleConfig() {
    if (!game.user.isGM) return;
    this.#editingConfig = !this.#editingConfig;
    this.#editingNode = null;
    this.#editingRegion = null;
    this.render();
  }

  static async #onSaveConfig() {
    if (!game.user.isGM) return;
    const root = this.element;
    const num = (sel, fallback, min, max) => {
      const v = Number(root.querySelector(sel)?.value);
      if (!Number.isFinite(v)) return fallback;
      return Math.max(min, Math.min(max, v));
    };
    const configRegion = {
      id: "__global_config__",
      canvasBg: root.querySelector("#config-canvas-bg")?.value ?? DEFAULT_CONFIG.canvasBg,
      bgStyle: root.querySelector("#config-bg-style")?.value ?? DEFAULT_CONFIG.bgStyle,
      lineColor: root.querySelector("#config-line-color")?.value ?? DEFAULT_CONFIG.lineColor,
      lineActiveColor: root.querySelector("#config-line-active")?.value ?? DEFAULT_CONFIG.lineActiveColor,
      lineStyle: root.querySelector("#config-line-style")?.value ?? DEFAULT_CONFIG.lineStyle,
      lineWidth: num("#config-line-width", DEFAULT_CONFIG.lineWidth, 1, 8),
      nodeShape: root.querySelector("#config-node-shape")?.value ?? DEFAULT_CONFIG.nodeShape,
      nodeSize: num("#config-node-size", DEFAULT_CONFIG.nodeSize, 60, 260),
      nodeBg: root.querySelector("#config-node-bg")?.value ?? DEFAULT_CONFIG.nodeBg,
      nodeText: root.querySelector("#config-node-text")?.value ?? DEFAULT_CONFIG.nodeText,
      nodeBorderColor: root.querySelector("#config-node-border")?.value ?? DEFAULT_CONFIG.nodeBorderColor,
      nodeBorderWidth: num("#config-node-border-width", DEFAULT_CONFIG.nodeBorderWidth, 0, 10),
      accentColor: root.querySelector("#config-accent")?.value ?? DEFAULT_CONFIG.accentColor,
      glowIntensity: num("#config-glow", DEFAULT_CONFIG.glowIntensity, 0, 200),
      canvasWidth: num("#config-canvas-width", DEFAULT_CONFIG.canvasWidth, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE),
      canvasHeight: num("#config-canvas-height", DEFAULT_CONFIG.canvasHeight, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE)
    };

    let regions = getResearchRegions();
    const idx = regions.findIndex(r => r.id === "__global_config__");
    if (idx === -1) regions.push(configRegion);
    else regions[idx] = configRegion;

    await setResearchRegions(regions);
    this.#editingConfig = false;
    refreshAllResearchApps();
    broadcastRefresh();
    this.render();
  }

  static async #onResetConfig() {
    if (!game.user.isGM) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Reset Tree Style" },
      content: "<p>Reset all Tree Configuration fields (background, node shape/size, line style, colors, glow) back to the module's defaults? This does not touch your nodes, regions, or points.</p>"
    });
    if (!confirmed) return;

    let regions = getResearchRegions();
    const idx = regions.findIndex(r => r.id === "__global_config__");
    if (idx === -1) regions.push({ ...DEFAULT_CONFIG });
    else regions[idx] = { ...DEFAULT_CONFIG };

    await setResearchRegions(regions);
    refreshAllResearchApps();
    broadcastRefresh();
    this.render();
  }

  static async #onPickColorEyedropper(event, target) {
    const input = target.closest(".kc-color-row")?.querySelector('input[type="color"]');
    if (!input) return;
    if (!window.EyeDropper) {
      ui.notifications.warn("Browser doesn't support eyedropper tool (Chrome/Edge only) — use the swatch.");
      return;
    }
    try {
      const result = await new window.EyeDropper().open();
      input.value = result.sRGBHex;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } catch {}
  }

  static async #onBrowseImage(event, target) {
    const input = target.closest('.kc-file-row').querySelector('.file-input');
    const fp = new FilePicker({
      type: "image",
      current: input.value,
      callback: path => {
        input.value = path;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    return fp.browse();
  }

  static #onZoomIn() { this.#setZoom(this.#zoomLevel + 0.1); }
  static #onZoomOut() { this.#setZoom(this.#zoomLevel - 0.1); }
  static #onZoomReset() { this.#setZoom(1); }

  #triggerUnlockBurst(nodeId) {
    const canvasEl = this.element.querySelector(".research-canvas");
    const inner = this.element.querySelector(".research-canvas__inner");
    const nodeEl = inner?.querySelector(`[data-node-id="${nodeId}"]`);
    if (!canvasEl || !inner || !nodeEl) return;

    nodeEl.classList.add("research-node--just-unlocked");
    nodeEl.addEventListener("animationend", () => nodeEl.classList.remove("research-node--just-unlocked"), { once: true });

    const canvasRect = canvasEl.getBoundingClientRect();
    const nodeRect = nodeEl.getBoundingClientRect();
    const cx = nodeRect.left - canvasRect.left + nodeRect.width / 2;
    const cy = nodeRect.top - canvasRect.top + nodeRect.height / 2;

    const pc = document.createElement("canvas");
    pc.className = "research-particle-canvas";
    pc.width = canvasRect.width;
    pc.height = canvasRect.height;
    canvasEl.appendChild(pc);
    const ctx = pc.getContext("2d");

    const COLORS = ["#E8B651", "#F4E9C0", "#ffffff", "#9C7C38", "#ff8a3d"];
    const particles = Array.from({ length: 22 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 3;
      return {
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 1 + Math.random() * 2,
        life: 1,
        decay: 0.022 + Math.random() * 0.026,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      };
    });

    let rafId;
    const tick = () => {
      ctx.clearRect(0, 0, pc.width, pc.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        p.life -= p.decay;
        if (p.life <= 0) continue;
        alive = true;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      if (alive) {
        rafId = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(rafId);
        this.#activeBurstRafs.delete(rafId);
        pc.remove();
      }
    };
    rafId = requestAnimationFrame(tick);
    this.#activeBurstRafs.add(rafId);
  }

  static #onTogglePointsEditor() {
    if (!game.user.isGM) return;
    const editor = this.element.querySelector(".research-points__editor");
    if (editor) editor.hidden = !editor.hidden;
  }

  static async #onSavePoints() {
    if (!game.user.isGM) return;
    const value = Number(this.element.querySelector("#research-points-input")?.value);
    await setResearchPoints(Number.isFinite(value) ? value : 0);
    refreshAllResearchApps();
    broadcastRefresh();
    this.render();
  }
}