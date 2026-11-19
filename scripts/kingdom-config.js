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
  MODULE_ID
} from "./data.js";
import { refreshAllKingdomApps, registerModuleWindow, unregisterModuleWindow } from "./kingdom.js";

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
      resetEvents: KingdomConfigApp.#onResetEvents
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
          stages: this.#editingEvent.stages ?? []
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
    context.editingFaction = this.#editingFaction;

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

    if (type === "multiscreen" && !pages.length) {
      ui.notifications.warn("A multi-screen event needs at least one page.");
      return false;
    }
    if (type === "questline" && !stages.length) {
      ui.notifications.warn("A quest line needs at least one stage.");
      return false;
    }

    const id = this.#editingEvent?.id ?? foundry.utils.randomID();
    const eventRecord = { id, title, art, tintColor, category, type, conditions, body, outcomes, pages, stages };

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
    target.closest(".ability-row, .outcome-row, .page-row, .stage-row")?.remove();
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
      effectLow: ""
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
    const effectHigh = root.querySelector("#faction-effect-high")?.value.trim() ?? "";
    const effectLow = root.querySelector("#faction-effect-low")?.value.trim() ?? "";

    const id = this.#editingFaction?.id ?? foundry.utils.randomID();
    const existing = this.#factions.find((f) => f.id === id);
    const faction = {
      id,
      name,
      portrait,
      present,
      happiness: existing?.happiness ?? 0,
      effectHigh,
      effectLow
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

}
