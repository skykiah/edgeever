import type { TiptapDoc, TiptapNode, TiptapTextNode } from "./content";

export type MemoShare = {
  memoId: string;
  token: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicMemoShare = {
  title: string | null;
  contentJson: TiptapDoc;
  contentMarkdown: string;
  tags: string[];
  updatedAt: string;
};

const RESOURCE_URL_PATTERN = /^\/api\/v1\/resources\/([^/?#]+)\/blob(?:[?#].*)?$/;

const rewriteAttributeValue = (value: unknown, token: string) => {
  if (typeof value !== "string") return value;
  const match = value.match(RESOURCE_URL_PATTERN);
  return match
    ? `/api/public/shares/${encodeURIComponent(token)}/resources/${encodeURIComponent(match[1])}/blob`
    : value;
};

/** Rewrites only EdgeEver-owned resource URLs so a public viewer never needs a user session. */
export const rewriteMemoResourcesForShare = (doc: TiptapDoc, token: string): TiptapDoc => {
  const visit = (node: TiptapNode | TiptapTextNode): TiptapNode | TiptapTextNode => {
    const attrs = "attrs" in node && node.attrs
      ? Object.fromEntries(Object.entries(node.attrs).map(([key, value]) => [key, rewriteAttributeValue(value, token)]))
      : undefined;
    const marks = "marks" in node && node.marks
      ? node.marks.map((mark) => ({
          ...mark,
          attrs: mark.attrs
            ? Object.fromEntries(Object.entries(mark.attrs).map(([key, value]) => [key, rewriteAttributeValue(value, token)]))
            : undefined,
        }))
      : undefined;

    return {
      ...node,
      ...(attrs ? { attrs } : {}),
      ...(marks ? { marks } : {}),
      ...("content" in node && node.content ? { content: node.content.map(visit) } : {}),
    } as TiptapNode | TiptapTextNode;
  };

  return visit(doc) as TiptapDoc;
};
