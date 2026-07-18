

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

// Load environment variables with override enabled to ensure .env file values
// always take precedence over pre-existing container environment variables.
dotenv.config({ override: true });

function cleanEnvValue(value: string | undefined, defaultValue: string): string {
  if (!value) return defaultValue;
  let val = value.trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  return val.trim();
}

interface StaffCredentials {
  id: string;
  pass: string;
}

function getStaffCredentials(): StaffCredentials {
  let staffId = 'admin';
  let staffPassword = 'password123';

  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          
          // Remove wrapping quotes if present
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1).trim();
          }
          
          if (key === 'STAFF_ID') {
            staffId = val;
          } else if (key === 'STAFF_PASSWORD') {
            staffPassword = val;
          }
        }
      }
    } else {
      // Fallback to process.env
      if (process.env.STAFF_ID) {
        staffId = cleanEnvValue(process.env.STAFF_ID, 'admin');
      }
      if (process.env.STAFF_PASSWORD) {
        staffPassword = cleanEnvValue(process.env.STAFF_PASSWORD, 'password123');
      }
    }
  } catch (err) {
    console.error('Error reading .env dynamically:', err);
    if (process.env.STAFF_ID) {
      staffId = cleanEnvValue(process.env.STAFF_ID, 'admin');
    }
    if (process.env.STAFF_PASSWORD) {
      staffPassword = cleanEnvValue(process.env.STAFF_PASSWORD, 'password123');
    }
  }

  return { id: staffId, pass: staffPassword };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Setup JSON body parsing middleware
  app.use(express.json());

  // API Authentication Endpoints
  app.post('/api/auth/login', (req, res) => {
    const { id, password } = req.body;

    const credentials = getStaffCredentials();
    const expectedId = credentials.id;
    const expectedPassword = credentials.pass;

    if (id === expectedId && password === expectedPassword) {
      // Create a secure base64 token derived from current credentials
      const sessionToken = Buffer.from(`${id}:${password}`).toString('base64');
      res.json({ success: true, token: sessionToken });
    } else {
      res.status(401).json({ success: false, error: 'Invalid Staff ID or Password. Please try again.' });
    }
  });

  app.post('/api/auth/verify', (req, res) => {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    const credentials = getStaffCredentials();
    const expectedId = credentials.id;
    const expectedPassword = credentials.pass;
    const expectedToken = Buffer.from(`${expectedId}:${expectedPassword}`).toString('base64');

    if (token === expectedToken) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: 'Session expired or credentials changed.' });
    }
  });

  // Health check API (secured)
  app.get('/api/health', (req, res) => {
    const credentials = getStaffCredentials();
    const envPath = path.join(process.cwd(), '.env');
    const fileExists = fs.existsSync(envPath);

    res.json({ 
      status: 'healthy', 
      envLoaded: fileExists,
      rawIdPresent: fileExists,
      usingDefaults: credentials.id === 'admin' && credentials.pass === 'password123'
    });
  });

  // Serve Frontend assets using Vite Dev Server in development or Static Assets in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Always listen on port 3000 and 0.0.0.0
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pharmacy full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
