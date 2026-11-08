FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    HOME=/home/user

# Install system dependencies: libgomp1 (required for XGBoost) and curl (for health checks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user (UID 1000 required by Hugging Face Spaces)
RUN useradd -m -u 1000 user

WORKDIR /app

# Install Python dependencies as root into system environment
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files and grant full ownership to user 1000
COPY --chown=user:user . /app

# Switch to non-root user
USER user

EXPOSE 7860

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
