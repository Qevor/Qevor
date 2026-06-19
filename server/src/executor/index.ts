import { createLogger } from '../lib/logger.js';
import { writeHeartbeat } from './heartbeat.js';
import { RealCircleCliRunner } from './circle-cli.js';
import { MantleNativeRunner } from './mantle-runner.js';
import { provisionPendingEscrows } from './escrow-provisioner.js';
import { processPendingBatches } from './batch-processor.js';
import { queueDueRecurringPayments } from './recurring-processor.js';
import { sweepExpiredCosigns, processApprovedCosigns } from './cosign-sweeper.js';
import { isMantleAgentChain, normalizeAgentChain } from './chain-support.js';

const log = createLogger('executor');
const circleCli = new RealCircleCliRunner(log);
const mantleCli = new MantleNativeRunner(log);

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS ?? '15000', 10);
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? '30000', 10);

let sessionState: 'authenticated' | 'expired' | 'unknown' = 'unknown';
let sessionExpiresAt: Date | undefined;
let lastSessionError: string | undefined;

function getRunnerForChain(chain: string) {
  const normalized = normalizeAgentChain(chain);
  return isMantleAgentChain(normalized) ? mantleCli : circleCli;
}

async function checkSession() {
  const [circle, mantle] = await Promise.all([
    circleCli.status(),
    mantleCli.status(),
  ]);

  const prev = sessionState;
  sessionState = circle.authenticated || mantle.authenticated ? 'authenticated' : 'expired';
  sessionExpiresAt = circle.expiresAt;
  lastSessionError = sessionState === 'authenticated'
    ? undefined
    : [circle.reason, mantle.reason].filter(Boolean).join('; ') || undefined;

  if (prev !== sessionState) {
    log.info({
      from: prev,
      to: sessionState,
      rails: {
        circle: circle.authenticated,
        mantle: mantle.authenticated,
      },
    }, 'Session state changed');
  }
}

async function heartbeatLoop() {
  while (true) {
    await checkSession();
    await writeHeartbeat(log, sessionState, sessionExpiresAt, lastSessionError);
    await sleep(HEARTBEAT_INTERVAL);
  }
}

async function pollLoop() {
  while (true) {
    if (sessionState === 'authenticated') {
      log.debug('Polling for pending batch requests...');
      await provisionPendingEscrows(getRunnerForChain, log);
      await queueDueRecurringPayments(log);
      await processPendingBatches(getRunnerForChain, log);
      await sweepExpiredCosigns(log);
      await processApprovedCosigns(getRunnerForChain, log);
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
  await writeHeartbeat(log, sessionState, sessionExpiresAt, lastSessionError);

  log.info({ sessionState }, 'Initial session state');

  // Run heartbeat and poll loops concurrently
  await Promise.all([heartbeatLoop(), pollLoop()]);
}

main().catch((err) => {
  log.fatal({ err }, 'Executor crashed');
  process.exit(1);
});
