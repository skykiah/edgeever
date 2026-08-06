const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const importKey = async (masterKey: string, usage: KeyUsage) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(masterKey));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [usage]);
};

export const encryptSecret = async (value: string, masterKey: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(masterKey, "encrypt");
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
};

export const decryptSecret = async (value: string, masterKey: string) => {
  const [version, ivValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !encryptedValue) {
    throw new Error("Unsupported encrypted secret format.");
  }

  const key = await importKey(masterKey, "decrypt");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivValue) },
    key,
    fromBase64(encryptedValue),
  );
  return decoder.decode(decrypted);
};
