import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertOnRun } from "@/lib/alerts";

describe("owner alerts", () => {
  const env = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" });
    delete process.env.RESEND_API_KEY;
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("stays quiet when a run succeeded or was skipped", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await alertOnRun("daily", { status: "succeeded", steps: [] });
    await alertOnRun("weekly", { skipped: "already completed" });
    expect(f).not.toHaveBeenCalled();
  });

  it("names failed steps and failed deliveries", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", f);
    await alertOnRun("weekly", {
      status: "partial",
      steps: [
        { step: "fund_navs", ok: false, detail: "MFapi timed out" },
        { step: "delivery", ok: true, detail: "email: sent_to_provider; whatsapp: failed (template not approved)" },
      ],
    });
    const text = JSON.parse(f.mock.calls[0][1].body).text as string;
    expect(text).toMatch(/Saturday report needs attention/);
    expect(text).toMatch(/fund_navs failed: MFapi timed out/);
    expect(text).toMatch(/whatsapp: failed/);
  });

  it("never throws if the alert itself cannot be sent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(alertOnRun("daily", { status: "failed", steps: [] })).resolves.toBeUndefined();
  });
});
