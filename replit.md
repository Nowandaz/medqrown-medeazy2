# MedQrown MedEazy

Comprehensive exam management platform for medical education with AI-powered SAQ marking.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + TanStack Query + Wouter
- **Backend**: Express.js (v5) + Drizzle ORM + PostgreSQL (Neon serverless)
- **AI**: Multi-provider orchestration via Replit AI Integrations — OpenAI (primary, weight=2) and Anthropic (fallback) are active and working; Gemini disabled (proxy incompatible with OpenAI chat completions format)
- **Storage**: GCS Object Storage via Replit integration (with local fallback)
- **Email**: Gmail SMTP via nodemailer

## Key Features
- Role-based admin access (super_admin, examiner, reviewer)
- Exam creation with MCQ and SAQ question types
- Per-question timer, full-exam timer, or no timer modes
- Auto-submit on timer expiry
- Next-only navigation (no going back)
- Refresh persistence via DB-stored attempt state
- Binary SAQ AI marking with educational feedback
- Auto-mark on submission toggle
- Multi-AI provider weighted distribution with custom endpoint URLs
- Gmail SMTP mass emailing
- Student results with admin-controlled release
- Podium-style top-3 rankings
- Analytics and student feedback
- Image upload and preview for questions

## Project Structure
```
shared/schema.ts          - DB schema + types + indexes (Drizzle + Zod)
server/db.ts              - Database connection (auto-detects Neon/standard PG)
server/storage.ts         - DatabaseStorage class (all CRUD)
server/routes.ts          - All API routes (admin + student)
server/seed.ts            - Seed data (admin, AI providers, email template)
server/ai-orchestrator.ts - Multi-provider SAQ marking (OpenAI=OpenAI SDK, Anthropic=native Anthropic SDK, both via Replit sidecar env vars)
server/marking-queue.ts   - Sequential marking queue
server/exam-cache.ts      - In-memory exam structure cache (5-min TTL)
server/index.ts           - Express server entry point
client/src/App.tsx         - Router
client/src/pages/admin/    - Admin portal (login, dashboard, exam-detail, settings)
client/src/pages/student/  - Student portal (login, instructions, exam, results)
```

## Default Credentials
- Admin: norysndachule@gmail.com / admin123

## Database Tables
admins, exams, students, exam_students, questions, question_options,
subquestions, attempts, responses, ai_providers, email_templates,
email_logs, student_feedback, audit_logs, ai_marking_jobs

## SMTP Configuration
- SMTP_HOST=smtp.gmail.com, SMTP_PORT=587
- SMTP_USER, SMTP_PASS (env secrets)
- SMTP_FROM_NAME=MedQrown MedEazy

## Contact Info
- Email: norysndachule@gmail.com
- Phone: 0702797977
- WhatsApp: https://wa.me/254702797977
