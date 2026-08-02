import { describe, expect, test } from "bun:test";
import { markdownToDoc, resolveMemoContentMarkdown } from "@edgeever/shared";

describe("mobile memo detail content", () => {
  test("keeps JSON divider nodes when the Markdown compatibility copy is stale", () => {
    const richContent = markdownToDoc("第一篇正文\n\n---\n\n第二篇正文");
    const resolved = resolveMemoContentMarkdown(richContent, "第一篇正文 第二篇正文");

    expect(resolved).toContain("第一篇正文\n\n---\n\n第二篇正文");
  });
});
