# YouTube Upload Planner

A Next.js dashboard to plan and track daily YouTube uploads across multiple channels.

## Features

- **Multiple channels** — one sidebar entry per channel, with pending/total counts
- **JSON import** — drop in a 30-day plan per channel (paste or upload a file)
- **One-click copy** — separate copy buttons for title, description, suno-prompt, thumbnail-text
- **Pending / Uploaded / All** filters; the next pending day is highlighted at the top
- **Mark uploaded** — hides the task from Pending; the next day automatically rises to the top
- **Export** — download a channel back to JSON
- Server-side persistence (JSON file on disk)

## Getting started

```bash
npm install   # already done if scaffolded
npm run dev
```

Open http://localhost:3000.

Channels and tasks are stored in `data/db.json` (gitignored).

## JSON import format

A bare array, or `{ "tasks": [...] }`, or `{ "days": [...] }`:

```json
[
  {
    "day": 1,
    "title": "Morning Raga",
    "description": "A serene morning melody.",
    "suno-prompt": "soft sitar morning raga, slow tempo",
    "thumbnail-text": "DAY 1 · MORNING RAGA"
  },
  {
    "day": 2,
    "title": "Twilight Drone",
    "description": "...",
    "suno-prompt": "...",
    "thumbnail-text": "TWILIGHT"
  }
]
```

`thumbnail-text` is the bold caption you place on the YouTube thumbnail. Aliases accepted: `thumbnailText`, `thumbnail`. Omit to leave blank.

## Build & run

```bash
npm run build
npm start
```

## Project layout

```
src/
  app/
    layout.tsx           # root layout + ToastProvider
    page.tsx             # renders <Dashboard/>
    globals.css          # Tailwind v4 + design tokens
    api/
      channels/          # GET, POST channels
      channels/[id]/     # PATCH, DELETE
      channels/[id]/tasks   # GET, POST
      channels/[id]/import  # POST (JSON import)
      channels/[id]/export  # GET (download JSON)
      tasks/[id]            # GET, PATCH, DELETE
  components/
    Dashboard.tsx        # main client component
    Sidebar.tsx
    TaskCard.tsx
    TaskEditor.tsx
    ImportModal.tsx
    Modal.tsx
    Toast.tsx
    CopyButton.tsx
  lib/
    db.ts                # JSON-file persistence with serialized writes
    types.ts             # shared types
```
