FROM node:24-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY index.js .
COPY np_token.js .
COPY nullplatform_api_mcp.js .

CMD ["node", "index.js"]
