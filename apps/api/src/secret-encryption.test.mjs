import { describe, expect, test } from "bun:test";
import { decryptSecret, encryptSecret } from "./secret-encryption.ts";

describe("object storage secret encryption", () => {
  test("round-trips a secret without storing plaintext", async () => {
    const plaintext = "secret-access-key";
    const encrypted = await encryptSecret(plaintext, "instance-master-key");

    expect(encrypted).toStartWith("v1.");
    expect(encrypted).not.toContain(plaintext);
    expect(await decryptSecret(encrypted, "instance-master-key")).toBe(plaintext);
  });

  test("rejects a different master key", async () => {
    const encrypted = await encryptSecret("secret", "first-key");
    expect(decryptSecret(encrypted, "second-key")).rejects.toThrow();
  });
});
