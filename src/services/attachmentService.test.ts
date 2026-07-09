import { describe, expect, it } from "vitest";
import { createAttachmentQueue, MAX_ATTACHMENT_BYTES } from "./attachmentService";

describe("attachmentService", () => {
  it("creates stable ready items for supported business files", () => {
    const file = new File(["region,revenue"], "sales.csv", { type: "text/csv", lastModified: 42 });

    const first = createAttachmentQueue([file]);
    const second = createAttachmentQueue([file]);

    expect(first[0]).toMatchObject({ name: "sales.csv", status: "ready", error: "" });
    expect(first[0]?.id).toBe(second[0]?.id);
  });

  it("rejects unsupported and oversized files without dropping queue context", () => {
    const unsupported = new File(["binary"], "installer.exe", { type: "application/x-msdownload" });
    const oversized = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], "huge.csv", { type: "text/csv" });

    const queue = createAttachmentQueue([unsupported, oversized]);

    expect(queue.map((item) => item.status)).toEqual(["rejected", "rejected"]);
    expect(queue[0]?.error).toContain("不支持");
    expect(queue[1]?.error).toContain("20 MB");
  });
});
