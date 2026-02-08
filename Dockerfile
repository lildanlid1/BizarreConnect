FROM node:22-slim

# Install Java
RUN apt-get update && apt-get install -y openjdk-21-jdk-headless && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY index.js ./
COPY config.yml ./

RUN npm install

EXPOSE 25565

CMD ["node", "index.js"]
