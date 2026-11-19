export const MODULE_ID = "pf2e-revamped-kingdoms";

/* A safe, always-available placeholder — a core Foundry icon, not
   anything this module ships — so a freshly-created Domain/Event/
   Building/Faction shows a visible, editable image slot instead of a
   blank/broken one. Swap it via the image field (Browse button) once
   you've got (or drawn) the real art. */
export const BLANK_IMAGE = "icons/svg/mystery-man.svg";

/** Escapes text for safe use inside HTML built from strings (names in
 *  dialogs, tooltips, chat cards). Effect/description fields are meant to
 *  hold HTML and are NOT passed through this. */
export function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A CSS url() value that survives quotes, brackets and spaces in a path
 *  (building art like "Buildings - Tower (red).png"). */
export function cssUrl(path) {
  if (!path) return "none";
  return `url("${String(path).replace(/\\/g, "/").replace(/"/g, "%22")}")`;
}

/** Whether this user can write world settings. Players normally can't —
 *  Foundry only lets Assistant GMs and above do that — so anything a
 *  player triggers has to go through the GM instead (see the socket
 *  handler in main.js). */
export function canWriteWorld() {
  return game.user?.isGM || !!game.user?.can?.("SETTINGS_MODIFY");
}

/* Seed data — this is exactly the content that used to be hardcoded in
   kingdom.hbs. It only ever loads once, the first time the world settings
   are read (Foundry persists whatever the GM edits afterward). */
export const DEFAULT_DOMAINS = [
  {
    id: "treasurer",
    name: "The Treasurer",
    portrait: "modules/pf2e-revamped-kingdoms/images/banker.jpg",
    remote: false,
    tags: ["Generating KW", "Reducing KW costs", "Wealth distribution"],
    note: "",
    abilities: [
      {
        title: "Set Taxes",
        costs: [1],
        interactionType: "set-taxes",
        description:
          "<p>You may adjust taxes for each faction. Each faction may either have any of the following;</p><ul><li><strong>Relief:</strong> When you <em>levy taxes</em>, you lose 2 KW but gain 1 stage of happiness with this faction, to a maximum of 2.</li><li><strong>Standard:</strong> When you <em>levy taxes</em>, you gain 1 KW and lose 1 stage of happiness with this faction, to a minimum of -1.</li><li><strong>Aggressive:</strong> When you <em>levy taxes</em>, you gain 2 KW but lose 2 stages of happiness with this faction, to a minimum of -3.</li></ul>"
      },
      {
        title: "Levy Taxes",
        costs: [2, 3],
        interactionType: "levy-taxes",
        description:
          "<p>It's tax day. Select a faction. Gain or lose KW and happiness according to the taxes you set on them. You may instead spend three actions to claim taxes on all factions.</p>"
      },
      {
        title: "Issue a Subsidy",
        costs: [1],
        interactionType: "issue-subsidy",
        description:
          "<p>This action takes priority in the Decide stage. Select an action where a council member would spend KW; that cost is reduced by 2 KW.</p>"
      }
    ]
  },
  {
    id: "general",
    name: "The General",
    portrait: "https://hearthstone.wiki.gg/images/Stormwind_Champion_full.jpg?97de26=&format=original",
    remote: true,
    tags: ["Combat", "Exploration", "Challenges"],
    note: "Combats are resolved one after another, with time to prepare equal to the time it takes to travel there in hexploration days.",
    abilities: [
      {
        title: "Advance",
        costs: [1],
        interactionType: "post-effect",
        playerEffect: {
          name: "Advance (Combat Bonus)",
          description: "<p>+1 status bonus to attack rolls, damage rolls, and saving throws for this combat.</p>",
          duration: { value: 1, unit: "encounter" }
        },
        description:
          "<p>Select an unclaimed tile adjacent to a claimed one. You learn of any hazards on that tile. If there is a combat hazard, you must fight it at the end of the Resolve stage. Your party gain a +1 status bonus to attack rolls, damage rolls, and saving throws for this combat.</p>"
      },
      {
        title: "Scout",
        costs: [2],
        reminderMessage: "Reveal hazards on three adjacent unclaimed tiles (at least one touching a claimed tile).",
        description:
          "<p>Select three unclaimed tiles. They must all be adjacent to each other, and at least one must be adjacent to a claimed tile (such as a straight line). You learn of all hazards on that space.</p>"
      },
      {
        title: "Challenge",
        costs: [1],
        reminderMessage: "Reward is GM judgment: guaranteed double gold for the encounter, plus a chance at an item of that level or lower.",
        description:
          "<p>Select a tile with a combat hazard. You fight it at the end of the Resolve stage. That combat increases by one tier of difficulty (Trivial &rarr; Low &rarr; Moderate &rarr; Severe &rarr; Extreme &rarr; <em>Deadly</em>). If you complete this combat, you are <em>guaranteed</em> to earn double the gold you would for that encounter ordinarily. You have a chance to, if appropriate, receive a powerful item of that encounter's level or lower.</p>"
      }
    ]
  },
  {
    id: "warden",
    name: "The Warden",
    portrait: "https://hearthstone.wiki.gg/images/thumb/Elise_the_Trailblazer_full.jpg/800px-Elise_the_Trailblazer_full.jpg?316f31",
    remote: true,
    tags: ["Exploring", "Revealing the fog of war", "Taming the wilds"],
    note: "",
    abilities: [
      {
        title: "Explore",
        costs: [1],
        interactionType: "mark-reconnoitered",
        reminderMessage: "Marking the hex waives its Claim a Hex cost once, next time it's claimed (assuming it's cleared of any hazards). Capped at 3 marked-but-unclaimed hexes at a time.",
        description:
          "<p>Select an unclaimed hex adjacent to a claimed one. You learn of what hazards are on that tile. That tile gains the [Reconnoitered] trait, making claiming it cost 0 KW when it is cleared of any hazards.</p>"
      },
      {
        title: "Scout",
        costs: [2],
        reminderMessage: "Reveal hazards on the target tile and its neighbors, and clear the fog of war there.",
        description:
          "<p>Select any tile. You learn of any hazards on that tile and any adjacent tile. The fog of war is also cleared for that tile.</p>"
      },
      {
        title: "Tame",
        costs: [1],
        reminderMessage: "Roll a DC 15 flat check (optionally spend KW 1-for-1 to lower the DC first).",
        description:
          "<p>Select a tile that has an animal fight hazard. Roll a DC 15 Flat Check. On a success, that animal is tamed and is considered cleared. You may spend as many KW as you would like as part of this action to lower the flat check DC by the amount you spent.</p>"
      }
    ]
  },
  {
    id: "magister",
    name: "The Magister",
    portrait: "https://hearthstone.wiki.gg/images/thumb/Archmage_Vargoth_full.jpg/800px-Archmage_Vargoth_full.jpg?ac31b8",
    remote: true,
    tags: ["Researching", "Scrying and divining the future", "Warding the Kingdom"],
    note: "",
    abilities: [
      {
        title: "Research",
        costs: [1, 2, 3],
        description:
          "<p>You may spend up to three actions as part of this action. Gain that many research points to use on the research tree.</p>"
      },
      {
        title: "Scry",
        costs: [2],
        reminderMessage: "Cast Augury for free as a 2nd-level spell — no 30-minute restriction, but the question must be reasonable to divine.",
        description:
          "<p>You cast <strong>Augury</strong> for free as a second level spell. The 30 minute restriction is removed, but the event must be reasonable to divine.</p>"
      },
      {
        title: "Ward",
        costs: [1],
        interactionType: "post-effect",
        playerEffect: {
          name: "Ward (Shield + False Vitality)",
          description: "<p>Begin the combat with the <strong>Shield</strong> spell and <strong>False Vitality</strong> (heightened to half the party's level, rounded up, minimum 2nd) already active.</p>",
          duration: { value: 1, unit: "encounter" }
        },
        description:
          "<p>If you would have a combat event this Kingdom turn, everyone begins with the <strong>Shield</strong> spell and <strong>False Vitality</strong> (heightened to half the party's level rounded up to a minimum of 2nd) spell active.</p>"
      }
    ]
  },
  {
    id: "architect",
    name: "The Architect",
    portrait: "https://hearthstone.wiki.gg/images/thumb/Safety_Inspector_full.jpg/800px-Safety_Inspector_full.jpg?5fd97c",
    remote: true,
    tags: ["Special modifications to districts", "Building upgrades", "Moving districts"],
    note: "",
    abilities: [
      {
        title: "Special Modifications",
        costs: [2],
        interactionType: "apply-transformation",
        reminderMessage: "Pick a district that has an unlocked transformation available. Pay that transformation's own KW cost — separate from the district's original build cost — and it completes over that transformation's own turn timer, the same way building a new district does.",
        description:
          "<p>Choose a claimed tile with a district on it that has an available transformation (unlocked via research, configured under Kingdom Configuration &rarr; Transformations). Pay that transformation's KW cost. Over the following kingdom turn(s), the district is rebuilt into its transformed version — same footprint, same base role, different tile and effects.</p>"
      },
      {
        title: "Upgrade a Building",
        costs: [2],
        interactionType: "upgrade-building",
        description:
          "<p>Select a tile that can be levelled up. Pay cost equal to the cost of building that tile at its lowest level. The tile levels up.</p>"
      },
      {
        title: "Move a District",
        costs: [1],
        interactionType: "move-district",
        reminderMessage: "Simplified from the rulebook: this moves both districts immediately rather than after a full kingdom turn's delay.",
        description:
          "<p>Select two districts you have built. Pay KW equal to the lowest of the two's build costs. The districts are moved in 1 kingdom turn.</p>"
      }
    ]
  },
  {
    id: "quartermaster",
    name: "The Quartermaster",
    portrait: "https://hearthstone.wiki.gg/images/Grimestreet_Outfitter_full.jpg",
    remote: true,
    tags: ["Sourcing weaponry", "Upgrading your gear", "Diverting resources to wartime efforts"],
    note: "",
    abilities: [
      {
        title: "Improve Gear",
        costs: [3],
        reminderMessage: "Pick a player + a foundational/property rune at or below their level. KW cost = rune level \u00d7 tier (see Tier Levels).",
        description:
          "<p>Select one player. Select a <em>foundational or property rune</em>, that is your level or below, to slot into one item that player owns. You must spend KW equal to that rune's level, multiplied by the tier as shown in <strong>Tier Levels</strong>. You do not need to pay the cost of slotting runes into armour through this method.</p>"
      },
      {
        title: "Acquire Weaponry",
        costs: [2],
        reminderMessage: "1 KW per 100gp of the weapon. No more than two levels above the buyer\u0027s own level.",
        description:
          "<p>Each player may select a weapon to purchase using KW. The cost to acquire a weapon is 1 KW per 100gp of the item. Each player may only select a weapon that is no more than two levels above their own.</p>"
      },
      {
        title: "Wartime Efforts",
        costs: [1],
        interactionType: "wartime-efforts",
        description:
          "<p>You spur your factions into war. Select a faction. It loses 1 Happiness, to a happiness minimum of -3, but that faction immediately produces +2 KW. If you are not currently at war, faction happiness loss is increased to -2 through this action. A faction at -3 happiness produces 0 KW.</p>"
      }
    ]
  }
];

export const DEFAULT_EVENTS = [
  {
    id: "scientific-invention",
    title: "Scientific Invention",
    art: "modules/pf2e-revamped-kingdoms/images/cataclysm.jpg",
    tintColor: "#16241a",
    conditions: [],
    category: "Discovery",
    type: "single",
    body:
      "<p>The <strong>Settlers</strong> have accidentally invented an <strong>Arcane Golem,</strong> with the aim of bolstering city defences. However, the Golem has gone rampant! The Settlers cannot contain it! You must stop the Golem before it destroys more of the city.</p><p>Will you choose to destroy it and prevent further ruin, or subdue it and potentially gain a valuable defence asset?</p>",
    outcomes: [
      { label: "SUCCESS", text: "+1 Settler Happiness, Arcane Golem unit (if subdued)" },
      { label: "FAILURE", text: "-1 Settler Happiness, -3 KW." }
    ],
    pages: [],
    stages: []
  }
];

/* An event's "type" controls how it's delivered in the Event tab:
     - single: one screen, resolved and forgotten (existing behavior).
     - multiscreen: a slideshow of pages the GM clicks through in one
       sitting, outcomes shown on the last page.
     - questline: an ongoing arc. Progress (which stage it's on) is
       tracked per-event and persists across kingdom turns — picking the
       same questline event again later resumes where it left off,
       rather than restarting. Advanced one stage at a time via its own
       button, no going back. */
export const EVENT_TYPES = [
  { id: "single", label: "Single Screen" },
  { id: "multiscreen", label: "Multi-Screen (Slideshow)" },
  { id: "questline", label: "Quest Line (persists across turns)" }
];

/* Fixed vocabulary of tags an event can be flagged with, matched against
   live game state when the GM asks for a random pick. An event with no
   tags (or only "always") is eligible regardless of state. Matching is
   OR across an event's own tags — one hit is enough. */
export const EVENT_CONDITIONS = [
  { id: "always", label: "Always eligible" },
  { id: "kw-negative", label: "KW is negative" },
  { id: "kw-low", label: "KW is below 5" },
  { id: "kw-high", label: "KW is 20 or more" },
  { id: "happiness-negative", label: "Any faction happiness is negative" },
  { id: "happiness-very-negative", label: "Any faction happiness is -2 or lower" },
  { id: "happiness-high", label: "Any faction happiness is +2 or higher" },
  { id: "at-war", label: "Kingdom is at war" }
];

/* Universal actions — available to every domain, shown only in the
   action-selection pool, never on the Decide cards themselves. */
export const DEFAULT_UNIVERSAL_ACTIONS = [
  {
    title: "Build a District",
    costs: [2],
    description:
      "<p>Select a district and a claimed tile that does not have a district on it. Pay KW equal to the building cost. It finishes in the designated amount of kingdom turns. Timers for kingdom turns tick down at the beginning of turns.</p>"
  },
  {
    title: "Destroy a District",
    costs: [1],
    reminderMessage: "Refund half the district\u0027s KW cost, then reduce its associated faction\u0027s happiness by 1 (minimum 0).",
    description:
      "<p>Select a district. Gain half of its district KW cost. That district is <em>immediately</em> destroyed. The faction primarily associated with that district is reduced by 1 happiness to a minimum of 0.</p>"
  },
  {
    title: "Claim a Hex",
    costs: [1],
    reminderMessage: "Cost escalates +1 KW every 3rd claim (handled automatically by the macro). If the hex belongs to another kingdom, that allyship ends and a negative event is due this round.",
    description:
      "<p>Select a hex that is adjacent to a hex you own. Pay 1 KW. The hex is considered claimed and you may build districts upon it. If there are any hazards on that tile, you are forced to deal with them when this action resolves. Every three times you use this action, the base cost increases by 1 KW. If you claim a hex that is currently owned by another kingdom, your allyship with that kingdom ceases, and a negative event involving that ally is set for this round.</p>"
  },
  {
    title: "Expedite Labour",
    costs: [2],
    interactionType: "expedite-labour",
    description:
      "<p>Select a district under construction. Pay 2 KW and reduce the time remaining to build that district by one turn, to a minimum of <em>immediate completion</em>.</p>"
  },
  {
    title: "Host a Festival",
    costs: [2],
    reminderMessage: "Pick two factions and raise each +1 happiness (max 3). This festival\u0027s cost was 5 KW \u2014 remember to increase the cost for next time.",
    description:
      "<p>You host a festival for your kingdom. Pay 5 KW. If an event wasn't already set for this Kingdom Turn, it is instead set to the Festival event. In addition to the event, you may immediately increase two factions' happiness by +1, to a maximum of 3. High expectations ride each following festival, and as such future costs of Hosting a Festival increase by 1.</p>"
  },
  {
    title: "Address the Populace",
    costs: [2],
    interactionType: "address-populace",
    description:
      "<p class=\"faction-card__note\"><em>Traits: Bribe</em></p><p>You address a faction who is currently hostile with you. Any negative effects imposed by that faction are suppressed for this turn. You may optionally bribe the faction and pay 3 KW to reset their happiness to zero. Future actions with the bribe trait cost 1 more KW.</p>"
  },
  {
    title: "Level Up a Store",
    costs: [1],
    interactionType: "level-up-store",
    reminderMessage: "Only usable if you've built a store, and only if that store isn't still recovering from its last level-up (2 kingdom turns).",
    description:
      "<p>Level up a store you've built. That store becomes unavailable this kingdom turn and the next. Costs 3 KW. A store's level adds directly to the item level your party can buy there (party level + store level).</p>"
  }
];

/* The 3 factions tracked by the reputation panel. */
export const DEFAULT_FACTIONS = [
  {
    id: "settlers",
    name: "The Settlers",
    portrait: "",
    happiness: 0,
    present: false,
    effectHigh: "Productivity surges. +1 KW every turn.",
    effectLow: "Lose any KW gained from Settlers this turn. Produces 0 KW next turn."
  },
  {
    id: "woodsmen",
    name: "The Woodsmen",
    portrait: "",
    happiness: 0,
    present: false,
    effectHigh: "First road each turn costs 1 less KW, and build one each turn as a free action.",
    effectLow: "May not claim hexes this turn. Districts take +1 action and +1 KW."
  },
  {
    id: "merchants",
    name: "The Merchants",
    portrait: "",
    happiness: 0,
    present: false,
    effectHigh: "All shops receive a 10% discount (stacks).",
    effectLow: "All actions from Quartermaster negated. Shop costs increased by 10%."
  }
];

export const DEFAULT_KINGDOM_STATE = { kw: 2, kwDelta: 1 };

export const TAX_LEVELS = {
  relief: { label: "Relief", kw: -2, happiness: 1 },
  standard: { label: "Standard", kw: 1, happiness: -1 },
  aggressive: { label: "Aggressive", kw: 2, happiness: -2 }
};

export const DEFAULT_FACTION_TAXES = {};

export const DEFAULT_RESEARCH_REGIONS = [];

export const DEFAULT_RESEARCH_NODES = [];

export const DEFAULT_RESEARCH_POINTS = 0;

/* Transformations — GM-defined recipes that let a placed district of one
 * building type (fromBuildingId) be converted in-place into another
 * (toBuildingId), gated behind research the same way locked buildings
 * already are (see isTransformationResearchUnlocked below, and
 * grantsTransformationId on research nodes). `icon` is deliberately
 * optional and left blank by default: the UI that lists transformations
 * falls back to the FROM building's own tileImage/icon when blank, and
 * only uses this field when the GM explicitly wants the transformed
 * result to look different in pickers before it's actually built. Cost
 * and turnTimeout are separate from both buildings' own cost/buildTime —
 * transforming an existing district is its own action with its own
 * price and timer, not a re-run of the original construction. */
export const DEFAULT_TRANSFORMATIONS = [];

export const DEFAULT_RESOLVE_STATE = { entries: [], locked: false, resolving: false, step: 0 };

export const DEFAULT_KINGDOM_NAME = "Kingdom of Stolen Lands";

/* Buildings — transcribed from your ruleset doc. `tileImage` is my best
   match against your 2-Minute Tabletop asset names/thumbnails; swap any
   of these in the Buildings tab of the Config app if a different tile
   reads better. `kwPerTurn` is a generic passive-income number the
   kingdom's +KW total adds up automatically from built structures — the
   more bespoke conditional rules (adjacency, happiness gates, event-trait
   triggers) stay as GM-adjudicated text in `effect` for now. */
export const DEFAULT_BUILDINGS = [
  {
    id: "road",
    name: "Road",
    category: "General",
    traits: ["Exploration"],
    cost: 1,
    buildTime: 0,
    prerequisitesText: "",
    requiresFactionId: null,
    invitesFactionId: null,
    kwPerTurn: 0,
    placementMode: "single",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: [],
    tileImage: "",
    effect: "<p>Travel onto a road tile does not cost a hexploration action.</p>"
  },
  {
    id: "menagerie",
    name: "Menagerie",
    category: "General",
    traits: ["Animals", "Woodsmen"],
    cost: 2,
    buildTime: 2,
    prerequisitesText: "Woodsmen Faction, Woodsmen at +1 Happiness or higher",
    requiresFactionId: "woodsmen",
    invitesFactionId: null,
    kwPerTurn: 0,
    placementMode: "single",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["happiness-threshold", "consumes-action"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - Farmland Fence (lush).png",
    effect:
      "<p>The Menagerie allow you to adopt a pet. You may spend a kingdom turn action to gain the Pet general feat for free until the next kingdom turn - but only if the Woodsmen faction are at +1 happiness or higher. The Woodsmen must be at +1 Happiness to build this tile, and to use the aforementioned action.</p>"
  },
  {
    id: "bulwark-forges",
    name: "The Bulwark Forges",
    category: "General",
    traits: ["Equipment", "Merchants"],
    cost: 2,
    buildTime: 2,
    prerequisitesText: "Merchants Faction, Merchants at +1 Happiness or higher",
    requiresFactionId: "merchants",
    invitesFactionId: null,
    kwPerTurn: 0,
    placementMode: "scatter",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["happiness-threshold", "consumes-action"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - City Building 4 (blue).png",
    effect:
      "<p>Merchants provide you with powerful enhancements to your armour that leave you feeling ready to take on the world. You may spend an action to enhance your armour, giving you temporary hitpoints equal to your level for the first combat encounter of the month. The Merchants faction must be at +1 Happiness to build this tile, and to use the aforementioned action.</p>"
  },
  {
    id: "training-grounds",
    name: "The Training Grounds",
    category: "General",
    traits: ["Combat", "Settlers"],
    cost: 2,
    buildTime: 2,
    prerequisitesText: "Settlers Faction, Settlers at +1 Happiness or higher",
    requiresFactionId: "settlers",
    invitesFactionId: null,
    kwPerTurn: 0,
    placementMode: "single",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["happiness-threshold", "consumes-action"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - City with Wall (red).png",
    effect:
      "<p>Some of the settlers specialise in combat, and offer you training. You may spend an action to train with the settlers, giving you a +2 circumstance bonus to initiative, if you roll with Perception, for the first combat of the month. The Settlers faction must be at +1 Happiness to build this tile, and to use the aforementioned action.</p>"
  },
  {
    id: "decoration",
    name: "Decoration",
    category: "General",
    traits: ["Combat", "Settlers"],
    cost: 1,
    buildTime: 1,
    prerequisitesText: "",
    requiresFactionId: null,
    invitesFactionId: null,
    kwPerTurn: 0,
    placementMode: "single",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["adjacency-bonus"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - City Statue.png",
    effect:
      "<p>You build a decoration, such as a fountain, a park, a flower garden etc. You may choose what the decoration is. An adjacent faction to this decoration gets +1 happiness to a maximum of +1. Each faction may only receive this benefit once per kingdom turn.</p>"
  },
  {
    id: "housing-district",
    name: "Housing District",
    category: "Settlers",
    traits: ["Housing", "Settlers"],
    cost: 5,
    buildTime: 1,
    prerequisitesText: "",
    requiresFactionId: null,
    invitesFactionId: "settlers",
    kwPerTurn: 1,
    escalationPerCopy: 1,
    researchLocked: false,
    placementMode: "scatter",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["adjacency-bonus", "happiness-threshold", "escalating-cost"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - Town Building 1 (red).png",
    effect:
      "<p>+1 KW at the start of each kingdom turn. If this tile is adjacent to a tile with the Job trait, this instead increases to +2 KW. If the Settlers are at -3 Happiness, this reduces to 0 KW unless an action is spent to Quell. This stacks with other housing districts. Future housing districts cost 1 more KW.</p><p>This district invites the <strong>Settlers faction</strong> into your Kingdom if this is the first housing district you have built.</p>"
  },
  {
    id: "agrarian-steadings",
    name: "Agrarian Steadings",
    category: "Settlers",
    traits: ["Food", "Settlers"],
    cost: 3,
    buildTime: 1,
    prerequisitesText: "The Settlers Faction",
    requiresFactionId: "settlers",
    invitesFactionId: null,
    kwPerTurn: 0,
    placementMode: "single",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["event-trait-trigger"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - Farmhouse (lush).png",
    effect:
      "<p>This tile prevents 1 KW of loss to an event with the Food, Winter, or Harvest trait. This stacks with other Agrarian Steadings.</p>"
  },
  {
    id: "parish",
    name: "Parish",
    category: "Settlers",
    traits: ["Religion", "Settlers"],
    cost: 3,
    buildTime: 1,
    prerequisitesText: "The Settlers Faction, must be built next to a housing district",
    requiresFactionId: "settlers",
    invitesFactionId: null,
    kwPerTurn: 0,
    placementMode: "single",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["adjacency-requirement", "event-trait-trigger"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - Monastery (red).png",
    effect:
      "<p>This prevents losing happiness with the <strong>Settlers faction</strong> the first time you levy taxes from the Settlers each kingdom turn. This tile does not stack with other Parishes.</p>"
  },
  {
    id: "wood-mills",
    name: "The Wood Mills",
    category: "Woodsmen",
    traits: ["Woodsmen", "Job"],
    cost: 7,
    buildTime: 2,
    prerequisitesText: "Settlers Faction",
    requiresFactionId: "settlers",
    invitesFactionId: "woodsmen",
    kwPerTurn: 2,
    escalationPerCopy: 2,
    researchLocked: false,
    placementMode: "single",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["adjacency-bonus", "prerequisite-for-others", "escalating-cost"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - Windmill (red).png",
    effect:
      "<p>Provides processed lumber to your kingdom. Is a prerequisite for some buildings. This provides +2 KW at the start of your turn, if it is adjacent to at least one unclaimed hex.</p><p>This district invites the <strong>Woodsmen faction</strong> into your Kingdom.</p><p><em>Future Wood Mills cost 2 more KW each.</em></p>"
  },
  {
    id: "ranger-waystations",
    name: "Ranger Waystations",
    category: "Woodsmen",
    traits: ["Exploration", "Woodsmen", "Job"],
    cost: 5,
    buildTime: 2,
    prerequisitesText: "Woodsmen Faction",
    requiresFactionId: "woodsmen",
    invitesFactionId: null,
    kwPerTurn: 0,
    placementMode: "single",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["adjacency-bonus", "action-cost-modifier"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - Tower (red).png",
    effect:
      "<p>The Woodsmen actively scout and patrol the lands. The first time you <em>Claim a Tile</em> each Kingdom Turn that is adjacent to this tile, it becomes a free action and costs 0 KW.</p>"
  },
  {
    id: "butchers",
    name: "The Butchers",
    category: "Woodsmen",
    traits: ["Animal", "Woodsmen", "Job"],
    cost: 7,
    buildTime: 2,
    prerequisitesText: "Woodsmen Faction",
    requiresFactionId: "woodsmen",
    invitesFactionId: null,
    kwPerTurn: 0,
    placementMode: "scatter",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["event-trait-trigger"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - City Building 1 (red).png",
    effect:
      "<p>Animal attacks, while devastating, result in more food for your kingdom. Whenever an event with the traits Animal and Attack is resolved, immediately gain +2 KW. This stacks with other Butcher tiles.</p>"
  },
  {
    id: "build-a-store",
    name: "Build A Store",
    category: "Merchants",
    traits: ["Economy", "Merchants", "Job"],
    cost: 7,
    buildTime: 1,
    prerequisitesText: "",
    requiresFactionId: null,
    invitesFactionId: "merchants",
    kwPerTurn: 0,
    placementMode: "scatter",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["sub-shops", "consumes-action"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - City Building 2 (blue).png",
    effect:
      "<p>You may build from one of the following stores. These are leveled and begin at level 0. You may purchase items equal to your party level or lower plus the level of store of the respective type. (<em>Eg. You are level 4, the shop is Level 2, you may purchase level 6 items.</em>). Building a store grants you the <strong>Level Up</strong> general action.</p><p>If this is the first time you are building any store, you invite the <strong>Merchants faction</strong> into your kingdom.</p><p><em>Level Up:</em> 1 action. Level up a store. That store becomes unavailable for this kingdom turn, and the next kingdom turn and costs 3 KW.</p><ul><li><strong>Oleg's General Store</strong> - Sells general goods, adventuring gear, potions, and trinkets such as rings.</li><li><strong>Bokken's Bonanza</strong> - Sells scrolls, staves, staffs, anything to do with magic.</li><li><strong>Aldorei's Armaments</strong> - Sells weapons, armour, everything to do with combat.</li></ul>"
  },
  {
    id: "trade-depot-network",
    name: "Trade Depot Network",
    category: "Merchants",
    traits: ["Economy", "Merchants", "Job"],
    cost: 3,
    buildTime: 1,
    prerequisitesText: "",
    requiresFactionId: null,
    invitesFactionId: null,
    kwPerTurn: 0,
    placementMode: "single",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["consumes-action"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - Jetty (ship).png",
    effect:
      "<p>Once per turn, you may spend 1 general action to convert two non-consumable magic items to KW as below. Items are converted at a rate of 1 KW per every 5 levels of the items.</p><table><thead><tr><th>Levels of the Items</th><th>KW</th></tr></thead><tbody><tr><td>1-5</td><td>1</td></tr><tr><td>6-10</td><td>2</td></tr><tr><td>11-15</td><td>3</td></tr><tr><td>16-20</td><td>4</td></tr></tbody></table>"
  },
  {
    id: "bank",
    name: "Bank",
    category: "Merchants",
    traits: ["Economy", "Merchants", "Job"],
    cost: 10,
    buildTime: 1,
    prerequisitesText: "",
    requiresFactionId: null,
    invitesFactionId: null,
    kwPerTurn: 0,
    storageCapacity: 10,
    storageBonusKw: 1,
    researchLocked: false,
    placementMode: "scatter",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["storage"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - City Building 6 (blue).png",
    effect:
      "<p>You may store up to 10 KW on this tile. You may withdraw or deposit any time as a free action during the Decide stage. During the Resolve stage - if this has 10 KW on it, your kingdom gains +1 KW.</p>"
  },
  {
    id: "milestone-obelisk",
    name: "Milestone Obelisk",
    category: "Tier 2",
    traits: ["Mythical"],
    cost: 20,
    buildTime: 2,
    prerequisitesText: "Settlers faction, Woodsmen faction, Merchant faction",
    requiresFactionId: null,
    invitesFactionId: null,
    kwPerTurn: 0,
    grantsBonusActionSlot: true,
    researchLocked: false,
    placementMode: "single",
    offsetX: 0,
    offsetY: 0,
    scale: null,
    flags: ["permanent-bonus", "triggers-event"],
    tileImage: "modules/pf2e-revamped-kingdoms/images/buildings/Buildings - Tower (blue).png",
    effect:
      "<p>This mythical obelisk defines a new era. All players gain +1 kingdom action permanently. The next event is set to a wave defense of this obelisk as it attracts unwanted attention from mystical powers.</p><p><em>The extra action slot is granted automatically once construction completes. The follow-up event is still a manual GM call — pick or write one and feature it next turn.</em></p>"
  }
];

/* Recognized "not simple yet" flags. Anything a building does beyond a
   flat kwPerTurn/kwEffect/happinessEffect gets tagged with one or more
   of these instead of being silently unimplemented — a future pass can
   search for a flag and wire in the actual behavior without having to
   re-read every building's prose description first. */
export const BUILDING_FLAG_LABELS = {
  "adjacency-bonus": "Bonus depends on adjacent tiles",
  "adjacency-requirement": "Must be built adjacent to something specific",
  "happiness-threshold": "Effect gated on a faction's happiness",
  "event-trait-trigger": "Triggers off a specific event trait",
  "escalating-cost": "Cost increases with repeated builds",
  "prerequisite-for-others": "Other buildings may require this one",
  "action-cost-modifier": "Changes the cost of another action",
  "sub-shops": "Has its own internal sub-system (leveled shops)",
  "consumes-action": "Grants its own dedicated action",
  "storage": "Stores a resource on the tile itself",
  "permanent-bonus": "Grants an ongoing effect outside KW/happiness",
  "triggers-event": "Forces a specific future event"
};

export function registerSettings() {
  game.settings.register(MODULE_ID, "domains", {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_DOMAINS
  });

  game.settings.register(MODULE_ID, "events", {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_EVENTS
  });

  game.settings.register(MODULE_ID, "universalActions", {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_UNIVERSAL_ACTIONS
  });

  game.settings.register(MODULE_ID, "factions", {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_FACTIONS
  });

  game.settings.register(MODULE_ID, "kingdomState", {
    scope: "world",
    config: false,
    type: Object,
    default: DEFAULT_KINGDOM_STATE
  });

  game.settings.register(MODULE_ID, "resolveState", {
    scope: "world",
    config: false,
    type: Object,
    default: DEFAULT_RESOLVE_STATE
  });

  game.settings.register(MODULE_ID, "kingdomName", {
    scope: "world",
    config: false,
    type: String,
    default: DEFAULT_KINGDOM_NAME
  });

  game.settings.register(MODULE_ID, "buildings", {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_BUILDINGS
  });

  game.settings.register(MODULE_ID, "claimedHexes", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, "placedBuildings", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, "ignoreGmKwCosts", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "factionTaxes", {
    scope: "world",
    config: false,
    type: Object,
    default: DEFAULT_FACTION_TAXES
  });

  game.settings.register(MODULE_ID, "atWar", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "festivalCost", {
    scope: "world",
    config: false,
    type: Number,
    default: 5
  });

  game.settings.register(MODULE_ID, "reconnoiteredHexes", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE_ID, "activeEventId", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "activeEventPage", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(MODULE_ID, "bonusActionSlots", {
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(MODULE_ID, "questlineProgress", {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  // Real "module settings" (config: true) — appear under Configure
  // Settings, as asked, rather than tucked inside the Config app.
  game.settings.register(MODULE_ID, "scatterCountMin", {
    name: "Scatter Buildings: Minimum Count",
    hint: "Lowest number of small copies placed for a scatter-mode building.",
    scope: "world",
    config: true,
    type: Number,
    default: 3
  });

  game.settings.register(MODULE_ID, "scatterCountMax", {
    name: "Scatter Buildings: Maximum Count",
    hint: "Highest number of small copies placed for a scatter-mode building.",
    scope: "world",
    config: true,
    type: Number,
    default: 5
  });

  game.settings.register(MODULE_ID, "scatterScale", {
    name: "Scatter Buildings: Scale",
    hint: "Size of each scattered copy, as a fraction of the hex size (e.g. 0.22 = 22%).",
    scope: "world",
    config: true,
    type: Number,
    default: 0.22
  });

  game.settings.register(MODULE_ID, "singleBuildingScale", {
    name: "Single-Placement Buildings: Default Scale",
    hint: "Default size for a single-placement building, as a fraction of the hex size. Individual buildings can override this in the Buildings tab of Kingdom Configuration.",
    scope: "world",
    config: true,
    type: Number,
    default: 1
  });

  game.settings.register(MODULE_ID, "researchNodes", {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_RESEARCH_NODES
  });

  game.settings.register(MODULE_ID, "researchRegions", {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_RESEARCH_REGIONS
  });

  game.settings.register(MODULE_ID, "researchPoints", {
    scope: "world",
    config: false,
    type: Number,
    default: DEFAULT_RESEARCH_POINTS
  });

  game.settings.register(MODULE_ID, "transformations", {
    scope: "world",
    config: false,
    type: Array,
    default: DEFAULT_TRANSFORMATIONS
  });

  // Client-scoped (not "world"): where YOU last left the research tree
  // view (pan/zoom). Deliberately personal, not shared/broadcast — the
  // GM panning around to edit nodes shouldn't yank every connected
  // player's own camera position around too, the way a world-scoped
  // setting would.
  game.settings.register(MODULE_ID, "researchViewState", {
    scope: "client",
    config: false,
    type: Object,
    default: null
  });

  // Per-person memory of the map tooltip on/off toggle, so it doesn't
  // switch itself back on every time someone reloads.
  game.settings.register(MODULE_ID, "tooltipsEnabled", {
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });
}

export function getDomains() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "domains"));
}

export function getEvents() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "events"));
}

export async function setDomains(domains) {
  await game.settings.set(MODULE_ID, "domains", domains);
}

export async function setEvents(events) {
  await game.settings.set(MODULE_ID, "events", events);
}

export function getUniversalActions() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "universalActions"));
}

export async function setUniversalActions(actions) {
  await game.settings.set(MODULE_ID, "universalActions", actions);
}

export function getFactions() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "factions"));
}

export async function setFactions(factions) {
  await game.settings.set(MODULE_ID, "factions", factions);
}

export function getKingdomState() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "kingdomState"));
}

export async function setKingdomState(state) {
  await game.settings.set(MODULE_ID, "kingdomState", state);
}

export function getResolveState() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "resolveState"));
}

export async function setResolveState(state) {
  await game.settings.set(MODULE_ID, "resolveState", state);
}

export function getKingdomName() {
  return game.settings.get(MODULE_ID, "kingdomName");
}

export async function setKingdomName(name) {
  await game.settings.set(MODULE_ID, "kingdomName", name);
}

export function getBuildings() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "buildings"));
}

export async function setBuildings(buildings) {
  await game.settings.set(MODULE_ID, "buildings", buildings);
}

export function getClaimedHexes() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "claimedHexes"));
}

export async function setClaimedHexes(hexes) {
  await game.settings.set(MODULE_ID, "claimedHexes", hexes);
}

export function getPlacedBuildings() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "placedBuildings"));
}

export async function setPlacedBuildings(placed) {
  await game.settings.set(MODULE_ID, "placedBuildings", placed);
}

export function getIgnoreGmKwCosts() {
  return game.settings.get(MODULE_ID, "ignoreGmKwCosts");
}

export async function setIgnoreGmKwCosts(value) {
  await game.settings.set(MODULE_ID, "ignoreGmKwCosts", value);
}

export function getFactionTaxes() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "factionTaxes"));
}

export async function setFactionTaxes(taxes) {
  await game.settings.set(MODULE_ID, "factionTaxes", taxes);
}

export function getAtWar() {
  return game.settings.get(MODULE_ID, "atWar");
}

export async function setAtWar(value) {
  await game.settings.set(MODULE_ID, "atWar", value);
}

export function getFestivalCost() {
  return game.settings.get(MODULE_ID, "festivalCost");
}

export async function setFestivalCost(value) {
  await game.settings.set(MODULE_ID, "festivalCost", value);
}

export function getReconnoiteredHexes() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "reconnoiteredHexes"));
}

export async function setReconnoiteredHexes(hexes) {
  await game.settings.set(MODULE_ID, "reconnoiteredHexes", hexes);
}

export function getActiveEventId() {
  return game.settings.get(MODULE_ID, "activeEventId") || null;
}

export async function setActiveEventId(id) {
  await game.settings.set(MODULE_ID, "activeEventId", id ?? "");
}

export function getActiveEventPage() {
  return game.settings.get(MODULE_ID, "activeEventPage") ?? 0;
}

export async function setActiveEventPage(page) {
  await game.settings.set(MODULE_ID, "activeEventPage", Math.max(0, page ?? 0));
}

/** Milestone Obelisk (and anything else tagged grantsBonusActionSlot)
 *  increments this permanently once its construction completes — see
 *  Finish Turn in kingdom.js. Total action slots per turn = 3 + this. */
export function getBonusActionSlots() {
  return game.settings.get(MODULE_ID, "bonusActionSlots") ?? 0;
}

export async function setBonusActionSlots(count) {
  await game.settings.set(MODULE_ID, "bonusActionSlots", Math.max(0, count ?? 0));
}

export function getQuestlineProgress() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "questlineProgress"));
}

export async function setQuestlineProgress(progress) {
  await game.settings.set(MODULE_ID, "questlineProgress", progress);
}

export function getScatterSettings() {
  return {
    min: game.settings.get(MODULE_ID, "scatterCountMin"),
    max: game.settings.get(MODULE_ID, "scatterCountMax"),
    scale: game.settings.get(MODULE_ID, "scatterScale")
  };
}

export function getDefaultSingleBuildingScale() {
  return game.settings.get(MODULE_ID, "singleBuildingScale");
}

export function getResearchNodes() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "researchNodes"));
}

export async function setResearchNodes(nodes) {
  await game.settings.set(MODULE_ID, "researchNodes", nodes);
}

/** A building tagged researchLocked is only actually available once some
 *  unlocked research node names it via grantsBuildingId. Buildings with
 *  no lock (the default — every pre-existing building included) are
 *  always available, same as before this existed. */
export function isBuildingResearchUnlocked(buildingId) {
  return getResearchNodes().some((n) => n.unlocked && n.grantsBuildingId === buildingId);
}

/** Same gating pattern as isBuildingResearchUnlocked above, but for a
 *  whole Domain (leadership role) via grantsDomainId on a research
 *  node. A "job domain" created from the Research Tree's own quick-
 *  create flow is always researchLocked: true, the same reasoning
 *  buildings created that way already use — it only exists to be
 *  gated by whichever node created it. Domains with no lock (every
 *  pre-existing one, and any hand-authored in Kingdom Configuration
 *  with the box left unchecked) are always available, same as before
 *  this existed. */
export function isDomainResearchUnlocked(domainId) {
  return getResearchNodes().some((n) => n.unlocked && n.grantsDomainId === domainId);
}

export function getTransformations() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "transformations"));
}

export async function setTransformations(transformations) {
  await game.settings.set(MODULE_ID, "transformations", transformations);
}

/** Same gating pattern as isBuildingResearchUnlocked above, but for
 *  transformations via grantsTransformationId on a research node. A
 *  transformation with no lock (researchLocked left false/unset) is
 *  always available once its fromBuildingId exists on the map, same
 *  "no lock = always on" default buildings already use. */
export function isTransformationResearchUnlocked(transformationId) {
  return getResearchNodes().some((n) => n.unlocked && n.grantsTransformationId === transformationId);
}

export function getResearchRegions() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "researchRegions"));
}

export async function setResearchRegions(regions) {
  await game.settings.set(MODULE_ID, "researchRegions", regions);
}

export function getResearchPoints() {
  return game.settings.get(MODULE_ID, "researchPoints");
}

export async function setResearchPoints(points) {
  await game.settings.set(MODULE_ID, "researchPoints", points);
}

/** Client-scoped last-viewed pan/zoom for the research tree — see the
 *  "researchViewState" setting registration for why this is per-client
 *  rather than shared world state. Returns null if this client has
 *  never had a view saved yet (brand new, or cleared), which the app
 *  treats as "fall back to centering on the Start node." */
export function getResearchViewState() {
  return game.settings.get(MODULE_ID, "researchViewState");
}

export async function setResearchViewState(state) {
  await game.settings.set(MODULE_ID, "researchViewState", state);
}
