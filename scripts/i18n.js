import { MODULE_ID } from "./constants.js";

const PREFIX = "PF2E-CA";

export function key(suffix) {
  return `${PREFIX}.${suffix}`;
}

export function t(suffix) {
  return game.i18n.localize(key(suffix));
}

export function format(suffix, data = {}) {
  return game.i18n.format(key(suffix), data);
}

export function setting(name) {
  return game.settings.get(MODULE_ID, name);
}
