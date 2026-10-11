// Re-ingest index history. Usage: npx tsx --env-file=.env.local scripts/refresh-indices.ts
import { todayIn } from "@/lib/dates";
import { refreshIndices } from "@/lib/pipeline/data";
refreshIndices(todayIn()).then((r) => console.log(r.map((x) => `${x.id}: ${x.ok ? `${x.points} pts via ${x.source}` : x.error}`).join("\n")));
