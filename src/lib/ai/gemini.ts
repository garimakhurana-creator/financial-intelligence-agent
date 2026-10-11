import { GoogleGenAI } from "@google/genai";
import { MissingConfigError } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";
import { geminiModel } from "@/lib/report/gemini";

/** Inline file part (e.g. a PDF) passed alongside the prompt. */
export interface InlineFile {
  mimeType: string;
  base64: string;
}

/**
 * One structured-output Gemini Flash call with API-key fallback on auth/quota errors.
 * Returns parsed JSON (unvalidated — callers validate) and the model version that answered.
 */
export async function generateJson(args: {
  system: string;
  prompt: string;
  schema: unknown;
  file?: InlineFile;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ json: unknown; modelVersion: string }> {
  const primary = process.env.GEMINI_API_KEY?.trim();
  if (!primary) throw new MissingConfigError("Gemini", ["GEMINI_API_KEY"]);
  const keys = [primary, ...(process.env.GEMINI_API_KEY_FALLBACKS ?? "").split(",").map((k) => k.trim()).filter(Boolean)];
  const model = geminiModel();
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
  if (args.file) parts.push({ inlineData: { mimeType: args.file.mimeType, data: args.file.base64 } });
  parts.push({ text: args.prompt });
  let lastErr: unknown;
  for (const [i, apiKey] of keys.entries()) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: args.system,
          responseMimeType: "application/json",
          responseJsonSchema: args.schema,
          temperature: args.temperature ?? 0.2,
          httpOptions: { timeout: args.timeoutMs ?? 90_000 },
        },
      });
      if (!res.text) throw new Error("Gemini returned an empty response");
      return { json: JSON.parse(res.text), modelVersion: res.modelVersion ?? model };
    } catch (e) {
      lastErr = e;
      const msg = errorMessage(e);
      log.warn("gemini.json_call_failed", { keyIndex: i, error: msg.slice(0, 200) });
      if (!/401|403|429|quota|exhausted|unauth|permission|api key/i.test(msg)) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
