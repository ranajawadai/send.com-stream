FROM node:20-slim

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the code
COPY . .

# Build TypeScript (if using ts-node, we can run directly)
RUN npm install -g ts-node typescript

# Hugging Face Spaces usually expects port 7860
ENV PORT=7860
EXPOSE 7860

# Start the server
CMD ["ts-node", "server/proxy.ts"]
