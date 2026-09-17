import type { NotificationChannelHandler, ChannelSendResult } from "../types.js";

/**
 * The Notification row itself *is* the in-app delivery — the frontend reads it
 * straight from the database. Nothing to dispatch, so this always succeeds.
 */
export class InAppChannel implements NotificationChannelHandler {
  async send(): Promise<ChannelSendResult> {
    return { success: true };
  }
}
