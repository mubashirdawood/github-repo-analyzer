import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import repoRoutes from './routes/repoRoutes.js';
import repositoryRoutes from './routes/repositoryRoutes.js';
import authRoutes from './routes/authRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import { requireAuth } from './middleware/authMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';
import { sensitiveAuthRateLimiter } from './middleware/rateLimit.js';

// Load environment variables
dotenv.config();

const app = express();

if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  // Required behind nginx / Cloudflare so rate-limit + req.ip use X-Forwarded-For
  app.set('trust proxy', 1);
}

const jwtSecret = process.env.JWT_SECRET || '';
if (!jwtSecret || jwtSecret.length < 32) {
  console.warn(
    '[security] JWT_SECRET is missing or shorter than 32 characters. Use a long random secret in production (e.g. openssl rand -base64 48).',
  );
  if (process.env.NODE_ENV === 'production') {
    console.error('[security] Refusing to start in production without a strong JWT_SECRET.');
    process.exit(1);
  }
}

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/devlens-ai';

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

function mongoHostLabel(uri) {
  try {
    const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
    const hostPart = withoutScheme.split('/')[0].split('@').pop() || 'unknown';
    return hostPart.split(',')[0];
  } catch {
    return 'unknown';
  }
}

function logMongo(status, detail = '') {
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`[mongodb] ${status}${suffix}`);
}

// Middleware — security first
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      // Non-browser clients (curl, server-to-server) send no Origin
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin.replace(/\/$/, ''))) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  }),
);
app.use(morgan('dev'));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(
  mongoSanitize({
    replaceWith: '_',
    allowDots: true,
  }),
);

// CORS rejection → consistent JSON
app.use((err, req, res, next) => {
  if (err && typeof err.message === 'string' && err.message.startsWith('CORS blocked')) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  return next(err);
});

mongoose.connection.on('connected', () => {
  logMongo('connected', mongoose.connection.name || 'default');
});

mongoose.connection.on('error', (err) => {
  logMongo('connection error', err.message);
});

mongoose.connection.on('disconnected', () => {
  logMongo('disconnected');
});

// MongoDB Connection
logMongo('connecting', mongoHostLabel(MONGO_URI));
mongoose
  .connect(MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  })
  .catch((err) => {
    logMongo('failed', err.message);
    logMongo('hint', 'DB routes (login, repos) will not work until this is fixed.');
    if (String(MONGO_URI).startsWith('mongodb+srv://')) {
      logMongo(
        'hint',
        'queryTxt ETIMEOUT = DNS blocks mongodb+srv. Use a standard mongodb:// host list from Atlas.',
      );
    }
  });

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/contact', sensitiveAuthRateLimiter, contactRoutes);
app.use('/api/repos', requireAuth, repoRoutes);
app.use('/api/repositories', requireAuth, repositoryRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus =
    dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : dbState === 3 ? 'disconnecting' : 'disconnected';

  res.status(200).json({
    status: 'ok',
    db: {
      status: dbStatus,
      name: mongoose.connection.name || null,
    },
  });
});

// Root route (simple landing)
app.get('/', (req, res) => {
  res.status(200).send('GitLens AI API is running. Health check at /api/health');
});

// Centralized error handler (must be last)
app.use(errorHandler);

// Start Server — handle port-in-use so nodemon does not leave a silent crash
const server = app.listen(PORT, () => {
  console.log(`Server is running in dev mode on http://localhost:${PORT}`);
  console.log('[mongodb] waiting for connection (see status above when ready)');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[error] Port ${PORT} is already in use. Stop the other Node process, or re-run npm run dev (predev frees the port).`,
    );
    process.exit(1);
  }
  console.error('[error] Server failed to start:', err.message);
  process.exit(1);
});
