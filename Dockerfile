FROM node:20-slim

# Install Java runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    openjdk-17-jre-headless \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy app files
COPY package.json index.js ./

# Install dependencies (none currently, but future-proof)
RUN npm install --production

EXPOSE 8080

CMD ["node", "index.js"]
