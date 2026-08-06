import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REQUIRED_MAC_ICNS_TYPES,
  assertMacIcnsComplete,
  inspectMacIcns,
  parseIcnsEntries,
} from "./desktop-icns.mjs";

const incompleteIcnsFromPwa = () => {
  // Synthetic ICNS with only a few modern types (mirrors the previous 512-only pack).
  const chunks = [
    Buffer.from("icp4"),
    (() => {
      const body = Buffer.alloc(8);
      body.writeUInt32BE(16, 0);
      return body;
    })(),
  ];
  // Build one real-looking entry of length 16 (header 8 + 8 payload)
  const entryType = Buffer.from("ic09");
  const entryLen = Buffer.alloc(4);
  entryLen.writeUInt32BE(16, 0);
  const entryPayload = Buffer.alloc(8, 1);
  const entry = Buffer.concat([entryType, entryLen, entryPayload]);
  const total = 8 + entry.length;
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(total, 4);
  return Buffer.concat([header, entry]);
};

describe("desktop ICNS helpers", () => {
  test("lists the Dock-critical type set including 1024px", () => {
    expect(REQUIRED_MAC_ICNS_TYPES).toContain("ic10");
    expect(REQUIRED_MAC_ICNS_TYPES).toContain("ic14");
  });

  test("rejects buffers that are not ICNS", () => {
    expect(() => parseIcnsEntries(Buffer.from("not-an-icon"))).toThrow(/icns magic/i);
  });

  test("reports missing types for incomplete ICNS packs", () => {
    const incomplete = incompleteIcnsFromPwa();
    const report = inspectMacIcns(incomplete);
    expect(report.ok).toBe(false);
    expect(report.missing).toContain("ic10");
    expect(() => assertMacIcnsComplete(incomplete, "test.icns")).toThrow(/missing Dock-critical/i);
  });

  test("committed desktop icon.icns is complete for Dock", () => {
    const path = join(import.meta.dir, "../apps/desktop/assets/icon.icns");
    const data = readFileSync(path);
    const report = assertMacIcnsComplete(data, path);
    for (const type of REQUIRED_MAC_ICNS_TYPES) {
      expect(report.types).toContain(type);
    }
    expect(report.types.some((type) => type === "ic04" || type === "icp4")).toBe(true);
  });
});
