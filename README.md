# ⚡ BuildFactory

> Bulk website generation for local businesses — powered by Next.js + Supabase.

---

## 🗂 Project Structure

```
buildfactory/
├── src/
│   ├── app/
│   │   ├── (app)/                  # App shell (with sidebar)
│   │   │   ├── layout.tsx          # Shell layout
│   │   │   ├── dashboard/          # Stats + recent builds
│   │   │   ├── templates/          # Upload & manage templates
│   │   │   ├── leads/              # Add/import leads
│   │   │   └── build-queue/        # Trigger builds, download ZIPs
│   │   ├── api/
│   │   │   └── builds/process/     # Build engine API route
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                # Redirects to /dashboard
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   └── ui/
│   │       ├── Badge.tsx
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Input.tsx           # Input, Select, Textarea
│   │       ├── Modal.tsx
│   │       └── Skeleton.tsx
│   ├── lib/
│   │   ├── supabase.ts             # Supabase client
│   │   ├── build-engine.ts         # ZIP processing + placeholder replacement
│   │   └── utils.ts                # Helpers, constants
│   └── types/
│       └── index.ts                # Full TypeScript types
├── supabase/migrations/
│   └── 001_initial_schema.sql      # Full DB schema
├── vercel.json
└── .env.local.example
```

---

## 🚀 Setup Guide

### 1. Clone & Install

```bash
git clone <your-repo>
cd buildfactory
npm install
```

### 2. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run `supabase/migrations/001_initial_schema.sql`
3. Go to **Storage** and create two buckets:
   - `templates` — for uploaded ZIP template files
   - `builds` — for generated output ZIPs
4. Set both buckets to **private** (access via signed URLs)

### 3. Environment Variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Fill in your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📦 Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Set environment variables in the Vercel dashboard under **Settings → Environment Variables**.

---

## 🧩 Template Placeholders

Create ZIP files with HTML/CSS/JS templates using these tokens:

| Token | Replaced with |
|-------|--------------|
| `{{COMPANY_NAME}}` | Business name |
| `{{CITY}}` | City |
| `{{PHONE}}` | Phone number |
| `{{EMAIL}}` | Email address |
| `{{CATEGORY}}` | Business category |
| `{{WEBSITE}}` | Website URL |
| `{{COMPANY_SLUG}}` | URL-safe company name |
| `{{YEAR}}` | Current year |

Tokens work in **filenames** and **file contents** (HTML, CSS, JS, JSON, etc.).

---

## 📋 CSV Import Format

Required columns: `company_name`, `city`, `category`  
Optional columns: `phone`, `email`, `website`, `notes`

```csv
company_name,category,city,phone,email
The Golden Spoon,restaurant,Austin,+1 555 001 0001,hello@goldspoon.com
Mike's Plumbing,plumber,Denver,+1 555 002 0002,mike@mikesplumbing.com
```

---

## 🔧 Tech Stack

- **Next.js 14** — App Router, Server Components, API Routes
- **Tailwind CSS** — Utility-first styling
- **Supabase** — PostgreSQL database + file storage
- **JSZip** — ZIP processing (template parsing + output generation)
- **PapaParse** — CSV parsing
- **react-hot-toast** — Notifications
- **Vercel** — Deployment platform
