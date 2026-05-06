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

Open http://localhost:786.

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

## Suno music generation

Each task has a "♪ Generate music" button on its card. It calls a Suno
provider, polls until the track is ready, fetches the MP3, and converts it to
24-bit/48 kHz WAV via local `ffmpeg`. Files land in
`public/audio/{channelId}/{taskId}.wav` (gitignored) and are served back
through `/api/suno/audio/{taskId}`.

### Configure

Open the channel menu (⋯) → **Suno settings…**

- **Provider**
  - `sunoapi.org` — paid wrapper. Paste your API key. The "Callback URL"
    field is sent to satisfy the provider's required schema; we poll for
    completion, so any syntactically valid URL works.
  - `Self-hosted` — point at a running [gcui-art/suno-api](https://github.com/gcui-art/suno-api)
    instance.
- **Default model** / **Default instrumental** — used when the per-task
  generate panel doesn't override them.

Use **Test connection** to confirm the host is reachable.

### Requirements

- `ffmpeg` on `PATH` (or set `FFMPEG_PATH`). Without it, the route falls back
  to saving the original MP3 instead of WAV.
- Node runtime (`npm run dev` or `npm start`). The Suno routes need
  filesystem + child-process access, so they don't run on the Cloudflare
  Workers static export — generation features are local-server only.

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






Run the planner on Windows / macOS / Linux
Same Node app on all three. Only difference is how you install Node and how you start the launcher.

Prereq (all platforms)
Node.js 20+ (LTS) → https://nodejs.org
The project source — clone with git or unzip what you sent.
Verify after install:

node -v   # v20.x or higher
npm -v
macOS
git clone <repo-url> ~/planner   # or unzip into ~/planner
cd ~/planner
npm install
npm run dev
Open http://localhost:786.

Optional alias so planner from anywhere starts it:

echo 'alias planner="cd ~/planner && npm run dev"' >> ~/.zshrc
source ~/.zshrc
Linux (Ubuntu/Debian/Fedora/Arch — any distro)
git clone <repo-url> ~/planner
cd ~/planner
npm install
npm run dev
Open http://localhost:786.

Optional alias (bash or zsh):

echo 'alias planner="cd ~/planner && npm run dev"' >> ~/.bashrc
source ~/.bashrc
Windows
Two equivalent paths. Pick one.

A. PowerShell (recommended)
git clone <repo-url> $HOME\planner
cd $HOME\planner
npm install
npm run dev
Open http://localhost:786.

PowerShell function as an alias (works from any folder):

notepad $PROFILE
Add this line, save, restart PowerShell:

function planner { Set-Location "$HOME\planner"; npm run dev }
If you get a script-execution error the first time:

Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
B. WSL (if you prefer a Linux shell on Windows)
wsl --install   # one-time, then reboot
Then inside the WSL terminal, follow the Linux steps above.

Production build (any OS, optional)
npm run build
npm run start
Same URL, faster, cleaner logs. Build once after pulling new changes.

Common gotchas
Port 786 in use → PORT=3001 npm run dev (mac/Linux) or $env:PORT=3001; npm run dev (PowerShell).
Behind a firewall → only localhost is listening; nothing leaves your machine.
Where data lives → ./data/db.json next to the project. Bulk-downloaded music goes to ../{folder} (one level above the project root). Adjust in src/app/api/suno/library/download/route.js if you'd rather keep it inside the project.
Suno bearer token is per-machine, per-account — paste it in the sidebar on first run. It expires hourly; the banner above the textarea tells you when.