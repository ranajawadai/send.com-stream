# Send.now Video Streamer

A **zero‑cost**, production‑ready solution that lets you stream GB‑size videos hosted on **send.now** directly in the browser – just like YouTube, without downloading the whole file.

---

## 🎬 What it does
- Takes a **direct download link** from send.now (right‑click → *Copy link address*).
- Streams the video through a **high‑performance proxy** that supports HTTP **Range Requests** (fast seeking).
- Presents a sleek, dark‑theme UI built with **Next.js 14**, **Tailwind CSS**, and **Plyr** – complete with speed control, fullscreen, and mobile responsiveness.

## 📁 Repository Layout
```
send.now video player/
├─ app/                # Next.js App Router pages
│   ├─ layout.tsx     # Root layout with dark theme
│   └─ page.tsx       # Main UI (input + video player)
├─ components/        # Re‑usable UI components
│   ├─ LinkInput.tsx   # Glass‑morphic link input
│   └─ VideoPlayer.tsx# Plyr wrapper with proxy URL handling
├─ server/            # Express proxy handling range requests
│   └─ proxy.ts       # Core streaming engine
├─ Dockerfile         # Hugging Face Space Docker image
├─ .env.example      # Env template (NEXT_PUBLIC_PROXY_URL)
├─ package.json       # All dependencies (frontend + backend)
├─ tsconfig.json     # TypeScript strict config
└─ public/            # Static assets (favicon, logo …)
```

## 🛠️ Setup Locally (optional)
```bash
# Clone & install dependencies
git clone https://github.com/ranajawadai/send.com-stream.git
cd send.com-stream
npm install   # installs both client & server deps

# Run proxy locally (useful for dev)
npm run dev:server   # starts on http://localhost:7860

# Run Next.js client locally
npm run dev:client   # starts on http://localhost:3000
```

## 🚀 Deploy – Zero Cost
### 1️⃣ Backend – Hugging Face Space (Docker)
1. Open **https://huggingface.co/spaces** → **New Space** → *Docker* → **Blank**.
2. Name it, e.g., `sendnow-proxy`.
3. Upload the **`server/`**, **`package.json`**, **`Dockerfile`** files from this repository.
4. Click **Deploy** – after ~2‑5 min you’ll get a URL like:
   `https://<your‑username>-sendnow-proxy.hf.space`
   
> **NOTE:** This Space runs on the free tier. It may go to sleep after 30 min of inactivity – the first request after sleep will take ~10 s to wake.

### 2️⃣ Frontend – Vercel (Free)
1. Push this code to GitHub (see below if you haven’t yet).
2. In **Vercel**, import the repo and select **Next.js**.
3. Add an **Environment Variable**:
   - `NEXT_PUBLIC_PROXY_URL` → `https://<your‑username>-sendnow-proxy.hf.space`
4. Deploy – Vercel will give you a URL like `https://send-com-stream.vercel.app`.

## 📦 Git Commands (first‑time push)
```bash
cd "C:\Users\RANA JAWAD LAPTOP\Downloads\Workspace\send.now video player"

git init
git add .
git commit -m "Initial commit – full streaming stack"

git remote add origin https://github.com/ranajawadai/send.com-stream.git
git branch -M main

git push -u origin main
```

## 🖱️ How to Use the Live App
1. Open the Vercel URL.
2. Paste a **direct video URL** from send.now (the one you get by right‑clicking the *Download* button).
3. Press **Play** – the video streams instantly, you can scrub anywhere without waiting for the whole file to download.

---

## 🛡️ Security & Performance
- **No secrets** in the client – the proxy URL lives in an environment variable.
- **Range Requests** keep memory usage minimal (only the requested chunk is held in RAM).
- **CORS** handled by the proxy, so the browser can play without errors.

---

## 🎉 What you get
- A production‑ready, **open‑source** streaming service.
- Free deployment on two platforms (Vercel + Hugging Face).
- Full TypeScript, strict mode, lint‑free code ready for scaling.

---

## 🗂️ License
MIT – feel free to fork, customize, or contribute!
