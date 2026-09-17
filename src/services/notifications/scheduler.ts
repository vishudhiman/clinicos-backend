import { prisma } from "../../db.js";
import { dispatchNotification } from "./notificationService.js";

/**
 * Simple in-process polling loop — no queue, no worker process, no Docker. Good enough
 * for this scale; swap for a real scheduler if reminder volume ever grows.
 */
export function startReminderScheduler(intervalMs = 60_000): NodeJS.Timeout {
  async function tick() {
    try {
      const due = await prisma.notification.findMany({
        where: { status: "PENDING", scheduledFor: { lte: new Date() } },
        take: 50,
      });
      for (const notification of due) {
        await dispatchNotification(notification.id);
      }
    } catch (err) {
      console.error("Reminder scheduler tick failed:", err);
    }
  }

  tick();
  return setInterval(tick, intervalMs);
}
