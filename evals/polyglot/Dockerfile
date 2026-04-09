FROM node:22-bookworm

# Avoid interactive prompts during apt-get install
ENV DEBIAN_FRONTEND=noninteractive

# --- Base tools ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git build-essential cmake unzip ca-certificates \
    python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

# --- Python: pytest ---
RUN pip3 install pytest --break-system-packages

# --- Go (latest stable) ---
RUN ARCH=$(dpkg --print-architecture) && \
    curl -fsSL "https://go.dev/dl/go1.23.4.linux-${ARCH}.tar.gz" | tar -C /usr/local -xzf -
ENV PATH=$PATH:/usr/local/go/bin

# --- Rust ---
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH=/root/.cargo/bin:$PATH

# --- Java + Gradle ---
RUN apt-get update && apt-get install -y --no-install-recommends default-jdk-headless \
    && rm -rf /var/lib/apt/lists/*
RUN GRADLE_VERSION=8.5 && \
    curl -fsSL "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" -o /tmp/gradle.zip && \
    unzip -q -d /opt /tmp/gradle.zip && rm /tmp/gradle.zip && \
    ln -s /opt/gradle-${GRADLE_VERSION}/bin/gradle /usr/local/bin/gradle

# --- pnpm (for workspace resolution) ---
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /workspace
