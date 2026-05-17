import express from 'express';
import { createLogger } from '../lib/logger.js';

const log = createLogger('api');
const app = express();
const port = parseInt(process.env.PORT ?? '3000', 10);

app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log.info({
      method: req.method,
      route: req.path,
      status: res.statusCode,
      latency_ms: Date.now() - start,
    });
  });
  next();
});

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: 'qevor-api' });
});

// Agent routes
import agentRegisterRouter from './routes/agents/register.js';
import agentPoliciesRouter from './routes/agents/policies.js';
import agentAuditRouter from './routes/agents/audit.js';
import agentEnrollRouter from './routes/agents/wallets-enroll.js';
import agentCosignRouter from './routes/agents/cosign.js';
app.use('/api/agents', agentRegisterRouter);
app.use('/api/agents', agentPoliciesRouter);
app.use('/api/agents', agentAuditRouter);
app.use('/api/agents', agentEnrollRouter);
app.use('/api/agents', agentCosignRouter);

app.listen(port, '127.0.0.1', () => {
  log.info({ port }, 'qevor-api listening');
});
