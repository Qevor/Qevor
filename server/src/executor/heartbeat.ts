import { supabase } from '../lib/supabase.js';
import type { Logger } from 'pino';

export async function writeHeartbeat(
  log: Logger,
  sessionState: 'authenticated' | 'expired' | 'unknown',
  sessionExpiresAt?: Date,
  lastError?: string,
) {
  const row: Record<string, unknown> = {
    id: 'singleton',
    last_heartbeat_at: new Date().toISOString(),
    session_state: sessionState,
    last_polled_at: new Date().toISOString(),
  };

  if (sessionExpiresAt) {
    row.session_expires_at = sessionExpiresAt.toISOString();
  }
  if (lastError) {
    row.last_error = lastError;
    row.last_error_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('executor_health')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    log.error({ error }, 'Failed to write heartbeat');
  } else {
    log.debug('Heartbeat written');
  }
}
