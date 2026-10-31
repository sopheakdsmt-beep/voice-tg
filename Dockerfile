FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies with ignore-scripts to bypass pnpm-only restrictions
COPY package*.json .npmrc ./
RUN npm ci --ignore-scripts

# Copy application source code
COPY . .

# Set environment
ENV NODE_ENV=production

# Start bot
CMD ["node", "index.js"]
