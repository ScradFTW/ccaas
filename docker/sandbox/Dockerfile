FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      ripgrep \
      curl \
      ca-certificates \
      tmux \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

RUN useradd -m -s /bin/bash coder
USER coder
ENV HOME=/home/coder
WORKDIR /home/coder

CMD ["sleep", "infinity"]
