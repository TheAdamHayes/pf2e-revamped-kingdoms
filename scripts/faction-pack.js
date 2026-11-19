/* The Faction Pack: leaders, agendas, rivals, ladders and favours for the
 * three main factions, plus Oleg, the Sootscale kobolds and Restov, and a
 * set of events, petitions and story arcs that use them.
 *
 * It's only ever added when the GM asks for it, from Kingdom
 * Configuration. Each pack faction is matched to one of the world's own
 * factions (or added as new, or skipped), and only EMPTY fields are filled
 * in, so anything already written by hand stays exactly as it is. Events
 * are only added if an event with the same id isn't already there.
 *
 * In the data below, "@key" stands for a pack faction and "#key" for a
 * pack event. They're swapped for real ids when the pack is applied. */
import { getFactions, setFactions, getEvents, setEvents } from "./data.js";

const IMG = "modules/pf2e-revamped-kingdoms/images";

export const PACK_FACTIONS = [
  {
    key: "citizens",
    guess: ["citizen", "settler"],
    data: {
      name: "The Citizens",
      tier: "main",
      leaderName: "Ilse Varnholt",
      leaderTitle: "Mayor",
      leaderQuote: "I don't care whose name is on the charter. I care whether the roof leaks.",
      agenda: "A roof, a field and a safe night for every family.",
      rival: "@woodsmen",
      ladder: {
        "-3": "Unrest in the streets. You have one less kingdom action next turn.",
        "-2": "Housing Districts produce 1 less KW each, to a minimum of 0.",
        "-1": "Levying taxes from the Citizens gives 1 less KW.",
        1: "Hosting a Festival costs 1 less KW.",
        2: "Housing Districts produce +1 KW each.",
        3: "The Citizens form a militia. Once per kingdom turn, one combat is one tier easier."
      },
      favour: {
        title: "Barn Raising",
        costs: [1],
        description: "<p>The Citizens lend a hand. Select a Housing or Food district under construction. It finishes one kingdom turn sooner.</p>"
      },
      storyHigh: "#story-citizens-high",
      storyLow: "#story-citizens-low"
    }
  },
  {
    key: "stonemasons",
    guess: ["stonemason", "mason"],
    data: {
      name: "The Stonemasons",
      tier: "main",
      leaderName: "Dorrin Flintmar",
      leaderTitle: "Guildmaster",
      leaderQuote: "Wood rots. Stone doesn't. Pay us properly and your grandchildren will thank you.",
      agenda: "Build in stone, and build it to last.",
      rival: "@citizens",
      ladder: {
        "-3": "The guild is on strike. Construction timers don't go down this turn.",
        "-2": "You can't Upgrade a Building or Move a District.",
        "-1": "Every building costs 1 more KW.",
        1: "Upgrading a building costs 1 less KW.",
        2: "New districts finish one kingdom turn sooner, to a minimum of 1.",
        3: "Tier 2 buildings cost a quarter less KW, rounded down."
      },
      favour: {
        title: "Quarry Shift",
        costs: [1],
        description: "<p>The masons put in an extra shift. Select a district under construction. It finishes one kingdom turn sooner. This costs no KW.</p>"
      },
      storyHigh: "#story-stonemasons-high",
      storyLow: "#story-stonemasons-low"
    }
  },
  {
    key: "woodsmen",
    guess: ["woodsm", "woodsmen"],
    data: {
      name: "The Woodsmen",
      tier: "main",
      leaderName: "Hesta Barkwright",
      leaderTitle: "Warden of the Lodges",
      leaderQuote: "You can have your fields. Leave us the old wood and we'll keep the beasts off your doorstep.",
      agenda: "The forest stays standing.",
      rival: "@stonemasons",
      ladder: {
        "-3": "The Woodsmen stop helping. You can't Claim a Hex this turn.",
        "-2": "Wood Mills produce 0 KW.",
        "-1": "Roads cost 1 more KW.",
        1: "The first road you build each turn costs 0 KW.",
        2: "Wood Mills produce +1 KW each.",
        3: "Once per kingdom turn, the Warden's Tame succeeds automatically."
      },
      favour: {
        title: "Hunting Party",
        costs: [1],
        description: "<p>The Woodsmen go out hunting. Either gain 1 KW, or select an unclaimed hex adjacent to a claimed one and learn of any hazards on it.</p>"
      },
      storyHigh: "#story-woodsmen-high",
      storyLow: "#story-woodsmen-low"
    }
  },
  {
    key: "oleg",
    guess: ["oleg"],
    data: {
      name: "Oleg's Trading Post",
      tier: "minor",
      portrait: `${IMG}/buildings/Bazaar.webp`,
      leaderName: "Oleg Leveton",
      leaderTitle: "Runs the Trading Post with Svetlana",
      leaderQuote: "Svetlana says I'm too generous. She's usually right.",
      agenda: "Safe roads and paying customers.",
      ladder: {
        "-1": "Oleg's prices go up. Stores cost 10% more.",
        1: "Stores give a 10% discount, and the Trade Depot gives 1 extra KW each time you use it."
      },
      favour: {
        title: "Oleg's Contacts",
        costs: [1],
        description: "<p>Oleg calls in a favour from a trader on the road. Gain 2 KW.</p>"
      }
    }
  },
  {
    key: "kobolds",
    guess: ["sootscale", "kobold"],
    data: {
      name: "The Sootscale Kobolds",
      tier: "minor",
      portrait: `${IMG}/buildings/Town_Hall_Stone_Age.webp`,
      leaderName: "Mikmek",
      leaderTitle: "Chief of the Sootscales",
      leaderQuote: "Big folk dig slow. Sootscales dig fast. Sootscales dig cheap!",
      agenda: "Beat the Mugspits, and dig wherever they like.",
      rival: "@stonemasons",
      ladder: {
        "-1": "The kobolds help themselves. Lose 1 KW at the start of each kingdom turn.",
        1: "Kobold diggers. Building a district costs 1 less KW."
      },
      favour: {
        title: "Kobold Diggers",
        costs: [1],
        description: "<p>Mikmek sends his best diggers. Select a district under construction. It finishes one kingdom turn sooner. The Stonemasons won't like it.</p>"
      }
    }
  },
  {
    key: "restov",
    guess: ["restov", "jamandi", "aldori"],
    data: {
      name: "Restov",
      tier: "patron",
      portrait: `${IMG}/v19_98.png`,
      leaderName: "Jamandi Aldori",
      leaderTitle: "Swordlord of Restov",
      leaderQuote: "Restov paid for your charter. I'd like to see what we bought.",
      agenda: "A strong southern border, loyal to Restov.",
      ladder: {
        "-2": "Restov sends inspectors. Every building costs 1 more KW.",
        "-1": "Restov is watching. The trade agreement gives 1 less KW.",
        1: "Restov speaks well of you. Once per kingdom turn, Acquire Weaponry costs 1 less KW.",
        2: "Aldori swordlords train your people. The Training Grounds bonus to initiative increases to +3."
      },
      tradeKw: 2,
      tradeActive: false
    }
  }
];

const ev = (key, data) => ({ key, data: { tintColor: "#1b2e1f", conditions: [], outcomes: [], pages: [], stages: [], ...data } });
const fx = {
  happy: (faction, amount) => ({ type: "happiness", factionId: faction, amount }),
  kw: (amount) => ({ type: "kw", amount }),
  research: (amount) => ({ type: "research", amount }),
  remember: (text) => ({ type: "remember", text }),
  forget: (text) => ({ type: "forget", text }),
  join: (faction) => ({ type: "join", factionId: faction }),
  leave: (faction) => ({ type: "leave", factionId: faction }),
  petition: (event) => ({ type: "petition", eventId: event }),
  tradeOn: (faction) => ({ type: "tradeOn", factionId: faction }),
  tradeOff: (faction) => ({ type: "tradeOff", factionId: faction })
};

export const PACK_EVENTS = [
  ev("oak", {
    title: "The Old Mother Oak",
    category: "Factions",
    art: `${IMG}/buildings/Garden_Ruins.webp`,
    tintColor: "#1d2a17",
    type: "single",
    featuredFactionIds: ["@citizens", "@woodsmen"],
    factionConditions: [
      { factionId: "@citizens", op: "present" },
      { factionId: "@woodsmen", op: "present" }
    ],
    forbidsMemories: ["felled the Old Mother Oak", "spared the Old Mother Oak"],
    body:
      "<p>The <strong>Citizens</strong> want to clear the old grove north of the lodges for farmland. It's good soil, and there are families waiting for land.</p><p>The <strong>Woodsmen</strong> say the Old Mother Oak was standing before Brevoy had a name. Hesta has planted herself in front of it and isn't moving.</p><p>Will you clear the grove, spare it, or find the farmers somewhere else?</p>",
    choices: [
      {
        label: "Clear the grove",
        text: "The farmers get their land. The Woodsmen won't forget.",
        effects: [fx.happy("@citizens", 1), fx.happy("@woodsmen", -2), fx.kw(3), fx.remember("felled the Old Mother Oak")]
      },
      {
        label: "Spare the oak",
        text: "The grove stays. The farmers grumble.",
        effects: [fx.happy("@woodsmen", 1), fx.happy("@citizens", -1), fx.remember("spared the Old Mother Oak")]
      },
      {
        label: "Find them other land",
        text: "It costs you now, and the Citizens will hold you to it.",
        effects: [fx.kw(-2), fx.remember("spared the Old Mother Oak"), fx.petition("#petition-scrubland")]
      }
    ]
  }),
  ev("petition-scrubland", {
    queueOnly: true,
    title: "Clear the Northern Scrubland",
    category: "Petitions",
    art: `${IMG}/v10_34.jpg`,
    type: "petition",
    body: "<p>Mayor Varnholt wants the scrubland north of the river cleared, so the families who gave up the grove get their fields after all.</p><p>Claim a hex with no hazards on it, as far north as you can.</p>",
    petition: {
      factionId: "@citizens",
      turns: 2,
      success: [fx.happy("@citizens", 2)],
      failure: [fx.happy("@citizens", -2)]
    }
  }),
  ev("grove-remembers", {
    title: "The Grove Remembers",
    category: "Factions",
    art: `${IMG}/buildings/Garden_Ruins.webp`,
    tintColor: "#1d2a17",
    type: "single",
    featuredFactionIds: ["@woodsmen"],
    requiresMemories: ["felled the Old Mother Oak"],
    forbidsMemories: ["the grove made peace"],
    body: "<p>The field where the Old Mother Oak stood has never given a good harvest. The farmers say the ground is sour. The Woodsmen don't say anything, but they're smiling.</p>",
    choices: [
      {
        label: "Ask the Woodsmen for help",
        text: "Hesta knows what the ground wants. It isn't cheap.",
        effects: [fx.kw(-2), fx.happy("@woodsmen", 1), fx.remember("the grove made peace")]
      },
      {
        label: "Plough on",
        text: "Another poor harvest.",
        effects: [fx.happy("@citizens", -1)]
      }
    ]
  }),
  ev("quarry", {
    title: "The Quarry in the Greenbelt",
    category: "Factions",
    art: `${IMG}/buildings/Lumbermill.webp`,
    type: "single",
    featuredFactionIds: ["@stonemasons", "@woodsmen"],
    factionConditions: [
      { factionId: "@stonemasons", op: "present" },
      { factionId: "@woodsmen", op: "present" }
    ],
    forbidsMemories: ["opened the greenbelt quarry"],
    body: "<p>Dorrin's surveyors have found good granite under the hills east of the lodges. Getting it out means cutting a road straight through the Woodsmen's hunting grounds.</p><p>The guild is already sharpening its picks. The Woodsmen have pulled up the survey stakes twice.</p>",
    choices: [
      {
        label: "Open the quarry",
        text: "The guild gets its stone.",
        effects: [fx.happy("@stonemasons", 2), fx.happy("@woodsmen", -1), fx.remember("opened the greenbelt quarry")]
      },
      {
        label: "Leave the hills alone",
        text: "The Woodsmen keep their hunting grounds. Dorrin takes it personally.",
        effects: [fx.happy("@woodsmen", 1), fx.happy("@stonemasons", -1)]
      },
      {
        label: "Quarry it carefully",
        text: "Slower and dearer, but nobody storms out.",
        effects: [fx.kw(-3), fx.happy("@stonemasons", 1), fx.remember("opened the greenbelt quarry")]
      }
    ]
  }),
  ev("kobolds", {
    title: "Kobolds at the Gate",
    category: "Factions",
    art: `${IMG}/buildings/Town_Hall_Stone_Age.webp`,
    tintColor: "#2a2116",
    type: "single",
    featuredFactionIds: ["@kobolds"],
    factionConditions: [{ factionId: "@kobolds", op: "absent" }],
    forbidsMemories: ["met the Sootscales"],
    body: "<p>A party of kobolds turns up at the edge of your lands, waving a white rag on a stick. Their chief, <strong>Mikmek</strong> of the Sootscales, wants to talk.</p><p>The Sootscales are at war with the Mugspit tribe, and they're losing. Mikmek offers you diggers and tunnels in return for help.</p>",
    choices: [
      {
        label: "Welcome them",
        text: "The Stonemasons don't like the idea of cheap kobold labour.",
        effects: [fx.join("@kobolds"), fx.happy("@kobolds", 1), fx.happy("@stonemasons", -1), fx.remember("met the Sootscales")]
      },
      {
        label: "Send them away",
        text: "The Citizens sleep easier. Mikmek doesn't forget.",
        effects: [fx.happy("@citizens", 1), fx.remember("met the Sootscales"), fx.remember("turned away the Sootscales")]
      },
      {
        label: "Help, but keep them at arm's length",
        text: "Prove it first. Then they can move in.",
        effects: [fx.remember("met the Sootscales"), fx.petition("#petition-mugspit")]
      }
    ]
  }),
  ev("petition-mugspit", {
    queueOnly: true,
    title: "Trouble with the Mugspits",
    category: "Petitions",
    art: `${IMG}/buildings/Town_Hall_Stone_Age.webp`,
    type: "petition",
    body: "<p>Mikmek wants the Mugspit kobolds driven out of the old tunnels. Find the Mugspit warren and deal with them.</p>",
    petition: {
      factionId: "@kobolds",
      turns: 3,
      success: [fx.join("@kobolds"), fx.happy("@kobolds", 1), fx.kw(2)],
      failure: [fx.happy("@kobolds", -1), fx.remember("let the Sootscales down")]
    }
  }),
  ev("envoy", {
    title: "An Envoy from Restov",
    category: "Factions",
    art: `${IMG}/v10_34.jpg`,
    tintColor: "#2b1f14",
    type: "single",
    featuredFactionIds: ["@restov"],
    forbidsMemories: ["heard from Restov"],
    body: "<p>A rider in Aldori colours arrives with a sealed letter from <strong>Jamandi Aldori</strong>. Restov is pleased with your progress, mostly. She's offering a trade agreement, and it comes with expectations.</p>",
    choices: [
      {
        label: "Sign the agreement",
        text: "Restov's coin starts coming in. So do Restov's demands.",
        effects: [fx.join("@restov"), fx.tradeOn("@restov"), fx.remember("heard from Restov"), fx.petition("#petition-restov")]
      },
      {
        label: "Politely decline",
        text: "Jamandi isn't used to being told no.",
        effects: [fx.join("@restov"), fx.happy("@restov", -1), fx.remember("heard from Restov")]
      }
    ]
  }),
  ev("petition-restov", {
    queueOnly: true,
    title: "Restov's Expectations",
    category: "Petitions",
    art: `${IMG}/v10_34.jpg`,
    type: "petition",
    body: "<p>Jamandi expects your banner over four more hexes before her envoy comes back.</p><p>Claim four hexes.</p>",
    petition: {
      factionId: "@restov",
      turns: 4,
      success: [fx.happy("@restov", 1), fx.kw(3)],
      failure: [fx.happy("@restov", -1), fx.tradeOff("@restov")]
    }
  }),
  ev("petition-owlbear", {
    title: "The Owlbear in the North",
    category: "Petitions",
    art: `${IMG}/buildings/Hunters_Cabin.webp`,
    type: "petition",
    factionConditions: [{ factionId: "@woodsmen", op: "present" }],
    body: "<p>An owlbear has been killing deer near the northern lodges, and last week it went for a hunter. Hesta wants it dealt with before winter.</p><p>Find the owlbear and kill it or drive it off.</p>",
    petition: {
      factionId: "@woodsmen",
      turns: 3,
      success: [fx.happy("@woodsmen", 2)],
      failure: [fx.happy("@woodsmen", -1), fx.remember("left the owlbear be")]
    }
  }),
  ev("petition-monument", {
    title: "A Monument for the Square",
    category: "Petitions",
    art: `${IMG}/v10_34.jpg`,
    type: "petition",
    factionConditions: [{ factionId: "@stonemasons", op: "present" }],
    body: "<p>Dorrin wants something to show off what the guild can do. Something big, in the middle of town, with his name on a plaque somewhere.</p><p>Build a Decoration or Upgrade a Building.</p>",
    petition: {
      factionId: "@stonemasons",
      turns: 2,
      success: [fx.happy("@stonemasons", 2)],
      failure: [fx.happy("@stonemasons", -1)]
    }
  }),
  ev("petition-bandits", {
    title: "Bandits on the South Road",
    category: "Petitions",
    art: `${IMG}/buildings/Bazaar.webp`,
    type: "petition",
    factionConditions: [{ factionId: "@citizens", op: "present" }],
    body: "<p>Carts coming up from Oleg's are being stopped on the south road and the drivers robbed. The Citizens want it stopped, and so does Oleg.</p><p>Deal with the bandits.</p>",
    petition: {
      factionId: "@citizens",
      turns: 2,
      success: [fx.happy("@citizens", 1), fx.happy("@oleg", 1)],
      failure: [fx.happy("@citizens", -1), fx.happy("@oleg", -1)]
    }
  }),

  // Story arcs. Lined up automatically the first time a faction reaches
  // the top or bottom of its track; the GM decides when to run them.
  ev("story-citizens-high", {
    queueOnly: true,
    title: "The First Town Charter",
    category: "Faction Stories",
    art: `${IMG}/v10_34.jpg`,
    type: "questline",
    featuredFactionIds: ["@citizens"],
    stages: [
      { title: "", art: "", tintColor: "", body: "<p>The Citizens want a town charter of their own, with a council and a seal. Ilse wants you there when they sign it.</p>" },
      { title: "The Signing", art: "", tintColor: "", body: "<p>The charter is signed in the square and half the kingdom turns out to watch. The Citizens will remember who stood with them.</p>" }
    ],
    choices: [{ label: "Sign it with them", text: "", effects: [fx.kw(5), fx.remember("the town charter")] }]
  }),
  ev("story-citizens-low", {
    queueOnly: true,
    title: "Bread Riots",
    category: "Faction Stories",
    art: `${IMG}/v10_34.jpg`,
    tintColor: "#2a1414",
    type: "questline",
    featuredFactionIds: ["@citizens"],
    stages: [
      { title: "", art: "", tintColor: "", body: "<p>There's no bread in the market and the Citizens blame you. A crowd has gathered outside the hall, and someone has put a stone through the window.</p>" },
      { title: "The Morning After", art: "", tintColor: "", body: "<p>The crowd is still there in the morning, and it's bigger. You'll need to give them something.</p>" }
    ],
    choices: [
      { label: "Open the stores", text: "It empties the coffers, but it works.", effects: [fx.kw(-4), fx.happy("@citizens", 2)] },
      { label: "Send in the guards", text: "It works. Nobody will thank you for it.", effects: [fx.remember("broke up the bread riots")] }
    ]
  }),
  ev("story-stonemasons-high", {
    queueOnly: true,
    title: "The Masterwork",
    category: "Faction Stories",
    art: `${IMG}/v10_34.jpg`,
    type: "questline",
    featuredFactionIds: ["@stonemasons"],
    stages: [
      { title: "", art: "", tintColor: "", body: "<p>The guild wants to build something that will outlast all of you. Dorrin has drawings, and he's been carrying them around for a week.</p>" },
      { title: "Unveiled", art: "", tintColor: "", body: "<p>The work is done. People are coming from Restov just to look at it.</p>" }
    ],
    choices: [{ label: "Unveil it", text: "", effects: [fx.kw(4), fx.happy("@restov", 1), fx.remember("the guild's masterwork")] }]
  }),
  ev("story-stonemasons-low", {
    queueOnly: true,
    title: "The Guild Walks Out",
    category: "Faction Stories",
    art: `${IMG}/v10_34.jpg`,
    tintColor: "#241d18",
    type: "questline",
    featuredFactionIds: ["@stonemasons"],
    stages: [
      { title: "", art: "", tintColor: "", body: "<p>Nobody turns up at the building sites this morning. The tools are lying where they were dropped. The guild has walked out.</p>" },
      { title: "Dorrin Will Talk", art: "", tintColor: "", body: "<p>Dorrin will talk, but only to you, and only about money.</p>" }
    ],
    choices: [
      { label: "Pay them", text: "", effects: [fx.kw(-5), fx.happy("@stonemasons", 2)] },
      { label: "Wait them out", text: "The Citizens think the guild's been greedy anyway.", effects: [fx.happy("@citizens", 1), fx.remember("waited out the guild")] }
    ]
  }),
  ev("story-woodsmen-high", {
    queueOnly: true,
    title: "Keepers of the Greenbelt",
    category: "Faction Stories",
    art: `${IMG}/buildings/Hunters_Cabin.webp`,
    tintColor: "#1d2a17",
    type: "questline",
    featuredFactionIds: ["@woodsmen"],
    stages: [
      { title: "", art: "", tintColor: "", body: "<p>Hesta asks you to walk the old wood with her. She wants to show you something.</p>" },
      { title: "The Standing Stones", art: "", tintColor: "", body: "<p>Deep in the forest is a ring of standing stones the Woodsmen have looked after for generations. Hesta says they'll look after your borders the same way.</p>" }
    ],
    choices: [{ label: "Accept their oath", text: "", effects: [fx.kw(2), fx.research(2), fx.remember("the Woodsmen's oath")] }]
  }),
  ev("story-woodsmen-low", {
    queueOnly: true,
    title: "The Lodges Go Silent",
    category: "Faction Stories",
    art: `${IMG}/buildings/Hunters_Cabin.webp`,
    tintColor: "#1a1d17",
    type: "questline",
    featuredFactionIds: ["@woodsmen"],
    stages: [
      { title: "", art: "", tintColor: "", body: "<p>No game has come in from the woods all week. When you send someone out to the lodges, they're empty.</p>" },
      { title: "At the Edge of the Grove", art: "", tintColor: "", body: "<p>You find Hesta at the edge of the old grove. She'll bring her people back, but she wants something in return.</p>" }
    ],
    choices: [
      { label: "Give them the northern woods", text: "", effects: [fx.happy("@woodsmen", 2), fx.happy("@citizens", -1), fx.remember("gave the northern woods to the Woodsmen")] },
      { label: "Let them go", text: "", effects: [fx.leave("@woodsmen"), fx.remember("the Woodsmen left")] }
    ]
  })
];

export const packEventId = (key) => `rk-pack-${key}`;
export const packFactionId = (key) => `rk-pack-${key}`;

/** Best guess at which existing faction a pack faction should fill in. */
export function guessMatch(packFaction, factions) {
  const hit = factions.find((f) => packFaction.guess.some((g) => (f.name ?? "").toLowerCase().includes(g)));
  return hit?.id ?? "new";
}

const isBlank = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);

/** Pure: returns the new factions and events lists without saving
 *  anything, so it can be tested. mapping: { packKey: existingId | "new" | "skip" } */
export function buildPack(mapping, factions, events) {
  const outFactions = foundry.utils.deepClone(factions);
  const outEvents = foundry.utils.deepClone(events);
  const idFor = {};
  for (const pf of PACK_FACTIONS) {
    const choice = mapping[pf.key] ?? "new";
    if (choice === "skip") idFor[pf.key] = null;
    else if (choice === "new") idFor[pf.key] = packFactionId(pf.key);
    else idFor[pf.key] = outFactions.some((f) => f.id === choice) ? choice : packFactionId(pf.key);
  }
  const fid = (ref) => (typeof ref === "string" && ref.startsWith("@") ? idFor[ref.slice(1)] ?? null : ref);
  const eid = (ref) => (typeof ref === "string" && ref.startsWith("#") ? packEventId(ref.slice(1)) : ref);
  const fixEffects = (list = []) =>
    list
      .map((e) => ({ ...e, factionId: fid(e.factionId) ?? null, eventId: eid(e.eventId) ?? null }))
      .filter((e) => !["happiness", "join", "leave", "tradeOn", "tradeOff"].includes(e.type) || e.factionId);

  let factionsFilled = 0;
  let factionsAdded = 0;
  for (const pf of PACK_FACTIONS) {
    const id = idFor[pf.key];
    if (!id) continue;
    const d = pf.data;
    const fields = {
      tier: d.tier,
      leaderName: d.leaderName,
      leaderTitle: d.leaderTitle,
      leaderQuote: d.leaderQuote,
      agenda: d.agenda,
      rivalId: d.rival ? fid(d.rival) : null,
      ladder: d.ladder,
      favour: d.favour ?? null,
      storyHighEventId: d.storyHigh ? eid(d.storyHigh) : null,
      storyLowEventId: d.storyLow ? eid(d.storyLow) : null,
      tradeKw: d.tradeKw ?? null,
      tradeActive: d.tradeActive ?? null
    };
    let existing = outFactions.find((f) => f.id === id);
    if (!existing) {
      existing = { id, name: d.name, portrait: d.portrait ?? "", happiness: 0, present: false, effectHigh: "", effectLow: "" };
      outFactions.push(existing);
      factionsAdded++;
    } else {
      factionsFilled++;
    }
    for (const [k, v] of Object.entries(fields)) {
      if (v === null || v === undefined) continue;
      const current = existing[k];
      const empty = isBlank(current) || (k === "ladder" && !Object.values(current ?? {}).some(Boolean)) || (k === "favour" && !current?.title);
      if (empty) existing[k] = foundry.utils.deepClone(v);
    }
  }

  let eventsAdded = 0;
  for (const pe of PACK_EVENTS) {
    const id = packEventId(pe.key);
    if (outEvents.some((e) => e.id === id)) continue;
    const d = foundry.utils.deepClone(pe.data);
    // An event built around a skipped faction isn't added at all.
    const needs = [...(d.featuredFactionIds ?? []), d.petition?.factionId].filter(Boolean);
    if (needs.some((ref) => fid(ref) === null)) continue;
    d.id = id;
    d.featuredFactionIds = (d.featuredFactionIds ?? []).map(fid).filter(Boolean);
    d.factionConditions = (d.factionConditions ?? []).map((c) => ({ ...c, factionId: fid(c.factionId) })).filter((c) => c.factionId);
    d.choices = (d.choices ?? []).map((c) => ({ ...c, effects: fixEffects(c.effects) }));
    if (d.petition) {
      d.petition.factionId = fid(d.petition.factionId);
      d.petition.success = fixEffects(d.petition.success);
      d.petition.failure = fixEffects(d.petition.failure);
    }
    outEvents.push(d);
    eventsAdded++;
  }
  return { factions: outFactions, events: outEvents, factionsFilled, factionsAdded, eventsAdded };
}

export async function applyPack(mapping) {
  const result = buildPack(mapping, getFactions(), getEvents());
  await setFactions(result.factions);
  await setEvents(result.events);
  return result;
}
