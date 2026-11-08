FROM python:3.11-slim

# Set environment variables for production execution and Google Cloud Run
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    HOME=/home/user

# Install system dependencies: libgomp1 (required for XGBoost) and curl (for health checks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged non-root user (Google Cloud security best practice)
RUN useradd -m -u 1000 user

WORKDIR /app

# Install Python dependencies as root into system environment
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files and grant full ownership to user
COPY --chown=user:user . /app

# Switch to non-root user
USER user

EXPOSE 8080

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
