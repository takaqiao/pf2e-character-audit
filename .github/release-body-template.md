## Install

In Foundry → **Add-on Modules → Install Module**, paste the manifest URL:

```
https://github.com/takaqiao/pf2e-character-audit/releases/latest/download/module.json
```

## Compatibility

- Foundry VTT v13 ~ v14
- PF2e system v7+

## What it does

- **Publication audit** — scans every owned item for its publication source, license, and Remaster status. Surfaces homebrew, custom Lore, and legacy-source items.
- **Prerequisite verification** — parses each owned feat's prerequisites and evaluates against the current actor state (tristate: pass / fail / unknown).
- **Build completeness** — verifies attribute boosts, languages, feat slots (ancestry / class / skill / general / archetype), skill increases, apex item, dual class, starting equipment and 20+ other rules.

Four entry points: character sheet header, party sheet header, Actors directory toolbar, Actors directory right-click menu.

## Changes

See the commits associated with this tag for the full change list.
