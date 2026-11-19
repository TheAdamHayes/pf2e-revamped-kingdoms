import {
  getDomains,
  getEvents,
  getUniversalActions,
  getFactions,
  setFactions,
  getKingdomState,
  setKingdomState,
  getResolveState,
  setResolveState,
  getKingdomName,
  getBuildings,
  getPlacedBuildings,
  setPlacedBuildings,
  getFactionTaxes,
  setFactionTaxes,
  getAtWar,
  getFestivalCost,
  setFestivalCost,
  getActiveEventId,
  setActiveEventId,
  getActiveEventPage,
  setActiveEventPage,
  getBonusActionSlots,
  setBonusActionSlots,
  getQuestlineProgress,
  setQuestlineProgress,
  isDomainResearchUnlocked,
  escapeHTML,
  cssUrl,
  canWriteWorld,
  TAX_LEVELS,
  EVENT_CONDITIONS,
  EVENT_TYPES,
  MODULE_ID,
  getPetitions,
  getQueuedEvents,
  setQueuedEvents,
  getMemories,
  getActiveEventChoice,
  setActiveEventChoice,
  getKingdomTurn,
  setKingdomTurn
} from "./data.js";
import { KingdomConfigApp } from "./kingdom-config.js";
import {
  tierOf,
  clampHappiness,
  moodLabel,
  ladderRows,
  favourAvailable,
  favourActions,
  tradeIncome,
  tradeIncomeRows,
  describeEffects,
  applyEffects,
  eventConditionsMet,
  acceptPetition,
  resolvePetition,
  tickPetitions,
  checkStoryArcs,
  whisperGM
} from "./factions.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* Tracks every currently-open window from this module — both the main
   Kingdom app and the GM Config app — so minimize/restore (used while a
   Claim Hex / Build District picker is up) can affect all of them, and
   so a GM's saved edits can push a live refresh to Kingdom windows
   without anyone needing to reload the page. */
const openWindows = new Set();

export function registerModuleWindow(app) {
  openWindows.add(app);
}

export function unregisterModuleWindow(app) {
  openWindows.delete(app);
}

/* Many actions change two or three settings in a row and each one asks
   for a refresh; on remote clients several socket "refresh" messages can
   land together too. Re-rendering the whole window for every one of
   those was most of the "it stutters after I click" feel. Requests made
   in the same moment now collapse into a single render on the next
   frame. */
let kingdomRefreshQueued = false;

export function refreshAllKingdomApps() {
  if (kingdomRefreshQueued) return;
  kingdomRefreshQueued = true;
  const run = () => {
    kingdomRefreshQueued = false;
    renderKingdomWindowsNow();
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else setTimeout(run, 0);
}

/** Opens a module window, or brings the existing one forward if it's
 *  already open. These windows use fixed ids, so a second copy would
 *  fight the first for the same id. */
export function focusOrOpen(AppClass, options = {}) {
  const id = AppClass.DEFAULT_OPTIONS?.id;
  const existing = id ? foundry.applications.instances?.get(id) : null;
  if (existing?.rendered) {
    existing.maximize?.();
    if (typeof existing.bringToFront === "function") existing.bringToFront();
    else existing.bringToTop?.();
    return existing;
  }
  const app = new AppClass(options);
  app.render(true);
  return app;
}

function renderKingdomWindowsNow() {
  // Used to be scoped to RevampedKingdomApp only, to avoid wiping
  // whatever the GM was mid-way through editing in Kingdom Config — that
  // was true back when Config held every edit as an in-memory draft
  // until a separate "Save & Publish" click. Publishing now happens
  // immediately per item (see kingdom-config.js's #broadcastChange), so
  // there's no batched draft left to lose, and _prepareContext there
  // re-reads its lists fresh on every render rather than caching them
  // once per window session — the change that actually makes rendering
  // this app here safe. Re-rendering it now is what lets an ALREADY-
  // OPEN Config window pick up a building created from somewhere else
  // entirely (the Research Tree's own "+ New" building flow, for
  // instance) without needing to be closed and reopened. A currently-
  // open, unsaved item editor (mid-typing a new Domain's ability, say)
  // is untouched either way — that lives in its own #editingX field,
  // separate from the lists this refresh is about.
  for (const app of openWindows) {
    if (app instanceof RevampedKingdomApp || app instanceof KingdomConfigApp) app.render();
  }
}

/** "Pull players to screen": opens this client's Kingdom Management
 *  window if it isn't already open, brings it to the front and
 *  un-minimizes it if it is, and optionally jumps to a specific tab —
 *  called from the socket handler in main.js when the GM broadcasts a
 *  pull. Each client has its own separate openWindows Set (this isn't
 *  shared state), so this only ever finds/creates a window on the
 *  client it's running on, which is exactly what's wanted here. */
/** The Kingdom window currently being opened or shown, so a quick double
 *  click on the launcher can't open two of them before the first has
 *  finished drawing. Cleared when the window closes. */
let kingdomAppInstance = null;

export function openOrFocusKingdomApp(tab) {
  let app = [...openWindows].find((w) => w instanceof RevampedKingdomApp) ?? kingdomAppInstance;
  if (app) {
    app.maximize?.();
    // Foundry has used both bringToFront (ApplicationV2) and bringToTop
    // (the older V1 Application) as the "raise z-index" method name
    // across versions — try both rather than guess wrong and silently
    // do nothing extra.
    if (typeof app.bringToFront === "function") app.bringToFront();
    else if (typeof app.bringToTop === "function") app.bringToTop();
    if (tab) app.switchToTab(tab);
    app.render(); // harmless if the above already did it; cheap safety net either way
  } else {
    app = new RevampedKingdomApp(tab ? { startTab: tab } : {});
    kingdomAppInstance = app;
    app.render(true);
  }
}

export function minimizeAllModuleWindows() {
  for (const app of openWindows) app.minimize?.();
}

export function restoreAllModuleWindows() {
  for (const app of openWindows) app.maximize?.();
}

function broadcastRefresh() {
  game.socket.emit(`module.${MODULE_ID}`, { action: "refresh" });
}

/** Evaluates one condition tag against live game state. Used both by
 *  the random event picker and available for anything else that wants
 *  a read on "is the kingdom in trouble" later. */
function evaluateEventCondition(tag, state) {
  switch (tag) {
    case "always":
      return true;
    case "kw-negative":
      return state.kw < 0;
    case "kw-low":
      return state.kw < 5;
    case "kw-high":
      return state.kw >= 20;
    case "happiness-negative":
      return state.factions.some((f) => f.happiness < 0);
    case "happiness-very-negative":
      return state.factions.some((f) => f.happiness <= -2);
    case "happiness-high":
      return state.factions.some((f) => f.happiness >= 2);
    case "at-war":
      return state.atWar;
    default:
      return false;
  }
}

/** An event with no condition tags is always eligible. Otherwise it's
 *  eligible if ANY one of its tags currently matches (OR, not AND) — an
 *  event can be relevant to more than one kind of crisis. */
/** Applies a tax level's KW/happiness effect to one faction, MUTATING
 *  its happiness in place, and returns what actually happened. The KW
 *  gain is scaled by how much happiness ACTUALLY moved, not the nominal
 *  amount — closes an exploit where Aggressive taxes became free once a
 *  faction's happiness was already floored at -3 (the code applied the
 *  full +2 KW every time regardless of whether the -2 happiness could
 *  still happen at all). A faction already fully floored/ceilinged for
 *  this direction now yields proportionally less KW, down to zero if
 *  completely capped — matching the narrative logic that a tax hike
 *  someone's already maximally furious about shouldn't still pay out
 *  in full. */
function applyScaledTaxEffect(faction, level) {
  const { kw: kwDelta, happiness: happinessDelta, label } = TAX_LEVELS[level];
  const before = faction.happiness;
  const after = Math.max(HAPPINESS_MIN, Math.min(HAPPINESS_MAX, before + happinessDelta));
  const actualHappinessChange = after - before;
  const effectiveness = happinessDelta !== 0 ? Math.abs(actualHappinessChange / happinessDelta) : 1;
  const actualKwDelta = Math.round(kwDelta * effectiveness);
  faction.happiness = after;
  return { kwDelta: actualKwDelta, happinessDelta: actualHappinessChange, label, wasCapped: effectiveness < 1 };
}

function isEventEligible(eventDef, state) {
  // Faction and memory requirements have to hold; a petition already
  // pinned on the board can't come up again until it's dealt with.
  if (state.pinnedEventIds?.has(eventDef.id)) return false;
  if (eventDef.queueOnly) return false; // only comes up through a choice or a faction's story
  if (!eventConditionsMet(eventDef, { factions: state.factions, memories: state.memories ?? [] })) return false;
  const tags = eventDef.conditions ?? [];
  if (!tags.length || tags.includes("always")) return true;
  return tags.some((tag) => evaluateEventCondition(tag, state));
}

/** A resolve entry's interactionType/playerEffect/reminderMessage get
 *  baked in from the ability definition at the moment it's DRAGGED onto
 *  the timeline (Decide phase) — see #buildActionChip / #onConfirmActions.
 *  That's a problem whenever the ability's own definition gets fixed or
 *  reset AFTER an action was already placed on the current turn's
 *  timeline: the already-placed entry keeps whatever was true at
 *  drag-time, so e.g. a "Reset Domains" fix would not retroactively
 *  reach an action already sitting in Resolve. This looks the ability
 *  back up FRESH by domain+title every time the wizard renders, so any
 *  later fix takes effect immediately without needing the GM to remove
 *  and re-drag the action. Falls back to whatever was already stored if
 *  no live match is found (e.g. the ability was renamed/deleted since). */
function refreshEntryInteractionData(entry) {
  const norm = (s) => (s ?? "").trim().toLowerCase();
  const domain = getDomains().find((d) => norm(d.name) === norm(entry.domain));
  let live = domain?.abilities?.find((a) => norm(a.title) === norm(entry.action));
  if (!live) live = getUniversalActions().find((a) => norm(a.title) === norm(entry.action));
  if (!live) live = favourActions().find((a) => norm(a.title) === norm(entry.action));

  // This ran on every render and logged every time; now it only speaks
  // up when the lookup genuinely fails, which is the case worth knowing.
  if (!live) {
    console.debug("PF2e Revamped Kingdoms | No live ability found for resolve entry", entry.domain, entry.action);
    return entry;
  }

  return {
    ...entry,
    interactionType: live.interactionType ?? "generic",
    playerEffect: live.playerEffect ?? null,
    reminderMessage: live.reminderMessage ?? null
  };
}

/** Normalizes any event (single/multiscreen/questline) into one uniform
 *  shape for the template — displayArt/displayTint/displayTitle/
 *  displayBody always mean "what to show right now", regardless of
 *  which type of event this is or how far into it the group has gotten.
 *  This is what lets kingdom.hbs use one shared block of markup for the
 *  actual event-scene display instead of three parallel template
 *  branches; only the navigation controls beneath it differ by type. */
function buildEventDisplayModel(event, activeEventPage, questlineProgress) {
  const type = event.type ?? "single";

  if (type === "multiscreen") {
    const pages = event.pages ?? [];
    const pageIndex = pages.length ? Math.max(0, Math.min(activeEventPage ?? 0, pages.length - 1)) : 0;
    const page = pages[pageIndex] ?? {};
    const isLastPage = pageIndex >= pages.length - 1;
    return {
      ...event,
      displayArt: page.art || event.art,
      displayTint: page.tintColor || event.tintColor,
      displayTitle: page.title || event.title,
      displayBody: page.body ?? "",
      isMultiscreen: true,
      pageIndex,
      pageDisplay: pageIndex + 1,
      pageCount: pages.length,
      isFirstPage: pageIndex === 0,
      isLastPage,
      showOutcomes: isLastPage && (event.outcomes?.length ?? 0) > 0
    };
  }

  if (type === "questline") {
    const stages = event.stages ?? [];
    const savedStage = questlineProgress?.[event.id] ?? 0;
    const stageIndex = stages.length ? Math.max(0, Math.min(savedStage, stages.length - 1)) : 0;
    const stage = stages[stageIndex] ?? {};
    const isLastStage = stageIndex >= stages.length - 1;
    return {
      ...event,
      displayArt: stage.art || event.art,
      displayTint: stage.tintColor || event.tintColor,
      displayTitle: stage.title || event.title,
      displayBody: stage.body ?? "",
      isQuestline: true,
      stageIndex,
      stageDisplay: stageIndex + 1,
      stageCount: stages.length,
      isLastStage,
      showOutcomes: false
    };
  }

  return {
    ...event,
    displayArt: event.art,
    displayTint: event.tintColor,
    displayTitle: event.title,
    displayBody: event.body ?? "",
    isSingle: true,
    showOutcomes: (event.outcomes?.length ?? 0) > 0
  };
}

/* ------------------------------------------------------------------ */
/* Resolve timeline changes that players can make                      */
/* ------------------------------------------------------------------ */

/** Builds a timeline entry from the live domain/ability data, so the
 *  description and buttons always come from the GM's own definitions —
 *  never from whatever a client happened to send. Same shape entries
 *  have always had. */
export function buildResolveEntry(domainId, title, cost) {
  const domain = getDomains().find((d) => d.id === domainId);
  if (!domain) return null;
  if (domain.researchLocked && !isDomainResearchUnlocked(domain.id)) return null;
  const ability =
    (domain.abilities ?? []).find((a) => a.title === title) ??
    getUniversalActions().find((a) => a.title === title) ??
    favourActions().find((a) => a.title === title);
  if (!ability) return null;
  const costs = ability.costs?.length ? ability.costs : [1];
  const chosenCost = costs.includes(cost) ? cost : costs[0];
  return {
    id: foundry.utils.randomID(),
    domain: domain.name,
    art: domain.portrait,
    action: ability.title,
    description: ability.description ?? "",
    cost: chosenCost,
    kwEffect: ability.kwEffect ?? 0,
    happinessFactionId: ability.happinessFactionId ?? null,
    happinessEffect: ability.happinessEffect ?? 0,
    interactionType: ability.interactionType ?? "generic",
    playerEffect: ability.playerEffect ?? null,
    reminderMessage: ability.reminderMessage ?? null,
    resolved: false
  };
}

/** Applies one change to the shared timeline against the freshest saved
 *  copy. Working from the fresh copy (rather than a whole timeline sent
 *  by a client) means two players confirming at the same moment both
 *  land, instead of the second quietly overwriting the first. */
export async function applyResolveOp(op) {
  const state = getResolveState();
  if (op?.type === "append") {
    const entries = (op.picks ?? [])
      .slice(0, 12)
      .map((p) => buildResolveEntry(op.domainId, p.title, Number(p.cost)))
      .filter(Boolean);
    if (!entries.length) return false;
    state.entries.push(...entries);
  } else if (op?.type === "reorder") {
    if (state.locked) return false;
    const fromIdx = state.entries.findIndex((e) => e.id === op.draggedId);
    const toIdx = state.entries.findIndex((e) => e.id === op.targetId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return false;
    const [moved] = state.entries.splice(fromIdx, 1);
    state.entries.splice(toIdx, 0, moved);
  } else {
    return false;
  }
  await setResolveState(state);
  return true;
}

/** Players can't write world settings, so their timeline changes are
 *  handed to the GM's client to save (see main.js). The GM, or an
 *  Assistant GM, just applies them directly. */
export async function requestResolveOp(op) {
  if (canWriteWorld()) return applyResolveOp(op);
  if (!game.users?.activeGM) {
    ui.notifications.warn("The GM needs to be connected to record that.");
    return false;
  }
  game.socket.emit(`module.${MODULE_ID}`, { action: "resolveOp", op });
  return true;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

/** Total kingdom actions per turn: normally 3, permanently increased by
 *  anything tagged grantsBonusActionSlot once its construction actually
 *  completes (see Finish Turn) — e.g. the Milestone Obelisk. Computed
 *  fresh rather than cached, so a bonus granted mid-session takes effect
 *  on the very next render. */
function getTotalSlots() {
  return 3 + getBonusActionSlots();
}

function makeEmptyPlacements() {
  return new Array(getTotalSlots()).fill(null);
}
const FADE_MS = 160;
const HAPPINESS_MIN = -3;
const HAPPINESS_MAX = 3;

export class RevampedKingdomApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "revamped-kingdom-app",
    classes: ["kingdom-app"],
    window: {
      title: "Kingdom Management",
      resizable: true
    },
    position: {
      width: 1100,
      height: 720
    },
    actions: {
      openConfig: RevampedKingdomApp.#onOpenConfig,
      pullPlayersToScreen: RevampedKingdomApp.#onPullToScreen,
      openResearchTree: RevampedKingdomApp.#onOpenResearchTree,
      selectBack: RevampedKingdomApp.#onSelectBack,
      confirmActions: RevampedKingdomApp.#onConfirmActions,
      toggleFactionMenu: RevampedKingdomApp.#onToggleFactionMenu,
      toggleBuildingsBrowser: RevampedKingdomApp.#onToggleBuildingsBrowser,
      viewBuildingDetail: RevampedKingdomApp.#onViewBuildingDetail,
      closeBuildingDetail: RevampedKingdomApp.#onCloseBuildingDetail,
      adjustHappiness: RevampedKingdomApp.#onAdjustHappiness,
      toggleFactionPresent: RevampedKingdomApp.#onToggleFactionPresent,
      saveKw: RevampedKingdomApp.#onSaveKw,
      claimHex: RevampedKingdomApp.#onClaimHexClick,
      buildDistrict: RevampedKingdomApp.#onBuildDistrictClick,
      inviteFaction: RevampedKingdomApp.#onInviteFaction,
      toggleLock: RevampedKingdomApp.#onToggleLock,
      startResolving: RevampedKingdomApp.#onStartResolving,
      stepNav: RevampedKingdomApp.#onStepNav,
      applyKw: RevampedKingdomApp.#onApplyKw,
      applyHappiness: RevampedKingdomApp.#onApplyHappiness,
      finishTurn: RevampedKingdomApp.#onFinishTurn,
      toggleShowMore: RevampedKingdomApp.#onToggleShowMore,
      setTaxLevel: RevampedKingdomApp.#onSetTaxLevel,
      applyLevy: RevampedKingdomApp.#onApplyLevy,
      applyLevyAll: RevampedKingdomApp.#onApplyLevyAll,
      applyWartime: RevampedKingdomApp.#onApplyWartime,
      applyBribe: RevampedKingdomApp.#onApplyBribe,
      toggleAtWar: RevampedKingdomApp.#onToggleAtWar,
      triggerExpediteLabour: RevampedKingdomApp.#onTriggerExpediteLabour,
      triggerMarkReconnoitered: RevampedKingdomApp.#onTriggerMarkReconnoitered,
      triggerUpgradeBuilding: RevampedKingdomApp.#onTriggerUpgradeBuilding,
      triggerMoveDistrict: RevampedKingdomApp.#onTriggerMoveDistrict,
      triggerApplyTransformation: RevampedKingdomApp.#onTriggerApplyTransformation,
      triggerLevelUpStore: RevampedKingdomApp.#onTriggerLevelUpStore,
      selectEventCard: RevampedKingdomApp.#onSelectEventCard,
      pickRandomEvent: RevampedKingdomApp.#onPickRandomEvent,
      changeEvent: RevampedKingdomApp.#onChangeEvent,
      eventPrevPage: RevampedKingdomApp.#onEventPrevPage,
      eventNextPage: RevampedKingdomApp.#onEventNextPage,
      advanceQuestline: RevampedKingdomApp.#onAdvanceQuestline,
      postPlayerEffect: RevampedKingdomApp.#onPostPlayerEffect,
      postCustomEffect: RevampedKingdomApp.#onPostCustomEffect,
      chooseEventChoice: RevampedKingdomApp.#onChooseEventChoice,
      acceptPetition: RevampedKingdomApp.#onAcceptPetition,
      refusePetition: RevampedKingdomApp.#onRefusePetition,
      petitionDone: RevampedKingdomApp.#onPetitionDone,
      petitionDrop: RevampedKingdomApp.#onPetitionDrop,
      dismissQueued: RevampedKingdomApp.#onDismissQueued
    }
  };

  static PARTS = {
    main: {
      template: "modules/pf2e-revamped-kingdoms/templates/kingdom.hbs"
    }
  };

  /** However this app gets opened — macro, the settings-menu button, a
   *  future launcher — size it against the user's actual screen unless
   *  the caller explicitly asked for a specific size. */
  constructor(options = {}) {
    if (!options.position?.width && !options.position?.height) {
      options = {
        ...options,
        position: {
          ...options.position,
          width: Math.min(Math.round(window.innerWidth * 0.92), 1600),
          height: Math.min(Math.round(window.innerHeight * 0.88), 1000)
        }
      };
    }
    super(options);
    if (["decide", "resolve", "event"].includes(options.startTab)) {
      this.#activeTab = options.startTab;
    }
  }

  /** decide | resolve | event */
  #activeTab = "decide";

  /** The domain currently open in the action-selection overlay, or null. */
  #currentDomain = null;

  /** placements[i] = null | { cost, start, title, description, kwEffect, happinessFactionId, happinessEffect } */
  #placements = makeEmptyPlacements();

  /** The action-chip element currently mid-drag in the select pool, or null. */
  #dragged = null;

  /** The resolve timeline entry id currently mid-drag, or null. */
  #draggedEntryId = null;

  /** Which event/page/stage was showing last render, so the entrance
   *  animation only plays when it actually changes. */
  #lastEventKey = null;

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const domains = getDomains()
      .filter((domain) => !domain.researchLocked || isDomainResearchUnlocked(domain.id))
      .map((domain) => ({
        ...domain,
        abilities: domain.abilities.map((ability, i) => ({
          ...ability,
          actionId: `${domain.id}-${i}`,
          ...this.#costDisplay(ability.costs)
        }))
      }));

    const events = getEvents();

    const kingdomState = getKingdomState();
    const buildingDefs = getBuildings();
    const placedBuildings = getPlacedBuildings();

    const defsById = new Map(buildingDefs.map((b) => [b.id, b]));
    const completedByBuildingId = new Map();
    for (const p of placedBuildings) {
      if ((p.turnsRemaining ?? 0) > 0) continue;
      const def = defsById.get(p.buildingId);
      if (!def || !def.kwPerTurn) continue;
      const entry = completedByBuildingId.get(def.id) ?? { name: def.name, count: 0, total: 0 };
      entry.count += 1;
      entry.total += def.kwPerTurn;
      completedByBuildingId.set(def.id, entry);
    }
    const buildingIncomeBreakdown = [...completedByBuildingId.values()];
    const buildingIncome = buildingIncomeBreakdown.reduce((sum, b) => sum + b.total, 0);

    const resolveState = getResolveState();
    const resolveEntries = resolveState.entries.map((entry, i) => ({
      ...entry,
      isUp: i % 2 === 0,
      showCost: entry.cost > 1
    }));

    const pendingHappinessByFaction = new Map();
    for (const entry of resolveEntries) {
      if (!entry.happinessFactionId || !entry.happinessEffect) continue;
      const list = pendingHappinessByFaction.get(entry.happinessFactionId) ?? [];
      list.push({ domain: entry.domain, action: entry.action, happinessEffect: entry.happinessEffect });
      pendingHappinessByFaction.set(entry.happinessFactionId, list);
    }

    const factionTaxes = getFactionTaxes();
    const rawFactions = getFactions();
    const nameById = new Map(rawFactions.map((f) => [f.id, f.name]));
    const factions = rawFactions.map((faction, i) => {
      const tier = tierOf(faction).id;
      const rows = ladderRows(faction);
      return {
        ...faction,
        slot: i + 1,
        tier,
        isMain: tier === "main",
        isMinor: tier === "minor",
        isPatron: tier === "patron",
        mood: moodLabel(faction),
        ladderRows: rows,
        hasLadder: rows.length > 0,
        rivalName: faction.rivalId ? nameById.get(faction.rivalId) ?? null : null,
        favourOn: favourAvailable(faction),
        topPercent: this.#happinessToPercent(faction.happiness),
        pendingChanges: pendingHappinessByFaction.get(faction.id) ?? [],
        taxLevel: factionTaxes[faction.id] ?? null,
        taxLabel: factionTaxes[faction.id] ? TAX_LEVELS[factionTaxes[faction.id]]?.label : "Not set"
      };
    });
    // Main factions keep the crests, taxes and levies exactly as before;
    // minor factions and patrons get their own smaller cards.
    const presentFactions = factions.filter((f) => f.present && f.isMain);
    const allPresentFactions = factions.filter((f) => f.present);
    const absentFactions = factions.filter((f) => !f.present);

    const presentIds = new Set(allPresentFactions.map((f) => f.id));
    const buildingsBrowser = buildingDefs.map((b) => ({
      ...b,
      traitsJoined: (b.traits ?? []).join(", "),
      available: !b.requiresFactionId || presentIds.has(b.requiresFactionId)
    }));

    context.isGM = game.user.isGM;
    context.kingdomName = getKingdomName();
    context.domains = domains;
    const activeEventId = getActiveEventId();
    const rawActiveEvent = activeEventId ? events.find((e) => e.id === activeEventId) ?? null : null;
    // Defensive fallback: an event saved before tintColor/conditions/
    // category/type/pages/stages existed (this world's stored data
    // likely predates them, same issue as the stale domains/
    // universalActions settings) would otherwise render broken.
    const normalizedActiveEvent = rawActiveEvent
      ? { tintColor: "#1b2e1f", conditions: [], category: "Uncategorized", type: "single", pages: [], stages: [], ...rawActiveEvent }
      : null;
    context.currentEvent = normalizedActiveEvent
      ? buildEventDisplayModel(normalizedActiveEvent, getActiveEventPage(), getQuestlineProgress())
      : null;
    context.showEventPicker = !context.currentEvent;

    const ce = context.currentEvent;
    if (ce) this.#decorateEvent(ce, rawFactions, events);
    const eventKey = ce ? `${ce.id}|${ce.pageIndex ?? ""}|${ce.stageIndex ?? ""}` : null;
    context.eventSettled = !!eventKey && eventKey === this.#lastEventKey;
    this.#lastEventKey = eventKey;

    const questlineProgress = getQuestlineProgress();
    const normalizedEvents = events.map((e) => ({
      tintColor: "#1b2e1f",
      conditions: [],
      category: "Uncategorized",
      type: "single",
      pages: [],
      stages: [],
      ...e
    }));
    context.allEvents = normalizedEvents.map((e) => {
      const isQuestline = e.type === "questline";
      const stageIndex = isQuestline ? Math.min(questlineProgress[e.id] ?? 0, Math.max(0, (e.stages?.length ?? 1) - 1)) : 0;
      return {
        ...e,
        typeLabel: EVENT_TYPES.find((t) => t.id === e.type)?.label ?? "Single Screen",
        questlineBadge: isQuestline && e.stages?.length ? `Stage ${stageIndex + 1}/${e.stages.length}` : null
      };
    });
    const eventCategoryMap = new Map();
    for (const e of context.allEvents) {
      const cat = e.category?.trim() || "Uncategorized";
      if (!eventCategoryMap.has(cat)) eventCategoryMap.set(cat, []);
      eventCategoryMap.get(cat).push(e);
    }
    context.queuedEvents = getQueuedEvents()
      .map((q) => ({ ...q, event: context.allEvents.find((e) => e.id === q.eventId) }))
      .filter((q) => q.event);
    context.eventCategories = [...eventCategoryMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, evts]) => ({ name, events: evts }));
    context.factions = presentFactions;
    context.minorFactions = allPresentFactions.filter((f) => f.isMinor);
    context.patronFactions = allPresentFactions.filter((f) => f.isPatron);
    context.allPresentFactions = allPresentFactions;
    context.absentFactions = absentFactions;
    context.kingdomTurn = getKingdomTurn();

    // Petitions pinned on the Decide screen
    const factionById = new Map(rawFactions.map((f) => [f.id, f]));
    context.petitions = getPetitions().map((p) => {
      const f = factionById.get(p.factionId);
      return {
        ...p,
        factionName: f?.name ?? "",
        portrait: f?.leaderPortrait || f?.portrait || "",
        dueText: p.turnsLeft <= 1 ? "Due this turn" : `${p.turnsLeft} turns left`,
        urgent: p.turnsLeft <= 1,
        successText: describeEffects(p.success, { factions: rawFactions, events }),
        failureText: describeEffects(p.failure, { factions: rawFactions, events })
      };
    });
    context.hasPetitions = context.petitions.length > 0;
    context.buildingsBrowser = buildingsBrowser;
    context.atWar = getAtWar();
    context.festivalCost = getFestivalCost();
    context.taxLevelKeys = Object.keys(TAX_LEVELS);

    context.kw = kingdomState.kw;
    context.kwDeltaManual = kingdomState.kwDelta;
    context.kwBuildingIncome = buildingIncome;
    context.tradeIncomeBreakdown = tradeIncomeRows(rawFactions);
    context.kwDelta = kingdomState.kwDelta + buildingIncome + tradeIncome(rawFactions);
    context.buildingIncomeBreakdown = buildingIncomeBreakdown;
    context.pendingKwEntries = resolveEntries.filter((e) => e.kwEffect);

    context.resolveEntries = resolveEntries;
    context.resolveLocked = resolveState.locked;
    context.resolveResolving = resolveState.resolving;
    context.resolveHasEntries = resolveEntries.length > 0;
    context.resolveTotal = resolveEntries.length;
    context.resolveStepDisplay = resolveState.step + 1;
    context.resolveStepIsFirst = resolveState.step === 0;
    context.resolveIsLastStep = resolveState.step >= resolveEntries.length - 1;
    let currentEntry = resolveState.resolving ? resolveEntries[resolveState.step] ?? null : null;
    if (currentEntry) {
      currentEntry = refreshEntryInteractionData(currentEntry);
      currentEntry = {
        ...currentEntry,
        isClaimHexEntry: currentEntry.action === "Claim a Hex",
        isBuildDistrictEntry: currentEntry.action === "Build a District",
        isSetTaxes: currentEntry.interactionType === "set-taxes",
        isLevyTaxes: currentEntry.interactionType === "levy-taxes",
        isLevyAll: currentEntry.interactionType === "levy-taxes" && currentEntry.cost >= 3,
        isWartimeEfforts: currentEntry.interactionType === "wartime-efforts",
        isAddressPopulace: currentEntry.interactionType === "address-populace",
        isExpediteLabour: currentEntry.interactionType === "expedite-labour",
        isIssueSubsidy: currentEntry.interactionType === "issue-subsidy",
        isMarkReconnoitered: currentEntry.interactionType === "mark-reconnoitered",
        isUpgradeBuilding: currentEntry.interactionType === "upgrade-building",
        isMoveDistrict: currentEntry.interactionType === "move-district",
        isApplyTransformation: currentEntry.interactionType === "apply-transformation",
        isLevelUpStore: currentEntry.interactionType === "level-up-store",
        isPostEffect: currentEntry.interactionType === "post-effect"
      };
    }
    context.resolveCurrentEntry = currentEntry;

    context.tabs = [
      { key: "decide", label: "Decide", active: this.#activeTab === "decide" },
      { key: "resolve", label: "Resolve", active: this.#activeTab === "resolve" },
      { key: "event", label: "Event", active: this.#activeTab === "event" }
    ];

    const overlayOpen = !!this.#currentDomain;
    context.showDecide = !overlayOpen && this.#activeTab === "decide";
    context.showResolve = !overlayOpen && this.#activeTab === "resolve";
    context.showEvent = !overlayOpen && this.#activeTab === "event";

    return context;
  }

  /** Adds the faction side of an event to its display model: the leaders
   *  it features, its choices (and which one was taken), and for a
   *  petition, who's asking and what rides on it. */
  #decorateEvent(ev, factions, events) {
    const byId = new Map(factions.map((f) => [f.id, f]));
    ev.featured = (ev.featuredFactionIds ?? [])
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((f) => ({
        name: f.leaderName || f.name,
        role: f.leaderName ? f.leaderTitle || f.name : "",
        portrait: f.leaderPortrait || f.portrait || "",
        quote: f.leaderQuote || ""
      }));
    ev.hasFeatured = ev.featured.length > 0;

    const atEnd = ev.isSingle || ev.isLastPage || ev.isLastStage || ev.type === "petition";
    const chosen = getActiveEventChoice();
    const choiceKey = `${ev.id}|${ev.stageIndex ?? ""}`;
    const chosenIndex = chosen?.key === choiceKey ? chosen.index : null;
    ev.choiceKey = choiceKey;
    ev.choicesView = (ev.choices ?? []).map((c, i) => ({
      index: i,
      label: c.label || `Choice ${i + 1}`,
      text: c.text ?? "",
      effectsText: describeEffects(c.effects ?? [], { factions, events }),
      chosen: chosenIndex === i,
      passedOver: chosenIndex !== null && chosenIndex !== i
    }));
    ev.showChoices = atEnd && ev.choicesView.length > 0;
    ev.choiceMade = chosenIndex !== null;

    if (ev.type === "petition") {
      const p = ev.petition ?? {};
      const asker = byId.get(p.factionId);
      ev.isPetition = true;
      ev.petitionFrom = asker?.name ?? "";
      ev.petitionTurns = Math.max(1, Number(p.turns) || 2);
      ev.petitionDueText =
        ev.petitionTurns === 1 ? "You have 1 kingdom turn to see it done." : `You have ${ev.petitionTurns} kingdom turns to see it done.`;
      ev.petitionSuccessText = describeEffects(p.success ?? [], { factions, events });
      ev.petitionFailureText = describeEffects(p.failure ?? [], { factions, events });
      ev.petitionPinned = getPetitions().some((x) => x.eventId === ev.id);
      ev.petitionRefused = chosenIndex === "refused";
      ev.petitionOpen = !ev.petitionPinned && !ev.petitionRefused;
    }
  }

  #costDisplay(costs) {
    return {
      hasCostChoice: costs.length > 1,
      costsForDisplay: costs.map((value, idx) => ({ value, isLast: idx === costs.length - 1 }))
    };
  }

  #happinessToPercent(happiness) {
    // Must match the CSS baseline's actual position (48.5%, not 50%) or
    // a happiness of exactly 0 renders visibly off the zero line.
    const BASELINE_PERCENT = 48.5;
    return Math.max(8, Math.min(88, BASELINE_PERCENT - (happiness / HAPPINESS_MAX) * 40));
  }

  _onRender(context, options) {
    super._onRender(context, options);
    registerModuleWindow(this);

    this.#wireTabs();
    this.#wireDomainCards();
    this.#wireResolveDrag();
    this.#wireWizardInputs();
    this.#wireStatBadge();

    // A full re-render (GM published new data) happened while this player
    // had a domain open — rebuild the select view against the fresh data
    // rather than leaving it showing stale/empty content.
    if (this.#currentDomain) {
      const stillExists = getDomains().find((d) => d.id === this.#currentDomain.id);
      if (stillExists) this.#openSelect(stillExists.id, { silent: true });
      else {
        this.#currentDomain = null;
        this.#placements = makeEmptyPlacements();
      }
    }
  }

  _onClose(options) {
    super._onClose(options);
    unregisterModuleWindow(this);
    if (kingdomAppInstance === this) kingdomAppInstance = null;
  }

  /* ---------------------------------------------------------------- */
  /* Tab bar — pure DOM, no re-render                                   */
  /* ---------------------------------------------------------------- */

  /** Public wrapper so external code (the "pull players to screen"
   *  socket handler in main.js) can switch this instance's tab without
   *  needing access to the private #switchTab method — private class
   *  members aren't reachable from outside the class body at all, even
   *  from other functions in the same file. */
  switchToTab(view) {
    this.#switchTab(view);
  }

  #wireTabs() {
    for (const tab of this.element.querySelectorAll(".tab")) {
      tab.addEventListener("click", (event) => {
        event.preventDefault();
        if (this.#currentDomain) return;
        this.#switchTab(tab.dataset.view);
      });
    }
  }

  #switchTab(view) {
    if (view === this.#activeTab) return;
    this.#activeTab = view;

    for (const tab of this.element.querySelectorAll(".tab")) {
      const isActive = tab.dataset.view === view;
      tab.classList.toggle("tab--active", isActive);
      tab.classList.toggle("tab--ghost", !isActive);
    }

    const panels = this.element.querySelectorAll(
      '[data-view-panel="decide"], [data-view-panel="resolve"], [data-view-panel="event"]'
    );
    const current = [...panels].find((p) => !p.hidden);
    const next = this.element.querySelector(`[data-view-panel="${view}"]`);
    this.#crossFade(current, next);
  }

  /** Fades `from` out, then swaps `hidden`, then fades `to` in. Cheap —
   *  only ever touches two elements, never triggers a Handlebars render. */
  #crossFade(from, to) {
    if (!to || from === to) return;
    if (!from) {
      to.hidden = false;
      to.classList.remove("kingdom-fade-out");
      return;
    }
    from.classList.add("kingdom-fade-out");
    setTimeout(() => {
      from.hidden = true;
      from.classList.remove("kingdom-fade-out");
      to.hidden = false;
      to.classList.add("kingdom-fade-out");
      requestAnimationFrame(() => to.classList.remove("kingdom-fade-out"));
    }, FADE_MS);
  }

  /* ---------------------------------------------------------------- */
  /* KW badge — left-click shows a read-only breakdown of what's coming;
     right-click (GM only) opens the editor. Both close on outside click,
     and clicks inside either panel never bubble out to retrigger this. */
  /* ---------------------------------------------------------------- */

  #wireStatBadge() {
    const badge = this.element.querySelector(".stat-badge");
    if (!badge) return;

    badge.addEventListener("click", (event) => {
      if (event.target.closest(".kw-editor, .kw-breakdown")) return;
      this.#toggleKwPanel(".kw-breakdown");
    });

    if (game.user.isGM) {
      badge.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.#toggleKwPanel(".kw-editor");
      });
    }
    // Note: no stopPropagation here on purpose. The badge's own click
    // handler above already ignores clicks that land inside the panels
    // (via the closest() check), which is enough to stop the badge from
    // re-toggling itself. Actually calling stopPropagation would also
    // block the click from ever reaching Foundry's own [data-action]
    // delegation higher up the tree — which is exactly what silently
    // broke the Save button before.
  }

  #toggleKwPanel(selector) {
    const badge = this.element.querySelector(".stat-badge");
    const panel = badge?.querySelector(selector);
    if (!panel) return;

    // Only one of the two panels is ever open at a time.
    for (const other of badge.querySelectorAll(".kw-editor, .kw-breakdown")) {
      if (other !== panel && !other.hidden) {
        other.classList.add("kingdom-fade-out");
        setTimeout(() => {
          other.hidden = true;
          other.classList.remove("kingdom-fade-out");
        }, FADE_MS);
      }
    }

    const opening = panel.hidden;
    if (opening) {
      panel.hidden = false;
      panel.classList.add("kingdom-fade-out");
      requestAnimationFrame(() => panel.classList.remove("kingdom-fade-out"));
      this.#armOutsideClose(panel);
    } else {
      panel.classList.add("kingdom-fade-out");
      setTimeout(() => {
        panel.hidden = true;
        panel.classList.remove("kingdom-fade-out");
      }, FADE_MS);
    }
  }

  #armOutsideClose(panelEl) {
    const handler = (event) => {
      if (panelEl.hidden) {
        document.removeEventListener("click", handler, true);
        return;
      }
      if (!panelEl.contains(event.target)) {
        panelEl.hidden = true;
        document.removeEventListener("click", handler, true);
      }
    };
    // deferred so the click that opened the panel doesn't immediately close it
    setTimeout(() => document.addEventListener("click", handler, true), 0);
  }

  static async #onSaveKw() {
    const root = this.element;
    const kw = Number(root.querySelector("#kw-input")?.value);
    const kwDelta = Number(root.querySelector("#kw-delta-input")?.value);
    await setKingdomState({
      kw: Number.isFinite(kw) ? kw : 0,
      kwDelta: Number.isFinite(kwDelta) ? kwDelta : 0
    });
    const editor = root.querySelector(".kw-editor");
    if (editor) editor.hidden = true;
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  /* ---------------------------------------------------------------- */
  /* Faction reputation menu                                            */
  /* ---------------------------------------------------------------- */

  static #onToggleFactionMenu() {
    this.#toggleOverlay(".faction-menu");
  }

  static #onToggleBuildingsBrowser() {
    this.#toggleOverlay(".buildings-browser");
  }

  static #onViewBuildingDetail(event, target) {
    const id = target.dataset.buildingId;
    const building = getBuildings().find((b) => b.id === id);
    if (!building) return;

    const available =
      !building.requiresFactionId || getFactions().find((f) => f.id === building.requiresFactionId)?.present === true;

    const root = this.element;
    const thumb = root.querySelector("#building-detail-thumb");
    if (thumb) thumb.style.backgroundImage = building.tileImage ? cssUrl(building.tileImage) : "";
    root.querySelector("#building-detail-name").textContent = building.name ?? "";
    root.querySelector("#building-detail-meta").textContent =
      `${building.category ?? ""} · ${building.cost ?? 0} KW · ${building.buildTime ?? 0} turn(s)`;
    const traitsEl = root.querySelector("#building-detail-traits");
    traitsEl.textContent = building.traits?.length ? building.traits.join(", ") : "";
    traitsEl.hidden = !building.traits?.length;
    const prereqEl = root.querySelector("#building-detail-prereqs");
    prereqEl.textContent = building.prerequisitesText ?? "";
    prereqEl.hidden = !building.prerequisitesText;
    const statusEl = root.querySelector("#building-detail-status");
    statusEl.textContent = available ? "Available" : "Not yet available";
    statusEl.className = `building-card__status ${available ? "building-card__status--yes" : "building-card__status--no"}`;
    root.querySelector("#building-detail-effect").innerHTML = building.effect ?? "";

    // Only need to actually toggle if it's currently closed — clicking a
    // different card while the modal is already open should just swap
    // the content in place, not close it right back up.
    const modal = root.querySelector(".building-detail-modal");
    if (modal?.hidden) this.#toggleOverlay(".building-detail-modal");
  }

  static #onCloseBuildingDetail() {
    this.#toggleOverlay(".building-detail-modal");
  }

  #toggleOverlay(selector) {
    const panel = this.element.querySelector(selector);
    if (!panel) return;
    if (panel.hidden) {
      panel.hidden = false;
      panel.classList.add("kingdom-fade-out");
      requestAnimationFrame(() => panel.classList.remove("kingdom-fade-out"));
    } else {
      panel.classList.add("kingdom-fade-out");
      setTimeout(() => {
        panel.hidden = true;
        panel.classList.remove("kingdom-fade-out");
      }, FADE_MS);
    }
  }

  static async #onAdjustHappiness(event, target) {
    if (!game.user.isGM) return;
    const id = target.dataset.factionId;
    const delta = Number(target.dataset.delta);

    const factions = getFactions();
    const faction = factions.find((f) => f.id === id);
    if (!faction) return;

    faction.happiness = clampHappiness(faction, faction.happiness + delta);
    await setFactions(factions);

    // Patch this client's DOM directly instead of a full re-render —
    // a full render would close the faction menu you're working in.
    this.#patchFactionDisplay(faction);
    broadcastRefresh();
  }

  #patchFactionDisplay(faction) {
    const root = this.element;
    const valueEl = root.querySelector(`.faction-menu__card[data-faction-id="${faction.id}"] .faction-menu__happiness-value`);
    if (valueEl) valueEl.textContent = faction.happiness;

    const crest = root.querySelector(`.reputation-panel__crest[data-faction-id="${faction.id}"]`);
    if (crest) crest.style.top = `${this.#happinessToPercent(faction.happiness)}%`;

    const card = root.querySelector(`.faction-menu__card[data-faction-id="${faction.id}"]`);
    if (!card) return;
    const moodEl = card.querySelector("[data-mood]");
    if (moodEl) moodEl.textContent = moodLabel(faction) ?? "";
    const h = faction.happiness;
    for (const row of card.querySelectorAll("[data-ladder-step]")) {
      const s = Number(row.dataset.ladderStep);
      row.classList.toggle("is-active", (s > 0 && h >= s) || (s < 0 && h <= s));
    }
  }

  static async #onToggleFactionPresent(event, target) {
    if (!game.user.isGM) return;
    const id = target.dataset.factionId;
    const factions = getFactions();
    const faction = factions.find((f) => f.id === id);
    if (!faction) return;

    faction.present = !faction.present;
    await setFactions(factions);

    // Presence changes whether a crest shows on the header panel at all,
    // which this client's DOM can't cheaply patch — a full render is fine
    // here since toggling presence is rare.
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  /* ---------------------------------------------------------------- */
  /* Decide -> Select                                                   */
  /* ---------------------------------------------------------------- */

  #wireDomainCards() {
    for (const card of this.element.querySelectorAll(".faction-card[data-domain-id]")) {
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      const open = () => this.#openSelect(card.dataset.domainId);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    }
  }

  #openSelect(domainId, { silent = false } = {}) {
    const domain = getDomains().find((d) => d.id === domainId);
    if (!domain) return;

    this.#currentDomain = domain;
    this.#placements = makeEmptyPlacements();

    const root = this.element;
    root.querySelector("#select-title").textContent = domain.name;
    const portraitEl = root.querySelector("#select-portrait");
    portraitEl.style.backgroundImage = domain.portrait ? cssUrl(domain.portrait) : "";

    const pool = root.querySelector("#select-pool");
    pool.innerHTML = "";
    const universal = getUniversalActions();
    for (const ability of [...domain.abilities, ...universal, ...favourActions()]) {
      pool.appendChild(this.#buildActionChip(ability));
    }
    this.#wireSelectPool();
    this.#renderSlots();

    const decidePanel = root.querySelector('[data-view-panel="decide"]');
    const selectPanel = root.querySelector('[data-view-panel="select"]');

    if (silent) {
      selectPanel.hidden = false;
      if (decidePanel) decidePanel.hidden = true;
    } else {
      this.#crossFade(decidePanel, selectPanel);
    }
  }

  static #onSelectBack() {
    this.#closeSelect();
  }

  #closeSelect() {
    this.#currentDomain = null;
    this.#placements = makeEmptyPlacements();

    const selectPanel = this.element.querySelector('[data-view-panel="select"]');
    const target = this.element.querySelector(`[data-view-panel="${this.#activeTab}"]`);
    this.#crossFade(selectPanel, target);
  }

  #buildActionChip(ability) {
    const chip = document.createElement("div");
    chip.className = "action-chip";
    chip.draggable = true;
    chip.dataset.cost = String(ability.costs[0]);
    chip.dataset.title = ability.title;
    chip.dataset.description = ability.description ?? "";
    chip.dataset.kwEffect = String(ability.kwEffect ?? 0);
    chip.dataset.happinessFactionId = ability.happinessFactionId ?? "";
    chip.dataset.happinessEffect = String(ability.happinessEffect ?? 0);
    chip.dataset.interactionType = ability.interactionType ?? "generic";
    if (ability.playerEffect) chip.dataset.playerEffect = JSON.stringify(ability.playerEffect);
    if (ability.reminderMessage) chip.dataset.reminderMessage = ability.reminderMessage;

    const titleEl = document.createElement("h3");
    titleEl.className = "faction-card__ability-title";
    ability.costs.forEach((cost, idx) => {
      const icon = document.createElement("span");
      icon.className = "act-icon";
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", `${cost} action`);
      icon.textContent = String(cost);
      titleEl.appendChild(icon);
      if (idx < ability.costs.length - 1) {
        const sep = document.createElement("span");
        sep.className = "act-sep";
        sep.textContent = "/";
        titleEl.appendChild(sep);
      }
    });
    const nameEl = document.createElement("span");
    nameEl.textContent = ability.title;
    titleEl.appendChild(nameEl);
    chip.appendChild(titleEl);

    const descWrap = document.createElement("div");
    descWrap.innerHTML = ability.description ?? ""; // GM-authored, world-scope trusted content
    while (descWrap.firstChild) chip.appendChild(descWrap.firstChild);

    if (ability.costs.length > 1) {
      const picker = document.createElement("div");
      picker.className = "cost-choice";
      const label = document.createElement("span");
      label.className = "cost-choice__label";
      label.textContent = "Spend";
      picker.appendChild(label);
      ability.costs.forEach((cost, idx) => {
        const pip = document.createElement("button");
        pip.type = "button";
        pip.className = `cost-pip${idx === 0 ? " is-on" : ""}`;
        pip.dataset.cost = String(cost);
        pip.textContent = String(cost);
        picker.appendChild(pip);
      });
      chip.appendChild(picker);
    }

    return chip;
  }

  #wireSelectPool() {
    const pool = this.element.querySelector("#select-pool");

    for (const chip of pool.querySelectorAll(".action-chip")) {
      chip.addEventListener("dragstart", (event) => {
        this.#dragged = chip;
        chip.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "copy";
      });
      chip.addEventListener("dragend", () => {
        chip.classList.remove("is-dragging");
        this.#clearHighlight();
        this.#dragged = null;
      });
      chip.addEventListener("click", () => {
        const cost = Number(chip.dataset.cost) || 1;
        const at = this.#firstFit(cost);
        if (at === -1) this.#reject(0);
        else this.#place(at, chip);
      });

      for (const pip of chip.querySelectorAll(".cost-pip")) {
        pip.addEventListener("click", (event) => {
          event.stopPropagation();
          chip.dataset.cost = pip.dataset.cost;
          for (const p of chip.querySelectorAll(".cost-pip")) {
            p.classList.toggle("is-on", p === pip);
          }
        });
      }
    }
  }

  #wireSlotGrid() {
    const slotGrid = this.element.querySelector("#slot-grid");

    for (const slotEl of slotGrid.querySelectorAll(".slot:not(.slot--filled)")) {
      const idx = Number(slotEl.dataset.index);
      slotEl.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        this.#highlight(idx, this.#dragged);
      });
      slotEl.addEventListener("dragleave", () => this.#clearHighlight());
      slotEl.addEventListener("drop", (event) => {
        event.preventDefault();
        this.#clearHighlight();
        if (this.#dragged) this.#place(idx, this.#dragged);
      });
    }

    for (const clearBtn of slotGrid.querySelectorAll(".slot__clear")) {
      clearBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        this.#clearFrom(Number(clearBtn.dataset.clearIndex));
      });
    }
  }

  #fits(startIdx, cost) {
    if (startIdx + cost > getTotalSlots()) return false;
    for (let i = startIdx; i < startIdx + cost; i++) {
      if (this.#placements[i]) return false;
    }
    return true;
  }

  #firstFit(cost) {
    for (let i = 0; i <= getTotalSlots() - cost; i++) {
      if (this.#fits(i, cost)) return i;
    }
    return -1;
  }

  #place(startIdx, chip) {
    const cost = Number(chip.dataset.cost) || 1;
    if (!this.#fits(startIdx, cost)) {
      const alt = this.#firstFit(cost);
      if (alt === -1) {
        this.#reject(startIdx);
        return;
      }
      startIdx = alt;
    }
    const rec = {
      cost,
      start: startIdx,
      title: chip.dataset.title,
      description: chip.dataset.description,
      kwEffect: Number(chip.dataset.kwEffect) || 0,
      happinessFactionId: chip.dataset.happinessFactionId || null,
      happinessEffect: Number(chip.dataset.happinessEffect) || 0,
      interactionType: chip.dataset.interactionType || "generic",
      playerEffect: chip.dataset.playerEffect ? JSON.parse(chip.dataset.playerEffect) : null,
      reminderMessage: chip.dataset.reminderMessage || null
    };
    for (let i = startIdx; i < startIdx + cost; i++) this.#placements[i] = rec;
    this.#renderSlots(); // DOM patch only — no app-wide re-render
  }

  #clearFrom(idx) {
    const rec = this.#placements[idx];
    if (!rec) return;
    for (let i = 0; i < getTotalSlots(); i++) {
      if (this.#placements[i] === rec) this.#placements[i] = null;
    }
    this.#renderSlots();
  }

  #highlight(idx, dragged) {
    this.#clearHighlight();
    const cost = dragged ? Number(dragged.dataset.cost) || 1 : 1;
    const ok = this.#fits(idx, cost);
    const slotGrid = this.element.querySelector("#slot-grid");
    for (let i = idx; i < Math.min(idx + cost, getTotalSlots()); i++) {
      const el = slotGrid?.querySelector(`[data-index="${i}"]`);
      if (el) el.classList.add(ok ? "slot--over" : "slot--bad");
    }
  }

  #clearHighlight() {
    const slotGrid = this.element.querySelector("#slot-grid");
    if (!slotGrid) return;
    for (const el of slotGrid.querySelectorAll(".slot")) {
      el.classList.remove("slot--over", "slot--bad");
    }
  }

  #reject(idx) {
    const slotGrid = this.element.querySelector("#slot-grid");
    const el = slotGrid?.querySelectorAll(".slot")[idx];
    if (!el) return;
    el.classList.add("slot--reject");
    setTimeout(() => el.classList.remove("slot--reject"), 400);
  }

  /** Rebuilds only #slot-grid from #placements. Cheap DOM patch. */
  #renderSlots() {
    const slotGrid = this.element.querySelector("#slot-grid");
    if (!slotGrid) return;
    slotGrid.innerHTML = "";

    let i = 0;
    while (i < getTotalSlots()) {
      const rec = this.#placements[i];
      if (rec && rec.start === i) {
        slotGrid.appendChild(this.#buildFilledSlot(rec, i));
        i += rec.cost;
      } else {
        slotGrid.appendChild(this.#buildEmptySlot(i));
        i += 1;
      }
    }

    this.#wireSlotGrid();
    const confirmBtn = this.element.querySelector("#confirm-btn");
    if (confirmBtn) confirmBtn.disabled = this.#placements.every((p) => !p);
  }

  #buildFilledSlot(rec, index) {
    const filled = document.createElement("div");
    filled.className = "slot slot--filled";
    filled.style.flexGrow = String(rec.cost);

    const chipClone = document.createElement("div");
    chipClone.className = "action-chip";
    const h3 = document.createElement("h3");
    h3.className = "faction-card__ability-title";
    const span = document.createElement("span");
    span.textContent = rec.title;
    h3.appendChild(span);
    chipClone.appendChild(h3);
    const descWrap = document.createElement("div");
    descWrap.innerHTML = rec.description ?? "";
    while (descWrap.firstChild) chipClone.appendChild(descWrap.firstChild);
    filled.appendChild(chipClone);

    if (rec.cost > 1) {
      const spanEl = document.createElement("span");
      spanEl.className = "slot__span";
      spanEl.textContent = `${rec.cost} actions`;
      filled.appendChild(spanEl);
    }

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "slot__clear";
    clearBtn.setAttribute("aria-label", "Remove action");
    clearBtn.textContent = "\u00d7";
    clearBtn.dataset.clearIndex = String(index);
    filled.appendChild(clearBtn);

    return filled;
  }

  #buildEmptySlot(index) {
    const empty = document.createElement("div");
    empty.className = "slot";
    empty.dataset.index = String(index);
    const num = document.createElement("span");
    num.className = "slot__num";
    num.textContent = ROMAN[index];
    empty.appendChild(num);
    return empty;
  }

  static async #onConfirmActions() {
    const domainId = this.#currentDomain?.id;
    if (!domainId) return;
    const seen = new Set();
    const picks = [];
    for (const rec of this.#placements) {
      if (rec && !seen.has(rec)) {
        seen.add(rec);
        picks.push({ title: rec.title, cost: rec.cost });
      }
    }

    if (picks.length) {
      const sent = await requestResolveOp({ type: "append", domainId, picks });
      if (!sent) return;
    }

    this.#currentDomain = null;
    this.#placements = makeEmptyPlacements();
    this.#activeTab = "resolve";

    refreshAllKingdomApps();
    // A player's change is saved (and announced) by the GM's client once
    // it arrives; only announce here when this client saved it itself.
    if (canWriteWorld()) broadcastRefresh();
  }

  /* ---------------------------------------------------------------- */
  /* Resolve: drag-reorder, lock, step-by-step wizard                   */
  /* ---------------------------------------------------------------- */

  #wireResolveDrag() {
    const track = this.element.querySelector(".timeline__track");
    if (!track) return;

    for (const item of track.querySelectorAll('.tl-item[draggable="true"]')) {
      item.addEventListener("dragstart", () => {
        this.#draggedEntryId = item.dataset.entryId;
        item.classList.add("is-dragging");
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("is-dragging");
        this.#draggedEntryId = null;
      });
      item.addEventListener("dragover", (event) => {
        event.preventDefault();
      });
      item.addEventListener("drop", async (event) => {
        event.preventDefault();
        const targetId = item.dataset.entryId;
        if (!this.#draggedEntryId || this.#draggedEntryId === targetId) return;
        await this.#reorderResolveEntries(this.#draggedEntryId, targetId);
      });
    }
  }

  async #reorderResolveEntries(draggedId, targetId) {
    const state = getResolveState();
    if (state.locked) return;
    const fromIdx = state.entries.findIndex((e) => e.id === draggedId);
    const toIdx = state.entries.findIndex((e) => e.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const sent = await requestResolveOp({ type: "reorder", draggedId, targetId });
    if (!sent) return;

    // Reorder the EXISTING elements in place instead of a full re-render.
    // A full render here was the cause of the "stutters, then jumps" feel
    // — the whole timeline was being torn down and rebuilt right as the
    // browser's own drag-drop return animation was still playing.
    const track = this.element.querySelector(".timeline__track");
    if (track) {
      const draggedEl = track.querySelector(`[data-entry-id="${draggedId}"]`);
      const targetEl = track.querySelector(`[data-entry-id="${targetId}"]`);
      if (draggedEl && targetEl) {
        // Same rule the saved order follows: moving right lands after
        // the target, moving left lands before it.
        if (fromIdx < toIdx) targetEl.after(draggedEl);
        else targetEl.before(draggedEl);
      }
      // Re-stripe the up/down zigzag to match the new physical order.
      const items = [...track.querySelectorAll(".tl-item")];
      items.forEach((el, i) => {
        el.classList.toggle("tl-item--up", i % 2 === 0);
        el.classList.toggle("tl-item--down", i % 2 !== 0);
      });
    }

    // Only OTHER clients need a real render; the one doing the dragging
    // already has the correct DOM from the reorder above. (A player's
    // drag is announced by the GM's client once it's saved.)
    if (canWriteWorld()) broadcastRefresh();
  }

  static async #onToggleLock() {
    if (!game.user.isGM) return;
    const state = getResolveState();
    state.locked = !state.locked;
    if (!state.locked) {
      state.resolving = false;
      state.step = 0;
    }
    await setResolveState(state);
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onStartResolving() {
    if (!game.user.isGM) return;
    const state = getResolveState();
    if (!state.locked || !state.entries.length) return;
    state.resolving = true;
    state.step = 0;
    await setResolveState(state);
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onStepNav(event, target) {
    if (!game.user.isGM) return;
    const state = getResolveState();
    const max = Math.max(0, state.entries.length - 1);
    const delta = target.dataset.dir === "next" ? 1 : -1;
    state.step = Math.max(0, Math.min(max, state.step + delta));
    await setResolveState(state);
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onApplyKw() {
    if (!game.user.isGM) return;
    const input = this.element.querySelector("#wizard-kw-input");
    const amount = Number(input?.value) || 0;

    const kingdomState = getKingdomState();
    kingdomState.kw += amount;
    await setKingdomState(kingdomState);

    const state = getResolveState();
    const entry = state.entries[state.step];
    if (entry) entry.resolved = true;
    await setResolveState(state);

    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onApplyHappiness() {
    if (!game.user.isGM) return;
    const root = this.element;
    const factionId = root.querySelector("#wizard-faction-select")?.value;
    const amount = Number(root.querySelector("#wizard-happiness-input")?.value) || 0;
    if (!factionId) {
      ui.notifications.warn("Pick a faction to apply the happiness change to.");
      return;
    }

    const factions = getFactions();
    const faction = factions.find((f) => f.id === factionId);
    if (faction) {
      faction.happiness = clampHappiness(faction, faction.happiness + amount);
      await setFactions(factions);
    }

    const state = getResolveState();
    const entry = state.entries[state.step];
    if (entry) entry.resolved = true;
    await setResolveState(state);

    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static #onToggleShowMore(event, target) {
    const panel = this.element.querySelector(".resolve-wizard__manual");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    target.textContent = panel.hidden ? "Show more (manual KW / happiness)" : "Show less";
  }

  /* ---------------------------------------------------------------- */
  /* Treasurer: persistent taxes                                       */
  /* ---------------------------------------------------------------- */

  static async #onSetTaxLevel(event, target) {
    if (!game.user.isGM) return;
    const factionId = target.dataset.factionId;
    const level = target.dataset.level;
    if (!factionId || !level) return;

    const taxes = getFactionTaxes();
    taxes[factionId] = level;
    await setFactionTaxes(taxes);

    const factionName = getFactions().find((f) => f.id === factionId)?.name ?? "A faction";
    await this.#postAuditMessage(`Taxes for ${factionName} set to <strong>${TAX_LEVELS[level]?.label ?? level}</strong>.`);

    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onApplyLevy() {
    if (!game.user.isGM) return;
    const root = this.element;
    const factionId = root.querySelector("#levy-faction-select")?.value;
    if (!factionId) {
      ui.notifications.warn("Pick a faction to levy taxes from.");
      return;
    }

    const taxes = getFactionTaxes();
    const level = taxes[factionId];
    if (!level) {
      ui.notifications.warn("That faction's taxes haven't been set yet — use the Set Taxes action first.");
      return;
    }

    const factions = getFactions();
    const faction = factions.find((f) => f.id === factionId);
    if (!faction) return;

    const { kwDelta, happinessDelta, label, wasCapped } = applyScaledTaxEffect(faction, level);
    await setFactions(factions);

    const kingdomState = getKingdomState();
    kingdomState.kw += kwDelta;
    await setKingdomState(kingdomState);

    await this.#markCurrentStepResolved();
    await this.#postAuditMessage(
      `Levied <strong>${label}</strong> taxes from ${faction.name}: ${kwDelta >= 0 ? "+" : ""}${kwDelta} KW, ${happinessDelta >= 0 ? "+" : ""}${happinessDelta} happiness.` +
        (wasCapped ? " (reduced — their happiness was already at its limit for this tax)" : "")
    );

    refreshAllKingdomApps();
    broadcastRefresh();
  }

  /** The 3-action Levy Taxes variant — "spend three actions to claim
   *  taxes on all factions" per the ability's own description. Only
   *  reachable when the entry's action cost is 3 (the wizard shows this
   *  button instead of the single-faction picker in that case). */
  static async #onApplyLevyAll() {
    if (!game.user.isGM) return;
    const taxes = getFactionTaxes();
    const allFactions = getFactions();
    const presentFactions = allFactions.filter((f) => f.present);

    let totalKw = 0;
    const lines = [];
    for (const faction of presentFactions) {
      const level = taxes[faction.id];
      if (!level) continue; // no tax level set for this faction — skip it, not an error
      const { kwDelta, happinessDelta, label, wasCapped } = applyScaledTaxEffect(faction, level);
      totalKw += kwDelta;
      lines.push(
        `${faction.name}: <strong>${label}</strong>, ${kwDelta >= 0 ? "+" : ""}${kwDelta} KW, ${happinessDelta >= 0 ? "+" : ""}${happinessDelta} happiness${wasCapped ? " (capped)" : ""}`
      );
    }

    if (!lines.length) {
      ui.notifications.warn("No present faction has a tax level set yet — use Set Taxes first.");
      return;
    }

    // presentFactions holds references INTO allFactions (Array#filter
    // doesn't clone elements), so the mutations above already landed on
    // the right objects here — saving the full list preserves absent
    // factions untouched rather than dropping them.
    await setFactions(allFactions);
    const kingdomState = getKingdomState();
    kingdomState.kw += totalKw;
    await setKingdomState(kingdomState);

    await this.#markCurrentStepResolved();
    await this.#postAuditMessage(
      `Levied taxes on all factions (${totalKw >= 0 ? "+" : ""}${totalKw} KW total):<br>${lines.join("<br>")}`
    );

    refreshAllKingdomApps();
    broadcastRefresh();
  }

  /* ---------------------------------------------------------------- */
  /* Quartermaster: Wartime Efforts                                     */
  /* ---------------------------------------------------------------- */

  static async #onToggleAtWar(event, target) {
    if (!game.user.isGM) return;
    await setAtWar(target.checked);
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onApplyWartime() {
    if (!game.user.isGM) return;
    const factionId = this.element.querySelector("#wartime-faction-select")?.value;
    if (!factionId) {
      ui.notifications.warn("Pick a faction to spur into war efforts.");
      return;
    }

    const atWar = getAtWar();
    const happinessDelta = atWar ? -1 : -2;
    const nominalKw = 2;

    const factions = getFactions();
    const faction = factions.find((f) => f.id === factionId);
    if (!faction) return;

    // Same fix as Levy Taxes: scale the KW gain by how much happiness
    // could actually move, so this can't become free KW once a faction
    // is already floored at -3.
    const before = faction.happiness;
    const after = Math.max(HAPPINESS_MIN, Math.min(HAPPINESS_MAX, before + happinessDelta));
    const actualHappinessChange = after - before;
    const effectiveness = Math.abs(actualHappinessChange / happinessDelta);
    const actualKw = Math.round(nominalKw * effectiveness);
    faction.happiness = after;
    await setFactions(factions);

    const kingdomState = getKingdomState();
    kingdomState.kw += actualKw;
    await setKingdomState(kingdomState);

    await this.#markCurrentStepResolved();
    await this.#postAuditMessage(
      `Wartime Efforts against ${faction.name}: +${actualKw} KW, ${actualHappinessChange} happiness (kingdom is ${atWar ? "" : "not "}currently at war).` +
        (effectiveness < 1 ? " (reduced — their happiness was already at its limit)" : "")
    );

    refreshAllKingdomApps();
    broadcastRefresh();
  }

  /* ---------------------------------------------------------------- */
  /* Address the Populace: bribe                                        */
  /* ---------------------------------------------------------------- */

  static async #onApplyBribe() {
    if (!game.user.isGM) return;
    const factionId = this.element.querySelector("#bribe-faction-select")?.value;
    if (!factionId) {
      ui.notifications.warn("Pick a faction to bribe.");
      return;
    }

    const kingdomState = getKingdomState();
    if (kingdomState.kw < 3) {
      ui.notifications.warn("Not enough KW — bribing costs 3 KW.");
      return;
    }
    kingdomState.kw -= 3;
    await setKingdomState(kingdomState);

    const factions = getFactions();
    const faction = factions.find((f) => f.id === factionId);
    if (faction) {
      faction.happiness = 0;
      await setFactions(factions);
    }

    await this.#markCurrentStepResolved();
    await this.#postAuditMessage(`Bribed ${faction?.name ?? "a faction"} for 3 KW — their happiness resets to 0.`);

    refreshAllKingdomApps();
    broadcastRefresh();
  }

  /* ---------------------------------------------------------------- */
  /* Expedite Labour — trigger the same reduce-build-time flow used by  */
  /* the GM Config shortcut, via the module API to avoid an import cycle*/
  /* ---------------------------------------------------------------- */

  static #onTriggerExpediteLabour() {
    game.modules.get(MODULE_ID)?.api?.reduceBuildTime?.();
  }

  static #onTriggerMarkReconnoitered() {
    game.modules.get(MODULE_ID)?.api?.markReconnoitered?.();
  }

  static #onTriggerUpgradeBuilding() {
    game.modules.get(MODULE_ID)?.api?.upgradeBuilding?.();
  }

  static #onTriggerMoveDistrict() {
    game.modules.get(MODULE_ID)?.api?.moveDistrict?.();
  }

  static #onTriggerApplyTransformation() {
    game.modules.get(MODULE_ID)?.api?.applyTransformation?.();
  }

  static #onTriggerLevelUpStore() {
    game.modules.get(MODULE_ID)?.api?.levelUpStore?.();
  }

  /* ---------------------------------------------------------------- */
  /* Event picker                                                       */
  /* ---------------------------------------------------------------- */

  static async #onSelectEventCard(event, target) {
    if (!game.user.isGM) return;
    const id = target.dataset.eventId;
    if (!id) return;
    await setActiveEventId(id);
    await setActiveEventPage(0);
    await setActiveEventChoice({});
    const queue = getQueuedEvents();
    if (queue.some((q) => q.eventId === id)) await setQueuedEvents(queue.filter((q) => q.eventId !== id));
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onPickRandomEvent() {
    if (!game.user.isGM) return;
    const events = getEvents();
    if (!events.length) {
      ui.notifications.warn("There are no events configured yet — add some in Kingdom Configuration.");
      return;
    }

    const kingdomState = getKingdomState();
    const factions = getFactions();
    const memories = getMemories();
    const pinnedEventIds = new Set(getPetitions().map((p) => p.eventId));
    const state = { kw: kingdomState.kw, factions, atWar: getAtWar(), memories, pinnedEventIds };

    let eligible = events.filter((e) => isEventEligible(e, state));
    // Nothing fits the mood of the kingdom: fall back to anything whose
    // faction and memory requirements still hold, then to anything at all.
    if (!eligible.length) {
      eligible = events.filter((e) => !e.queueOnly && !pinnedEventIds.has(e.id) && eventConditionsMet(e, { factions, memories }));
    }
    if (!eligible.length) eligible = events.filter((e) => !e.queueOnly);
    if (!eligible.length) {
      ui.notifications.warn("Every event here only comes up through a choice or a story. Pick one by hand.");
      return;
    }

    const picked = eligible[Math.floor(Math.random() * eligible.length)];
    await setActiveEventId(picked.id);
    await setActiveEventPage(0);
    await setActiveEventChoice({});
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onChangeEvent() {
    if (!game.user.isGM) return;
    await setActiveEventId(null);
    await setActiveEventPage(0);
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onEventPrevPage() {
    if (!game.user.isGM) return;
    const page = getActiveEventPage();
    if (page <= 0) return;
    await setActiveEventPage(page - 1);
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onEventNextPage() {
    if (!game.user.isGM) return;
    const activeId = getActiveEventId();
    const event = getEvents().find((e) => e.id === activeId);
    if (!event) return;
    const pageCount = event.pages?.length ?? 0;
    const page = getActiveEventPage();
    if (page >= pageCount - 1) return;
    await setActiveEventPage(page + 1);
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onAdvanceQuestline() {
    if (!game.user.isGM) return;
    const activeId = getActiveEventId();
    const event = getEvents().find((e) => e.id === activeId);
    if (!event || event.type !== "questline") return;

    const stageCount = event.stages?.length ?? 0;
    const progress = getQuestlineProgress();
    const current = progress[event.id] ?? 0;
    if (current >= stageCount - 1) {
      ui.notifications.info(`"${event.title}" is already on its final stage.`);
      return;
    }
    progress[event.id] = current + 1;
    await setQuestlineProgress(progress);
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  /* ---------------------------------------------------------------- */
  /* Draggable player-effect chat cards                                 */
  /* ---------------------------------------------------------------- */

  static async #onPostPlayerEffect() {
    const entry = this.#currentResolveEntry();
    const effect = entry?.playerEffect;
    if (!effect) return;
    await this.#postPlayerEffectToChat(effect.name, effect.description, effect.duration);
    await this.#markCurrentStepResolved();
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onPostCustomEffect() {
    const root = this.element;
    const name = root.querySelector("#custom-effect-name")?.value.trim();
    const description = root.querySelector("#custom-effect-description")?.value.trim();
    if (!name) {
      ui.notifications.warn("Give the effect a name first.");
      return;
    }
    await this.#postPlayerEffectToChat(name, description ? `<p>${description}</p>` : "", { value: 1, unit: "encounter" });
  }

  async #postPlayerEffectToChat(name, description, duration) {
    const safeName = escapeHTML(name);
    try {
      const item = await this.#getOrCreateEffectItem(name, description, duration);
      const link = item ? `@UUID[${item.uuid}]{${safeName}}` : `<strong>${safeName}</strong>`;
      await ChatMessage.create({
        speaker: { alias: "Kingdom" },
        content: `<div class="pf2e-rk-effect-card"><h3>${safeName}</h3>${description ?? ""}<p><em>Drag onto a token to apply:</em> ${link}</p></div>`
      });
    } catch (err) {
      console.error("PF2e Revamped Kingdoms | Couldn't create a draggable effect item — posting as plain text instead", err);
      await ChatMessage.create({
        speaker: { alias: "Kingdom" },
        content: `<div class="pf2e-rk-effect-card"><h3>${safeName}</h3>${description ?? ""}<p><em>(Couldn't make a draggable effect this time — apply it by hand.)</em></p></div>`
      });
    }
  }

  /** Effects posted to chat used to create a brand-new item every time,
   *  which slowly filled the Items sidebar with copies of "Ward" and
   *  "Advance". Now each named effect lives once, in a "Kingdom Effects"
   *  folder, and is refreshed and reused. */
  async #getOrCreateEffectItem(name, description, duration) {
    const system = {
      description: { value: description ?? "" },
      duration: duration ?? { value: 1, unit: "encounter" },
      tokenIcon: { show: true }
    };
    const existing = game.items.find((i) => i.getFlag?.(MODULE_ID, "kingdomEffect") && i.name === name);
    if (existing) {
      await existing.update({ system });
      return existing;
    }
    let folder = game.folders.find((f) => f.type === "Item" && f.getFlag?.(MODULE_ID, "effectsFolder"));
    if (!folder) {
      folder = await Folder.create({
        name: "Kingdom Effects",
        type: "Item",
        color: "#9c7c38",
        flags: { [MODULE_ID]: { effectsFolder: true } }
      });
    }
    return Item.create({
      name,
      type: "effect",
      img: "icons/svg/aura.svg",
      folder: folder?.id ?? null,
      system,
      flags: { [MODULE_ID]: { kingdomEffect: true } }
    });
  }

  #currentResolveEntry() {
    const state = getResolveState();
    return state.entries[state.step] ?? null;
  }

  async #markCurrentStepResolved() {
    const state = getResolveState();
    const entry = state.entries[state.step];
    if (entry) entry.resolved = true;
    await setResolveState(state);
  }

  async #postAuditMessage(message) {
    try {
      await ChatMessage.create({ speaker: { alias: "Kingdom" }, content: `<p>${message}</p>` });
    } catch (err) {
      console.warn("PF2e Revamped Kingdoms | Couldn't post audit chat message", err);
    }
  }

  static async #onFinishTurn() {
    if (!game.user.isGM) return;
    if (!(await RevampedKingdomApp.#confirmFinishTurn())) return;
    const kingdomState = getKingdomState();
    const buildingDefs = getBuildings();
    const placed = getPlacedBuildings();

    const buildingIncome = placed
      .filter((p) => (p.turnsRemaining ?? 0) <= 0)
      .reduce((sum, p) => sum + (buildingDefs.find((b) => b.id === p.buildingId)?.kwPerTurn ?? 0), 0);

    // Storage buildings (Bank, or anything else given storageCapacity)
    // pay their bonus each turn they're kept completely full — actually
    // enforced now rather than being manual/GM-tracked flavor text.
    const storageIncome = placed.reduce((sum, p) => {
      const def = buildingDefs.find((b) => b.id === p.buildingId);
      const capacity = def?.storageCapacity ?? 0;
      if (capacity > 0 && (p.storedKw ?? 0) >= capacity) return sum + (def.storageBonusKw ?? 0);
      return sum;
    }, 0);

    kingdomState.kw += kingdomState.kwDelta + buildingIncome + storageIncome + tradeIncome();
    await setKingdomState(kingdomState);

    let bonusSlotsGranted = 0;
    for (const p of placed) {
      const wasUnderConstruction = (p.turnsRemaining ?? 0) > 0;
      if ((p.turnsRemaining ?? 0) > 0) p.turnsRemaining -= 1;
      if ((p.unavailableTurns ?? 0) > 0) p.unavailableTurns -= 1;

      // Milestone Obelisk (or anything else tagged this way): the
      // permanent +1 action slot is granted the moment construction
      // actually finishes, not just when it's placed under construction.
      if (wasUnderConstruction && (p.turnsRemaining ?? 0) <= 0) {
        const def = buildingDefs.find((b) => b.id === p.buildingId);
        if (def?.grantsBonusActionSlot) bonusSlotsGranted += 1;
      }
    }
    await setPlacedBuildings(placed);

    if (bonusSlotsGranted > 0) {
      await setBonusActionSlots(getBonusActionSlots() + bonusSlotsGranted);
      ui.notifications.info(
        `Construction complete on a building that grants bonus actions — the kingdom permanently gains +${bonusSlotsGranted} action(s) per turn!`
      );
    }

    // Transformations (Architect's Special Modifications) tick down and
    // complete the same turn Finish Turn already advances everything
    // else on. Routed through the module API rather than importing
    // hexes.js directly — hexes.js already imports refreshAllKingdomApps
    // etc. from this file, so a direct import back would cycle; the
    // rest of this app's hex-action triggers (#onTriggerMoveDistrict and
    // friends, just above) already go through this same api indirection
    // for that exact reason.
    const completedTransformations = (await game.modules.get(MODULE_ID)?.api?.completeDueTransformations?.()) ?? [];
    if (completedTransformations.length > 0) {
      ui.notifications.info(
        `Transformation complete: ${completedTransformations.map((c) => c.name).join(", ")}.`
      );
    }

    // Petitions run down a turn (any that run out fail), then any faction
    // that's just hit the top or bottom of its track lines up its story.
    const expired = await tickPetitions();
    for (const { petition, summary } of expired) {
      await this.#postAuditMessage(`<strong>${escapeHTML(petition.title)}</strong> ran out of time. ${escapeHTML(summary)}`);
    }
    const arcs = await checkStoryArcs();
    if (arcs.length) {
      await whisperGM(
        `<p>${arcs.map((a) => `<strong>${escapeHTML(a.faction)}</strong>: "${escapeHTML(a.title)}" is lined up in the event picker.`).join("<br>")}</p>`
      );
    }
    await setKingdomTurn(getKingdomTurn() + 1);

    await setResolveState({ entries: [], locked: false, resolving: false, step: 0 });
    await setActiveEventId(null);
    await setActiveEventPage(0);
    await setActiveEventChoice({});

    refreshAllKingdomApps();
    broadcastRefresh();
  }

  /* ---------------------------------------------------------------- */
  /* Event choices and petitions                                        */
  /* ---------------------------------------------------------------- */

  #activeEventDef() {
    const id = getActiveEventId();
    return id ? getEvents().find((e) => e.id === id) ?? null : null;
  }

  #choiceKeyFor(eventDef) {
    if (eventDef?.type !== "questline") return `${eventDef?.id}|`;
    const stages = eventDef.stages ?? [];
    const saved = getQuestlineProgress()?.[eventDef.id] ?? 0;
    const stageIndex = stages.length ? Math.max(0, Math.min(saved, stages.length - 1)) : 0;
    return `${eventDef.id}|${stageIndex}`;
  }

  static async #onChooseEventChoice(event, target) {
    if (!game.user.isGM) return;
    const def = this.#activeEventDef();
    const index = Number(target.dataset.index);
    const choice = def?.choices?.[index];
    if (!choice) return;
    const key = this.#choiceKeyFor(def);
    if (getActiveEventChoice()?.key === key) {
      ui.notifications.info("A choice has already been made on this event.");
      return;
    }
    await setActiveEventChoice({ key, index });
    const summary = await applyEffects(choice.effects ?? []);
    await this.#postAuditMessage(
      `<strong>${escapeHTML(def.title)}</strong>: ${escapeHTML(choice.label || `Choice ${index + 1}`)}. ${escapeHTML(summary)}`
    );
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onAcceptPetition() {
    if (!game.user.isGM) return;
    const def = this.#activeEventDef();
    if (def?.type !== "petition") return;
    const petition = await acceptPetition(def);
    if (petition) {
      await this.#postAuditMessage(
        `<strong>${escapeHTML(def.title)}</strong> is pinned to the board. ${petition.turnsLeft} kingdom turn${petition.turnsLeft === 1 ? "" : "s"} to see it done.`
      );
    }
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onRefusePetition() {
    if (!game.user.isGM) return;
    const def = this.#activeEventDef();
    if (def?.type !== "petition") return;
    const key = this.#choiceKeyFor(def);
    if (getActiveEventChoice()?.key === key) return;
    await setActiveEventChoice({ key, index: "refused" });
    const summary = await applyEffects(def.petition?.failure ?? []);
    await this.#postAuditMessage(`<strong>${escapeHTML(def.title)}</strong>: turned down. ${escapeHTML(summary)}`);
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onPetitionDone(event, target) {
    if (!game.user.isGM) return;
    const result = await resolvePetition(target.dataset.petitionId, true);
    if (result) await this.#postAuditMessage(`<strong>${escapeHTML(result.petition.title)}</strong>: done! ${escapeHTML(result.summary)}`);
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onPetitionDrop(event, target) {
    if (!game.user.isGM) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Give up on this petition?" },
      classes: ["pf2e-rk-dialog"],
      content: "<p>It fails straight away and its failure effects happen now.</p>"
    }).catch(() => false);
    if (!confirmed) return;
    const result = await resolvePetition(target.dataset.petitionId, false);
    if (result) await this.#postAuditMessage(`<strong>${escapeHTML(result.petition.title)}</strong>: given up. ${escapeHTML(result.summary)}`);
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  static async #onDismissQueued(event, target) {
    if (!game.user.isGM) return;
    const id = target.dataset.eventId;
    await setQueuedEvents(getQueuedEvents().filter((q) => q.eventId !== id));
    refreshAllKingdomApps();
    broadcastRefresh();
  }

  /** One look at what Finish Turn is about to do before it does it — it
   *  clears the timeline and the event and moves every timer on, so a
   *  stray click used to cost a whole turn's bookkeeping. */
  static async #confirmFinishTurn() {
    const kingdomState = getKingdomState();
    const defsById = new Map(getBuildings().map((b) => [b.id, b]));
    const placed = getPlacedBuildings();
    let income = kingdomState.kwDelta ?? 0;
    const finishing = [];
    for (const p of placed) {
      const def = defsById.get(p.buildingId);
      if ((p.turnsRemaining ?? 0) <= 0) income += def?.kwPerTurn ?? 0;
      const capacity = def?.storageCapacity ?? 0;
      if (capacity > 0 && (p.storedKw ?? 0) >= capacity) income += def.storageBonusKw ?? 0;
      if ((p.turnsRemaining ?? 0) === 1) finishing.push(def?.name ?? "A district");
    }
    income += tradeIncome();
    const unresolved = getResolveState().entries.filter((e) => !e.resolved).length;
    const sign = income >= 0 ? "+" : "";
    const due = getPetitions().filter((p) => (p.turnsLeft ?? 1) <= 1);

    const lines = [
      `<p>The kingdom gains <strong>${sign}${income} KW</strong> (${kingdomState.kw} &rarr; ${kingdomState.kw + income}).</p>`
    ];
    if (finishing.length) lines.push(`<p>Finishing this turn: ${finishing.map(escapeHTML).join(", ")}.</p>`);
    if (unresolved) {
      lines.push(
        `<p><em>${unresolved} action${unresolved === 1 ? " is" : "s are"} still unticked on the timeline.</em></p>`
      );
    }
    if (due.length) {
      lines.push(`<p>Running out of time, and will fail: ${due.map((p) => escapeHTML(p.title)).join(", ")}.</p>`);
    }
    lines.push("<p>The timeline and this turn's event will be cleared.</p>");

    return foundry.applications.api.DialogV2.confirm({
      window: { title: "Finish the kingdom turn?" },
      classes: ["pf2e-rk-dialog"],
      content: lines.join("")
    }).catch(() => false);
  }

  #wireWizardInputs() {
    const select = this.element.querySelector("#wizard-faction-select");
    if (select && select.dataset.selected) select.value = select.dataset.selected;
  }

  /* ---------------------------------------------------------------- */
  /* GM config                                                          */
  /* ---------------------------------------------------------------- */

  static #onOpenConfig() {
    focusOrOpen(KingdomConfigApp);
  }

  static #onPullToScreen() {
    if (!game.user.isGM) return;
    game.socket.emit(`module.${MODULE_ID}`, { action: "pullToScreen", tab: this.#activeTab });
    ui.notifications.info("Pulled all connected players to the Kingdom Management window.");
  }

  static #onOpenResearchTree() {
    game.modules.get(MODULE_ID)?.api?.openResearchTree?.();
  }

  /* ---------------------------------------------------------------- */
  /* Hex claiming / district building — thin triggers into hexes.js,   */
  /* called through the module API rather than a direct import so      */
  /* there's no import cycle between kingdom.js and hexes.js.           */
  /* ---------------------------------------------------------------- */

  static #onClaimHexClick() {
    game.modules.get(MODULE_ID)?.api?.claimHex?.();
  }

  static #onBuildDistrictClick() {
    game.modules.get(MODULE_ID)?.api?.buildDistrict?.();
  }

  static async #onInviteFaction() {
    if (!game.user.isGM) return;
    const select = this.element.querySelector("#invite-faction-select");
    const id = select?.value;
    if (!id) return;

    const factions = getFactions();
    const faction = factions.find((f) => f.id === id);
    if (!faction) return;

    faction.present = true;
    await setFactions(factions);

    refreshAllKingdomApps();
    broadcastRefresh();
  }
}
