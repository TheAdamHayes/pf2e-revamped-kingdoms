import { RevampedKingdomApp, refreshAllKingdomApps, openOrFocusKingdomApp } from "./kingdom.js";
import { KingdomConfigApp } from "./kingdom-config.js";
import { ResearchTreeApp, refreshAllResearchApps } from "./research.js";
import {
    registerSettings,
    MODULE_ID,
    getDomains,
    setDomains,
    getEvents,
    setEvents,
    getUniversalActions,
    setUniversalActions,
    getFactions,
    setFactions,
    getBuildings,
    setBuildings,
    getTransformations,
    setTransformations,
    getKingdomName,
    setKingdomName,
    getKingdomState,
    setKingdomState,
    getIgnoreGmKwCosts,
    setIgnoreGmKwCosts,
    getFactionTaxes,
    setFactionTaxes,
    getAtWar,
    setAtWar,
    getFestivalCost,
    setFestivalCost,
    getClaimedHexes,
    setClaimedHexes,
    getPlacedBuildings,
    setPlacedBuildings,
    getReconnoiteredHexes,
    setReconnoiteredHexes,
    getActiveEventId,
    setActiveEventId,
    getActiveEventPage,
    setActiveEventPage,
    getBonusActionSlots,
    setBonusActionSlots,
    getQuestlineProgress,
    setQuestlineProgress,
    getResearchNodes,
    setResearchNodes,
    getResearchRegions,
    setResearchRegions,
    getResearchPoints,
    setResearchPoints,
    getScatterSettings,
    getDefaultSingleBuildingScale
} from "./data.js";
import {
    claimHex,
    buildDistrict,
    destroyDistrict,
    unclaimHex,
    unlockAllTiles,
    recenterAllDistrictTiles,
    clearHexOverlays,
    reduceBuildTime,
    markReconnoitered,
    upgradeBuilding,
    moveDistrict,
    levelUpStore,
    manageBankStorage,
    clearReconMarkers,
    applyTransformation,
    completeDueTransformations,
    initHoverTooltips
} from "./hexes.js";

/** Builds the full exportable snapshot of this world's kingdom data —
 *  everything needed to recreate the game state exactly, not just the
 *  GM-authored content (domains/events/buildings/etc, which is all the
 *  older flat getSnapshot() below used to include). Grouped into named
 *  sections rather than one flat object: this is read by GMs re-importing
 *  a save AND, per the person's own stated use case, potentially handed
 *  to an LLM to reason about the kingdom's current state (e.g. "codify
 *  a domain's job") — a self-describing nested shape with a `_meta`
 *  explanation is easier for either reader to orient in than a flat
 *  bag of same-named keys with no structure. */
function buildFullSnapshot() {
    return {
        _meta: {
            format: "pf2e-revamped-kingdoms-backup",
            formatVersion: 2,
            exportedAt: new Date().toISOString(),
            exportedBy: game.user?.name ?? "unknown",
            worldTitle: game.world?.title ?? null,
            note:
                "Full save-state export of this world's PF2e Revamped Kingdoms data — everything needed to restore the kingdom exactly as it was when exported, not just GM-authored content. Re-import via Kingdom Configuration \u2192 Import Backup, or by running an exported backup macro. IDs referenced across sections point at entries elsewhere in this file: a research node's grantsBuildingId/grantsTransformationId points at buildings[]/transformations[] by id; a placed district's buildingId points at buildings[] by id; a transformation's fromBuildingId/toBuildingId both point at buildings[] by id; map.placedBuildings[].key and map.claimedHexes[].key are hex-grid offset keys (\"i,j\"), matched against research.nodes[].x/y which are separate pixel coordinates on the research tree canvas, not hex coordinates."
        },
        kingdom: {
            name: getKingdomName(),
            state: getKingdomState(),
            ignoreGmKwCosts: getIgnoreGmKwCosts(),
            atWar: getAtWar(),
            festivalCost: getFestivalCost(),
            bonusActionSlots: getBonusActionSlots(),
            questlineProgress: getQuestlineProgress()
        },
        leadership: {
            domains: getDomains()
        },
        universalActions: getUniversalActions(),
        events: {
            definitions: getEvents(),
            activeEventId: getActiveEventId(),
            activeEventPage: getActiveEventPage()
        },
        factions: {
            list: getFactions(),
            taxes: getFactionTaxes()
        },
        buildings: getBuildings(),
        transformations: getTransformations(),
        map: {
            claimedHexes: getClaimedHexes(),
            placedBuildings: getPlacedBuildings(),
            reconnoiteredHexes: getReconnoiteredHexes()
        },
        research: {
            nodes: getResearchNodes(),
            regions: getResearchRegions(),
            points: getResearchPoints()
        },
        tilePlacementDefaults: {
            ...getScatterSettings(),
            singleBuildingScale: getDefaultSingleBuildingScale()
        }
    };
}

/** Accepts either the current nested format (see buildFullSnapshot above)
 *  or the older flat format (domains/events/universalActions/factions/
 *  buildings/kingdomName/kingdomState as top-level keys) that earlier
 *  backup macros already out in the wild were built with — so a GM's
 *  existing old backup macro still works after this change instead of
 *  silently restoring nothing. */
async function restoreBackup(snapshot) {
    if (!game.user.isGM) {
        ui.notifications.warn("Only the GM can restore a kingdom backup.");
        return;
    }
    if (!snapshot || typeof snapshot !== "object") {
        ui.notifications.error("That backup data looks invalid.");
        return;
    }

    const isNested = snapshot._meta?.format === "pf2e-revamped-kingdoms-backup";

    if (isNested) {
        const { kingdom, leadership, universalActions, events, factions, buildings, transformations, map, research, tilePlacementDefaults } = snapshot;

        if (kingdom?.name) await setKingdomName(kingdom.name);
        if (kingdom?.state) await setKingdomState(kingdom.state);
        if (typeof kingdom?.ignoreGmKwCosts === "boolean") await setIgnoreGmKwCosts(kingdom.ignoreGmKwCosts);
        if (typeof kingdom?.atWar === "boolean") await setAtWar(kingdom.atWar);
        if (typeof kingdom?.festivalCost === "number") await setFestivalCost(kingdom.festivalCost);
        if (typeof kingdom?.bonusActionSlots === "number") await setBonusActionSlots(kingdom.bonusActionSlots);
        if (kingdom?.questlineProgress) await setQuestlineProgress(kingdom.questlineProgress);

        if (leadership?.domains) await setDomains(leadership.domains);
        if (universalActions) await setUniversalActions(universalActions);
        if (events?.definitions) await setEvents(events.definitions);
        if (events?.activeEventId !== undefined) await setActiveEventId(events.activeEventId);
        if (typeof events?.activeEventPage === "number") await setActiveEventPage(events.activeEventPage);
        if (factions?.list) await setFactions(factions.list);
        if (factions?.taxes) await setFactionTaxes(factions.taxes);
        if (buildings) await setBuildings(buildings);
        if (transformations) await setTransformations(transformations);
        if (map?.claimedHexes) await setClaimedHexes(map.claimedHexes);
        if (map?.placedBuildings) await setPlacedBuildings(map.placedBuildings);
        if (map?.reconnoiteredHexes) await setReconnoiteredHexes(map.reconnoiteredHexes);
        if (research?.nodes) await setResearchNodes(research.nodes);
        if (research?.regions) await setResearchRegions(research.regions);
        if (typeof research?.points === "number") await setResearchPoints(research.points);
        if (tilePlacementDefaults) {
            const { min, max, scale, singleBuildingScale } = tilePlacementDefaults;
            if (typeof min === "number") await game.settings.set(MODULE_ID, "scatterCountMin", min);
            if (typeof max === "number") await game.settings.set(MODULE_ID, "scatterCountMax", max);
            if (typeof scale === "number") await game.settings.set(MODULE_ID, "scatterScale", scale);
            if (typeof singleBuildingScale === "number") await game.settings.set(MODULE_ID, "singleBuildingScale", singleBuildingScale);
        }
    } else {
        // Old flat format — kept working rather than breaking existing
        // backup macros GMs may already have saved from before this
        // export was expanded to cover the full game state.
        if (snapshot.domains) await setDomains(snapshot.domains);
        if (snapshot.events) await setEvents(snapshot.events);
        if (snapshot.universalActions) await setUniversalActions(snapshot.universalActions);
        if (snapshot.factions) await setFactions(snapshot.factions);
        if (snapshot.buildings) await setBuildings(snapshot.buildings);
        if (snapshot.kingdomName) await setKingdomName(snapshot.kingdomName);
        if (snapshot.kingdomState) await setKingdomState(snapshot.kingdomState);
    }

    refreshAllKingdomApps();
    refreshAllResearchApps();
    game.socket.emit(`module.${MODULE_ID}`, { action: "refresh" });
    ui.notifications.info("Kingdom data restored from backup.");
}

Hooks.once("init", () => {
    console.log("PF2e Revamped Kingdoms | Initializing custom kingdom ruleset.");

    registerSettings();
    Handlebars.registerHelper("eq", (a, b) => a === b);
    Handlebars.registerHelper("gt", (a, b) => a > b);

    // A button under Configure Settings, so opening the app doesn't
    // require a macro. RevampedKingdomApp's own constructor handles
    // sizing itself to the screen regardless of how it's launched.
    game.settings.registerMenu(MODULE_ID, "openKingdomApp", {
        name: "Kingdom Management",
        label: "Open Kingdom Management",
        hint: "Opens the Kingdom Management window.",
        icon: "fas fa-chess-rook",
        type: RevampedKingdomApp,
        restricted: false
    });

    // Expose to global scope for easy macro access
    game.modules.get(MODULE_ID).api = {
        open: () => {
            new RevampedKingdomApp().render(true);
        },
        openConfig: () => {
            new KingdomConfigApp().render(true);
        },
        openResearchTree: () => {
            new ResearchTreeApp().render(true);
        },
        claimHex,
        buildDistrict,
        destroyDistrict,
        unclaimHex,
        unlockAllTiles,
        recenterAllDistrictTiles,
        clearHexOverlays,
        reduceBuildTime,
        markReconnoitered,
        upgradeBuilding,
        moveDistrict,
        levelUpStore,
        manageBankStorage,
        clearReconMarkers,
        applyTransformation,
        completeDueTransformations,
        restoreBackup,
        // Exposed so an exported backup macro/file-export can pull the full
        // snapshot shape without needing to know the individual setting
        // keys. See buildFullSnapshot() for what's actually in it now —
        // this used to return a small flat object (just the GM-authored
        // content); it's the same function name for compatibility with
        // anything already calling api.getSnapshot(), but the shape
        // returned is the new nested one.
        getSnapshot: buildFullSnapshot
    };
});

Hooks.once("ready", () => {
    // When the GM publishes edits from the Kingdom Configuration app, every
    // client's open Kingdom window(s) refresh automatically — no one needs
    // to reload the page for new domains/events to show up.
    game.socket.on(`module.${MODULE_ID}`, (payload) => {
        if (payload?.action === "refresh") {
            refreshAllKingdomApps();
            refreshAllResearchApps();
        } else if (payload?.action === "pullToScreen") {
            // Every connected client (GM's own emit doesn't loop back to
            // itself — standard socket broadcast behavior) opens or
            // focuses their OWN Kingdom Management window and jumps to
            // whichever tab the GM was on when they pulled everyone in.
            openOrFocusKingdomApp(payload.tab);
        }
    });

    initHoverTooltips();
});
