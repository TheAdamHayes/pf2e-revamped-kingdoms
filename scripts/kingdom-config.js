import {
  getDomains,
  getEvents,
  setDomains,
  setEvents,
  getFactions,
  setFactions,
  getKingdomName,
  setKingdomName,
  getBuildings,
  setBuildings,
  getResearchNodes,
  getPlacedBuildings,
  getTransformations,
  setTransformations,
  getIgnoreGmKwCosts,
  setIgnoreGmKwCosts,
  setUniversalActions,
  DEFAULT_DOMAINS,
  DEFAULT_UNIVERSAL_ACTIONS,
  DEFAULT_EVENTS,
  BLANK_IMAGE,
  EVENT_CONDITIONS,
  EVENT_TYPES,
  MODULE_ID,
  escapeHTML,
  getMemories,
  setMemories,
  getKingdomTurn
} from "./data.js";
import { refreshAllKingdomApps, registerModuleWindow, unregisterModuleWindow } from "./kingdom.js";
import {
  FACTION_TIERS,
  EFFECT_TYPES,
  CONDITION_OPS,
  describeEffects,
  normalizeEffect,
  tierOf,
  clampHappiness,
  memoryKey
} from "./factions.js";
import { PACK_FACTIONS, PACK_EVENTS, guessMatch, applyPack } from "./faction-pack.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class KingdomConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "revamped-kingdom-config",
    classes: ["kingdom-app", "kingdom-config-app"],
    window: {
      title: "Kingdom Configuration",
      resizable: true
    },
    position: {
      width: 920,
      height: 680
    },
    actions: {
      selectSection: KingdomConfigApp.#onSelectSection,
      saveName: KingdomConfigApp.#onSaveName,
      newDomain: KingdomConfigApp.#onNewDomain,
      editDomain: KingdomConfigApp.#onEditDomain,
      deleteDomain: KingdomConfigApp.#onDeleteDomain,
      saveDomain: KingdomConfigApp.#onSaveDomain,
      cancelDomain: KingdomConfigApp.#onCancelDomain,
      addAbility: KingdomConfigApp.#onAddAbility,
      newEvent: KingdomConfigApp.#onNewEvent,
      editEvent: KingdomConfigApp.#onEditEvent,
      deleteEvent: KingdomConfigApp.#onDeleteEvent,
      saveEvent: KingdomConfigApp.#onSaveEvent,
      cancelEvent: KingdomConfigApp.#onCancelEvent,
      addOutcome: KingdomConfigApp.#onAddOutcome,
      addPage: KingdomConfigApp.#onAddPage,
      addStage: KingdomConfigApp.#onAddStage,
      newBuilding: KingdomConfigApp.#onNewBuilding,
      editBuilding: KingdomConfigApp.#onEditBuilding,
      deleteBuilding: KingdomConfigApp.#onDeleteBuilding,
      saveBuilding: KingdomConfigApp.#onSaveBuilding,
      cancelBuilding: KingdomConfigApp.#onCancelBuilding,
      newTransformation: KingdomConfigApp.#onNewTransformation,
      editTransformation: KingdomConfigApp.#onEditTransformation,
      deleteTransformation: KingdomConfigApp.#onDeleteTransformation,
      saveTransformation: KingdomConfigApp.#onSaveTransformation,
      cancelTransformation: KingdomConfigApp.#onCancelTransformation,
      newFaction: KingdomConfigApp.#onNewFaction,
      editFaction: KingdomConfigApp.#onEditFaction,
      deleteFaction: KingdomConfigApp.#onDeleteFaction,
      saveFaction: KingdomConfigApp.#onSaveFaction,
      cancelFaction: KingdomConfigApp.#onCancelFaction,
      removeRow: KingdomConfigApp.#onRemoveRow,
      gmClaimHex: KingdomConfigApp.#onGmClaimHex,
      gmBuildDistrict: KingdomConfigApp.#onGmBuildDistrict,
      gmDestroyDistrict: KingdomConfigApp.#onGmDestroyDistrict,
      gmUnclaimHex: KingdomConfigApp.#onGmUnclaimHex,
      gmExpediteLabour: KingdomConfigApp.#onGmExpediteLabour,
      gmMarkReconnoitered: KingdomConfigApp.#onGmMarkReconnoitered,
      gmUpgradeBuilding: KingdomConfigApp.#onGmUpgradeBuilding,
      gmMoveDistrict: KingdomConfigApp.#onGmMoveDistrict,
      gmLevelUpStore: KingdomConfigApp.#onGmLevelUpStore,
      gmManageBankStorage: KingdomConfigApp.#onGmManageBankStorage,
      gmClearReconMarkers: KingdomConfigApp.#onGmClearReconMarkers,
      gmUnlockTiles: KingdomConfigApp.#onGmUnlockTiles,
      gmRecenterTiles: KingdomConfigApp.#onGmRecenterTiles,
      gmClearHexOverlays: KingdomConfigApp.#onGmClearHexOverlays,
      toggleIgnoreKwCosts: KingdomConfigApp.#onToggleIgnoreKwCosts,
      exportBackup: KingdomConfigApp.#onExportBackup,
      importBackup: KingdomConfigApp.#onImportBackup,
      browseImage: KingdomConfigApp.#onBrowseImage,
      browsePageImage: KingdomConfigApp.#onBrowsePageImage,
      browseStageImage: KingdomConfigApp.#onBrowseStageImage,
      pickColorEyedropper: KingdomConfigApp.#onPickColorEyedropper,
      resetDomains: KingdomConfigApp.#onResetDomains,
      resetUniversalActions: KingdomConfigApp.#onResetUniversalActions,
      resetEvents: KingdomConfigApp.#onResetEvents,
      addChoice: KingdomConfigApp.#onAddChoice,
      addEffect: KingdomConfigApp.#onAddEffect,
      addCondition: KingdomConfigApp.#onAddCondition,
      forgetMemory: KingdomConfigApp.#onForgetMemory,
      addMemory: KingdomConfigApp.#onAddMemory,
      addFactionPack: KingdomConfigApp.#onAddFactionPack
    }
  };

  static PARTS = {
    main: {
      template: "modules/pf2e-revamped-kingdoms/templates/kingdom-config.hbs"
    }
  };

  /** "domains" | "events" | "buildings" | "transformations" | "factions" */
  #section = "domains";

  #domains = null;
  #events = null;
  #buildings = null;
  #transformations = null;
  #factions = null;
  #editingDomain = null;
  #editingEvent = null;
  #editingBuilding = null;
  #editingTransformation = null;
  #editingFaction = null;

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Always re-read fresh, rather than "load once per window session"
    // (the old comment/behavior here) — that caching was only ever safe
    // because every edit used to stay in this in-memory copy until a
    // separate "Save & Publish" click, so nothing else could change the
    // underlying setting out from under it anyway. Now that every
    // individual Save/Delete persists immediately (see #broadcastChange
    // below), that assumption no longer holds: this window can genuinely
    // go stale if a building gets created from somewhere else entirely
    // — the Research Tree's own "+ New" building flow, for instance —
    // while this window is already open. Re-fetching here is what makes
    // refreshAllKingdomApps() re-rendering this app (see kingdom.js) an
    // actual fix rather than a no-op against a cache that never clears.
    // The one thing this deliberately does NOT touch is whichever
    // #editingX field holds a currently-open, unsaved item editor — an
    // in-progress edit survives a re-render exactly as it did before.
    this.#domains = getDomains();
    this.#events = getEvents();
    this.#buildings = getBuildings();
    this.#transformations = getTransformations();
    this.#factions = getFactions();

    context.kingdomName = getKingdomName();
    context.ignoreGmKwCosts = getIgnoreGmKwCosts();

    context.section = this.#section;
    context.domainsActive = this.#section === "domains";
    context.eventsActive = this.#section === "events";
    context.buildingsActive = this.#section === "buildings";
    context.transformationsActive = this.#section === "transformations";
    context.factionsActive = this.#section === "factions";

    const researchNodes = getResearchNodes();
    context.domains = this.#domains.map((d) => ({
      ...d,
      grantingNodeName: researchNodes.find((n) => n.grantsDomainId === d.id)?.name ?? null
    }));
    context.events = this.#events;
    context.buildings = this.#buildings.map((b) => {
      // Shows which research node grants this building, when one does —
      // makes the link the Research Tree's "+ New" building flow creates
      // visible here too, not just functionally correct behind the
      // scenes.
      const grantingNode = researchNodes.find((n) => n.grantsBuildingId === b.id);
      return { ...b, grantingNodeName: grantingNode?.name ?? null };
    });
    // Transformations list gets each entry's from/to building NAMES
    // resolved for display — the raw records only store the ids.
    context.transformations = this.#transformations.map((t) => ({
      ...t,
      fromBuildingName: this.#buildings.find((b) => b.id === t.fromBuildingId)?.name ?? "(deleted building)",
      toBuildingName: this.#buildings.find((b) => b.id === t.toBuildingId)?.name ?? "(deleted building)"
    }));
    context.factions = this.#factions;
    context.tierChoices = FACTION_TIERS;
    context.eventOptions = this.#events.map((e) => ({ id: e.id, title: e.title || "(untitled)" }));
    context.memories = getMemories().filter((m) => !m.hidden);

    context.editingDomain = this.#editingDomain
      ? {
          ...this.#editingDomain,
          tagsJoined: (this.#editingDomain.tags || []).join(", "),
          abilities: (this.#editingDomain.abilities || []).map((a) => ({
            ...a,
            costsJoined: (a.costs || []).join(","),
            kwEffect: a.kwEffect ?? 0,
            happinessFactionId: a.happinessFactionId ?? "",
            happinessEffect: a.happinessEffect ?? 0
          }))
        }
      : null;
    context.editingEvent = this.#editingEvent
      ? {
          ...this.#editingEvent,
          tintColor: this.#editingEvent.tintColor ?? "#1b2e1f",
          category: this.#editingEvent.category ?? "",
          type: this.#editingEvent.type ?? "single",
          isSingle: (this.#editingEvent.type ?? "single") === "single",
          isMultiscreen: this.#editingEvent.type === "multiscreen",
          isQuestline: this.#editingEvent.type === "questline",
          typeChoices: EVENT_TYPES.map((t) => ({ ...t, checked: (this.#editingEvent.type ?? "single") === t.id })),
          conditionChoices: EVENT_CONDITIONS.map((c) => ({
            ...c,
            checked: (this.#editingEvent.conditions ?? []).includes(c.id)
          })),
          pages: this.#editingEvent.pages ?? [],
          stages: this.#editingEvent.stages ?? [],
          isPetition: this.#editingEvent.type === "petition",
          isSingleOrPetition: ["single", "petition"].includes(this.#editingEvent.type ?? "single"),
          featuredChoices: this.#factions.map((f) => ({
            id: f.id,
            name: f.name,
            checked: (this.#editingEvent.featuredFactionIds ?? []).includes(f.id)
          })),
          choices: (this.#editingEvent.choices ?? []).map((c) => ({ ...c, effectsJson: JSON.stringify(c.effects ?? []) })),
          petition: { factionId: "", turns: 2, ...(this.#editingEvent.petition ?? {}) },
          petitionSuccessJson: JSON.stringify(this.#editingEvent.petition?.success ?? []),
          petitionFailureJson: JSON.stringify(this.#editingEvent.petition?.failure ?? []),
          conditionsJson: JSON.stringify(this.#editingEvent.factionConditions ?? []),
          requiresMemoriesJoined: (this.#editingEvent.requiresMemories ?? []).join(", "),
          forbidsMemoriesJoined: (this.#editingEvent.forbidsMemories ?? []).join(", ")
        }
      : null;
    context.editingBuilding = this.#editingBuilding
      ? {
          escalationPerCopy: 0,
          researchLocked: false,
          ...this.#editingBuilding,
          traitsJoined: (this.#editingBuilding.traits || []).join(", "),
          flagsJoined: (this.#editingBuilding.flags || []).join(", ")
        }
      : null;
    context.editingTransformation = this.#editingTransformation
      ? {
          researchLocked: false,
          icon: "",
          ...this.#editingTransformation,
          buildingChoicesFrom: this.#buildings.map((b) => ({ id: b.id, name: b.name, selected: this.#editingTransformation.fromBuildingId === b.id })),
          buildingChoicesTo: this.#buildings.map((b) => ({ id: b.id, name: b.name, selected: this.#editingTransformation.toBuildingId === b.id })),
          // Shown next to the icon field as a fallback preview when the
          // GM hasn't set an override — "inherits the base icon" means
          // this, not that the saved record itself gets a copied path.
          fromBuildingIcon: this.#buildings.find((b) => b.id === this.#editingTransformation.fromBuildingId)?.tileImage ?? ""
        }
      : null;
    context.editingFaction = this.#editingFaction ? this.#prepareFactionEditor(this.#editingFaction) : null;

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    registerModuleWindow(this);

    // Handlebars can't easily pre-select a <select> option without a
    // helper, so wire it up here instead: each row carries its saved
    // faction id in a data attribute, and we apply it to the <select>.
    for (const row of this.element.querySelectorAll(".ability-row[data-happiness-faction-id]")) {
      const select = row.querySelector(".ability-faction");
      if (select) select.value = row.dataset.happinessFactionId || "";
    }
    for (const el of this.element.querySelectorAll("[data-requires-faction-id], [data-invites-faction-id]")) {
      const requiresSelect = el.querySelector(".building-requires-faction");
      if (requiresSelect) requiresSelect.value = el.dataset.requiresFactionId || "";
      const invitesSelect = el.querySelector(".building-invites-faction");
      if (invitesSelect) invitesSelect.value = el.dataset.invitesFactionId || "";
    }
    for (const el of this.element.querySelectorAll("[data-placement-mode]")) {
      const select = el.querySelector(".building-placement-mode");
      if (select) select.value = el.dataset.placementMode || "single";
    }

    // Selects that need a saved value picked: the template puts it in
    // data-value and it's applied here (Handlebars can't easily do it).
    for (const select of this.element.querySelectorAll("select[data-value]")) {
      select.value = select.dataset.value ?? "";
    }
    this.#mountEffectEditors();
    this.#wireFactionTier();

    // Keeps every image-path thumbnail live as the GM types a path
    // directly (Browse also updates it, but only on that path) — same
    // listener works for every .kc-file-row regardless of whether it's
    // a static field or a repeatable page/stage row.
    for (const row of this.element.querySelectorAll(".kc-file-row")) {
      const input = row.querySelector('input[type="text"]');
      const thumb = row.querySelector(".kc-thumb");
      if (!input || !thumb) continue;
      input.addEventListener("input", () => {
        thumb.style.backgroundImage = input.value ? `url('${input.value}')` : "";
      });
    }

    // Event type radios show/hide their matching field section directly
    // (no re-render) so switching type doesn't discard whatever else
    // the GM has already typed into the rest of the form.
    const typeRadios = this.element.querySelectorAll(".event-type-radio");
    if (typeRadios.length) {
      const applyEventTypeVisibility = (type) => {
        for (const section of this.element.querySelectorAll("[data-event-type-section]")) {
          const allowed = section.dataset.eventTypeSection.split(",");
          section.hidden = !allowed.includes(type);
        }
      };
      const checkedRadio = [...typeRadios].find((r) => r.checked);
      if (checkedRadio) applyEventTypeVisibility(checkedRadio.value);
      for (const radio of typeRadios) {
        radio.addEventListener("change", () => applyEventTypeVisibility(radio.value));
      }
    }

    // game.settings.set on a "world" scope setting is already GM-only at
    // the engine level, but bail out visibly rather than showing a broken
    // form to a player who found this via the console API.
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can edit Kingdom data.");
      this.close();
    }
  }

  _onClose(options) {
    super._onClose(options);
    unregisterModuleWindow(this);
  }

  /* ---------------------------------------------------------------- */

  static #onSelectSection(event, target) {
    this.#section = target.dataset.section;
    this.#editingDomain = null;
    this.#editingEvent = null;
    this.#editingBuilding = null;
    this.#editingTransformation = null;
    this.#editingFaction = null;
    this.render();
  }

  static async #onSaveName() {
    const name = this.element.querySelector("#kingdom-name-input")?.value.trim();
    if (!name) {
      ui.notifications.warn("The kingdom needs a name.");
      return;
    }
    await setKingdomName(name);
    KingdomConfigApp.#broadcastChange();
    ui.notifications.info("Kingdom name updated.");
  }

  /** Shared by every per-item Save/Delete method below now that each one
   *  persists and broadcasts immediately instead of waiting for a
   *  separate "Save & Publish" step (removed entirely — see the
   *  comments on those methods for why keeping it around as a second,
   *  batched way to publish the same data would've been more confusing
   *  than useful once every individual save already does this). */
  static #broadcastChange() {
    refreshAllKingdomApps();
    game.socket.emit(`module.${MODULE_ID}`, { action: "refresh" });
  }

  /* ---------------------------------------------------------------- */
  /* Domains                                                            */
  /* ---------------------------------------------------------------- */

  static #onNewDomain() {
    this.#editingDomain = {
      id: foundry.utils.randomID(),
      name: "",
      portrait: BLANK_IMAGE,
      remote: false,
      tags: [],
      note: "",
      abilities: []
    };
    this.render();
  }

  static #onEditDomain(event, target) {
    const id = target.dataset.domainId;
    const domain = this.#domains.find((d) => d.id === id);
    this.#editingDomain = domain ? foundry.utils.deepClone(domain) : null;
    this.render();
  }

  static async #onDeleteDomain(event, target) {
    const id = target.dataset.domainId;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Domain" },
      content: "<p>Delete this domain? This goes live immediately and can't be undone.</p>"
    });
    if (!confirmed) return;

    this.#domains = this.#domains.filter((d) => d.id !== id);
    if (this.#editingDomain?.id === id) this.#editingDomain = null;
    await setDomains(this.#domains);
    KingdomConfigApp.#broadcastChange();
    this.render();
  }

  static #onCancelDomain() {
    this.#editingDomain = null;
    this.render();
  }

  static #onAddAbility() {
    const template = this.element.querySelector("#ability-row-template");
    const container = this.element.querySelector("#abilities-list");
    if (!template || !container) return;
    container.appendChild(template.content.cloneNode(true));
  }

  static async #onSaveDomain() {
    const root = this.element;
    const name = root.querySelector("#domain-name")?.value.trim();
    if (!name) {
      ui.notifications.warn("A domain needs a name.");
      return false;
    }

    const portrait = root.querySelector("#domain-portrait")?.value.trim() ?? "";
    const remote = root.querySelector("#domain-remote")?.checked ?? false;
    const tags = (root.querySelector("#domain-tags")?.value ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const note = root.querySelector("#domain-note")?.value.trim() ?? "";
    const researchLocked = !!root.querySelector("#domain-research-locked")?.checked;

    const abilities = [];
    for (const row of root.querySelectorAll("#abilities-list .ability-row")) {
      const title = row.querySelector(".ability-title")?.value.trim();
      if (!title) continue;
      const costsRaw = row.querySelector(".ability-costs")?.value ?? "1";
      const costs = costsRaw
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      const description = row.querySelector(".ability-description")?.value.trim() ?? "";
      const kwEffect = Number(row.querySelector(".ability-kw-effect")?.value) || 0;
      const happinessFactionId = row.querySelector(".ability-faction")?.value || null;
      const happinessEffect = Number(row.querySelector(".ability-happiness-effect")?.value) || 0;
      abilities.push({
        title,
        costs: costs.length ? costs : [1],
        description,
        kwEffect,
        happinessFactionId,
        happinessEffect
      });
    }

    const id = this.#editingDomain?.id ?? foundry.utils.randomID();
    const domain = { id, name, portrait, remote, tags, note, researchLocked, abilities };

    const idx = this.#domains.findIndex((d) => d.id === id);
    if (idx === -1) this.#domains.push(domain);
    else this.#domains[idx] = domain;

    this.#editingDomain = null;
    await setDomains(this.#domains);
    KingdomConfigApp.#broadcastChange();
    this.render();
    ui.notifications.info(`Saved "${name}" — everyone can see it now.`);
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Events                                                             */
  /* ---------------------------------------------------------------- */

  static #onNewEvent() {
    this.#editingEvent = {
      id: foundry.utils.randomID(),
      title: "",
      art: BLANK_IMAGE,
      tintColor: "#1b2e1f",
      conditions: [],
      category: "",
      type: "single",
      body: "",
      outcomes: [],
      pages: [],
      stages: []
    };
    this.render();
  }

  static #onEditEvent(event, target) {
    const id = target.dataset.eventId;
    const found = this.#events.find((e) => e.id === id);
    this.#editingEvent = found ? foundry.utils.deepClone(found) : null;
    this.render();
  }

  static async #onDeleteEvent(event, target) {
    const id = target.dataset.eventId;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Event" },
      content: "<p>Delete this event? This goes live immediately and can't be undone.</p>"
    });
    if (!confirmed) return;

    this.#events = this.#events.filter((e) => e.id !== id);
    if (this.#editingEvent?.id === id) this.#editingEvent = null;
    await setEvents(this.#events);
    KingdomConfigApp.#broadcastChange();
    this.render();
  }

  static #onCancelEvent() {
    this.#editingEvent = null;
    this.render();
  }

  static #onAddOutcome() {
    const template = this.element.querySelector("#outcome-row-template");
    const container = this.element.querySelector("#outcomes-list");
    if (!template || !container) return;
    container.appendChild(template.content.cloneNode(true));
  }

  static #onAddPage() {
    const template = this.element.querySelector("#page-row-template");
    const container = this.element.querySelector("#pages-list");
    if (!template || !container) return;
    container.appendChild(template.content.cloneNode(true));
  }

  static #onAddStage() {
    const template = this.element.querySelector("#stage-row-template");
    const container = this.element.querySelector("#stages-list");
    if (!template || !container) return;
    container.appendChild(template.content.cloneNode(true));
  }

  static async #onSaveEvent() {
    const root = this.element;
    const title = root.querySelector("#event-title-input")?.value.trim();
    if (!title) {
      ui.notifications.warn("An event needs a title.");
      return false;
    }

    const art = root.querySelector("#event-art")?.value.trim() ?? "";
    const tintColor = root.querySelector("#event-tint-color")?.value ?? "#1b2e1f";
    const category = root.querySelector("#event-category")?.value.trim() ?? "";
    const type = root.querySelector(".event-type-radio:checked")?.value ?? "single";
    const body = root.querySelector("#event-body")?.value.trim() ?? "";
    const conditions = [...root.querySelectorAll(".event-condition-checkbox:checked")].map((el) => el.value);

    const outcomes = [];
    for (const row of root.querySelectorAll("#outcomes-list .outcome-row")) {
      const label = row.querySelector(".outcome-label")?.value.trim() ?? "";
      const text = row.querySelector(".outcome-text")?.value.trim() ?? "";
      if (label || text) outcomes.push({ label, text });
    }

    const pages = [];
    for (const row of root.querySelectorAll("#pages-list .page-row")) {
      const pageTitle = row.querySelector(".page-title")?.value.trim() ?? "";
      const pageArt = row.querySelector(".page-art")?.value.trim() ?? "";
      const pageTint = row.querySelector(".page-tint")?.value ?? "";
      const pageBody = row.querySelector(".page-body")?.value.trim() ?? "";
      if (pageTitle || pageArt || pageBody) pages.push({ title: pageTitle, art: pageArt, tintColor: pageTint, body: pageBody });
    }

    const stages = [];
    for (const row of root.querySelectorAll("#stages-list .stage-row")) {
      const stageTitle = row.querySelector(".stage-title")?.value.trim() ?? "";
      const stageArt = row.querySelector(".stage-art")?.value.trim() ?? "";
      const stageTint = row.querySelector(".stage-tint")?.value ?? "";
      const stageBody = row.querySelector(".stage-body")?.value.trim() ?? "";
      if (stageTitle || stageArt || stageBody) stages.push({ title: stageTitle, art: stageArt, tintColor: stageTint, body: stageBody });
    }

    const featuredFactionIds = [...root.querySelectorAll(".event-featured-checkbox:checked")].map((el) => el.value);
    const choices = [];
    for (const row of root.querySelectorAll("#choices-list > .choice-row")) {
      const label = row.querySelector(".choice-label")?.value.trim() ?? "";
      const text = row.querySelector(".choice-text")?.value.trim() ?? "";
      const effects = this.#readEffects(row.querySelector(".effect-list"));
      if (label || text || effects.length) choices.push({ label, text, effects });
    }
    const factionConditions = this.#readConditions(root.querySelector("#event-conditions-list"));
    const splitList = (sel) =>
      (root.querySelector(sel)?.value ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const requiresMemories = splitList("#event-requires-memories");
    const forbidsMemories = splitList("#event-forbids-memories");
    const queueOnly = !!root.querySelector("#event-queue-only")?.checked;
    let petition = null;
    if (type === "petition") {
      petition = {
        factionId: root.querySelector("#petition-faction")?.value || null,
        turns: Math.max(1, Number(root.querySelector("#petition-turns")?.value) || 2),
        success: this.#readEffects(root.querySelector("#petition-success .effect-list")),
        failure: this.#readEffects(root.querySelector("#petition-failure .effect-list"))
      };
      if (!petition.factionId) {
        ui.notifications.warn("A petition needs a faction to be asking for it.");
        return false;
      }
    }

    if (type === "multiscreen" && !pages.length) {
      ui.notifications.warn("A multi-screen event needs at least one page.");
      return false;
    }
    if (type === "questline" && !stages.length) {
      ui.notifications.warn("A quest line needs at least one stage.");
      return false;
    }

    const id = this.#editingEvent?.id ?? foundry.utils.randomID();
    // Spread the saved record first so fields this form doesn't show are kept.
    const previous = this.#events.find((e) => e.id === id) ?? {};
    const eventRecord = {
      ...previous,
      id,
      title,
      art,
      tintColor,
      category,
      type,
      conditions,
      body,
      outcomes,
      pages,
      stages,
      featuredFactionIds,
      choices,
      factionConditions,
      requiresMemories,
      forbidsMemories,
      queueOnly,
      petition
    };

    const idx = this.#events.findIndex((e) => e.id === id);
    if (idx === -1) this.#events.push(eventRecord);
    else this.#events[idx] = eventRecord;

    this.#editingEvent = null;
    await setEvents(this.#events);
    KingdomConfigApp.#broadcastChange();
    this.render();
    ui.notifications.info(`Saved "${title}" — everyone can see it now.`);
    return true;
  }

  /* ---------------------------------------------------------------- */

  static #onRemoveRow(event, target) {
    target.closest(".effect-row, .condition-row, .choice-row, .ability-row, .outcome-row, .page-row, .stage-row")?.remove();
    this.#updateReadbacks();
  }

  /* ---------------------------------------------------------------- */
  /* GM map utilities — thin triggers into hexes.js via the module API */
  /* (avoids a 3-way import cycle between this file, kingdom.js and    */
  /* hexes.js — same reasoning as kingdom.js's own claim/build buttons) */
  /* ---------------------------------------------------------------- */

  static #onGmClaimHex() {
    const ignoreCost = getIgnoreGmKwCosts();
    game.modules.get(MODULE_ID)?.api?.claimHex?.({ ignoreCost });
  }
  static #onGmBuildDistrict() {
    const ignoreCost = getIgnoreGmKwCosts();
    game.modules.get(MODULE_ID)?.api?.buildDistrict?.({ ignoreCost });
  }
  static #onGmDestroyDistrict() {
    game.modules.get(MODULE_ID)?.api?.destroyDistrict?.();
  }
  static #onGmUnclaimHex() {
    game.modules.get(MODULE_ID)?.api?.unclaimHex?.();
  }
  static #onGmExpediteLabour() {
    game.modules.get(MODULE_ID)?.api?.reduceBuildTime?.();
  }
  static #onGmMarkReconnoitered() {
    game.modules.get(MODULE_ID)?.api?.markReconnoitered?.();
  }
  static #onGmUpgradeBuilding() {
    game.modules.get(MODULE_ID)?.api?.upgradeBuilding?.();
  }
  static #onGmMoveDistrict() {
    game.modules.get(MODULE_ID)?.api?.moveDistrict?.();
  }
  static #onGmLevelUpStore() {
    game.modules.get(MODULE_ID)?.api?.levelUpStore?.();
  }
  static #onGmManageBankStorage() {
    game.modules.get(MODULE_ID)?.api?.manageBankStorage?.();
  }
  static #onGmClearReconMarkers() {
    game.modules.get(MODULE_ID)?.api?.clearReconMarkers?.();
  }
  static #onGmUnlockTiles() {
    game.modules.get(MODULE_ID)?.api?.unlockAllTiles?.();
  }
  static #onGmRecenterTiles() {
    game.modules.get(MODULE_ID)?.api?.recenterAllDistrictTiles?.();
  }
  static #onGmClearHexOverlays() {
    game.modules.get(MODULE_ID)?.api?.clearHexOverlays?.();
  }

  static async #onToggleIgnoreKwCosts(event, target) {
    await setIgnoreGmKwCosts(target.checked);
    ui.notifications.info(target.checked ? "GM map actions will now ignore KW costs." : "GM map actions will charge KW costs normally again.");
  }

  /* ---------------------------------------------------------------- */
  /* Backup export — writes a self-contained restore macro             */
  /* ---------------------------------------------------------------- */

  static #onBrowseImage(event, target) {
    const inputId = target.dataset.target;
    const input = this.element.querySelector(`#${inputId}`);
    if (!input) return;
    const thumb = input.closest(".kc-file-row")?.querySelector(".kc-thumb");
    new FilePicker({
      type: "image",
      current: input.value,
      callback: (path) => {
        input.value = path;
        if (thumb) thumb.style.backgroundImage = path ? `url('${path}')` : "";
      }
    }).render(true);
  }

  /** Pages/stages are repeatable rows, not unique IDs, so their browse
   *  buttons find the art input as a sibling within their own row
   *  instead of looking one up by ID like #onBrowseImage does. */
  static #onBrowsePageImage(event, target) {
    const row = target.closest(".page-row");
    const input = row?.querySelector(".page-art");
    if (!input) return;
    const thumb = row.querySelector(".kc-thumb");
    new FilePicker({
      type: "image",
      current: input.value,
      callback: (path) => {
        input.value = path;
        if (thumb) thumb.style.backgroundImage = path ? `url('${path}')` : "";
      }
    }).render(true);
  }

  static #onBrowseStageImage(event, target) {
    const row = target.closest(".stage-row");
    const input = row?.querySelector(".stage-art");
    if (!input) return;
    const thumb = row.querySelector(".kc-thumb");
    new FilePicker({
      type: "image",
      current: input.value,
      callback: (path) => {
        input.value = path;
        if (thumb) thumb.style.backgroundImage = path ? `url('${path}')` : "";
      }
    }).render(true);
  }

  /** Native browser eyedropper (Chrome/Edge — Foundry's Electron shell
   *  supports it) for picking a color from anywhere on screen, not just
   *  a swatch grid. Silently does nothing on unsupported browsers
   *  beyond the warning — the color input itself still works normally. */
  static async #onPickColorEyedropper(event, target) {
    const input = target.closest(".kc-color-row")?.querySelector('input[type="color"]');
    if (!input) return;
    if (!window.EyeDropper) {
      ui.notifications.warn("Your browser doesn't support the eyedropper tool (Chrome/Edge only) — use the color swatch instead.");
      return;
    }
    try {
      const result = await new window.EyeDropper().open();
      input.value = result.sRGBHex;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } catch {
      // user pressed Escape / cancelled — not an error
    }
  }

  /** Resets the domains list back to the code defaults and publishes
   *  immediately. Needed because Foundry settings persist exactly as
   *  first saved — new fields added to the defaults in a later module
   *  update (like the recent kwEffect/flags/interactionType additions)
   *  never retroactively merge into already-stored data on their own. */
  static async #onResetDomains() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Reset Domains" },
      content:
        "<p>Replace the current domains list with the module's built-in defaults and publish immediately? Useful after an update adds new fields your saved data predates. This discards any custom domain edits you've made.</p>"
    });
    if (!confirmed) return;

    this.#domains = foundry.utils.deepClone(DEFAULT_DOMAINS);
    this.#editingDomain = null;
    await setDomains(this.#domains);
    KingdomConfigApp.#broadcastChange();
    this.render();
    ui.notifications.info("Domains reset to defaults and published.");
  }

  /** Universal Actions have no Config tab yet, so this resets and
   *  publishes immediately rather than staging an in-memory edit —
   *  same as every other Save/Delete in this app now, this just
   *  predates the rest of them getting that treatment. */
  static async #onResetUniversalActions() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Reset Universal Actions" },
      content:
        "<p>Replace Universal Actions with the module's built-in defaults immediately? This is the fix if newly-added buttons (Levy Taxes, Wartime Efforts, etc.) aren't showing up — it means this world's saved copy predates them.</p>"
    });
    if (!confirmed) return;

    await setUniversalActions(foundry.utils.deepClone(DEFAULT_UNIVERSAL_ACTIONS));
    KingdomConfigApp.#broadcastChange();
    ui.notifications.info("Universal Actions reset to defaults and published.");
  }

  /** Same reasoning as Reset Domains: an event saved before tintColor/
   *  conditions existed is missing those fields entirely, not just
   *  defaulted. */
  static async #onResetEvents() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Reset Events" },
      content:
        "<p>Replace the current events list with the module's built-in defaults and publish immediately? Useful if an existing event predates the tint color / condition tag / type fields. This discards any custom event edits you've made.</p>"
    });
    if (!confirmed) return;

    this.#events = foundry.utils.deepClone(DEFAULT_EVENTS);
    this.#editingEvent = null;
    await setEvents(this.#events);
    KingdomConfigApp.#broadcastChange();
    this.render();
    ui.notifications.info("Events reset to defaults and published.");
  }

  static async #onExportBackup() {
    const api = game.modules.get(MODULE_ID)?.api;
    const snapshot = api?.getSnapshot ? api.getSnapshot() : null;
    if (!snapshot) {
      ui.notifications.error("Couldn't read current kingdom data to back up.");
      return;
    }

    // A real downloadable file rather than a generated Macro — reimport-
    // able via "Import Backup" below without needing macro permissions,
    // and readable as plain JSON if the GM wants to open it directly (in
    // an editor, or hand it to an LLM to reason about the kingdom's
    // current state — see buildFullSnapshot() in main.js for the
    // self-describing _meta block this relies on for that). Pretty-
    // printed for the same reason: this is meant to be read, not just
    // machine-round-tripped.
    const json = JSON.stringify(snapshot, null, 2);
    const safeName = (getKingdomName() || "kingdom").replace(/[^\w\- ]+/g, "").trim() || "kingdom";
    const filename = `${safeName} - Backup - ${new Date().toISOString().slice(0, 10)}.json`;

    try {
      const saveFn = foundry.utils?.saveDataToFile ?? globalThis.saveDataToFile;
      saveFn(json, "application/json", filename);
      ui.notifications.info(`Backup file downloaded: "${filename}". Use "Import Backup" to restore it later, in this world or another.`);
    } catch (err) {
      console.error("PF2e Revamped Kingdoms | Failed to export backup file", err);
      ui.notifications.error("Couldn't download the backup file — see the console for details.");
    }
  }

  /** Companion to #onExportBackup above: reads a previously-exported
   *  .json backup file straight from the GM's own disk (no macro
   *  permissions needed, unlike the old macro-based export/import) and
   *  restores it via the same restoreBackup() the old macros used —
   *  it transparently handles either the current nested format or an
   *  older flat one, see main.js for that compatibility handling. */
  static async #onImportBackup() {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can import a kingdom backup.");
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch (err) {
        console.error("PF2e Revamped Kingdoms | Backup file isn't valid JSON", err);
        ui.notifications.error("That file isn't valid JSON — couldn't import it.");
        return;
      }

      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Import Backup" },
        content: `<p>Importing <strong>${foundry.utils.escapeHTML(file.name)}</strong> will overwrite this world's current kingdom data — domains, events, buildings, transformations, factions, the map, and the research tree. This can't be undone. Continue?</p>`
      });
      if (!confirmed) return;

      await game.modules.get(MODULE_ID)?.api?.restoreBackup?.(parsed);
      this.#domains = null;
      this.#events = null;
      this.#buildings = null;
      this.#transformations = null;
      this.#factions = null;
      this.render();
    });

    input.click();
  }

  /* ---------------------------------------------------------------- */
  /* Buildings                                                          */
  /* ---------------------------------------------------------------- */

  static #onNewBuilding() {
    this.#editingBuilding = {
      id: foundry.utils.randomID(),
      name: "",
      category: "General",
      traits: [],
      cost: 1,
      buildTime: 0,
      prerequisitesText: "",
      requiresFactionId: null,
      invitesFactionId: null,
      kwPerTurn: 0,
      escalationPerCopy: 0,
      researchLocked: false,
      tileImage: BLANK_IMAGE,
      effect: ""
    };
    this.render();
  }

  static #onEditBuilding(event, target) {
    const id = target.dataset.buildingId;
    const building = this.#buildings.find((b) => b.id === id);
    this.#editingBuilding = building ? foundry.utils.deepClone(building) : null;
    this.render();
  }

  static async #onDeleteBuilding(event, target) {
    const id = target.dataset.buildingId;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Building" },
      content: "<p>Delete this building? This goes live immediately and can't be undone.</p>"
    });
    if (!confirmed) return;

    this.#buildings = this.#buildings.filter((b) => b.id !== id);
    if (this.#editingBuilding?.id === id) this.#editingBuilding = null;
    await setBuildings(this.#buildings);
    KingdomConfigApp.#broadcastChange();
    this.render();
  }

  static #onCancelBuilding() {
    this.#editingBuilding = null;
    this.render();
  }

  static async #onSaveBuilding() {
    const root = this.element;
    const name = root.querySelector("#building-name")?.value.trim();
    if (!name) {
      ui.notifications.warn("A building needs a name.");
      return false;
    }

    const category = root.querySelector("#building-category")?.value.trim() || "General";
    const traits = (root.querySelector("#building-traits")?.value ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const flags = (root.querySelector("#building-flags")?.value ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const cost = Number(root.querySelector("#building-cost")?.value) || 0;
    const buildTime = Number(root.querySelector("#building-time")?.value) || 0;
    const prerequisitesText = root.querySelector("#building-prereqs")?.value.trim() ?? "";
    const requiresFactionId = root.querySelector("#building-requires-faction")?.value || null;
    const invitesFactionId = root.querySelector("#building-invites-faction")?.value || null;
    const kwPerTurn = Number(root.querySelector("#building-kw-per-turn")?.value) || 0;
    const escalationPerCopy = Number(root.querySelector("#building-escalation")?.value) || 0;
    const researchLocked = !!root.querySelector("#building-research-locked")?.checked;
    const placementMode = root.querySelector("#building-placement-mode")?.value === "scatter" ? "scatter" : "single";
    const offsetX = Number(root.querySelector("#building-offset-x")?.value) || 0;
    const offsetY = Number(root.querySelector("#building-offset-y")?.value) || 0;
    const scaleRaw = root.querySelector("#building-scale")?.value?.trim();
    const scale = scaleRaw ? Number(scaleRaw) : null;
    const tileImage = root.querySelector("#building-tile-image")?.value.trim() ?? "";
    const effect = root.querySelector("#building-effect")?.value.trim() ?? "";

    const id = this.#editingBuilding?.id ?? foundry.utils.randomID();
    const building = {
      id,
      name,
      category,
      traits,
      flags,
      cost,
      buildTime,
      prerequisitesText,
      requiresFactionId,
      invitesFactionId,
      kwPerTurn,
      escalationPerCopy,
      researchLocked,
      placementMode,
      offsetX,
      offsetY,
      scale,
      tileImage,
      effect
    };

    const idx = this.#buildings.findIndex((b) => b.id === id);
    const previousImage = idx !== -1 ? this.#buildings[idx].tileImage : null;
    if (idx === -1) this.#buildings.push(building);
    else this.#buildings[idx] = building;

    this.#editingBuilding = null;
    await setBuildings(this.#buildings);
    KingdomConfigApp.#broadcastChange();
    this.render();

    const imageChanged = previousImage !== null && previousImage !== tileImage;
    const hasPlacedCopies = imageChanged && getPlacedBuildings().some((p) => p.buildingId === id);
    ui.notifications.info(
      `Saved "${name}" — everyone can see it now.` +
        (hasPlacedCopies
          ? ' This building\'s already been placed on the map — use "Recenter District Tiles" in the utility bar to update its existing image too (new copies will use the new art automatically either way).'
          : "")
    );
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Transformations                                                    */
  /* ---------------------------------------------------------------- */

  static #onNewTransformation() {
    if (!this.#buildings.length) {
      ui.notifications.warn("Add at least one building first — a transformation needs a From and a To building to pick from.");
      return;
    }
    this.#editingTransformation = {
      id: foundry.utils.randomID(),
      name: "",
      fromBuildingId: this.#buildings[0]?.id ?? null,
      toBuildingId: this.#buildings[0]?.id ?? null,
      icon: "",
      kwCost: 1,
      turnTimeout: 0,
      researchLocked: false
    };
    this.render();
  }

  static #onEditTransformation(event, target) {
    const id = target.dataset.transformationId;
    const transformation = this.#transformations.find((t) => t.id === id);
    this.#editingTransformation = transformation ? foundry.utils.deepClone(transformation) : null;
    this.render();
  }

  static async #onDeleteTransformation(event, target) {
    const id = target.dataset.transformationId;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Transformation" },
      content: "<p>Delete this transformation? Any research node granting it will just show it as unavailable. This goes live immediately and can't be undone.</p>"
    });
    if (!confirmed) return;

    this.#transformations = this.#transformations.filter((t) => t.id !== id);
    if (this.#editingTransformation?.id === id) this.#editingTransformation = null;
    await setTransformations(this.#transformations);
    KingdomConfigApp.#broadcastChange();
    this.render();
  }

  static #onCancelTransformation() {
    this.#editingTransformation = null;
    this.render();
  }

  static async #onSaveTransformation() {
    const root = this.element;
    const name = root.querySelector("#transformation-name")?.value.trim();
    if (!name) {
      ui.notifications.warn("A transformation needs a name.");
      return false;
    }

    const fromBuildingId = root.querySelector("#transformation-from-building")?.value || null;
    const toBuildingId = root.querySelector("#transformation-to-building")?.value || null;
    if (!fromBuildingId || !toBuildingId) {
      ui.notifications.warn("A transformation needs both a From and a To building.");
      return false;
    }

    const icon = root.querySelector("#transformation-icon")?.value.trim() ?? "";
    const kwCost = Number(root.querySelector("#transformation-kw-cost")?.value) || 0;
    const turnTimeout = Number(root.querySelector("#transformation-turn-timeout")?.value) || 0;
    const researchLocked = !!root.querySelector("#transformation-research-locked")?.checked;

    const id = this.#editingTransformation?.id ?? foundry.utils.randomID();
    const transformation = { id, name, fromBuildingId, toBuildingId, icon, kwCost, turnTimeout, researchLocked };

    const idx = this.#transformations.findIndex((t) => t.id === id);
    if (idx === -1) this.#transformations.push(transformation);
    else this.#transformations[idx] = transformation;

    this.#editingTransformation = null;
    await setTransformations(this.#transformations);
    KingdomConfigApp.#broadcastChange();
    this.render();

    ui.notifications.info(`Saved "${name}" — everyone can see it now.`);
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Factions                                                           */
  /* ---------------------------------------------------------------- */

  static #onNewFaction() {
    this.#editingFaction = {
      id: foundry.utils.randomID(),
      name: "",
      portrait: BLANK_IMAGE,
      happiness: 0,
      present: false,
      effectHigh: "",
      effectLow: "",
      tier: "main",
      ladder: {}
    };
    this.render();
  }

  static #onEditFaction(event, target) {
    const id = target.dataset.factionId;
    const faction = this.#factions.find((f) => f.id === id);
    this.#editingFaction = faction ? foundry.utils.deepClone(faction) : null;
    this.render();
  }

  static async #onDeleteFaction(event, target) {
    const id = target.dataset.factionId;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Faction" },
      content: "<p>Delete this faction? Any buildings or abilities referencing it will just show \"None\" until reassigned. This goes live immediately and can't be undone.</p>"
    });
    if (!confirmed) return;

    this.#factions = this.#factions.filter((f) => f.id !== id);
    if (this.#editingFaction?.id === id) this.#editingFaction = null;
    await setFactions(this.#factions);
    KingdomConfigApp.#broadcastChange();
    this.render();
  }

  static #onCancelFaction() {
    this.#editingFaction = null;
    this.render();
  }

  static async #onSaveFaction() {
    const root = this.element;
    const name = root.querySelector("#faction-name")?.value.trim();
    if (!name) {
      ui.notifications.warn("A faction needs a name.");
      return false;
    }

    const portrait = root.querySelector("#faction-portrait")?.value.trim() ?? "";
    const present = root.querySelector("#faction-present")?.checked ?? false;
    const val = (sel) => root.querySelector(sel)?.value.trim() ?? "";
    const tier = FACTION_TIERS.some((t) => t.id === val("#faction-tier")) ? val("#faction-tier") : "main";
    const range = FACTION_TIERS.find((t) => t.id === tier);
    const ladder = {};
    for (const input of root.querySelectorAll(".ladder-input")) {
      const step = Number(input.dataset.step);
      const text = input.value.trim();
      if (text && step >= range.min && step <= range.max) ladder[step] = text;
    }
    const favourTitle = val("#faction-favour-title");
    const favourCosts = val("#faction-favour-costs")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    const id = this.#editingFaction?.id ?? foundry.utils.randomID();
    const existing = this.#factions.find((f) => f.id === id);
    const faction = {
      // Keep anything this form doesn't show (taxes are stored elsewhere,
      // but future fields might not be).
      ...(existing ?? {}),
      id,
      name,
      portrait,
      present,
      tier,
      happiness: clampHappiness({ tier }, existing?.happiness ?? 0),
      // The old +3 / -3 text stays in step with the ladder's ends, so
      // anything still reading those fields sees the same words.
      effectHigh: ladder[range.max] ?? "",
      effectLow: ladder[range.min] ?? "",
      ladder,
      leaderName: val("#faction-leader-name"),
      leaderTitle: val("#faction-leader-title"),
      leaderPortrait: val("#faction-leader-portrait"),
      leaderQuote: val("#faction-leader-quote"),
      agenda: val("#faction-agenda"),
      rivalId: val("#faction-rival") || null,
      favour:
        favourTitle && tier !== "patron"
          ? { title: favourTitle, costs: favourCosts.length ? favourCosts : [1], description: val("#faction-favour-desc") }
          : null,
      tradeKw: Number(val("#faction-trade-kw")) || 0,
      tradeActive: !!root.querySelector("#faction-trade-active")?.checked,
      storyHighEventId: val("#faction-story-high") || null,
      storyLowEventId: val("#faction-story-low") || null
    };

    const idx = this.#factions.findIndex((f) => f.id === id);
    if (idx === -1) this.#factions.push(faction);
    else this.#factions[idx] = faction;

    this.#editingFaction = null;
    await setFactions(this.#factions);
    KingdomConfigApp.#broadcastChange();
    this.render();
    ui.notifications.info(`Saved "${name}" — everyone can see it now.`);
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Faction editor                                                     */
  /* ---------------------------------------------------------------- */

  #prepareFactionEditor(f) {
    const tier = tierOf(f);
    const ladder = { ...(f.ladder ?? {}) };
    if (!Object.values(ladder).some(Boolean)) {
      if (f.effectHigh) ladder[tier.max] = f.effectHigh;
      if (f.effectLow) ladder[tier.min] = f.effectLow;
    }
    return {
      ...f,
      tier: tier.id,
      ladderInputs: [3, 2, 1, -1, -2, -3].map((s) => ({ step: s, label: s > 0 ? `+${s}` : `${s}`, text: ladder[s] ?? "" })),
      rivalChoices: this.#factions.filter((x) => x.id !== f.id).map((x) => ({ id: x.id, name: x.name })),
      favourTitle: f.favour?.title ?? "",
      favourCostsJoined: (f.favour?.costs ?? [1]).join(","),
      favourDescription: f.favour?.description ?? "",
      tradeKw: f.tradeKw ?? 0
    };
  }

  /** Shows only the ladder steps and sections that make sense for the
   *  kind of faction picked, without a re-render (so typing isn't lost). */
  #wireFactionTier() {
    const select = this.element.querySelector("#faction-tier");
    if (!select) return;
    const apply = () => {
      const tier = FACTION_TIERS.find((t) => t.id === select.value) ?? FACTION_TIERS[0];
      for (const row of this.element.querySelectorAll(".kc-ladder__row")) {
        const s = Number(row.dataset.step);
        row.hidden = s < tier.min || s > tier.max;
      }
      for (const el of this.element.querySelectorAll("[data-tier-only]")) el.hidden = el.dataset.tierOnly !== tier.id;
      for (const el of this.element.querySelectorAll("[data-tier-not]")) el.hidden = el.dataset.tierNot === tier.id;
    };
    select.addEventListener("change", apply);
    apply();
  }

  /* ---------------------------------------------------------------- */
  /* Effects and conditions editors                                     */
  /* Rows are built here from JSON the template hands over, so the one  */
  /* builder serves both saved rows and "+ Add" buttons.                */
  /* ---------------------------------------------------------------- */

  #option(value, label, selected) {
    const o = document.createElement("option");
    o.value = value ?? "";
    o.textContent = label;
    if (selected) o.selected = true;
    return o;
  }

  #buildEffectRow(effect = {}) {
    const e = normalizeEffect(effect);
    const row = document.createElement("div");
    row.className = "effect-row";

    const type = document.createElement("select");
    type.className = "ef-type";
    for (const t of EFFECT_TYPES) type.append(this.#option(t.id, t.label, t.id === e.type));

    const faction = document.createElement("select");
    faction.className = "ef-faction";
    faction.append(this.#option("", "Choose a faction", !e.factionId));
    for (const f of this.#factions) faction.append(this.#option(f.id, f.name, f.id === e.factionId));

    const amount = document.createElement("input");
    amount.type = "number";
    amount.className = "ef-amount";
    amount.value = String(e.amount);
    amount.title = "Use a minus sign to take away, e.g. -2";

    const text = document.createElement("input");
    text.type = "text";
    text.className = "ef-text";
    text.value = e.text;
    text.placeholder = "e.g. spared the Old Mother Oak";

    const eventSel = document.createElement("select");
    eventSel.className = "ef-event";
    eventSel.append(this.#option("", "Choose an event", !e.eventId));
    for (const ev of this.#events) eventSel.append(this.#option(ev.id, ev.title || "(untitled)", ev.id === e.eventId));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-btn";
    remove.dataset.action = "removeRow";
    remove.textContent = "\u00d7";
    remove.setAttribute("aria-label", "Remove this effect");

    const setFields = () => {
      row.dataset.fields = (EFFECT_TYPES.find((t) => t.id === type.value)?.fields ?? []).join(" ");
    };
    type.addEventListener("change", setFields);
    setFields();

    row.append(type, faction, amount, text, eventSel, remove);
    return row;
  }

  #buildConditionRow(cond = {}) {
    const row = document.createElement("div");
    row.className = "condition-row";
    const faction = document.createElement("select");
    faction.className = "cond-faction";
    faction.append(this.#option("", "Choose a faction", !cond.factionId));
    for (const f of this.#factions) faction.append(this.#option(f.id, f.name, f.id === cond.factionId));
    const op = document.createElement("select");
    op.className = "cond-op";
    for (const o of CONDITION_OPS) op.append(this.#option(o.id, o.label, o.id === (cond.op ?? "atLeast")));
    const value = document.createElement("input");
    value.type = "number";
    value.className = "cond-value";
    value.value = String(cond.value ?? 0);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-btn";
    remove.dataset.action = "removeRow";
    remove.textContent = "\u00d7";
    const setOp = () => (row.dataset.op = op.value);
    op.addEventListener("change", setOp);
    setOp();
    row.append(faction, op, value, remove);
    return row;
  }

  #readEffects(list) {
    if (!list) return [];
    return [...list.querySelectorAll(":scope > .effect-row")].map((row) =>
      normalizeEffect({
        type: row.querySelector(".ef-type")?.value,
        factionId: row.querySelector(".ef-faction")?.value || null,
        amount: row.querySelector(".ef-amount")?.value,
        text: row.querySelector(".ef-text")?.value,
        eventId: row.querySelector(".ef-event")?.value || null
      })
    );
  }

  #readConditions(list) {
    if (!list) return [];
    return [...list.querySelectorAll(":scope > .condition-row")]
      .map((row) => ({
        factionId: row.querySelector(".cond-faction")?.value || null,
        op: row.querySelector(".cond-op")?.value || "atLeast",
        value: Number(row.querySelector(".cond-value")?.value) || 0
      }))
      .filter((c) => c.factionId);
  }

  #parseJson(text, fallback) {
    try {
      const v = JSON.parse(text ?? "");
      return Array.isArray(v) ? v : fallback;
    } catch {
      return fallback;
    }
  }

  #mountEffectEditors(scope = this.element) {
    for (const list of scope.querySelectorAll(".effect-list[data-effects]")) {
      for (const e of this.#parseJson(list.dataset.effects, [])) list.append(this.#buildEffectRow(e));
      delete list.dataset.effects;
    }
    for (const list of scope.querySelectorAll(".condition-list[data-conditions]")) {
      for (const c of this.#parseJson(list.dataset.conditions, [])) list.append(this.#buildConditionRow(c));
      delete list.dataset.conditions;
    }
    const screen = this.element.querySelector(".kc-screen");
    if (screen && !screen.dataset.readbacksWired) {
      screen.dataset.readbacksWired = "1";
      const update = (event) => {
        if (event.target.closest?.(".effect-block")) this.#updateReadbacks();
      };
      screen.addEventListener("input", update);
      screen.addEventListener("change", update);
    }
    this.#updateReadbacks();
  }

  /** The sentence under each set of effects, e.g. "+1 happiness with The
   *  Woodsmen, -2 KW." — so the GM can see what a choice will do. */
  #updateReadbacks() {
    for (const block of this.element.querySelectorAll(".effect-block")) {
      const out = block.querySelector(":scope > .effect-readback");
      if (!out) continue;
      out.textContent = describeEffects(this.#readEffects(block.querySelector(":scope > .effect-list")), {
        factions: this.#factions,
        events: this.#events
      });
    }
  }

  static #onAddChoice() {
    const template = this.element.querySelector("#choice-row-template");
    const container = this.element.querySelector("#choices-list");
    if (!template || !container) return;
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector(".choice-row");
    container.appendChild(fragment);
    if (row) this.#mountEffectEditors(row);
  }

  static #onAddEffect(event, target) {
    const list = target.closest(".effect-block")?.querySelector(":scope > .effect-list");
    if (!list) return;
    list.append(this.#buildEffectRow({ type: "happiness" }));
    this.#updateReadbacks();
  }

  static #onAddCondition() {
    const list = this.element.querySelector("#event-conditions-list");
    if (list) list.append(this.#buildConditionRow({ op: "atLeast", value: 1 }));
  }

  /* ---------------------------------------------------------------- */
  /* Memories                                                           */
  /* ---------------------------------------------------------------- */

  static async #onForgetMemory(event, target) {
    const key = target.dataset.key;
    await setMemories(getMemories().filter((m) => m.key !== key));
    KingdomConfigApp.#broadcastChange();
    this.render();
  }

  static async #onAddMemory() {
    const input = this.element.querySelector("#memory-add-input");
    const text = input?.value.trim();
    if (!text) return;
    const memories = getMemories();
    if (!memories.some((m) => m.key === memoryKey(text))) {
      memories.push({ key: memoryKey(text), label: text, turn: getKingdomTurn() });
      await setMemories(memories);
    }
    KingdomConfigApp.#broadcastChange();
    this.render();
  }

  /* ---------------------------------------------------------------- */
  /* Faction Pack                                                       */
  /* ---------------------------------------------------------------- */

  static async #onAddFactionPack() {
    if (!game.user.isGM) return;
    const factions = this.#factions;
    const tierLabel = { main: "main faction", minor: "minor faction", patron: "patron" };
    const rows = PACK_FACTIONS.map((pf) => {
      const guess = guessMatch(pf, factions);
      const options = [
        `<option value="new"${guess === "new" ? " selected" : ""}>Add it as a new faction</option>`,
        `<option value="skip">Leave it out</option>`,
        ...factions.map(
          (f) => `<option value="${escapeHTML(f.id)}"${guess === f.id ? " selected" : ""}>Fill in my "${escapeHTML(f.name)}"</option>`
        )
      ].join("");
      return `<div class="form-group"><label>${escapeHTML(pf.data.name)} <span class="kc-field-hint">(${tierLabel[pf.data.tier]}, led by ${escapeHTML(pf.data.leaderName)})</span></label><select name="${pf.key}">${options}</select></div>`;
    }).join("");

    const mapping = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Add the Faction Pack" },
      classes: ["pf2e-rk-dialog"],
      position: { width: 560 },
      content: `<p>This gives your factions leaders, rivals, ladders and favours, and adds ${PACK_EVENTS.length} events, petitions and faction stories.</p><p>It only fills in fields that are empty, so anything you've already written stays as it is. New factions start outside the kingdom until an event (or you) brings them in.</p>${rows}`,
      ok: {
        label: "Add it",
        callback: (event, button) => Object.fromEntries(PACK_FACTIONS.map((pf) => [pf.key, button.form.elements[pf.key]?.value ?? "new"]))
      },
      rejectClose: false
    }).catch(() => null);
    if (!mapping) return;

    const result = await applyPack(mapping);
    KingdomConfigApp.#broadcastChange();
    this.render();
    ui.notifications.info(
      `Faction Pack added: ${result.factionsFilled} faction(s) filled in, ${result.factionsAdded} new, ${result.eventsAdded} event(s) added.`
    );
  }
}
