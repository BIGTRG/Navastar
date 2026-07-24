import { describe, it, expect } from "vitest";
import { StubStorageProvider, getStorageProvider } from "./storage.js";

describe("StorageProvider (stub)", () => {
  it("mints a namespaced, sanitized key and a PUT upload url", async () => {
    const s = new StubStorageProvider();
    const up = await s.presignUpload("shipments/abc/pod", "my photo!.jpg", "image/jpeg");
    expect(up.method).toBe("PUT");
    expect(up.key).toMatch(/^shipments\/abc\/pod\/\d+-my_photo_\.jpg$/);
    expect(up.headers?.["Content-Type"]).toBe("image/jpeg");
    expect(up.uploadUrl).toContain("navastar-media");
  });

  it("getUrl points at the bucket", async () => {
    const s = new StubStorageProvider();
    const url = await s.getUrl("shipments/abc/pod/1-x.jpg");
    expect(url).toContain("/navastar-media/shipments/abc/pod/1-x.jpg");
  });

  it("getStorageProvider honors STORAGE_PROVIDER=stub in tests", () => {
    expect(getStorageProvider().name).toBe("stub");
  });
});
