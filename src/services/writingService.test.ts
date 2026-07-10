import { describe, expect, it } from "vitest";
import { createWritingDraft } from "./writingService";

describe("writingService", () => {
  it("acknowledges attachment metadata accepted by the writing adapter", async () => {
    const file = new File(["region,revenue"], "sales.csv", { type: "text/csv" });
    const result = await createWritingDraft({
      prompt: "生成经营月报",
      attachments: [
        {
          id: "local-sales",
          file,
          name: "sales.csv",
          size: file.size,
          type: "text/csv"
        }
      ]
    });

    expect(result).toMatchObject({
      status: "accepted",
      prompt: "生成经营月报",
      attachmentCount: 1
    });
  });
});
