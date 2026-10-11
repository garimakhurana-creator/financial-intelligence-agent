import { Client, TablesDB } from "node-appwrite";
import { requireEnv } from "@/lib/env";

let cached: { db: TablesDB; databaseId: string } | null = null;

/** Server-side Appwrite client using the API key. Never import this from client components. */
export function appwrite(): { db: TablesDB; databaseId: string } {
  if (cached) return cached;
  const env = requireEnv(["APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_API_KEY", "APPWRITE_DATABASE_ID"], "database");
  const client = new Client().setEndpoint(env.APPWRITE_ENDPOINT).setProject(env.APPWRITE_PROJECT_ID).setKey(env.APPWRITE_API_KEY);
  cached = { db: new TablesDB(client), databaseId: env.APPWRITE_DATABASE_ID };
  return cached;
}
