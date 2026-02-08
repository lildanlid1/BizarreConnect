# Base Node.js image
FROM node:22-slim

# Install Java (OpenJDK 21)
RUN apt-get update && \
    apt-get install -y openjdk-21-jdk-headless && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy Node.js app files
COPY package*.json ./
COPY index.js ./
COPY config.yml ./

# Install Node.js dependencies (if any)
RUN npm install

# Expose port if your JAR server uses one
EXPOSE 25565

# Start Node.js script
CMD ["node", "index.js"]
