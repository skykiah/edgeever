import { describe, expect, test } from "bun:test";
import { MERMAID_THEME_PALETTES } from "../components/ThemeProvider";
import { getOfficialMermaidThemeVariables } from "./mermaid-theme";

describe("official Mermaid theme variables", () => {
  test("maps every built-in theme across flowchart, sequence, and state diagrams", () => {
    for (const palette of Object.values(MERMAID_THEME_PALETTES)) {
      const variables = getOfficialMermaidThemeVariables(palette);
      const expectedAccent = palette.accent ?? palette.line ?? palette.fg;
      const expectedLine = palette.line ?? palette.muted ?? palette.fg;
      const expectedBorder = palette.border ?? palette.muted ?? expectedAccent;

      expect(variables.background).toBe(palette.bg);
      expect(variables.primaryTextColor).toBe(palette.fg);
      expect(variables.clusterBorder).toBe(expectedBorder);
      expect(variables.actorBorder).toBe(expectedBorder);
      expect(variables.signalColor).toBe(expectedAccent);
      expect(variables.stateBorder).toBe(expectedBorder);
      expect(variables.transitionColor).toBe(expectedLine);
    }
  });

  test("keeps minimal two-color themes coherent", () => {
    const palette = MERMAID_THEME_PALETTES["zinc-light"];
    const variables = getOfficialMermaidThemeVariables(palette);

    expect(variables.background).toBe(palette.bg);
    expect(variables.primaryColor).toBe(palette.bg);
    expect(variables.primaryBorderColor).toBe(palette.fg);
    expect(variables.signalColor).toBe(palette.fg);
  });
});
