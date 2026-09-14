import { config } from './config.js';
import { containerNameForUser, listRunningUserIds, stopUserContainer } from './docker.js';
import { execInContainer, collectStdoutUntilClose } from './dockerExec.js';

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// The `local` volume driver has no built-in size cap on a plain bind mount
// (that would need host filesystem project quotas), so nothing otherwise
// stops one user from filling the host's disk. This polls actual usage
// from inside each running container and stops any that are over quota --
// same enforcement shape as idleSweep.js's timeout check.
async function volumeUsageMb(userId) {
  const { stream, stdout, stderr } = await execInContainer(containerNameForUser(userId), [
    'du',
    '-sm',
    '/home/coder',
  ]);
  const output = await collectStdoutUntilClose(stream, stdout, stderr, 30 * 1000);
  const mb = parseInt(output.trim().split(/\s+/)[0], 10);
  return Number.isFinite(mb) ? mb : 0;
}

export function startVolumeQuotaSweep() {
  setInterval(async () => {
    let userIds;
    try {
      userIds = await listRunningUserIds();
    } catch (err) {
      console.error('volume quota sweep: failed to list containers', err);
      return;
    }

    for (const userId of userIds) {
      try {
        const usedMb = await volumeUsageMb(userId);
        if (usedMb > config.maxVolumeMb) {
          await stopUserContainer(userId);
          console.warn(`volume quota sweep: stopped container for user ${userId} (${usedMb}MB > ${config.maxVolumeMb}MB)`);
        }
      } catch (err) {
        console.error(`volume quota sweep: failed to check user ${userId}`, err);
      }
    }
  }, SWEEP_INTERVAL_MS).unref();
}
