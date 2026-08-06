const RESOURCE_PATH_PATTERN = /\/api\/v1\/resources\/([^/]+)\/blob(?:$|[?#])/;

export const getResourceIdFromUrl = (href: string): string | null => {
  if (href.startsWith("edgeever-resource://")) {
    try {
      const parsed = new URL(href);
      const resourceId = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
      return resourceId || null;
    } catch {
      return null;
    }
  }

  try {
    const parsed = new URL(href, "http://edgeever.local");
    const match = parsed.pathname.match(RESOURCE_PATH_PATTERN);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
};

export const getAttachmentFilenameFromLabel = (label: string) =>
  label.replace(/^\s*(?:附件[：:]|Attachment:)\s*/i, "").trim();
