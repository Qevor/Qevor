import express from 'express';
import { createLogger } from '../lib/logger.js';

const log = createLogger('api');
const app = express();
const port = parseInt(process.env.PORT ?? '3000', 10);

app.use(express.json());
app.use((req, res, next) => {
  const allowedOrigin = process.env.QEVOR_WEB_ORIGIN;
  const origin = req.get('origin');
  const isLocal = process.env.NODE_ENV !== 'production' && !!origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (origin && (origin === allowedOrigin || isLocal)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Qevor-Agent-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

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
import skillsRouter, { qevorSkillManifest } from './routes/skills.js';
import copilotRouter from './routes/copilot.js';
app.use('/api/agents', agentRegisterRouter);
app.use('/api/agents', agentPoliciesRouter);
app.use('/api/agents', agentAuditRouter);
app.use('/api/agents', agentEnrollRouter);
app.use('/api/agents', agentCosignRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/copilot', copilotRouter);
app.get('/.well-known/qevor-agent-skills.json', (_req, res) => {
  res.json(qevorSkillManifest);
});

app.listen(port, '127.0.0.1', () => {
  log.info({ port }, 'qevor-api listening');
});
