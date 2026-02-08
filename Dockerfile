# Base Node.js image
FROM node:22-slim

# Install Java
RUN apt-get update && apt-get install -y openjdk-21-jdk-headless && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy app files
COPY package*.json ./
COPY index.js ./
COPY config.yml ./

RUN npm install

# Expose port if the JAR server needs one
EXPOSE 25565

# Start Node.js script
CMD ["node", "index.js"]
