import { describe, expect, test } from "bun:test";
import { getImageReferrerPolicy } from "./image-referrer.ts";

describe("getImageReferrerPolicy", () => {
  test("suppresses the referrer only for exact WeChat image hosts", () => {
    expect(getImageReferrerPolicy("https://mmbiz.qpic.cn/sz_mmbiz_jpg/example/640")).toBe("no-referrer");
    expect(getImageReferrerPolicy("https://mmbiz.qlogo.cn/example/0")).toBe("no-referrer");
    expect(getImageReferrerPolicy("https://MMBIZ.QPIC.CN/example.jpg")).toBe("no-referrer");
  });

  test("keeps the default policy for unrelated and deceptive hosts", () => {
    expect(getImageReferrerPolicy("https://images.example.com/photo.jpg")).toBeUndefined();
    expect(getImageReferrerPolicy("https://mmbiz.qpic.cn.evil.example/photo.jpg")).toBeUndefined();
    expect(getImageReferrerPolicy("https://evil-mmbiz.qpic.cn/photo.jpg")).toBeUndefined();
    expect(getImageReferrerPolicy("/api/v1/resources/example/blob")).toBeUndefined();
    expect(getImageReferrerPolicy("data:image/png;base64,AAAA")).toBeUndefined();
    expect(getImageReferrerPolicy("not a URL")).toBeUndefined();
  });
});
