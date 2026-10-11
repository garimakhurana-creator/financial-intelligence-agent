import { errorMessage, log } from "@/lib/log";
import { fallbackReport } from "@/lib/report/fallback";
import { callGemini, geminiModel } from "@/lib/report/gemini";
import type { GeneratedReport, ReportInput } from "@/lib/report/types";
import { validateReport } from "@/lib/report/validate";

export const MAX_GEMINI_ATTEMPTS = 3;

/**
 * Generate the narrative: up to three Gemini attempts, each validated (schema, sentence counts,
 * every number traceable to the input, evidence ids real, no trade instructions). Validator
 * errors are fed back into the next attempt. If all fail, a deterministic template is used.
 */
export async function generateNarrative(
  input: ReportInput,
  call: typeof callGemini = callGemini,
): Promise<GeneratedReport> {
  const errors: string[] = [];
  let feedback: string[] | undefined;
  for (let attempt = 1; attempt <= MAX_GEMINI_ATTEMPTS; attempt++) {
    try {
      const { json, modelVersion } = await call(input, feedback);
      const v = validateReport(json, input);
      if (v.ok && v.value) {
        return { output: v.value, generator: "gemini", model: modelVersion, attempts: attempt, validationErrors: errors };
      }
      feedback = v.errors.slice(0, 12);
      errors.push(...v.errors.map((e) => `attempt ${attempt}: ${e}`));
      log.warn("report.validation_failed", { attempt, errors: v.errors.slice(0, 5) });
    } catch (e) {
      errors.push(`attempt ${attempt}: ${errorMessage(e)}`);
      log.error("report.gemini_error", { attempt, error: errorMessage(e).slice(0, 200) });
      if (/not configured/i.test(errorMessage(e))) break;
    }
  }
  return { output: fallbackReport(input), generator: "fallback", model: geminiModel(), attempts: MAX_GEMINI_ATTEMPTS, validationErrors: errors };
}
