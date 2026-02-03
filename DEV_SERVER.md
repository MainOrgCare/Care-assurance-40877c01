# Development Server Quick Start

## ✅ What Was Fixed

1. **CORS Configuration** - In development mode, ALL origins are now allowed (no more CORS errors!)
2. **Environment Variables** - Created `.env` file with development settings
3. **Server Mode** - Running in development mode (not production)

## 🚀 How to Start Server

**Development Mode (Recommended):**
```bash
npx tsx server/index.ts
```

OR use npm script (requires tsx installed):
```bash
npm run dev
```

**DO NOT use `npm start`** - that runs in production mode with strict CORS!

## 🔐 Login Credentials

- **Username:** `Lewis.barron`
- **Password:** `testtest`

## 📋 Server Status

- **PORT:** 5000 (default)
- **NODE_ENV:** development
- **CORS:** Permissive (all origins allowed in dev mode)
- **Database:** PostgreSQL (configured in .env)

## 🛠️ Environment File

The `.env` file has been created with:
- SESSION_SECRET for sessions
- NODE_ENV=development
- Database connection settings
- CORS configuration

## 🎯 Current Server

The server is currently running on terminal ID: `9c3174b1-631b-416f-ac9f-55ebfa01973b`

Access your app at the Codespace URL (typically Port 5000 forwarded).

##  ⚠️ Important Notes

1. **CORS errors are FIXED** - Development mode allows all origins
2. **Don't use `npm start`** - That forces production mode
3. **Restart server** after code changes with Ctrl+C and re-run `npx tsx server/index.ts`

## 🐛  If Issues Persist

1. Check server is running: Look for port 5000 in Codespace PORTS tab
2. Check browser console for actual error messages
3. Verify you're accessing the correct forwarded URL
