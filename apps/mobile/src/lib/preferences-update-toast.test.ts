import { expect, test } from "bun:test";
import { shouldShowMobileUpdateToastForVersion } from "./preferences";

test("shows the update toast only once per installed version", () => {
  expect(shouldShowMobileUpdateToastForVersion("1.12.2", null)).toBe(true);
  expect(shouldShowMobileUpdateToastForVersion("1.12.2", "1.12.2")).toBe(false);
});

test("allows a new toast after the installed package version changes", () => {
  expect(shouldShowMobileUpdateToastForVersion("1.13.0", "1.12.2")).toBe(true);
});

test("does not show when the installed version is unknown", () => {
  expect(shouldShowMobileUpdateToastForVersion(null, null)).toBe(false);
  expect(shouldShowMobileUpdateToastForVersion(undefined, "1.12.2")).toBe(false);
});
