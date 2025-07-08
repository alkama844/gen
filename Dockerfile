# Use the official Playwright image with browsers and dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.37.1-focal

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) first for efficient caching
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy the rest of your application code
COPY . .

# Expose the port your app listens on (adjust if different)
EXPOSE 3000

# Start your Node.js app
CMD ["node", "index.js"]
