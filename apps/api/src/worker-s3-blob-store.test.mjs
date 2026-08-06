import { afterEach, describe, expect, test } from "bun:test";
import { testWorkerS3Connection } from "./worker-s3-blob-store.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("Worker S3-compatible blob store", () => {
  test("signs and verifies a path-style upload/read/delete probe", async () => {
    const objects = new Map();
    const requests = [];
    globalThis.fetch = async (request) => {
      requests.push(request);
      expect(request.headers.get("authorization")).toContain("AWS4-HMAC-SHA256");
      if (request.method === "PUT") {
        objects.set(request.url, new Uint8Array(await request.arrayBuffer()));
        return new Response(null, { status: 200 });
      }
      if (request.method === "GET") {
        const value = objects.get(request.url);
        return value ? new Response(value, { status: 200 }) : new Response(null, { status: 404 });
      }
      if (request.method === "DELETE") {
        objects.delete(request.url);
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 405 });
    };

    await testWorkerS3Connection({
      endpoint: "https://objects.example.com",
      region: "us-east-1",
      bucket: "edgeever",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      forcePathStyle: true,
      objectPrefix: "notes",
    });

    expect(requests.map((request) => request.method)).toEqual(["PUT", "GET", "DELETE"]);
    expect(new URL(requests[0].url).pathname).toStartWith("/edgeever/notes/.edgeever-connection-test/");
    expect(objects.size).toBe(0);
  });
});
