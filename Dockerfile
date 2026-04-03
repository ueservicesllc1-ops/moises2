# Multi-stage build para reducir tamaño
FROM node:18-bullseye AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    python3-dev \
    libffi-dev \
    libssl-dev \
    cmake \
    llvm-11 \
    llvm-11-dev \
    gfortran \
    libopenblas-dev \
    liblapack-dev \
    libblas-dev \
    && rm -rf /var/lib/apt/lists/*

ENV LLVM_CONFIG=/usr/bin/llvm-config-11

WORKDIR /app

# Copy package files first
COPY package.json package-lock.json* ./

# Install ALL Node dependencies (including devDependencies for build)
RUN npm install

# Copy type declarations and source code
COPY lamejs.d.ts soundtouchjs.d.ts* ./
COPY . .

# Build Next.js
RUN npm run build

# Install Python dependencies with optimizations for faster builds
COPY requirements.txt ./
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Upgrade pip and install build tools first
RUN pip install --upgrade pip setuptools wheel

# Install dependencies in stages to avoid timeout
RUN pip install --no-cache-dir --timeout 600 --retries 3 \
    "setuptools>=70.0.0" "wheel>=0.42.0" "Cython>=3.0.0"

RUN pip install --no-cache-dir --timeout 600 --retries 3 \
    fastapi==0.104.1 uvicorn[standard]==0.24.0 python-multipart==0.0.6

RUN pip install --no-cache-dir --timeout 600 --retries 3 \
    "numpy>=1.24.0,<2.0.0" "scipy>=1.11.0,<2.0.0"

# Install librosa separately with more time
RUN pip install --no-cache-dir --timeout 900 --retries 3 librosa==0.10.1

RUN pip install --no-cache-dir --timeout 600 --retries 3 \
    soundfile==0.12.1 pydub==0.25.1 ffmpeg-python==0.2.0

# Install ML dependencies with CPU-only versions
RUN pip install --no-cache-dir --timeout 900 --retries 3 \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    torch==2.0.0+cpu torchaudio==2.0.0+cpu

RUN pip install --no-cache-dir --timeout 600 --retries 3 \
    spleeter==2.4.0 demucs>=4.0.0

# Install remaining dependencies
RUN pip install --no-cache-dir --timeout 600 --retries 3 \
    aiofiles==23.2.1 "aiohttp>=3.8.0" "httpx>=0.24.0" "pydantic>=2.0.0" \
    "requests>=2.31.0" "yt-dlp>=2023.11.16" "python-dotenv>=1.0.0"

# Production stage
FROM node:18-bullseye-slim

# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    ffmpeg \
    libopenblas0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/backend ./backend
COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"
ENV NODE_ENV=production

# Create directories
RUN mkdir -p uploads temp_conversion temp_analysis

EXPOSE 3000

CMD concurrently "next start -p ${PORT:-3000}" "cd backend && /opt/venv/bin/python main.py"
