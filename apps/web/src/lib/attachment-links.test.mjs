import { describe, expect, test } from "bun:test";
import {
  getAttachmentFilenameFromLabel,
  getAttachmentResourceId,
} from "./attachment-links.ts";

describe("attachment links", () => {
  test("extracts resource ids from API and desktop URLs", () => {
    expect(getAttachmentResourceId("/api/v1/resources/res_123/blob")).toBe("res_123");
    expect(getAttachmentResourceId("https://notes.example.com/api/v1/resources/res%20one/blob?download=1")).toBe("res one");
    expect(getAttachmentResourceId("edgeever-resource://resource/res_456")).toBe("res_456");
  });

  test("ignores unrelated and staged URLs", () => {
    expect(getAttachmentResourceId("https://example.com/file.zip")).toBeNull();
    expect(getAttachmentResourceId("edgeever-staged://stage_1")).toBeNull();
  });

  test("extracts filenames from localized attachment labels", () => {
    expect(getAttachmentFilenameFromLabel("附件：archive.zip")).toBe("archive.zip");
    expect(getAttachmentFilenameFromLabel("Attachment: report.pdf")).toBe("report.pdf");
  });
});
