# Stage 1: Build React frontend
FROM node:22-alpine AS frontend
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Python backend + built frontend
FROM python:3.11-slim

# System dependencies: ffmpeg, exiftool, tesseract
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libexif-dev \
    libimage-exiftool-perl \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and models
COPY src/ ./src/
COPY setup.py ./
COPY models/*.pt ./models/
COPY *.pt ./

# Copy built frontend from stage 1
COPY --from=frontend /app/client/dist ./client/dist

# Create output directory
RUN mkdir -p /app/output

ENV DASHCAM_OUTPUT_DIR=/app/output
ENV DASHCAM_ROAD_DAMAGE_MODEL=/app/models/road_damage.pt
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "src.web.app:app", "--host", "0.0.0.0", "--port", "8000"]
