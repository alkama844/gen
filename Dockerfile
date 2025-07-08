# Use Node.js official image with Debian base
FROM node:18-bullseye

# Install Playwright dependencies
RUN apt-get update && apt-get install -y \
    libgtk-4-1 \
    libgraphene-1.0-0 \
    libgstreamer-gl1.0-0 \
    libgstreamer-plugins-base1.0-0 \
    libavif15 \
    libenchant-2-2 \
    libsecret-1-0 \
    libmanette-0.2-0 \
    libgles2-mesa \
    libnss3 \
    libxss1 \
    libasound2 \
    fonts-liberation \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Install playwright browsers and dependencies
RUN npx playwright install --with-deps

# Set working directory inside container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy the rest of the app source code
COPY . .

# Expose port 3000
EXPOSE 3000

# Start your node app
CMD ["node", "index.js"]
