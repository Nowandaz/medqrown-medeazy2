# MedQrown MedEazy

A web platform built to help first-year medical students at the University of Nairobi structure their learning through organized lessons and timed examinations — with AI-powered feedback built into the experience.

## 🌐 Live Site
[medqrown-medeazy-ei1s.onrender.com](https://medqrown-medeazy-ei1s.onrender.com)

## About
MedQrown MedEazy was founded to address a real gap in how medical students access and organize learning content. With over **130 active student users**, the platform guides students through a structured learning journey — from onboarding to lessons, timed MCQ exams, and personalized AI feedback on their performance.

## Features
- **Student onboarding** — email verification via SMTP on signup, ensuring only verified users access the platform
- **Structured lessons** — content organized by topic, drawn directly from lecture material
- **Timed MCQ exams** — past paper and custom question sets delivered in exam conditions
- **AI-powered feedback** — personalized explanations and performance insights after each exam session
- **JSON question parser** — an inbuilt parser that accepts uploaded JSON files and automatically organizes questions into the platform, streamlining content management
- **Mass emailing for admins** — broadcast announcements and updates to all students directly from the dashboard
- **High traffic stability** — built to handle concurrent users without lag or failure during peak exam periods

## Stack
- **Runtime:** Node.js 24, TypeScript 5.9
- **API:** Express 5
- **Database:** PostgreSQL + Drizzle ORM
- **Validation:** Zod (v4), drizzle-zod
- **API codegen:** Orval (from OpenAPI spec)
- **Build:** esbuild (CJS bundle)
- **Package manager:** pnpm workspaces
- **Deployment:** Render

## Run Locally
````bash
# Install dependencies
pnpm install

# Run the API server (port 5000)
pnpm --filter @workspace/api-server run dev

# Push DB schema changes (dev only)
pnpm --filter @workspace/db run push
````

**Required env:** `DATABASE_URL` — Postgres connection string

## Developer
Built and maintained by [Norys](https://github.com/Nowandaz) — medical student, founder, and developer.
