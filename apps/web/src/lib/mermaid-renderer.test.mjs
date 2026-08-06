import { afterEach, describe, expect, test } from "bun:test";
import { renderMermaidSVG } from "beautiful-mermaid";
import mermaid from "mermaid";
import { getStoredMermaidRenderer } from "../components/ThemeProvider";
import { renderMermaidWithFallback } from "./mermaid-renderer";

const GANTT_SOURCE = `gantt
  dateFormat YYYY-MM-DD
  section Web
  Compatibility fallback :fallback, 2026-07-30, 1d`;

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

const restoreWindow = () => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    delete globalThis.window;
  }
};

afterEach(() => {
  restoreWindow();
});

describe("Mermaid renderer fallback", () => {
  test("defaults to the compact renderer when no browser preference exists", () => {
    delete globalThis.window;
    expect(getStoredMermaidRenderer()).toBe("beautiful");
  });

  test("defaults to the compact renderer when window exists without localStorage", () => {
    globalThis.window = {
      location: { hostname: "notes.example.com" },
    };
    expect(getStoredMermaidRenderer()).toBe("beautiful");
  });

  test("defaults to the compact renderer when localStorage is empty or blocked", () => {
    globalThis.window = {
      localStorage: {
        getItem: () => null,
      },
    };
    expect(getStoredMermaidRenderer()).toBe("beautiful");

    globalThis.window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(getStoredMermaidRenderer()).toBe("beautiful");
  });

  test("uses the official renderer for a valid Gantt diagram unsupported by beautiful-mermaid", async () => {
    expect(await mermaid.parse(GANTT_SOURCE, { suppressErrors: true })).toBeTruthy();

    let officialRenderCount = 0;
    const svg = await renderMermaidWithFallback({
      renderer: "beautiful",
      renderBeautiful: () => renderMermaidSVG(GANTT_SOURCE),
      renderOfficial: () => {
        officialRenderCount += 1;
        return '<svg data-renderer="mermaid"></svg>';
      },
    });

    expect(officialRenderCount).toBe(1);
    expect(svg).toContain('data-renderer="mermaid"');
  });
});
