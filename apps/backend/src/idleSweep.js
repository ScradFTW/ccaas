import { config } from './config.js';
import { idleMs } from './activity.js';
import { listRunningUserIds, stopUserContainer } from './docker.js';

const SWEEP_INTERVAL_MS = 60 * 1000;

export function startIdleSweep() {
  setInterval(async () => {
    let userIds;
    try {
      userIds = await listRunningUserIds();
    } catch (err) {
      console.error('idle sweep: failed to list containers', err);
      return;
    }

    for (const userId of userIds) {
      if (idleMs(userId) > config.idleTimeoutMs) {
        try {
          await stopUserContainer(userId);
          console.log(`idle sweep: stopped container for user ${userId}`);
        } catch (err) {
          console.error(`idle sweep: failed to stop container for user ${userId}`, err);
        }
      }
    }
  }, SWEEP_INTERVAL_MS).unref();
}
