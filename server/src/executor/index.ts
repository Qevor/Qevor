import 'dotenv/config';
import { createLogger } from '../lib/logger.js';
import { writeHeartbeat } from './heartbeat.js';
import { RealCircleCliRunner } from './circle-cli.js';
import { provisionPendingEscrows } from './escrow-provisioner.js';
import { processPendingBatches } from './batch-processor.js';
import { sweepExpiredCosigns, processApprovedCosigns } from './cosign-sweeper.js';

const log = createLogger('executor');
const cli = new RealCircleCliRunner(log);

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS ?? '15000', 10);
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? '30000', 10);

let sessionState: 'authenticated' | 'expired' | 'unknown' = 'unknown';
let sessionExpiresAt: Date | undefined;

async function checkSession() {
  const result = await cli.status();
  const prev = sessionState;
  sessionState = result.authenticated ? 'authenticated' : 'expired';
  sessionExpiresAt = result.expiresAt;

  if (prev !== sessionState) {
    log.info({ from: prev, to: sessionState }, 'Session state changed');
  }
}

async function heartbeatLoop() {
  while (true) {
    await checkSession();
    await writeHeartbeat(log, sessionState, sessionExpiresAt);
    await sleep(HEARTBEAT_INTERVAL);
  }
}

async function pollLoop() {
  while (true) {
    if (sessionState === 'authenticated') {
      log.debug('Polling for pending batch requests...');
      await provisionPendingEscrows(cli, log);
      await processPendingBatches(cli, log);
      await sweepExpiredCosigns(log);
      await processApprovedCosigns(cli, log);
    } else {
      log.warn('Session not authenticated, skipping poll');
    }
    await sleep(POLL_INTERVAL);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  log.info('qevor-executor starting');

  // Initial session check
  await checkSession();
  await writeHeartbeat(log, sessionState, sessionExpiresAt);

  log.info({ sessionState }, 'Initial session state');

  // Run heartbeat and poll loops concurrently
  await Promise.all([heartbeatLoop(), pollLoop()]);
}

main().catch((err) => {
  log.fatal({ err }, 'Executor crashed');
  process.exit(1);
});
