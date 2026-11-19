/* Faction system: tiers, ladders, favours, event effects, petitions,
 * memories and story arcs. Everything here reads and writes the module's
 * own world settings through data.js, and nothing imports the window
 * classes, so any file can use it without circular imports.
 *
 * All new faction fields are optional. A faction saved before this file
 * existed is treated as a main faction whose ladder is just its old
 * "Effect at +3" / "Effect at -3" text, so nothing already in a world
 * changes until the GM fills the new fields in. */
import {
  MODULE_ID,
  getFactions,
  setFactions,
  getEvents,
  getKingdomState,
  setKingdomState,
  getResearchPoints,
  setResearchPoints,
  getMemories,
  setMemories,
  getPetitions,
  setPetitions,
  getQueuedEvents,
  setQueuedEvents,
  getKingdomTurn,
  escapeHTML
} from "./data.js";

/* ------------------------------------------------------------------ */
/* Tiers                                                               */
/* ------------------------------------------------------------------ */

export const FACTION_TIERS = [
  { id: "main", label: "Main faction (lives in the kingdom)", min: -3, max: 3 },
  { id: "minor", label: "Minor faction (smaller folk nearby)", min: -1, max: 1 },
  { id: "patron", label: "Patron (a power outside the kingdom)", min: -2, max: 2 }
];

const MOODS = {
  minor: { "-1": "Cold", 0: "Neutral", 1: "Friendly" },
  patron: { "-2": "Hostile", "-1": "Wary", 0: "Neutral", 1: "Warm", 2: "Firm allies" }
};

export function tierOf(faction) {
  return FACTION_TIERS.find((t) => t.id === faction?.tier) ?? FACTION_TIERS[0];
}

export function clampHappiness(faction, value) {
  const t = tierOf(faction);
  return Math.max(t.min, Math.min(t.max, Number(value) || 0));
}

/** "Friendly", "Wary"… for minor factions and patrons; null for main ones. */
export function moodLabel(faction) {
  const table = MOODS[tierOf(faction).id];
  return table ? table[clampHappiness(faction, faction.happiness)] ?? null : null;
}

/** The steps a faction's ladder has, e.g. [-3,-2,-1,1,2,3] for a main one. */
export function ladderSteps(faction) {
  const t = tierOf(faction);
  const steps = [];
  for (let s = t.min; s <= t.max; s++) if (s !== 0) steps.push(s);
  return steps;
}

/** The ladder as display rows. Steps are cumulative: at -2 both the -1
 *  and -2 lines are in effect. A faction with no ladder yet falls back to
 *  its old +3/-3 effect text, so older factions still show something. */
export function ladderRows(faction) {
  const t = tierOf(faction);
  const ladder = { ...(faction.ladder ?? {}) };
  if (!Object.values(ladder).some((v) => v)) {
    if (faction.effectHigh) ladder[t.max] = faction.effectHigh;
    if (faction.effectLow) ladder[t.min] = faction.effectLow;
  }
  const h = clampHappiness(faction, faction.happiness);
  return ladderSteps(faction)
    .filter((s) => ladder[s])
    .sort((a, b) => b - a)
    .map((s) => ({
      step: s,
      label: s > 0 ? `+${s}` : `${s}`,
      text: ladder[s],
      inEffect: (s > 0 && h >= s) || (s < 0 && h <= s)
    }));
}

/* ------------------------------------------------------------------ */
/* Favours: one action a faction lends you while it's happy            */
/* ------------------------------------------------------------------ */

export function favourAvailable(faction) {
  if (!faction?.present || !faction.favour?.title) return false;
  if (tierOf(faction).id === "patron") return false;
  return (faction.happiness ?? 0) >= 1;
}

/** Ability-shaped records for every favour on offer right now, so they can
 *  sit in the action pool next to the universal actions. */
export function favourActions(factions = getFactions()) {
  return factions.filter(favourAvailable).map((f) => ({
    title: f.favour.title,
    costs: f.favour.costs?.length ? f.favour.costs : [1],
    description: `<p><em>A favour from ${escapeHTML(f.name)}.</em></p>${f.favour.description ?? ""}`,
    favourOf: f.id
  }));
}

/* ------------------------------------------------------------------ */
/* Patrons                                                             */
/* ------------------------------------------------------------------ */

export function tradeIncomeRows(factions = getFactions()) {
  return factions
    .filter((f) => tierOf(f).id === "patron" && f.present && f.tradeActive && Number(f.tradeKw))
    .map((f) => ({ name: f.name, total: Number(f.tradeKw) }));
}

export function tradeIncome(factions = getFactions()) {
  return tradeIncomeRows(factions).reduce((sum, r) => sum + r.total, 0);
}

/* ------------------------------------------------------------------ */
/* Memories                                                            */
/* ------------------------------------------------------------------ */

export function memoryKey(text) {
  return String(text ?? "").trim().toLowerCase();
}

export function remembers(memories, text) {
  const key = memoryKey(text);
  return !!key && memories.some((m) => m.key === key);
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

export const EFFECT_TYPES = [
  { id: "happiness", label: "Faction happiness", fields: ["faction", "amount"] },
  { id: "kw", label: "KW", fields: ["amount"] },
  { id: "research", label: "Research points", fields: ["amount"] },
  { id: "remember", label: "The kingdom remembers…", fields: ["text"] },
  { id: "forget", label: "The kingdom forgets…", fields: ["text"] },
  { id: "join", label: "A faction joins the kingdom", fields: ["faction"] },
  { id: "leave", label: "A faction leaves the kingdom", fields: ["faction"] },
  { id: "petition", label: "Start a petition", fields: ["event"] },
  { id: "queue", label: "Line up a follow-up event", fields: ["event"] },
  { id: "tradeOn", label: "Open a trade agreement", fields: ["faction"] },
  { id: "tradeOff", label: "End a trade agreement", fields: ["faction"] }
];

export function normalizeEffect(e = {}) {
  const type = EFFECT_TYPES.some((t) => t.id === e.type) ? e.type : "kw";
  return {
    type,
    factionId: e.factionId || null,
    amount: Number(e.amount) || 0,
    text: String(e.text ?? "").trim(),
    eventId: e.eventId || null
  };
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** One short line in the same shape as the outcome text already used in
 *  events ("+1 Settler Happiness, -3 KW."), read back to the GM wherever
 *  effects are set up or chosen. */
export function describeEffects(effects = [], { factions = getFactions(), events = getEvents() } = {}) {
  const nameOf = (id) => factions.find((f) => f.id === id)?.name ?? "a faction (not chosen yet)";
  const titleOf = (id) => events.find((e) => e.id === id)?.title ?? "an event (not chosen yet)";
  const parts = [];
  for (const raw of effects) {
    const e = normalizeEffect(raw);
    switch (e.type) {
      case "happiness":
        if (e.amount) parts.push(`${signed(e.amount)} happiness with ${nameOf(e.factionId)}`);
        break;
      case "kw":
        if (e.amount) parts.push(`${signed(e.amount)} KW`);
        break;
      case "research":
        if (e.amount) parts.push(`${signed(e.amount)} research point${Math.abs(e.amount) === 1 ? "" : "s"}`);
        break;
      case "remember":
        if (e.text) parts.push(`the kingdom remembers "${e.text}"`);
        break;
      case "forget":
        if (e.text) parts.push(`the kingdom forgets "${e.text}"`);
        break;
      case "join":
        parts.push(`${nameOf(e.factionId)} join the kingdom`);
        break;
      case "leave":
        parts.push(`${nameOf(e.factionId)} leave the kingdom`);
        break;
      case "petition":
        parts.push(`starts the petition "${titleOf(e.eventId)}"`);
        break;
      case "queue":
        parts.push(`lines up "${titleOf(e.eventId)}" for later`);
        break;
      case "tradeOn":
        parts.push(`opens trade with ${nameOf(e.factionId)}`);
        break;
      case "tradeOff":
        parts.push(`ends trade with ${nameOf(e.factionId)}`);
        break;
    }
  }
  if (!parts.length) return "Nothing happens automatically.";
  const line = parts.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1) + ".";
}

/** Builds a petition record from a petition-type event. */
export function makePetition(eventDef) {
  const p = eventDef?.petition ?? {};
  return {
    id: foundry.utils.randomID(),
    eventId: eventDef.id,
    title: eventDef.title ?? "Petition",
    text: eventDef.body ?? "",
    factionId: p.factionId || null,
    turnsLeft: Math.max(1, Number(p.turns) || 2),
    success: (p.success ?? []).map(normalizeEffect),
    failure: (p.failure ?? []).map(normalizeEffect)
  };
}

/** Applies a list of effects in one go: every setting it touches is read
 *  once and saved once. Returns the read-back line for the chat log. Only
 *  the GM (or an Assistant) can save world settings, so callers check. */
export async function applyEffects(effects = []) {
  const list = effects.map(normalizeEffect);
  if (!list.length) return describeEffects([]);

  const factions = getFactions();
  const events = getEvents();
  const summary = describeEffects(list, { factions, events });
  const touched = new Set();
  let kingdom = null;
  let research = null;
  let memories = null;
  let petitions = null;
  let queue = null;

  for (const e of list) {
    const faction = e.factionId ? factions.find((f) => f.id === e.factionId) : null;
    switch (e.type) {
      case "happiness":
        if (faction && e.amount) {
          faction.happiness = clampHappiness(faction, (faction.happiness ?? 0) + e.amount);
          touched.add("factions");
        }
        break;
      case "kw":
        kingdom ??= getKingdomState();
        kingdom.kw += e.amount;
        break;
      case "research":
        research ??= getResearchPoints();
        research = Math.max(0, research + e.amount);
        break;
      case "remember":
        memories ??= getMemories();
        if (e.text && !remembers(memories, e.text)) {
          memories.push({ key: memoryKey(e.text), label: e.text, turn: getKingdomTurn() });
        }
        break;
      case "forget":
        memories ??= getMemories();
        memories = memories.filter((m) => m.key !== memoryKey(e.text));
        break;
      case "join":
      case "leave":
        if (faction) {
          faction.present = e.type === "join";
          touched.add("factions");
        }
        break;
      case "tradeOn":
      case "tradeOff":
        if (faction) {
          faction.tradeActive = e.type === "tradeOn";
          touched.add("factions");
        }
        break;
      case "petition": {
        const def = events.find((ev) => ev.id === e.eventId);
        if (def) {
          petitions ??= getPetitions();
          if (!petitions.some((p) => p.eventId === def.id)) petitions.push(makePetition(def));
        }
        break;
      }
      case "queue":
        queue ??= getQueuedEvents();
        if (e.eventId && !queue.some((q) => q.eventId === e.eventId)) queue.push({ eventId: e.eventId, reason: "Follow-up" });
        break;
    }
  }

  if (touched.has("factions")) await setFactions(factions);
  if (kingdom) await setKingdomState(kingdom);
  if (research !== null) await setResearchPoints(research);
  if (memories) await setMemories(memories);
  if (petitions) await setPetitions(petitions);
  if (queue) await setQueuedEvents(queue);
  return summary;
}

/* ------------------------------------------------------------------ */
/* Event conditions                                                    */
/* ------------------------------------------------------------------ */

export const CONDITION_OPS = [
  { id: "atLeast", label: "is at or above" },
  { id: "atMost", label: "is at or below" },
  { id: "present", label: "is in the kingdom" },
  { id: "absent", label: "is not in the kingdom" }
];

/** Extra requirements an event can have on top of its tick-box conditions.
 *  All of them must hold. Events without any always pass. */
export function eventConditionsMet(eventDef, { factions = getFactions(), memories = getMemories() } = {}) {
  for (const c of eventDef.factionConditions ?? []) {
    const f = factions.find((x) => x.id === c.factionId);
    if (!f) return false;
    const h = f.happiness ?? 0;
    if (c.op === "atLeast" && !(f.present && h >= Number(c.value))) return false;
    if (c.op === "atMost" && !(f.present && h <= Number(c.value))) return false;
    if (c.op === "present" && !f.present) return false;
    if (c.op === "absent" && f.present) return false;
  }
  for (const text of eventDef.requiresMemories ?? []) if (!remembers(memories, text)) return false;
  for (const text of eventDef.forbidsMemories ?? []) if (remembers(memories, text)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Petitions                                                           */
/* ------------------------------------------------------------------ */

export async function acceptPetition(eventDef) {
  const petitions = getPetitions();
  if (petitions.some((p) => p.eventId === eventDef.id)) return null;
  const petition = makePetition(eventDef);
  petitions.push(petition);
  await setPetitions(petitions);
  return petition;
}

/** Closes a petition, applying its success or failure effects. */
export async function resolvePetition(petitionId, succeeded) {
  const petitions = getPetitions();
  const petition = petitions.find((p) => p.id === petitionId);
  if (!petition) return null;
  await setPetitions(petitions.filter((p) => p.id !== petitionId));
  const summary = await applyEffects(succeeded ? petition.success : petition.failure);
  return { petition, summary };
}

/** Finish Turn: every petition loses a turn; any that run out fail. */
export async function tickPetitions() {
  const petitions = getPetitions();
  if (!petitions.length) return [];
  const expired = [];
  const kept = [];
  for (const p of petitions) {
    p.turnsLeft = (p.turnsLeft ?? 1) - 1;
    if (p.turnsLeft <= 0) expired.push(p);
    else kept.push(p);
  }
  await setPetitions(kept);
  const results = [];
  for (const p of expired) results.push({ petition: p, summary: await applyEffects(p.failure) });
  return results;
}

/* ------------------------------------------------------------------ */
/* Story arcs                                                          */
/* ------------------------------------------------------------------ */

/** Finish Turn: the first time a faction reaches the top or bottom of its
 *  track, its story event is lined up for the GM. Each only happens once
 *  (the kingdom remembers it), and the GM still chooses when to run it. */
export async function checkStoryArcs() {
  const factions = getFactions();
  const memories = getMemories();
  const queue = getQueuedEvents();
  const events = getEvents();
  const started = [];

  for (const f of factions) {
    if (!f.present) continue;
    const t = tierOf(f);
    const h = f.happiness ?? 0;
    const arcs = [
      { at: t.max, eventId: f.storyHighEventId, side: "high" },
      { at: t.min, eventId: f.storyLowEventId, side: "low" }
    ];
    for (const arc of arcs) {
      if (!arc.eventId || h !== arc.at) continue;
      const key = `story:${f.id}:${arc.side}`;
      if (memories.some((m) => m.key === key)) continue;
      const def = events.find((e) => e.id === arc.eventId);
      if (!def) continue;
      memories.push({ key, label: key, turn: getKingdomTurn(), hidden: true });
      if (!queue.some((q) => q.eventId === def.id)) {
        queue.push({ eventId: def.id, reason: `${f.name} at ${arc.at > 0 ? "+" : ""}${arc.at}` });
      }
      started.push({ faction: f.name, title: def.title });
    }
  }
  if (started.length) {
    await setMemories(memories);
    await setQueuedEvents(queue);
  }
  return started;
}

/** Whispers a note to the GMs, used for things that happen during
 *  Finish Turn (failed petitions, stories starting). */
export async function whisperGM(html) {
  try {
    const gms = game.users.filter((u) => u.isGM).map((u) => u.id);
    await ChatMessage.create({ speaker: { alias: "Kingdom" }, whisper: gms, content: html });
  } catch (err) {
    console.warn(`${MODULE_ID} | Couldn't whisper to the GM`, err);
  }
}
