# GitLens.ai - Repository Evaluator (MERN Skeleton)

GitLens.ai is an intelligent codebase analyzer designed to evaluate GitHub repositories, map architecture layouts, identify system vulnerabilities, and auto-generate clean documentation.

This repository contains the foundational **MERN (MongoDB, Express, React, Node) skeleton** config.

---

## 🛠️ Tech Stack & Structure

### Core Architecture
- **`/server`**: Node.js & Express App (ES Modules, CORS, Morgan logger)
- **`/client`**: Vite + React App (Tailwind CSS v4)
- **Database**: MongoDB connectivity configured via Mongoose

### Key Dependencies Installed
- **Backend**: `express`, `mongoose`, `dotenv`, `cors`, `morgan`, `nodemon` (development)
- **Frontend**: `tailwindcss`, `@tailwindcss/vite`, `react-markdown`, `react-syntax-highlighter`

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18+ recommended)
- **npm** (v9+ recommended)
- **MongoDB** (local community server running or a MongoDB Atlas cloud URI)

### 2. Setup Dependencies
To automatically install dependencies for the root, server, and client workspace modules, run:
```bash
npm run install-all
```

Alternatively, you can install them manually:
```bash
# Install root concurrently tool
npm install

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

### 3. Environment Variables
Create a `.env` file in the `/server` directory:
```bash
cp server/.env.example server/.env
```
Inside `server/.env`, verify the values:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/devlens-ai
```

### 4. Running the Development Server
You can run both client and server concurrently from the root directory using a single command:
```bash
npm run dev
```

This uses `concurrently` to spin up:
- **Express Backend**: Listening on [http://localhost:5000](http://localhost:5000)
- **Vite React Frontend**: Serving on [http://localhost:5173](http://localhost:5173)

---

## 🔍 Health Checks

To verify code connectivity, visit:
- **Backend check**: [http://localhost:5000/api/health](http://localhost:5000/api/health) (returns `{ "status": "ok" }`)
- **Frontend check**: [http://localhost:5173/](http://localhost:5173/) (shows the GitLens.ai web panel UI)
