/* This file backs the "Claim a Hex" / "Build a District" / "Destroy a
 * District" / "Unclaim a Hex" macros, the canvas hover tooltip, and a
 * couple of GM cleanup utilities.
 *
 * IMPORTANT — confidence levels, read before debugging:
 *   HIGH confidence: pickHex, claimHex/unclaimHex bookkeeping,
 *     destroyDistrict, minimize/restore, image-aware sizing.
 *   MEDIUM confidence: hex overlay geometry. This version computes hex
 *     corners itself (trig off canvas.grid.getCenterPoint + grid.size)
 *     rather than trusting canvas.grid.getVertices, which produced a
 *     square/open shape last round. Neighbor-edge matching for the
 *     "glob" effect now uses angle comparison instead of assuming array
 *     index correspondence, which should be far more robust — but I
 *     still can't render this live to confirm.
 *   LOW confidence: water/pixel detection via renderer.extract.pixels.
 *     Untestable from here; fails open (won't block placement) on error.
 */
import {
  getClaimedHexes,
  setClaimedHexes,
  getPlacedBuildings,
  setPlacedBuildings,
  getBuildings,
  getKingdomState,
  setKingdomState,
  getFactions,
  setFactions,
  getScatterSettings,
  getDefaultSingleBuildingScale,
  getReconnoiteredHexes,
  setReconnoiteredHexes,
  isBuildingResearchUnlocked,
  getTransformations,
  isTransformationResearchUnlocked,
  getBonusActionSlots,
  setBonusActionSlots,
  escapeHTML,
  cssUrl,
  MODULE_ID
} from "./data.js";
import { refreshAllKingdomApps, minimizeAllModuleWindows, restoreAllModuleWindows } from "./kingdom.js";

function broadcastRefresh() {
  game.socket.emit(`module.${MODULE_ID}`, { action: "refresh" });
}

function hexKey(offset) {
  return `${offset.i},${offset.j}`;
}

function requireGM(actionLabel) {
  if (game.user.isGM) return true;
  ui.notifications.warn(`Only the GM can ${actionLabel} — ask them to do this one.`);
  return false;
}

/** Claims and districts remember which scene they were made on. A record
 *  counts as "here" if it's from this scene, has no scene, or points at a
 *  scene that no longer exists (an older, re-imported copy of the map) —
 *  so nothing already built quietly disappears. */
function onThisScene(record) {
  const here = canvas?.scene?.id;
  if (!here || !record?.sceneId) return true;
  if (record.sceneId === here) return true;
  return !game.scenes?.has?.(record.sceneId);
}

/* ------------------------------------------------------------------ */
/* Hex geometry — computed manually so we're not depending on a grid   */
/* method (getVertices) whose behavior we couldn't verify.              */
/* ------------------------------------------------------------------ */

function isPointyTopGrid() {
  // v12+: canvas.grid.columns is true for flat-top ("Q") hex grids,
  // false/undefined for pointy-top ("R") row-based hex grids.
  return !canvas.grid.columns;
}

/** A regular hexagon's 6 vertices sit on a single circle of radius R —
 *  you can't derive them by scaling x and y independently by different
 *  half-axis values, that distorts the shape. What varies by orientation
 *  is which of the hex's own bounding-box axes equals 2R (the
 *  point-to-point / long diagonal) versus R*sqrt(3) (the flat-to-flat /
 *  short diagonal). Previous version used size/2 uniformly, which is
 *  only the long-diagonal case — for the other orientation it under-
 *  sizes the hex, which is what caused the "inset border" bug. */
function getHexRadius() {
  const grid = canvas.grid;
  const pointyTop = isPointyTopGrid();
  if (typeof grid.sizeX === "number" && typeof grid.sizeY === "number") {
    // long diagonal is vertical for pointy-top, horizontal for flat-top
    return (pointyTop ? grid.sizeY : grid.sizeX) / 2;
  }
  // Fallback: grid.size is the flat-to-flat (short) diagonal regardless
  // of orientation; long diagonal = size * 2/sqrt(3).
  return grid.size / Math.sqrt(3);
}

function computeHexCorners(center) {
  const pointyTop = isPointyTopGrid();
  const radius = getHexRadius();
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = pointyTop ? 60 * i - 30 : 60 * i;
    const rad = (Math.PI / 180) * angleDeg;
    corners.push({ x: center.x + radius * Math.cos(rad), y: center.y + radius * Math.sin(rad) });
  }
  return corners;
}

/* ------------------------------------------------------------------ */
/* Picking a hex (with a live hover preview) / a building               */
/* ------------------------------------------------------------------ */

function pickHex(promptText) {
  if (!canvas?.ready) {
    ui.notifications.error("Open a scene with a grid first.");
    return Promise.resolve(null);
  }
  ui.notifications.info(promptText);

  const preview = new PIXI.Graphics();
  canvas.stage.addChild(preview);

  const drawPreview = (offset) => {
    preview.clear();
    try {
      const center = canvas.grid.getCenterPoint(offset);
      const corners = computeHexCorners(center);
      preview.lineStyle(2, 0xe8b651, 0.85);
      preview.beginFill(0xe8b651, 0.18);
      preview.moveTo(corners[0].x, corners[0].y);
      for (const c of corners.slice(1)) preview.lineTo(c.x, c.y);
      preview.closePath();
      preview.endFill();
    } catch (err) {
      // if grid math fails for some reason, just skip the preview silently
    }
  };

  let lastPreviewKey = null;
  const moveHandler = (event) => {
    const pos = event.data.getLocalPosition(canvas.stage);
    const offset = canvas.grid.getOffset(pos);
    const key = hexKey(offset);
    if (key === lastPreviewKey) return;
    lastPreviewKey = key;
    drawPreview(offset);
  };
  canvas.stage.on("pointermove", moveHandler);

  return new Promise((resolve) => {
    const clickHandler = (event) => {
      canvas.stage.off("pointerdown", clickHandler);
      canvas.stage.off("pointermove", moveHandler);
      canvas.stage.removeChild(preview);
      preview.destroy();
      const pos = event.data.getLocalPosition(canvas.stage);
      const offset = canvas.grid.getOffset(pos);
      resolve(offset);
    };
    canvas.stage.on("pointerdown", clickHandler);
  });
}

function pickBuilding(buildings) {
  const factions = getFactions();
  const cards = buildings.map((b) => {
    const requiredFaction = b.requiresFactionId ? factions.find((f) => f.id === b.requiresFactionId) : null;
    const factionBlocked = !!requiredFaction && !requiredFaction.present;
    const researchBlocked = !!b.researchLocked && !isBuildingResearchUnlocked(b.id);
    const unavailable = factionBlocked || researchBlocked;
    const badgeText = researchBlocked ? "Locked — needs research" : factionBlocked ? `Requires ${requiredFaction.name}` : null;
    return { building: b, unavailable, badgeText };
  });

  const cardHtml = cards
    .map(
      ({ building: b, unavailable, badgeText }, i) => `
      <div class="pf2e-rk-bcard${unavailable ? " pf2e-rk-bcard--unavailable" : ""}${i === 0 ? " is-selected" : ""}" data-building-id="${escapeHTML(b.id)}">
        ${b.tileImage ? `<div class="pf2e-rk-bcard__thumb" style="background-image:${escapeHTML(cssUrl(b.tileImage))}"></div>` : `<div class="pf2e-rk-bcard__thumb"></div>`}
        <div class="pf2e-rk-bcard__name">${escapeHTML(b.name)}</div>
        <div class="pf2e-rk-bcard__meta">${b.cost} KW &middot; ${b.buildTime} turn(s)</div>
        ${badgeText ? `<div class="pf2e-rk-bcard__badge">${escapeHTML(badgeText)}</div>` : ""}
      </div>`
    )
    .join("");

  // Inline onclick/onchange attributes get stripped by Foundry's dialog
  // content sanitizer, which is why only the pre-selected default ever
  // worked and the toggle did nothing. Wiring real listeners after render
  // (same pattern the rest of this module already uses successfully)
  // instead of relying on inline HTML event attributes.
  const hookId = Hooks.on("renderDialogV2", (dialog, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const picker = root?.querySelector?.(".pf2e-rk-bpicker");
    if (!picker) return; // not this dialog — ignore
    Hooks.off("renderDialogV2", hookId);

    const hiddenInput = picker.querySelector('[name="buildingId"]');
    const toggleInput = picker.querySelector(".pf2e-rk-bpicker__toggle-input");
    toggleInput?.addEventListener("change", () => {
      picker.classList.toggle("hide-unavailable", toggleInput.checked);
    });

    for (const card of picker.querySelectorAll(".pf2e-rk-bcard")) {
      card.addEventListener("click", () => {
        for (const c of picker.querySelectorAll(".pf2e-rk-bcard")) c.classList.remove("is-selected");
        card.classList.add("is-selected");
        if (hiddenInput) hiddenInput.value = card.dataset.buildingId;
      });
    }
  });

  return foundry.applications.api.DialogV2.prompt({
    window: { title: "Build a District" },
    classes: ["pf2e-rk-dialog"],
    content: `
      <div class="pf2e-rk-bpicker">
        <input type="hidden" name="buildingId" value="${escapeHTML(buildings[0]?.id ?? "")}">
        <label class="pf2e-rk-bpicker__toggle">
          <input type="checkbox" class="pf2e-rk-bpicker__toggle-input">
          Hide unavailable buildings
        </label>
        <div class="pf2e-rk-bpicker__grid">
          ${cardHtml}
        </div>
      </div>`,
    ok: {
      label: "Choose Hex \u2192",
      callback: (event, button) => button.form.elements.buildingId.value
    },
    rejectClose: false
  })
    .catch(() => null)
    .finally(() => Hooks.off("renderDialogV2", hookId));
}

/* ------------------------------------------------------------------ */
/* Image-aware sizing — the actual fix for "massive and not centered": */
/* scale to fit a target box while preserving the source image's own   */
/* aspect ratio, instead of forcing a square and letting it distort.    */
/* ------------------------------------------------------------------ */

const imageDimensionCache = new Map();

function getImageDimensions(src) {
  if (!src) return Promise.resolve({ width: 1, height: 1 });
  if (imageDimensionCache.has(src)) return imageDimensionCache.get(src);
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = src;
  });
  imageDimensionCache.set(src, promise);
  return promise;
}

async function fitToBox(tileImage, maxBoxSize) {
  const { width, height } = await getImageDimensions(tileImage);
  const aspect = width / height || 1;
  return aspect >= 1 ? { w: maxBoxSize, h: maxBoxSize / aspect } : { w: maxBoxSize * aspect, h: maxBoxSize };
}

/* ------------------------------------------------------------------ */
/* Water / pixel detection (experimental — see file header)            */
/* ------------------------------------------------------------------ */

/** Cache of the scene background decoded onto an offscreen canvas, so we
 *  only load/decode it once per scene rather than per sample point. */
let bgImageCache = null;
let waterDetectionWarned = false;

function warnWaterDetectionOnce(reason, err) {
  if (waterDetectionWarned) return;
  waterDetectionWarned = true;
  console.warn(
    `PF2e Revamped Kingdoms | Water detection isn't working (${reason}). This most likely means the scene image ` +
      "is served without CORS headers that allow pixel-level reading (common on some hosts/CDNs, Forge included in " +
      "some configurations) — that's a hosting/browser security restriction, not something this module can bypass " +
      "client-side. Placement will proceed without the water check.",
    err
  );
}

async function getBackgroundImageData() {
  const src = canvas?.scene?.background?.src;
  if (!src) return null;
  if (bgImageCache?.src === src) return bgImageCache;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const off = document.createElement("canvas");
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        // willReadFrequently keeps the image in ordinary memory, which
        // makes the many one-pixel reads below far cheaper.
        const ctx = off.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        // Touch getImageData once here so a CORS taint throws now, during
        // setup, rather than repeatedly during per-point sampling.
        ctx.getImageData(0, 0, 1, 1);
        bgImageCache = { src, ctx, width: img.naturalWidth, height: img.naturalHeight };
        resolve(bgImageCache);
      } catch (err) {
        warnWaterDetectionOnce("canvas read blocked (likely CORS)", err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function looksLikeWater(r, g, b) {
  return b > r + 20 && b > g + 10 && b > 70;
}

/** Reads the scene's own background image first. Once it's decoded that's
 *  a cheap one-pixel lookup — the old order rendered the entire canvas for
 *  every sample point (up to ~40 per build), and also "saw" tokens,
 *  drawings and this module's own gold overlays rather than the map.
 *  The background sits inside the scene's padding, so canvas coordinates
 *  are mapped through the scene rectangle; without that, sampling landed
 *  well away from the hex being checked on any padded scene. Fails open
 *  (never blocks placement) if the image can't be read. */
async function isWaterAt(x, y) {
  try {
    const bg = await getBackgroundImageData();
    if (bg) {
      const rect = canvas.dimensions?.sceneRect ?? { x: 0, y: 0, width: canvas.scene.width ?? bg.width, height: canvas.scene.height ?? bg.height };
      const px = Math.floor(((x - rect.x) / rect.width) * bg.width);
      const py = Math.floor(((y - rect.y) / rect.height) * bg.height);
      if (px < 0 || py < 0 || px >= bg.width || py >= bg.height) return false;
      const [r, g, b, a] = bg.ctx.getImageData(px, py, 1, 1).data;
      if (a < 10) return false;
      return looksLikeWater(r, g, b);
    }
  } catch (err) {
    warnWaterDetectionOnce("background image sampling threw", err);
  }

  try {
    const pixels = canvas.app.renderer.extract.pixels(canvas.stage, new PIXI.Rectangle(x, y, 1, 1));
    const [r, g, b, a] = pixels;
    if (a >= 10) return looksLikeWater(r, g, b);
  } catch (err) {
    warnWaterDetectionOnce("renderer.extract.pixels threw", err);
  }
  return false;
}

async function isHexMostlyWater(offset) {
  try {
    const center = canvas.grid.getCenterPoint(offset);
    const corners = computeHexCorners(center);
    const points = [...corners, center];
    const results = await Promise.all(points.map((p) => isWaterAt(p.x, p.y)));
    return results.filter(Boolean).length / results.length >= 0.85;
  } catch (err) {
    console.warn("PF2e Revamped Kingdoms | Couldn't evaluate water coverage for hex — allowing placement", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Hex-claim overlay                                                    */
/* ------------------------------------------------------------------ */

const HEX_OVERLAY_FLAG = "hexOverlay";

/** Deletes every Drawing on the current scene flagged as belonging to
 *  this hex-overlay system, regardless of what (if anything) is tracked
 *  in claimedHexes. This is the fix for "unclaiming doesn't remove the
 *  border": the old approach only deleted drawings still referenced by
 *  the surviving claimed-hex list, so anything not perfectly tracked —
 *  including hexes claimed before this tracking existed — never got
 *  cleaned up. Flags are Foundry's own authoritative per-document
 *  tagging, so this can't drift out of sync the way a separately-stored
 *  ID list can. */
async function clearAllHexOverlayDrawings() {
  if (!canvas?.scene) return;
  const toDelete = canvas.scene.drawings
    .filter((d) => d.getFlag(MODULE_ID, HEX_OVERLAY_FLAG))
    .map((d) => d.id);
  if (!toDelete.length) return;
  try {
    await canvas.scene.deleteEmbeddedDocuments("Drawing", toDelete);
  } catch (err) {
    console.warn("PF2e Revamped Kingdoms | Couldn't clear old hex overlays (they may already be gone)", err);
  }
}

const RECON_FLAG = "reconnoiteredMarker";

async function clearAllReconMarkers() {
  if (!canvas?.scene) return;
  const toDelete = canvas.scene.drawings.filter((d) => d.getFlag(MODULE_ID, RECON_FLAG)).map((d) => d.id);
  if (!toDelete.length) return;
  try {
    await canvas.scene.deleteEmbeddedDocuments("Drawing", toDelete);
  } catch (err) {
    console.warn("PF2e Revamped Kingdoms | Couldn't clear old reconnoitered markers", err);
  }
}

/** Draws a small dashed marker (visually distinct from the gold
 *  claimed-hex fill/border — blue, for "scouted") on every hex the
 *  Warden's Explore action has flagged. Same full-clear-then-redraw
 *  approach as the claim overlays, for the same robustness reason. */
async function refreshReconMarkers() {
  if (!canvas?.scene) return;
  await clearAllReconMarkers();

  const keys = getReconnoiteredHexes();
  if (!keys.length) return;

  const noFill = CONST.DRAWING_FILL_TYPES?.NONE ?? 0;
  const creations = [];
  for (const key of keys) {
    const [i, j] = key.split(",").map(Number);
    const offset = { i, j };
    let center;
    try {
      center = canvas.grid.getCenterPoint(offset);
    } catch {
      continue;
    }
    const size = Math.min(canvas.grid.size * 0.3, 40);
    creations.push({
      shape: { type: "e", width: size, height: size },
      x: center.x - size / 2,
      y: center.y - size / 2,
      strokeColor: "#5aa9e6",
      strokeWidth: 2,
      strokeAlpha: 0.8,
      fillAlpha: 0,
      fillType: noFill,
      locked: false,
      flags: { [MODULE_ID]: { [RECON_FLAG]: true, reconKey: key } }
    });
  }

  if (!creations.length) return;
  try {
    await canvas.scene.createEmbeddedDocuments("Drawing", creations);
  } catch (err) {
    console.error("PF2e Revamped Kingdoms | Failed to draw reconnoitered markers", err);
  }
}


/* Hex overlays are now updated by difference instead of wipe-and-redraw.
   Every overlay drawing carries a key ("fill:i,j" or "edge:i,j:n") and a
   small signature of its geometry. Claiming one hex used to delete and
   recreate every fill and border on the map — a couple of hundred
   documents on a grown kingdom, sent to every connected player. Now only
   the new hex's pieces and the few borders it absorbs change. Drawings
   from older versions have no key, so they're replaced once, the first
   time anything is claimed or unclaimed after updating. */
const OVERLAY_VERSION = 2;

function overlaySignature(data) {
  return [OVERLAY_VERSION, Math.round(data.x), Math.round(data.y), Math.round(data.shape.width), Math.round(data.shape.height)].join(",");
}

function withOverlayFlags(data, key) {
  data.flags = { [MODULE_ID]: { [HEX_OVERLAY_FLAG]: true, overlayKey: key, overlaySig: overlaySignature(data) } };
  return data;
}

/** Pure comparison, kept separate so it can be tested outside Foundry.
 *  existing: [{ id, key, sig }]; desired: Map(key -> drawing data). */
export function diffOverlayDocs(existing, desired) {
  const keep = new Set();
  const toDelete = [];
  for (const doc of existing) {
    const want = doc.key ? desired.get(doc.key) : null;
    const wantSig = want?.flags?.[MODULE_ID]?.overlaySig;
    if (!want || keep.has(doc.key) || wantSig !== doc.sig) toDelete.push(doc.id);
    else keep.add(doc.key);
  }
  const toCreate = [...desired].filter(([key]) => !keep.has(key)).map(([, data]) => data);
  return { toDelete, toCreate };
}

function buildDesiredOverlays(claimed) {
  const desired = new Map();
  const claimedKeys = new Set(claimed.map((h) => h.key));
  const fillType = CONST.DRAWING_FILL_TYPES?.SOLID ?? 1;
  const noFill = CONST.DRAWING_FILL_TYPES?.NONE ?? 0;

  for (const hex of claimed) {
    const offset = { i: hex.i, j: hex.j };
    const center = canvas.grid.getCenterPoint(offset);
    const corners = computeHexCorners(center);

    // Fill — one hex-shaped polygon, no stroke. Neighbouring fills with
    // no border between them read as one continuous territory.
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const closed = [...corners, corners[0]];
    desired.set(
      `fill:${hex.key}`,
      withOverlayFlags(
        {
          shape: { type: "p", points: closed.flatMap((c) => [c.x - minX, c.y - minY]), width: Math.max(...xs) - minX, height: Math.max(...ys) - minY },
          x: minX,
          y: minY,
          strokeWidth: 0,
          strokeAlpha: 0,
          fillColor: "#e8b651",
          fillAlpha: 0.12,
          fillType,
          locked: false
        },
        `fill:${hex.key}`
      )
    );

    // Border — one segment per edge, skipped where it touches another
    // claimed hex. Edges are matched to neighbours by direction from the
    // centre rather than by list order.
    let neighborOffsets = [];
    try {
      neighborOffsets = canvas.grid.getAdjacentOffsets(offset);
    } catch (err) {
      console.warn("PF2e Revamped Kingdoms | getAdjacentOffsets failed — this hex will get a full border", err);
    }
    const neighborCenters = neighborOffsets.map((o) => ({ key: hexKey(o), center: canvas.grid.getCenterPoint(o) }));

    for (let i = 0; i < 6; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 6];
      const edgeAngle = Math.atan2((a.y + b.y) / 2 - center.y, (a.x + b.x) / 2 - center.x);

      let matchedKey = null;
      let bestDiff = Infinity;
      for (const nc of neighborCenters) {
        let diff = Math.abs(Math.atan2(nc.center.y - center.y, nc.center.x - center.x) - edgeAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < bestDiff) {
          bestDiff = diff;
          matchedKey = nc.key;
        }
      }
      if (matchedKey && bestDiff < Math.PI / 6 && claimedKeys.has(matchedKey)) continue;

      const segMinX = Math.min(a.x, b.x);
      const segMinY = Math.min(a.y, b.y);
      const key = `edge:${hex.key}:${i}`;
      desired.set(
        key,
        withOverlayFlags(
          {
            shape: {
              type: "p",
              points: [a.x - segMinX, a.y - segMinY, b.x - segMinX, b.y - segMinY],
              width: Math.abs(b.x - a.x) || 1,
              height: Math.abs(b.y - a.y) || 1
            },
            x: segMinX,
            y: segMinY,
            strokeColor: "#e8b651",
            strokeWidth: 3,
            strokeAlpha: 0.75,
            fillAlpha: 0,
            fillType: noFill,
            locked: false
          },
          key
        )
      );
    }
  }
  return desired;
}

async function refreshAllHexOverlays() {
  const scene = canvas?.scene;
  if (!scene) return;

  const claimed = getClaimedHexes().filter(onThisScene);
  let desired;
  try {
    desired = buildDesiredOverlays(claimed);
  } catch (err) {
    console.error("PF2e Revamped Kingdoms | Couldn't work out hex overlay shapes", err);
    return;
  }

  const existing = scene.drawings
    .filter((d) => d.getFlag(MODULE_ID, HEX_OVERLAY_FLAG))
    .map((d) => ({ id: d.id, key: d.getFlag(MODULE_ID, "overlayKey") ?? null, sig: d.getFlag(MODULE_ID, "overlaySig") ?? null }));
  const { toDelete, toCreate } = diffOverlayDocs(existing, desired);

  if (toDelete.length) {
    try {
      await scene.deleteEmbeddedDocuments("Drawing", toDelete);
    } catch (err) {
      console.warn("PF2e Revamped Kingdoms | Couldn't remove old hex overlays (they may already be gone)", err);
    }
  }
  if (toCreate.length) {
    try {
      await scene.createEmbeddedDocuments("Drawing", toCreate);
    } catch (err) {
      console.error("PF2e Revamped Kingdoms | Failed to draw hex overlays", err);
    }
  }
  updateTooltipScene();
}

/** GM safety net: wipes every flagged hex-overlay drawing without
 *  touching claimedHexes data at all. Useful if overlays ever get out
 *  of sync with the claimed-hex list — run this, then re-open the
 *  Kingdom app (or claim/unclaim once more) to redraw cleanly. */
export async function clearHexOverlays() {
  if (!requireGM("clear hex overlays")) return;
  await clearAllHexOverlayDrawings();
  ui.notifications.info("Cleared all hex overlay drawings from this scene.");
}

/* ------------------------------------------------------------------ */
/* Claim / unclaim                                                      */
/* ------------------------------------------------------------------ */

/** Warden's Explore action: flags a hex so its next Claim a Hex is free.
 *  The flag is consumed automatically the moment that hex is claimed. */
const MAX_RECONNOITERED = 3;

export async function markReconnoitered() {
  if (!requireGM("change the kingdom map")) return;
  minimizeAllModuleWindows();
  try {
    const offset = await pickHex("Click the hex to mark as Reconnoitered.");
    if (!offset) return;
    const key = hexKey(offset);

    const keys = getReconnoiteredHexes();
    if (keys.includes(key)) {
      ui.notifications.warn("That hex is already marked Reconnoitered.");
      return;
    }
    if (getClaimedHexes().some((h) => h.key === key && onThisScene(h))) {
      ui.notifications.warn("That hex is already claimed — Reconnoitered only matters for claiming.");
      return;
    }
    // Cap so this can't be used to stockpile an unlimited number of
    // free future claims ahead of time — without this, the escalating
    // Claim a Hex cost could be entirely pre-paid via action economy
    // instead of KW, for as many hexes as there was time to scout.
    if (keys.length >= MAX_RECONNOITERED) {
      ui.notifications.warn(`Already have ${MAX_RECONNOITERED} hexes marked Reconnoitered — claim one of them before marking another.`);
      return;
    }

    keys.push(key);
    await setReconnoiteredHexes(keys);
    await refreshReconMarkers();

    ui.notifications.info(`Hex marked Reconnoitered (${keys.length}/${MAX_RECONNOITERED}) — claiming it next time will be free.`);
    refreshAllKingdomApps();
    broadcastRefresh();
  } finally {
    restoreAllModuleWindows();
  }
}

export async function claimHex({ ignoreCost = false } = {}) {
  if (!requireGM("change the kingdom map")) return;
  minimizeAllModuleWindows();
  try {
    const claimed = getClaimedHexes();
    const offset = await pickHex("Click the hex you want to claim.");
    if (!offset) return;
    const key = hexKey(offset);

    const claimedHere = claimed.filter(onThisScene);
    if (claimedHere.some((h) => h.key === key)) {
      ui.notifications.warn("That hex is already claimed.");
      return;
    }

    if (claimedHere.length > 0) {
      let adjacentKeys = [];
      try {
        adjacentKeys = canvas.grid.getAdjacentOffsets(offset).map(hexKey);
      } catch (err) {
        console.error("PF2e Revamped Kingdoms | getAdjacentOffsets failed", err);
      }
      const isAdjacent = claimedHere.some((h) => adjacentKeys.includes(h.key));
      if (!isAdjacent) {
        ui.notifications.warn("That hex isn't adjacent to territory you've already claimed.");
        return;
      }
    }

    const reconKeys = getReconnoiteredHexes();
    const isReconnoitered = reconKeys.includes(key);
    const cost = isReconnoitered ? 0 : 1 + Math.floor(claimed.length / 3);

    if (!ignoreCost && cost > 0) {
      const kingdomState = getKingdomState();
      if (kingdomState.kw < cost) {
        ui.notifications.warn(`Not enough KW — claiming this hex costs ${cost} KW.`);
        return;
      }
      kingdomState.kw -= cost;
      await setKingdomState(kingdomState);
    }

    claimed.push({ key, i: offset.i, j: offset.j, sceneId: canvas.scene?.id ?? null });
    await setClaimedHexes(claimed);
    await refreshAllHexOverlays();

    if (isReconnoitered) {
      await setReconnoiteredHexes(reconKeys.filter((k) => k !== key));
      await refreshReconMarkers();
    }

    ui.notifications.info(
      ignoreCost ? "Hex claimed (cost ignored)." : isReconnoitered ? "Hex claimed for free — it was Reconnoitered!" : `Hex claimed for ${cost} KW.`
    );
    refreshAllKingdomApps();
    broadcastRefresh();
  } finally {
    restoreAllModuleWindows();
  }
}

export async function unclaimHex() {
  if (!requireGM("unclaim hexes")) return;
  minimizeAllModuleWindows();
  try {
    const offset = await pickHex("Click the hex you want to unclaim.");
    if (!offset) return;
    const key = hexKey(offset);

    if (getPlacedBuildings().some((p) => p.key === key && onThisScene(p))) {
      ui.notifications.warn("That hex still has a district on it — destroy the district first.");
      return;
    }

    const claimed = getClaimedHexes();
    const idx = claimed.findIndex((h) => h.key === key && onThisScene(h));
    if (idx === -1) {
      ui.notifications.warn("That hex isn't claimed.");
      return;
    }

    // No need to special-case deleting this hex's own drawings anymore —
    // refreshAllHexOverlays now wipes every flagged overlay drawing and
    // redraws from scratch for whatever's left, so a hex we remove here
    // simply won't get redrawn.
    claimed.splice(idx, 1);

    await setClaimedHexes(claimed);
    await refreshAllHexOverlays();

    ui.notifications.info("Hex unclaimed.");
    refreshAllKingdomApps();
    broadcastRefresh();
  } finally {
    restoreAllModuleWindows();
  }
}

/* ------------------------------------------------------------------ */
/* Building placement                                                   */
/* ------------------------------------------------------------------ */

function randomPointInHex(center, radius) {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * radius * 0.55;
  return { x: center.x + Math.cos(angle) * dist, y: center.y + Math.sin(angle) * dist };
}

/** The hex's own "fit box" reference size — the smaller of its two axis
 *  dimensions, so a building tile fits within the hex's tighter footprint
 *  rather than assuming a uniform square derived from just one axis
 *  (hexes aren't square, so using only `size` could overflow the hex on
 *  one axis depending on orientation). */
function getHexBoxSize() {
  const grid = canvas.grid;
  if (typeof grid.sizeX === "number" && typeof grid.sizeY === "number") {
    return Math.min(grid.sizeX, grid.sizeY);
  }
  return grid.size;
}

/** Where a single-placement building's tile goes and how big it is.
 *  Shared by placing and by "Recenter District Tiles", which used to do
 *  its own sum with the raw grid size — so recentering quietly resized
 *  any building with its own scale (or a non-default scale setting). */
async function singleTileRect(building, offset) {
  const center = canvas.grid.getCenterPoint(offset);
  const scale = building.scale ?? getDefaultSingleBuildingScale() ?? 1;
  const boxSize = getHexBoxSize() * scale;
  const { w, h } = await fitToBox(building.tileImage, boxSize);
  // Centred on the hex; the offsets just nudge it if an asset needs it.
  return {
    x: center.x - w / 2 + (building.offsetX ?? 0) * boxSize,
    y: center.y - h / 2 + (building.offsetY ?? 0) * boxSize,
    width: w,
    height: h
  };
}

async function placeSingleBuilding(building, offset) {
  const rect = await singleTileRect(building, offset);
  const [tile] = await canvas.scene.createEmbeddedDocuments("Tile", [
    { texture: { src: building.tileImage }, ...rect, locked: false }
  ]);
  return tile ? [tile.id] : [];
}

/** Scatters several small copies of an "individual building" sprite
 *  across the hex at random positions (no rotation — kept upright per
 *  feedback), sized off the image's own aspect ratio and skipping any
 *  roll that lands on water. Count and scale are GM-configurable under
 *  Configure Settings. */
async function placeScatterBuilding(building, offset) {
  const center = canvas.grid.getCenterPoint(offset);
  const hexBox = getHexBoxSize();
  const hexRadius = hexBox / 2;
  const { min, max, scale: scatterScale } = getScatterSettings();
  const boxSize = hexBox * scatterScale;
  const { w, h } = await fitToBox(building.tileImage, boxSize);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const count = lo + Math.floor(Math.random() * (hi - lo + 1));
  const tileIds = [];

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 8 && !placed; attempt++) {
      const point = randomPointInHex(center, hexRadius);
      if (await isWaterAt(point.x, point.y)) continue;

      try {
        const [tile] = await canvas.scene.createEmbeddedDocuments("Tile", [
          {
            texture: { src: building.tileImage },
            x: point.x - w / 2 + (building.offsetX ?? 0) * boxSize,
            y: point.y - h / 2 + (building.offsetY ?? 0) * boxSize,
            width: w,
            height: h,
            rotation: 0,
            locked: false
          }
        ]);
        if (tile) tileIds.push(tile.id);
        placed = true;
      } catch (err) {
        console.error("PF2e Revamped Kingdoms | Scatter tile placement failed", err);
        placed = true;
      }
    }
  }
  return tileIds;
}

export async function buildDistrict({ ignoreCost = false } = {}) {
  if (!requireGM("change the kingdom map")) return;
  minimizeAllModuleWindows();
  try {
    const buildings = getBuildings();
    if (!buildings.length) {
      ui.notifications.error('No buildings configured yet — add some from the "Buildings" tab in Kingdom Configuration first.');
      return;
    }

    const buildingId = await pickBuilding(buildings);
    if (!buildingId) return;
    const building = buildings.find((b) => b.id === buildingId);
    if (!building) return;

    const offset = await pickHex(`Click the hex to build "${building.name}" on.`);
    if (!offset) return;
    const key = hexKey(offset);

    const claimed = getClaimedHexes();
    if (!claimed.some((h) => h.key === key && onThisScene(h))) {
      ui.notifications.warn("You can only build on a hex you've claimed — use Claim a Hex first.");
      return;
    }

    const placed = getPlacedBuildings();
    if (placed.some((p) => p.key === key && onThisScene(p))) {
      ui.notifications.warn("That hex already has a district built on it.");
      return;
    }

    if (building.requiresFactionId) {
      const factions = getFactions();
      const required = factions.find((f) => f.id === building.requiresFactionId);
      if (!required?.present) {
        ui.notifications.warn(`${building.name} requires the ${required?.name ?? "prerequisite"} faction to already be present in your kingdom.`);
        return;
      }
    }

    if (building.researchLocked && !isBuildingResearchUnlocked(building.id)) {
      ui.notifications.warn(`${building.name} is locked behind a research node that hasn't been unlocked yet.`);
      return;
    }

    if (building.tileImage && canvas?.scene && (await isHexMostlyWater(offset))) {
      ui.notifications.warn("That hex looks like it's mostly water — pick a land hex instead.");
      return;
    }

    // Real cost escalation (previously the "escalating-cost" flag was
    // cosmetic only — the effect text on a couple of buildings claimed
    // "future copies cost more" but nothing actually charged more).
    // Counts existing copies of this exact building already placed
    // anywhere, times its own per-copy increment (0 for most buildings).
    const existingCopies = placed.filter((p) => p.buildingId === building.id).length;
    const actualCost = building.cost + existingCopies * (building.escalationPerCopy ?? 0);

    if (!ignoreCost) {
      const kingdomState = getKingdomState();
      if (kingdomState.kw < actualCost) {
        ui.notifications.warn(
          `Not enough KW — ${building.name} costs ${actualCost} KW${existingCopies > 0 ? ` (escalated from ${building.cost} — this would be copy #${existingCopies + 1})` : ""}.`
        );
        return;
      }
      kingdomState.kw -= actualCost;
      await setKingdomState(kingdomState);
    }

    let tileIds = [];
    if (building.tileImage && canvas?.scene) {
      try {
        tileIds =
          building.placementMode === "scatter"
            ? await placeScatterBuilding(building, offset)
            : await placeSingleBuilding(building, offset);
      } catch (err) {
        console.error("PF2e Revamped Kingdoms | Failed to place building tile(s)", err);
        ui.notifications.warn("Couldn't place the tile image(s) on the canvas — the building was still recorded in the kingdom's data.");
      }
    }

    placed.push({
      key,
      i: offset.i,
      j: offset.j,
      buildingId: building.id,
      sceneId: canvas.scene?.id ?? null,
      tileIds,
      turnsRemaining: building.buildTime ?? 0,
      storedKw: 0
    });
    await setPlacedBuildings(placed);

    if (building.invitesFactionId) {
      const factions = getFactions();
      const invited = factions.find((f) => f.id === building.invitesFactionId);
      if (invited && !invited.present) {
        invited.present = true;
        await setFactions(factions);
        ui.notifications.info(`The ${invited.name} have joined your kingdom!`);
      }
    }

    // Instant-complete case (buildTime 0) — Finish Turn handles the
    // more common case of a bonus-slot building finishing construction
    // over subsequent turns; this covers one finishing immediately.
    if (building.grantsBonusActionSlot && (building.buildTime ?? 0) <= 0) {
      await setBonusActionSlots(getBonusActionSlots() + 1);
      ui.notifications.info(`${building.name} completed instantly — the kingdom permanently gains +1 action per turn!`);
    }

    ui.notifications.info(
      `${building.name} built${ignoreCost ? " (cost ignored)" : ` for ${actualCost} KW`}.` +
        (building.buildTime > 0 ? ` Ready in ${building.buildTime} kingdom turn(s).` : "")
    );
    refreshAllKingdomApps();
    broadcastRefresh();
  } finally {
    restoreAllModuleWindows();
  }
}

export async function destroyDistrict() {
  if (!requireGM("destroy districts")) return;
  minimizeAllModuleWindows();
  try {
    const offset = await pickHex("Click the district you want to destroy.");
    if (!offset) return;
    const key = hexKey(offset);

    const placed = getPlacedBuildings();
    const idx = placed.findIndex((p) => p.key === key && onThisScene(p));
    if (idx === -1) {
      ui.notifications.warn("There's no district on that hex.");
      return;
    }

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Destroy District" },
      content: "<p>Remove this building and delete its tile(s) from the canvas? This can't be undone.</p>"
    });
    if (!confirmed) return;

    const record = placed[idx];
    if (record.tileIds?.length && canvas?.scene) {
      try {
        await canvas.scene.deleteEmbeddedDocuments("Tile", record.tileIds);
      } catch (err) {
        console.warn("PF2e Revamped Kingdoms | Couldn't delete tile(s) — they may have already been removed manually on the canvas", err);
      }
    }

    placed.splice(idx, 1);
    await setPlacedBuildings(placed);

    ui.notifications.info("District destroyed.");
    refreshAllKingdomApps();
    broadcastRefresh();
  } finally {
    restoreAllModuleWindows();
  }
}

/** Architect's Upgrade a Building: pick a placed district, pay that
 *  building's base cost again, and bump its level by 1. Levels are
 *  cosmetic/tracking only for now — they show on the hover tooltip, but
 *  nothing currently reads a building's level to change its numbers. */
export async function upgradeBuilding() {
  if (!requireGM("change the kingdom map")) return;
  minimizeAllModuleWindows();
  try {
    const offset = await pickHex("Click the district you want to upgrade.");
    if (!offset) return;
    const key = hexKey(offset);

    const placed = getPlacedBuildings();
    const record = placed.find((p) => p.key === key && onThisScene(p));
    if (!record) {
      ui.notifications.warn("There's no district on that hex.");
      return;
    }

    const building = getBuildings().find((b) => b.id === record.buildingId);
    const cost = building?.cost ?? 0;

    const kingdomState = getKingdomState();
    if (kingdomState.kw < cost) {
      ui.notifications.warn(`Not enough KW — upgrading costs ${cost} KW (this building's base cost).`);
      return;
    }
    kingdomState.kw -= cost;
    await setKingdomState(kingdomState);

    record.level = (record.level ?? 1) + 1;
    await setPlacedBuildings(placed);

    ui.notifications.info(`${building?.name ?? "District"} upgraded to level ${record.level} for ${cost} KW.`);
    refreshAllKingdomApps();
    broadcastRefresh();
  } finally {
    restoreAllModuleWindows();
  }
}

/** Universal "Level Up a Store" action: distinct from the Architect's
 *  generic Upgrade a Building — fixed 3 KW cost regardless of the
 *  store's own build cost, and it makes the store unavailable for this
 *  turn and the next, per the rulebook. A store's level is meaningful
 *  on its own (party level + store level = max item level tradeable
 *  there), which is why this gets its own mechanic instead of just
 *  reusing the generic upgrade. */
export async function levelUpStore() {
  if (!requireGM("change the kingdom map")) return;
  minimizeAllModuleWindows();
  try {
    const offset = await pickHex("Click the store you want to level up.");
    if (!offset) return;
    const key = hexKey(offset);

    const placed = getPlacedBuildings();
    const record = placed.find((p) => p.key === key && onThisScene(p));
    if (!record) {
      ui.notifications.warn("There's no district on that hex.");
      return;
    }
    if (record.buildingId !== "build-a-store") {
      ui.notifications.warn("That district isn't a store — Level Up a Store only applies to a Build A Store district.");
      return;
    }
    if ((record.unavailableTurns ?? 0) > 0) {
      ui.notifications.warn(`That store is still recovering from its last level-up — ${record.unavailableTurns} kingdom turn(s) left.`);
      return;
    }

    const kingdomState = getKingdomState();
    if (kingdomState.kw < 3) {
      ui.notifications.warn("Not enough KW — leveling up a store costs 3 KW.");
      return;
    }
    kingdomState.kw -= 3;
    await setKingdomState(kingdomState);

    record.level = (record.level ?? 1) + 1;
    record.unavailableTurns = 2;
    await setPlacedBuildings(placed);

    ui.notifications.info(
      `Store leveled up to ${record.level} for 3 KW — it's unavailable this turn and next. Party can now trade items up to level (party level + ${record.level}) there.`
    );
    refreshAllKingdomApps();
    broadcastRefresh();
  } finally {
    restoreAllModuleWindows();
  }
}

/** Manages KW stored on a Bank (or any building with storageCapacity
 *  set) — deposit/withdraw 1 KW at a time. Deliberately NOT part of the
 *  Decide-phase action economy, matching the rulebook framing of this
 *  as a free action rather than one of the kingdom's 3 turn actions.
 *  DialogV2's multi-button form is used here rather than a number-input
 *  dialog, to keep this on already-proven ground (see pickBuilding/
 *  pickHex for the other dialog patterns already used successfully in
 *  this file) instead of introducing an untested form control. */
export async function manageBankStorage() {
  if (!requireGM("change the kingdom map")) return;
  minimizeAllModuleWindows();
  try {
    const offset = await pickHex("Click the Bank (or other storage building) you want to manage.");
    if (!offset) return;
    const key = hexKey(offset);

    const placed = getPlacedBuildings();
    const record = placed.find((p) => p.key === key && onThisScene(p));
    if (!record) {
      ui.notifications.warn("There's no district on that hex.");
      return;
    }
    const building = getBuildings().find((b) => b.id === record.buildingId);
    const capacity = building?.storageCapacity ?? 0;
    if (!capacity) {
      ui.notifications.warn(`${building?.name ?? "That building"} doesn't have KW storage.`);
      return;
    }

    const stored = record.storedKw ?? 0;
    const bonus = building.storageBonusKw ?? 0;
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: `${building.name} — Storage` },
      classes: ["pf2e-rk-dialog"],
      content: `<p>Currently storing <strong>${stored} / ${capacity} KW</strong>.</p><p>${
        stored >= capacity
          ? `Full — earning +${bonus} KW each kingdom turn while it stays that way.`
          : `Needs ${capacity - stored} more to fill and start earning +${bonus} KW per turn.`
      }</p>`,
      buttons: [
        { action: "deposit", label: "Deposit 1 KW", icon: "fas fa-arrow-up", disabled: stored >= capacity },
        { action: "withdraw", label: "Withdraw 1 KW", icon: "fas fa-arrow-down", disabled: stored <= 0 },
        { action: "cancel", label: "Close", icon: "fas fa-times" }
      ]
    });

    if (choice === "deposit") {
      const kingdomState = getKingdomState();
      if (kingdomState.kw < 1) {
        ui.notifications.warn("Not enough KW to deposit.");
        return;
      }
      kingdomState.kw -= 1;
      record.storedKw = Math.min(capacity, stored + 1);
      await setKingdomState(kingdomState);
      await setPlacedBuildings(placed);
      ui.notifications.info(`Deposited 1 KW — ${building.name} now storing ${record.storedKw}/${capacity}.`);
      refreshAllKingdomApps();
      broadcastRefresh();
    } else if (choice === "withdraw") {
      const kingdomState = getKingdomState();
      kingdomState.kw += 1;
      record.storedKw = Math.max(0, stored - 1);
      await setKingdomState(kingdomState);
      await setPlacedBuildings(placed);
      ui.notifications.info(`Withdrew 1 KW — ${building.name} now storing ${record.storedKw}/${capacity}.`);
      refreshAllKingdomApps();
      broadcastRefresh();
    }
  } finally {
    restoreAllModuleWindows();
  }
}

/** Architect's Move a District: pick two already-built districts, pay
 *  KW equal to the cheaper of the two, and swap their positions —
 *  deletes and re-places each building's tile(s) at the other's hex.
 *  Simplified from the rulebook's "completes after 1 kingdom turn" into
 *  an immediate swap; see the ability's in-app reminder note. */
export async function moveDistrict() {
  if (!requireGM("change the kingdom map")) return;
  minimizeAllModuleWindows();
  try {
    const offsetA = await pickHex("Click the first district to move.");
    if (!offsetA) return;
    const keyA = hexKey(offsetA);

    const placed = getPlacedBuildings();
    const recordA = placed.find((p) => p.key === keyA && onThisScene(p));
    if (!recordA) {
      ui.notifications.warn("There's no district on that hex.");
      return;
    }

    const offsetB = await pickHex("Now click the second district — the two will swap places.");
    if (!offsetB) return;
    const keyB = hexKey(offsetB);
    if (keyB === keyA) {
      ui.notifications.warn("Pick two different districts.");
      return;
    }

    const recordB = placed.find((p) => p.key === keyB && onThisScene(p));
    if (!recordB) {
      ui.notifications.warn("There's no district on that second hex.");
      return;
    }

    const buildings = getBuildings();
    const buildingA = buildings.find((b) => b.id === recordA.buildingId);
    const buildingB = buildings.find((b) => b.id === recordB.buildingId);
    const cost = Math.min(buildingA?.cost ?? 0, buildingB?.cost ?? 0);

    const kingdomState = getKingdomState();
    if (kingdomState.kw < cost) {
      ui.notifications.warn(`Not enough KW — moving costs ${cost} KW (the cheaper district's base cost).`);
      return;
    }

    // Delete both buildings' existing tiles, then re-place each building
    // definition at the OTHER hex — reuses the same sizing/placement
    // logic Build a District uses, so scatter buildings re-scatter
    // correctly rather than just having their old tiles translated.
    const allTileIds = [...(recordA.tileIds ?? []), ...(recordB.tileIds ?? [])];
    if (allTileIds.length && canvas?.scene) {
      try {
        await canvas.scene.deleteEmbeddedDocuments("Tile", allTileIds);
      } catch (err) {
        console.warn("PF2e Revamped Kingdoms | Couldn't delete tile(s) during move — they may already be gone", err);
      }
    }

    let newTileIdsForA = [];
    let newTileIdsForB = [];
    if (canvas?.scene) {
      try {
        if (buildingB?.tileImage) {
          newTileIdsForA =
            buildingB.placementMode === "scatter" ? await placeScatterBuilding(buildingB, offsetA) : await placeSingleBuilding(buildingB, offsetA);
        }
        if (buildingA?.tileImage) {
          newTileIdsForB =
            buildingA.placementMode === "scatter" ? await placeScatterBuilding(buildingA, offsetB) : await placeSingleBuilding(buildingA, offsetB);
        }
      } catch (err) {
        console.error("PF2e Revamped Kingdoms | Failed to re-place tiles during move", err);
      }
    }

    // Swap the tracking records: the building that WAS at A (buildingA)
    // now lives at B's old hex, and vice versa.
    recordA.buildingId = buildingB?.id ?? recordA.buildingId;
    recordA.tileIds = newTileIdsForA;
    recordB.buildingId = buildingA?.id ?? recordB.buildingId;
    recordB.tileIds = newTileIdsForB;

    kingdomState.kw -= cost;
    await setKingdomState(kingdomState);
    await setPlacedBuildings(placed);

    ui.notifications.info(`Districts swapped for ${cost} KW.`);
    refreshAllKingdomApps();
    broadcastRefresh();
  } finally {
    restoreAllModuleWindows();
  }
}

/* GM cleanup: wipes every reconnoitered marker without touching the
   underlying flag data — a visual reset if markers ever look stale. */
export async function clearReconMarkers() {
  if (!requireGM("clear reconnoitered markers")) return;
  await clearAllReconMarkers();
  ui.notifications.info("Cleared all Reconnoitered markers from this scene.");
}

/* ------------------------------------------------------------------ */
/* Transformations — Architect's Special Modifications                 */
/* A transformation converts an already-built district of one building */
/* type (fromBuildingId) into another (toBuildingId) in place: same     */
/* hex, its own separate KW cost and turn timer (NOT the original       */
/* building's own cost/buildTime — transforming isn't rebuilding from   */
/* scratch), old tile(s) deleted and new one(s) placed once the timer   */
/* completes, mirroring how Build a District's own construction delay   */
/* already works. Definitions themselves live in the "transformations"  */
/* setting, authored from Kingdom Configuration → Transformations.      */
/* ------------------------------------------------------------------ */

/** Returns every transformation whose fromBuildingId matches the given
 *  building AND that isn't locked behind an as-yet-unlocked research
 *  node (transformations with no researchLocked flag are always
 *  available, same "no lock = on" default buildings already use). */
function availableTransformationsFor(buildingId) {
  return getTransformations().filter(
    (t) => t.fromBuildingId === buildingId && (!t.researchLocked || isTransformationResearchUnlocked(t.id))
  );
}

/** Architect's Special Modifications: pick a placed district, pick which
 *  of its available transformations to apply (if more than one), pay
 *  that transformation's own KW cost, and start its own turn timer.
 *  Nothing about the tile changes yet — that happens in
 *  completeDueTransformations() once the timer reaches 0, same
 *  split as building a brand new district. */
export async function applyTransformation() {
  if (!requireGM("change the kingdom map")) return;
  minimizeAllModuleWindows();
  try {
    const offset = await pickHex("Click the district you want to apply a transformation to.");
    if (!offset) return;
    const key = hexKey(offset);

    const placed = getPlacedBuildings();
    const record = placed.find((p) => p.key === key && onThisScene(p));
    if (!record) {
      ui.notifications.warn("There's no district on that hex.");
      return;
    }
    if ((record.turnsRemaining ?? 0) > 0) {
      ui.notifications.warn("That district is still under construction — wait for it to finish first.");
      return;
    }
    if (record.pendingTransformationId) {
      ui.notifications.warn("That district already has a transformation in progress.");
      return;
    }

    const options = availableTransformationsFor(record.buildingId);
    if (!options.length) {
      ui.notifications.warn("That district has no available transformation (none defined, or the ones that exist are still locked behind research).");
      return;
    }

    let transformation = options[0];
    if (options.length > 1) {
      const pickedId = await foundry.applications.api.DialogV2.prompt({
        window: { title: "Apply a Transformation" },
        content: `
          <div class="form-group">
            <label>Transform into:</label>
            <select name="transformationId">
              ${options.map((t) => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.name)} (${t.kwCost} KW, ${t.turnTimeout} turn(s))</option>`).join("")}
            </select>
          </div>`,
        ok: {
          label: "Choose",
          callback: (event, button) => button.form.elements.transformationId.value
        },
        rejectClose: false
      }).catch(() => null);
      if (!pickedId) return;
      transformation = options.find((t) => t.id === pickedId) ?? transformation;
    }

    const cost = transformation.kwCost ?? 0;
    const kingdomState = getKingdomState();
    if (kingdomState.kw < cost) {
      ui.notifications.warn(`Not enough KW — ${transformation.name} costs ${cost} KW.`);
      return;
    }
    kingdomState.kw -= cost;
    await setKingdomState(kingdomState);

    record.pendingTransformationId = transformation.id;
    record.transformTurnsRemaining = transformation.turnTimeout ?? 0;
    await setPlacedBuildings(placed);

    // Instant-complete case (turnTimeout 0) — Finish Turn handles the
    // more common case of a multi-turn transformation completing over
    // subsequent turns; this covers one finishing immediately, same
    // split buildDistrict() already uses for buildTime 0.
    if ((transformation.turnTimeout ?? 0) <= 0) {
      await completeDueTransformations();
    }

    ui.notifications.info(
      `Applying ${transformation.name} for ${cost} KW.` +
        (transformation.turnTimeout > 0 ? ` Ready in ${transformation.turnTimeout} kingdom turn(s).` : "")
    );
    refreshAllKingdomApps();
    broadcastRefresh();
  } finally {
    restoreAllModuleWindows();
  }
}

/** Called from Finish Turn (via the module API, same reason every other
 *  cross-file hex action already goes through it — see main.js/kingdom.js
 *  for why a direct import would cycle). Ticks down every placed
 *  building's transformTurnsRemaining and, for any that just hit 0,
 *  actually performs the swap: delete the old tile(s), place the TO
 *  building's tile(s) via the same placement logic Build a District and
 *  Move a District already use, and update the record's buildingId.
 *  Kept as its own exported function (rather than folded into the
 *  turnsRemaining loop in kingdom.js) so the tile-placement logic that
 *  only exists in this file doesn't need to move or be duplicated. */
export async function completeDueTransformations() {
  const placed = getPlacedBuildings();
  const pending = placed.filter((p) => p.pendingTransformationId);
  if (!pending.length) return [];

  const transformations = getTransformations();
  const buildings = getBuildings();
  const completed = [];

  for (const record of pending) {
    if ((record.transformTurnsRemaining ?? 0) > 0) {
      record.transformTurnsRemaining -= 1;
    }
    if ((record.transformTurnsRemaining ?? 0) > 0) continue;

    const transformation = transformations.find((t) => t.id === record.pendingTransformationId);
    const toBuilding = buildings.find((b) => b.id === transformation?.toBuildingId);
    if (!transformation || !toBuilding) {
      // The transformation or its target building was deleted out from
      // under an in-progress one — clear the pending state rather than
      // leaving it stuck forever with nothing to complete into.
      console.warn("PF2e Revamped Kingdoms | A pending transformation's definition or target building no longer exists — clearing it", record);
      delete record.pendingTransformationId;
      delete record.transformTurnsRemaining;
      continue;
    }

    if (record.tileIds?.length && canvas?.scene) {
      try {
        await canvas.scene.deleteEmbeddedDocuments("Tile", record.tileIds);
      } catch (err) {
        console.warn("PF2e Revamped Kingdoms | Couldn't delete tile(s) before transforming — they may already be gone", err);
      }
    }

    let newTileIds = [];
    if (toBuilding.tileImage && canvas?.scene) {
      try {
        const offset = { i: record.i, j: record.j };
        newTileIds =
          toBuilding.placementMode === "scatter" ? await placeScatterBuilding(toBuilding, offset) : await placeSingleBuilding(toBuilding, offset);
      } catch (err) {
        console.error("PF2e Revamped Kingdoms | Failed to place tile(s) for a completed transformation", err);
      }
    }

    record.buildingId = toBuilding.id;
    record.tileIds = newTileIds;
    delete record.pendingTransformationId;
    delete record.transformTurnsRemaining;
    completed.push({ name: transformation.name, key: record.key });
  }

  await setPlacedBuildings(placed);
  return completed;
}

/** Expedite Labour: pick a district under construction, reduce its
 *  remaining build time by one turn, deduct 2 KW. Click a hex that has
 *  a building still under construction. */
export async function reduceBuildTime() {
  if (!requireGM("change the kingdom map")) return;
  minimizeAllModuleWindows();
  try {
    const offset = await pickHex("Click the district you want to expedite.");
    if (!offset) return;
    const key = hexKey(offset);

    const placed = getPlacedBuildings();
    const record = placed.find((p) => p.key === key && onThisScene(p));
    if (!record) {
      ui.notifications.warn("There's no district on that hex.");
      return;
    }
    if ((record.turnsRemaining ?? 0) <= 0) {
      ui.notifications.warn("That district is already complete.");
      return;
    }

    const kingdomState = getKingdomState();
    if (kingdomState.kw < 2) {
      ui.notifications.warn("Not enough KW — expediting costs 2 KW.");
      return;
    }
    kingdomState.kw -= 2;
    await setKingdomState(kingdomState);

    record.turnsRemaining = Math.max(0, record.turnsRemaining - 1);
    await setPlacedBuildings(placed);

    const buildingName = getBuildings().find((b) => b.id === record.buildingId)?.name ?? "District";
    ui.notifications.info(
      `${buildingName} expedited for 2 KW — ${record.turnsRemaining > 0 ? `${record.turnsRemaining} turn(s) remaining.` : "complete!"}`
    );
    refreshAllKingdomApps();
    broadcastRefresh();
  } finally {
    restoreAllModuleWindows();
  }
}

/** GM cleanup utility: sets locked:false on every tile in the current
 *  scene, in case anything got left locked (from a manual edit, an
 *  older version of this module, or otherwise) and can't be selected
 *  to delete normally. Non-destructive — just unlocks. */
export async function unlockAllTiles() {
  if (!requireGM("unlock tiles")) return;
  if (!canvas?.scene) {
    ui.notifications.warn("No active scene.");
    return;
  }
  const updates = canvas.scene.tiles.map((t) => ({ _id: t.id, locked: false }));
  if (!updates.length) {
    ui.notifications.info("No tiles on this scene.");
    return;
  }
  await canvas.scene.updateEmbeddedDocuments("Tile", updates);
  ui.notifications.info(`Unlocked ${updates.length} tile(s) — you can now select and delete any of them normally.`);
}

/** Re-runs the current (correct) sizing/centering math against every
 *  already-placed single-mode district tile on this scene. Useful after
 *  a sizing fix like this one, since fixing the code doesn't retroactively
 *  fix tiles that were placed by an earlier, buggier version. Leaves
 *  scatter-mode tiles alone since those are meant to be scattered, not
 *  centered on the hex. */
export async function recenterAllDistrictTiles() {
  if (!requireGM("recenter district tiles")) return;
  if (!canvas?.scene) {
    ui.notifications.warn("No active scene.");
    return;
  }

  const placed = getPlacedBuildings();
  const buildings = getBuildings();
  const updates = [];

  const tilesHere = canvas.scene.tiles;
  for (const record of placed) {
    if (!onThisScene(record)) continue;
    const building = buildings.find((b) => b.id === record.buildingId);
    if (!building?.tileImage || building.placementMode === "scatter") continue;
    if (!record.tileIds?.length) continue;

    let rect;
    try {
      rect = await singleTileRect(building, { i: record.i, j: record.j });
    } catch {
      continue;
    }

    for (const tileId of record.tileIds) {
      if (!tilesHere.has(tileId)) continue; // removed by hand on the canvas
      // "texture.src" included so this also picks up an image change made
      // in Kingdom Configuration — a building's own definition changing
      // doesn't retroactively touch tiles already placed on the canvas,
      // since each Tile document is its own independent snapshot from
      // whenever it was placed. This utility is the fix for that: run it
      // after editing a building's art to push the update to everything
      // already built.
      updates.push({ _id: tileId, ...rect, "texture.src": building.tileImage });
    }
  }

  if (!updates.length) {
    ui.notifications.info("No single-mode district tiles found to recenter.");
    return;
  }

  try {
    await canvas.scene.updateEmbeddedDocuments("Tile", updates);
    ui.notifications.info(`Recentered ${updates.length} tile(s).`);
  } catch (err) {
    console.error("PF2e Revamped Kingdoms | Failed to recenter tiles", err);
    ui.notifications.error("Couldn't recenter tiles — see the console for details.");
  }
}

/* ------------------------------------------------------------------ */
/* Hover tooltip for placed districts + reconnoitered markers           */
/*                                                                      */
/* The DOM pointermove + manual worldTransform-inversion approach from  */
/* the previous round is CONFIRMED WORKING (screenshot showed "Oleg's   */
/* Trading Post" popping correctly, toggle button reading ON). Kept as  */
/* the coordinate source. Everything below builds on top of that:      */
/*  - hit-testing is now HEX-based (the whole hex a building sits in    */
/*    triggers its tooltip), not just the building's own pixel bounds — */
/*    reuses canvas.grid.getOffset(), the same call pickHex() already   */
/*    uses successfully elsewhere in this file for the same conversion. */
/*  - a faint hex outline follows the cursor, independent of whether    */
/*    that hex has anything in it, so the coordinate math is visually   */
/*    self-checking — reuses the exact PIXI.Graphics technique from     */
/*    pickHex()'s own hover preview (proven pattern, not a new guess).  */
/*  - gated to a single named scene, checked by canvas.scene.name.      */
/*  - the toggle now tries to live in the actual Token Controls toolbar */
/*    via getSceneControlButtons, using the OBJECT-keyed-by-group shape */
/*    this world's console log confirmed for Foundry V13. Falls back to */
/*    the floating button (previous round) if that fails for any       */
/*    reason — never silently ends up with no toggle at all.            */
/* ------------------------------------------------------------------ */

const TOOLTIP_SCENE_NAME = "The Stolen Lands";

/* Tooltips used to work only on a scene named exactly "The Stolen Lands".
   They now also switch on for any scene the kingdom has claimed hexes or
   districts on, so renaming or copying the map doesn't silently turn them
   off. Worked out once per scene change (and after claims change) rather
   than on every mouse movement. */
let tooltipSceneActive = false;

function updateTooltipScene() {
  const scene = canvas?.scene;
  if (!scene) {
    tooltipSceneActive = false;
    return;
  }
  const mine = (rec) => rec.sceneId === scene.id;
  tooltipSceneActive =
    scene.name === TOOLTIP_SCENE_NAME || getClaimedHexes().some(mine) || getPlacedBuildings().some(mine);
}

function isTooltipScene() {
  return tooltipSceneActive;
}

function setTooltipsEnabled(value) {
  tooltipsEnabled = !!value;
  try {
    game.settings.set(MODULE_ID, "tooltipsEnabled", tooltipsEnabled);
  } catch {
    // remembering the choice is a nicety; the toggle still works without it
  }
  if (!tooltipsEnabled) {
    currentHoverKey = null;
    hideTooltip();
    hideHexOutline();
  }
}

let tooltipEl = null;
let tooltipMoveHandler = null;
let currentHoverKey = null;
let currentHexOutlineKey = null;
let canvasPointerMoveHandler = null;
let wiredView = null;
let tooltipsEnabled = true;
let hexOutlineGraphics = null;
let sceneControlToggleAdded = false;

function ensureTooltipEl() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement("div");
  tooltipEl.className = "pf2e-rk-tile-tooltip";
  tooltipEl.style.display = "none";
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function showTooltipContent(html) {
  const el = ensureTooltipEl();
  el.innerHTML = html;
  el.style.display = "flex";

  if (tooltipMoveHandler) document.removeEventListener("pointermove", tooltipMoveHandler);
  tooltipMoveHandler = (event) => {
    el.style.left = `${event.clientX + 18}px`;
    el.style.top = `${event.clientY + 18}px`;
  };
  document.addEventListener("pointermove", tooltipMoveHandler);
}

function showBuildingTooltip(building, record) {
  const level = record?.level ?? 1;
  const isStore = building.id === "build-a-store";
  const unavailableTurns = record?.unavailableTurns ?? 0;
  const turnsRemaining = record?.turnsRemaining ?? 0;
  const capacity = building.storageCapacity ?? 0;
  const stored = record?.storedKw ?? 0;
  showTooltipContent(`
    ${building.tileImage ? `<div class="pf2e-rk-tile-tooltip__img" style="background-image:${escapeHTML(cssUrl(building.tileImage))}"></div>` : ""}
    <div class="pf2e-rk-tile-tooltip__body">
      <h4>${escapeHTML(building.name)}${level > 1 ? ` <span class="pf2e-rk-tile-tooltip__level">Level ${level}</span>` : ""}</h4>
      ${building.traits?.length ? `<p class="pf2e-rk-tile-tooltip__traits">${escapeHTML(building.traits.join(", "))}</p>` : ""}
      ${isStore ? `<p class="pf2e-rk-tile-tooltip__traits">Trades items up to party level + ${level}</p>` : ""}
      ${capacity > 0 ? `<p class="pf2e-rk-tile-tooltip__traits">Storage: ${stored}/${capacity} KW${stored >= capacity ? " (full — earning its bonus)" : ""}</p>` : ""}
      ${turnsRemaining > 0 ? `<p class="pf2e-rk-tile-tooltip__unavailable">&#9203; Under construction — ${turnsRemaining} more kingdom turn(s)</p>` : ""}
      ${unavailableTurns > 0 ? `<p class="pf2e-rk-tile-tooltip__unavailable">&#9203; Unavailable for ${unavailableTurns} more kingdom turn(s)</p>` : ""}
      <div class="pf2e-rk-tile-tooltip__effect">${building.effect ?? ""}</div>
    </div>`);
}

function showReconTooltip() {
  showTooltipContent(`
    <div class="pf2e-rk-tile-tooltip__body">
      <h4>&#128270; Reconnoitered</h4>
      <div class="pf2e-rk-tile-tooltip__effect"><p>Claiming this hex will be free, once.</p></div>
    </div>`);
}

function hideTooltip() {
  if (!tooltipEl) return;
  tooltipEl.style.display = "none";
  if (tooltipMoveHandler) {
    document.removeEventListener("pointermove", tooltipMoveHandler);
    tooltipMoveHandler = null;
  }
}

/** Whole-hex hit test: is there a placed building tracked on this exact
 *  hex? Uses the SAME hex key format (`i,j`) every other part of this
 *  module already stores placements/claims under, so this is a direct
 *  lookup, not bounding-box math. */
function findBuildingAtHexKey(key) {
  const record = getPlacedBuildings().find((p) => p.key === key && onThisScene(p));
  if (!record) return null;
  const building = getBuildings().find((b) => b.id === record.buildingId);
  return building ? { building, record } : null;
}

function isHexReconnoitered(key) {
  return getReconnoiteredHexes().includes(key);
}

/** Converts a browser client-space point (event.clientX/Y) to world/
 *  canvas coordinates by inverting canvas.stage's own transform matrix
 *  directly — plain PIXI math, no Foundry API involved. Confirmed
 *  working against a live canvas (see session notes). */
function clientPointToWorld(clientX, clientY) {
  const view = canvas.app?.view;
  const stage = canvas.stage;
  if (!view || !stage) return null;
  const rect = view.getBoundingClientRect();
  const t = stage.worldTransform;
  if (!t || !t.a || !t.d) return null;
  return {
    x: (clientX - rect.left - t.tx) / t.a,
    y: (clientY - rect.top - t.ty) / t.d
  };
}

/** The faint "what hex am I looking at" outline. Same PIXI.Graphics
 *  technique as pickHex()'s own hover preview below, just non-
 *  interactive and left up continuously instead of during a click-to-
 *  pick flow. */
function ensureHexOutlineGraphics() {
  if (hexOutlineGraphics && !hexOutlineGraphics.destroyed) return hexOutlineGraphics;
  hexOutlineGraphics = new PIXI.Graphics();
  hexOutlineGraphics.eventMode = "none";
  (canvas.interface ?? canvas.stage).addChild(hexOutlineGraphics);
  return hexOutlineGraphics;
}

function drawHexOutline(offset) {
  const g = ensureHexOutlineGraphics();
  g.clear();
  if (!offset) return;
  try {
    const center = canvas.grid.getCenterPoint(offset);
    const corners = computeHexCorners(center);
    g.lineStyle(1.5, 0xe8b651, 0.45);
    g.moveTo(corners[0].x, corners[0].y);
    for (const c of corners.slice(1)) g.lineTo(c.x, c.y);
    g.closePath();
  } catch {
    // grid math failed for some reason — just skip drawing this frame
  }
}

function hideHexOutline() {
  if (hexOutlineGraphics && !hexOutlineGraphics.destroyed) hexOutlineGraphics.clear();
  currentHexOutlineKey = null;
}

function handleCanvasPointerMove(event) {
  if (!tooltipsEnabled || !isTooltipScene()) return;

  const point = clientPointToWorld(event.clientX, event.clientY);
  if (!point) return;

  let offset = null;
  try {
    offset = canvas.grid.getOffset(point);
  } catch {
    offset = null;
  }
  const key = offset ? hexKey(offset) : null;

  // Real performance fix, not a style tweak: this handler runs on every
  // single pointermove over the canvas — dozens to hundreds of times a
  // second while the mouse is simply moving, completely unthrottled.
  // findBuildingAtHexKey() below calls getPlacedBuildings() AND
  // getBuildings(), and both of those deep-clone a full settings array
  // on every call (see data.js) — that was happening on every one of
  // those pointermove events regardless of whether the cursor had even
  // left the hex it was already over, which is exactly the kind of
  // repeated main-thread work that shows up as sporadic lag while
  // moving the mouse around the map, worse on slower CPUs. Bailing out
  // here the instant the hovered hex key hasn't changed means the
  // expensive lookups below only ever run once per hex the cursor
  // actually enters, not once per pixel it crosses.
  if (key === currentHexOutlineKey) return;
  currentHexOutlineKey = key;
  drawHexOutline(offset);

  if (!key) {
    if (currentHoverKey !== null) {
      currentHoverKey = null;
      hideTooltip();
    }
    return;
  }

  const buildingHit = findBuildingAtHexKey(key);
  if (buildingHit) {
    const hoverKey = `building:${key}`;
    if (currentHoverKey !== hoverKey) {
      currentHoverKey = hoverKey;
      showBuildingTooltip(buildingHit.building, buildingHit.record);
    }
    return;
  }

  if (isHexReconnoitered(key)) {
    const hoverKey = `recon:${key}`;
    if (currentHoverKey !== hoverKey) {
      currentHoverKey = hoverKey;
      showReconTooltip();
    }
    return;
  }

  if (currentHoverKey !== null) {
    currentHoverKey = null;
    hideTooltip();
  }
}

function wireCanvasHover() {
  const view = canvas?.app?.view;
  if (!view) {
    console.warn("PF2e Revamped Kingdoms | Tooltip setup: canvas.app.view isn't available yet — hover tooltips can't attach.");
    return;
  }
  if (wiredView === view) return; // already wired for this scene's canvas element

  if (wiredView && canvasPointerMoveHandler) {
    wiredView.removeEventListener("pointermove", canvasPointerMoveHandler);
  }

  currentHoverKey = null;
  hideTooltip();
  hideHexOutline();

  canvasPointerMoveHandler = handleCanvasPointerMove;
  view.addEventListener("pointermove", canvasPointerMoveHandler);
  view.addEventListener("pointerleave", () => {
    currentHoverKey = null;
    hideTooltip();
    hideHexOutline();
  });
  wiredView = view;

  console.log(
    `PF2e Revamped Kingdoms | Tooltip hover listener attached. Scene: "${canvas.scene?.name}" (active: ${isTooltipScene()}). Tracked tiles: ${canvas.scene?.tiles?.size ?? 0}.`
  );
}

/** Floating fallback toggle — same as the previous round, kept in
 *  reserve in case the Token Controls integration below doesn't stick
 *  in some Foundry version. Hidden entirely off the target scene. */
let toggleButtonEl = null;

function updateToggleButtonLabel() {
  if (!toggleButtonEl) return;
  toggleButtonEl.textContent = tooltipsEnabled ? "🏠 Kingdom Tooltips: ON" : "🏠 Kingdom Tooltips: OFF";
  toggleButtonEl.classList.toggle("is-active", tooltipsEnabled);
}

function ensureToggleButton() {
  if (!toggleButtonEl || !document.body.contains(toggleButtonEl)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pf2e-rk-tooltip-toggle";
    btn.addEventListener("click", () => {
      setTooltipsEnabled(!tooltipsEnabled);
      updateToggleButtonLabel();
    });
    document.body.appendChild(btn);
    toggleButtonEl = btn;
    updateToggleButtonLabel();
  }
  toggleButtonEl.style.display = isTooltipScene() ? "" : "none";
}

/** Tries to add the toggle to the actual Token Controls toolbar. Wrapped
 *  defensively: if this fails or the expected shape isn't there, the
 *  floating button above stays as a working fallback rather than the
 *  feature silently having no toggle at all. Only adds the tool while
 *  on the target scene, and asks Foundry to rebuild controls on every
 *  scene change so that check re-runs (ui.controls.render() is a plain
 *  Application render call, not a version-fragile API). */
function addTooltipToggleControl(controls) {
  try {
    const group = controls?.tokens;
    if (!group?.tools || !isTooltipScene()) return false;
    group.tools["pf2e-rk-tooltip-toggle"] = {
      name: "pf2e-rk-tooltip-toggle",
      title: "Kingdom building tooltips",
      icon: "fas fa-info-circle",
      toggle: true,
      active: tooltipsEnabled,
      onChange: (_event, active) => setTooltipsEnabled(active)
    };
    return true;
  } catch (err) {
    console.warn("PF2e Revamped Kingdoms | Couldn't add the tooltip toggle to Token Controls — using the floating button instead", err);
    return false;
  }
}

/** Called once from main.js on init. */
export function initHoverTooltips() {
  try {
    tooltipsEnabled = game.settings.get(MODULE_ID, "tooltipsEnabled") ?? true;
  } catch {
    tooltipsEnabled = true;
  }

  Hooks.on("getSceneControlButtons", (controls) => {
    sceneControlToggleAdded = addTooltipToggleControl(controls);
    if (sceneControlToggleAdded && toggleButtonEl) {
      toggleButtonEl.remove();
      toggleButtonEl = null;
    }
  });

  const onCanvasReady = () => {
    updateTooltipScene();
    ui.controls?.render(); // re-checks the scene-gate for the Token Controls path
    if (!sceneControlToggleAdded) ensureToggleButton();
    wireCanvasHover();
  };

  Hooks.on("canvasReady", onCanvasReady);
  if (canvas?.ready) onCanvasReady();
}
