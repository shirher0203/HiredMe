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
