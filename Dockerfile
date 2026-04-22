# ─── Stage 1: Node build ───────────────────────────────────────────────────
FROM node:18-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY lamejs.d.ts soundtouchjs.d.ts* ./
COPY . .

RUN npm run build

# ─── Stage 2: Python venv ──────────────────────────────────────────────────
# Modal handles all ML (demucs/spleeter) — Railway only needs:
#   fastapi, librosa (BPM/chords), modal client, yt-dlp, misc utils
FROM node:18-bookworm-slim AS pybuilder

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --upgrade pip setuptools wheel
RUN pip install --no-cache-dir --timeout 300 --retries 3 -r requirements.txt
RUN pip install --no-cache-dir --force-reinstall setuptools

# ─── Stage 3: Production ───────────────────────────────────────────────────
FROM node:18-bookworm-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/backend ./backend
COPY --from=pybuilder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"
ENV NODE_ENV=production

RUN mkdir -p uploads temp_conversion temp_analysis

EXPOSE 3000

CMD ["npm", "run", "start:full"]
