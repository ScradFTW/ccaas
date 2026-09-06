import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT || 8080),
  allowedEmails: (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  // Optional: only needed once Google sign-in is enabled (see routes/auth.js).
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  },
  admin: {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
  },
  sessionSecret: required('SESSION_SECRET'),
  publicBasePath: process.env.PUBLIC_BASE_PATH || '/ccaas',
  dataDir: process.env.DATA_DIR || '/srv/ccaas/data',
  squidAclDir: process.env.SQUID_ACL_DIR || '/srv/ccaas/squid-acl',
  maxConcurrentContainers: Number(process.env.MAX_CONCURRENT_CONTAINERS || 2),
  idleTimeoutMs: Number(process.env.IDLE_TIMEOUT_MINUTES || 20) * 60 * 1000,
};
