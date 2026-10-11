// After you send /start to your bot, prints the chat ids that messaged it.
// Usage: npx tsx --env-file=.env.local scripts/telegram-chat-id.ts
async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN in .env.local first");
  const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const j = (await r.json()) as { ok: boolean; result?: { message?: { chat: { id: number; first_name?: string; type: string } } }[]; description?: string };
  if (!j.ok) throw new Error(j.description);
  const chats = new Map((j.result ?? []).filter((u) => u.message).map((u) => [u.message!.chat.id, u.message!.chat]));
  if (chats.size === 0) console.log("No messages yet — open your bot in Telegram and send /start, then re-run.");
  for (const c of chats.values()) console.log(`chat id ${c.id} (${c.type}${c.first_name ? `, ${c.first_name}` : ""})`);
}
main();
