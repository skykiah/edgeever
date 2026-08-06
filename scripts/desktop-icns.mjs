/**
 * macOS ICNS inspection helpers.
 *
 * Dock and Launch Services need a complete multi-resolution icon pack. A single
 * 512 PNG converted by electron-builder often omits the 1024 (ic10) slot and
 * can leave Dock tiles stuck on the generic "empty" placeholder after installs.
 */

/** @typedef {{ type: string; length: number; offset: number }} IcnsEntry */

/**
 * Types that a modern EdgeEver macOS app icon must include so Finder and Dock
 * can pick an appropriate bitmap at every scale.
 *
 * Note: current `iconutil` emits `ic04`/`ic05` for the smallest slots, while
 * older electron-builder packs used `icp4`/`icp5`/`icp6`. Either family is OK
 * for the small sizes; the high-resolution set below is mandatory.
 */
export const REQUIRED_MAC_ICNS_TYPES = Object.freeze([
  "ic07", // 128
  "ic08", // 256
  "ic09", // 512
  "ic10", // 1024 — required for modern Dock / retina large tiles
  "ic11", // 16@2x
  "ic12", // 32@2x
  "ic13", // 128@2x
  "ic14", // 256@2x
]);

/** At least one type from each group must be present. */
export const REQUIRED_MAC_ICNS_ANY_OF = Object.freeze([
  Object.freeze(["icp4", "ic04"]), // ~16px family
  Object.freeze(["icp5", "ic05", "icp6"]), // ~32–64px family
]);

/**
 * Parse the top-level type table of an ICNS container.
 * @param {Buffer | Uint8Array} data
 * @returns {IcnsEntry[]}
 */
export const parseIcnsEntries = (data) => {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buffer.length < 8 || buffer.subarray(0, 4).toString("ascii") !== "icns") {
    throw new Error("Not a valid ICNS file (missing icns magic).");
  }

  const declaredLength = buffer.readUInt32BE(4);
  if (declaredLength !== buffer.length) {
    throw new Error(
      `ICNS length mismatch: header claims ${declaredLength} bytes, file has ${buffer.length}.`,
    );
  }

  /** @type {IcnsEntry[]} */
  const entries = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    const length = buffer.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > buffer.length) {
      throw new Error(`Invalid ICNS entry at offset ${offset} (type=${JSON.stringify(type)}, length=${length}).`);
    }
    entries.push({ type, length, offset });
    offset += length;
  }

  if (offset !== buffer.length) {
    throw new Error(`ICNS trailing bytes: parsed ${offset}, file ${buffer.length}.`);
  }

  return entries;
};

/**
 * @param {Buffer | Uint8Array} data
 * @returns {{ types: string[]; missing: string[]; missingGroups: string[][]; ok: boolean }}
 */
export const inspectMacIcns = (data) => {
  const entries = parseIcnsEntries(data);
  const types = entries.map((entry) => entry.type);
  const present = new Set(types);
  const missing = REQUIRED_MAC_ICNS_TYPES.filter((type) => !present.has(type));
  const missingGroups = REQUIRED_MAC_ICNS_ANY_OF.filter(
    (group) => !group.some((type) => present.has(type)),
  );
  return {
    types,
    missing,
    missingGroups,
    ok: missing.length === 0 && missingGroups.length === 0,
  };
};

/**
 * @param {Buffer | Uint8Array} data
 * @param {string} [label]
 */
export const assertMacIcnsComplete = (data, label = "icon.icns") => {
  const result = inspectMacIcns(data);
  if (!result.ok) {
    const parts = [];
    if (result.missing.length > 0) {
      parts.push(`types ${result.missing.join(", ")}`);
    }
    if (result.missingGroups.length > 0) {
      parts.push(
        `small-size groups ${result.missingGroups.map((group) => group.join("|")).join("; ")}`,
      );
    }
    throw new Error(
      `${label} is missing Dock-critical ICNS ${parts.join(" and ")}. ` +
        `Regenerate with: bun run prepare:desktop:icons`,
    );
  }
  return result;
};
