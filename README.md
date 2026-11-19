# Revamped Kingdom Building (PF2e)

A custom Kingdom Building interface for Pathfinder 2e in Foundry VTT: domains and actions,
a resolve timeline, events, factions, buildings on the hex map, and a research tree.

## Install

In Foundry (or The Forge), install a module from this manifest URL:

```
https://github.com/TheAdamHayes/pf2e-revamped-kingdoms/releases/latest/download/module.json
```

## Your kingdom data is safe across updates

Everything about your kingdom (domains, events, buildings, factions, the hex map, the research
tree and research points) is saved in the **world**, not in the module's files. Updating the
module replaces only the code and images; the saved kingdom stays exactly as it was.

Before a big update it's still worth using **Kingdom Configuration → Export Backup File**.

## Releases

Every push to `main` (except README-only changes) builds a new release automatically and bumps
the last version number (1.0.0 → 1.0.1 → 1.0.2). To jump versions, set `"version"` in
`module.json` and push.
