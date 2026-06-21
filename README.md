# HIREDME 🎯  
**AI-Powered Job Search & Interview Preparation Platform**

## 📌 Project Overview
**HIREDME** is an intelligent AI-based web platform designed to support students and candidates in the high-tech job market throughout the entire job-search process.

The system provides an end-to-end solution that combines:
- Professional profile analysis
- Job description matching & gap analysis
- AI-based interview simulations
- Evaluation of take-home assignments and code projects
- Kanban-style job application management
- Smart reminders and calendar synchronization

The platform focuses on continuous, personalized improvement using artificial intelligence.

---

## 🏗️ System Architecture
HIREDME is a full-stack web system composed of:

- **Client (Frontend)**:  
  React-based Single Page Application (SPA)

- **Server (Backend / API)**:  
  Node.js + Express REST API with Service Layer

- **Database**:  
  MongoDB with Mongoose schemas

- **External Services**:
  - Google OAuth (Authentication)
  - Google Calendar API (Interview sync)
  - AI API (Interview simulation & evaluation)
  - GitHub API (Profile enrichment)

---

## 🧩 Core Modules
1. **User Module** – Authentication, profile & preferences  
2. **Job Module** – Job CRUD, Kanban pipeline & AI matching  
3. **Exercise Module** – AI interview simulations & evaluation  
4. **Event Module** – Interview scheduling & calendar sync  
5. **Admin & Logging Module** – Monitoring and system control  

---

## 🛠️ Technology Stack
**Frontend**
- React
- SPA Architecture
- State Management
- UI Libraries (Tailwind / MUI)

**Backend**
- Node.js
- Express
- JWT Authentication
- RESTful API

**Database**
- MongoDB
- Mongoose

**AI & Integrations**
- OpenAI API
- Google OAuth & Calendar API
- GitHub API

---

## 📁 Project Structure

**HiredMe** is organized as a two-workspace monorepo:

```
HiredMe/
├── client/   # Frontend — React SPA
├── docker-compose.yml
└── server/   # Backend — Node.js/Express API
    └── src/
        ├── controllers/   # Request handlers
        ├── services/      # Business logic
        ├── models/        # Data models
        ├── routes/        # Route definitions
        ├── middlewares/   # Express middlewares
        └── utils/         # Shared helpers
```

- **client** — the frontend application (user-facing React SPA).
- **server** — the backend API that serves the client, handles authentication, business logic, database access, and AI integrations.

---

## Docker Usage

The repository includes a Docker Compose setup for local development with hot reload:

```bash
cp .env.example .env
docker compose up --build
```

Services:

- Client: http://localhost:5173
- Server API: http://localhost:5000
- Health check: http://localhost:5000/api/health
- MongoDB: localhost:27017, with data persisted in the `mongo-data` Docker volume

By default, Docker runs with `USE_MOCK_AI=false`, so provide one of `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_KEY`, or `GEMINI_API_KEY` in `.env`. For offline local development, set `USE_MOCK_AI=true`.

Common commands:

```bash
docker compose logs -f
docker compose down
docker compose down -v   # also removes persisted MongoDB data and node_modules volumes
```

Production-style images can be built from the Dockerfiles:

```bash
docker build --target production -t hiredme-server ./server
docker build --target production -t hiredme-client ./client
```

The development client calls the backend directly through `VITE_API_BASE_URL=http://localhost:5000`. If `VITE_API_BASE_URL` is empty, Vite can proxy `/api` requests to the `server` container through `VITE_PROXY_API_TARGET`.

---
