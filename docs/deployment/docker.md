# Docker Deployment Guide

This guide covers containerizing and deploying DelAuto using Docker and related technologies.

## Docker Architecture

### Multi-Stage Dockerfile

```dockerfile
# Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for better caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build application (if needed)
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init curl

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S delauto -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=delauto:nodejs /app/src ./src
COPY --from=builder --chown=delauto:nodejs /app/public ./public
COPY --from=builder --chown=delauto:nodejs /app/views ./views

# Switch to non-root user
USER delauto

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
```

### Docker Compose Configuration

#### Development Setup
```yaml
version: '3.8'

services:
  delauto-api:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: delauto-api-dev
    ports:
      - "3000:3000"
      - "9229:9229"  # Debug port
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - PORT=3000
      - MONGODB_URI=mongodb://mongodb:27017/delauto_dev
      - REDIS_URL=redis://redis:6379
    depends_on:
      - mongodb
      - redis
    networks:
      - delauto-dev
    command: npm run dev

  mongodb:
    image: mongo:7-jammy
    container_name: delauto-mongodb-dev
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
      MONGO_INITDB_DATABASE: delauto_dev
    volumes:
      - mongodb_data:/data/db
      - ./docker/mongodb/init.js:/docker-entrypoint-initdb.d/init.js:ro
    networks:
      - delauto-dev

  redis:
    image: redis:7-alpine
    container_name: delauto-redis-dev
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --requirepass password
    volumes:
      - redis_data:/data
    networks:
      - delauto-dev

  mongo-express:
    image: mongo-express:latest
    container_name: delauto-mongo-express
    restart: unless-stopped
    ports:
      - "8081:8081"
    environment:
      ME_CONFIG_MONGODB_ADMINUSERNAME: admin
      ME_CONFIG_MONGODB_ADMINPASSWORD: password
      ME_CONFIG_MONGODB_URL: mongodb://admin:password@mongodb:27017/
      ME_CONFIG_BASICAUTH_USERNAME: admin
      ME_CONFIG_BASICAUTH_PASSWORD: admin
    depends_on:
      - mongodb
    networks:
      - delauto-dev

volumes:
  mongodb_data:
  redis_data:

networks:
  delauto-dev:
    driver: bridge
```

#### Production Setup
```yaml
version: '3.8'

services:
  delauto-api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: delauto-api
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
      - TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
      - TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER}
    depends_on:
      - redis
    networks:
      - delauto-prod
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s

  redis:
    image: redis:7-alpine
    container_name: delauto-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - delauto-prod
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M

  nginx:
    image: nginx:alpine
    container_name: delauto-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/ssl/certs:ro
      - nginx_logs:/var/log/nginx
    depends_on:
      - delauto-api
    networks:
      - delauto-prod
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 128M

volumes:
  redis_data:
  nginx_logs:

networks:
  delauto-prod:
    driver: bridge
```

## Docker Development Workflow

### Development Dockerfile
```dockerfile
FROM node:20-alpine

# Install development dependencies
RUN apk add --no-cache \
    git \
    curl \
    vim \
    && rm -rf /var/cache/apk/*

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S delauto -u 1001

# Set working directory
WORKDIR /app

# Change ownership
RUN chown -R delauto:nodejs /app
USER delauto

# Copy package files
COPY --chown=delauto:nodejs package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY --chown=delauto:nodejs . .

# Expose ports
EXPOSE 3000 9229

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Default command
CMD ["npm", "run", "dev"]
```

### Development Commands
```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f delauto-api

# Run tests in container
docker-compose -f docker-compose.dev.yml exec delauto-api npm test

# Debug application
docker-compose -f docker-compose.dev.yml exec delauto-api npm run debug

# Access container shell
docker-compose -f docker-compose.dev.yml exec delauto-api sh

# Stop environment
docker-compose -f docker-compose.dev.yml down
```

## Production Deployment

### Build and Push Images
```bash
# Build production image
docker build -t delauto/delauto-api:latest .

# Tag for registry
docker tag delauto/delauto-api:latest your-registry.com/delauto/delauto-api:v1.0.0

# Push to registry
docker push your-registry.com/delauto/delauto-api:v1.0.0
```

### Environment File for Production
```bash
# .env.prod
NODE_ENV=production
PORT=3000
BASE_URL=https://api.yourdomain.com

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/delauto_prod
REDIS_URL=redis://prod-redis:6379

# Security
JWT_SECRET=your-production-jwt-secret
API_KEY_PREFIX=da_prod

# External Services
TWILIO_ACCOUNT_SID=your-prod-twilio-sid
TWILIO_AUTH_TOKEN=your-prod-twilio-token
TWILIO_PHONE_NUMBER=+1234567890

# Cloud Storage
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_ACCESS_KEY_ID=your-prod-access-key
CLOUDFLARE_SECRET_ACCESS_KEY=your-prod-secret-key
CLOUDFLARE_R2_BUCKET=delauto-prod-recordings

# Monitoring
CLOUDWATCH_ENABLED=true
CLOUDWATCH_LOG_GROUP=/delauto/prod/api
CLOUDWATCH_REGION=us-east-1
```

### Production Docker Compose
```yaml
version: '3.8'

services:
  delauto-api:
    image: your-registry.com/delauto/delauto-api:v1.0.0
    container_name: delauto-api-prod
    restart: unless-stopped
    env_file:
      - .env.prod
    ports:
      - "3000:3000"
    depends_on:
      - redis
    networks:
      - delauto-prod
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G

  redis:
    image: redis:7-alpine
    container_name: delauto-redis-prod
    restart: unless-stopped
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    networks:
      - delauto-prod
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M

volumes:
  redis_data:
    driver: local

networks:
  delauto-prod:
    driver: bridge
```

## Docker Swarm Deployment

### Swarm Configuration
```yaml
version: '3.8'

services:
  delauto-api:
    image: your-registry.com/delauto/delauto-api:v1.0.0
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
      healthcheck:
        test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
        interval: 30s
        timeout: 10s
        retries: 3
        start_period: 40s
    environment:
      - NODE_ENV=production
    secrets:
      - jwt_secret
      - mongodb_uri
      - twilio_credentials

  redis:
    image: redis:7-alpine
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - nginx_config:/etc/nginx
    depends_on:
      - delauto-api

secrets:
  jwt_secret:
    external: true
  mongodb_uri:
    external: true
  twilio_credentials:
    external: true

volumes:
  redis_data:
  nginx_config:
```

### Swarm Deployment Commands
```bash
# Initialize swarm
docker swarm init

# Create secrets
echo "your-jwt-secret" | docker secret create jwt_secret -
echo "mongodb://user:pass@host:port/db" | docker secret create mongodb_uri -

# Deploy stack
docker stack deploy -c docker-compose.swarm.yml delauto

# Check services
docker service ls

# Scale services
docker service scale delauto_delauto-api=5

# Update service
docker service update --image your-registry.com/delauto/delauto-api:v1.1.0 delauto_delauto-api
```

## Kubernetes Deployment

### Kubernetes Manifests

#### Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: delauto-api
  labels:
    app: delauto-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: delauto-api
  template:
    metadata:
      labels:
        app: delauto-api
    spec:
      containers:
      - name: delauto-api
        image: your-registry.com/delauto/delauto-api:v1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: delauto-secrets
              key: mongodb-uri
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: delauto-secrets
              key: jwt-secret
        resources:
          limits:
            cpu: 1000m
            memory: 1Gi
          requests:
            cpu: 500m
            memory: 512Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

#### Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: delauto-api-service
spec:
  selector:
    app: delauto-api
  ports:
    - port: 3000
      targetPort: 3000
  type: ClusterIP
```

#### Ingress
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: delauto-api-ingress
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - api.yourdomain.com
    secretName: delauto-api-tls
  rules:
  - host: api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: delauto-api-service
            port:
              number: 3000
```

#### ConfigMap
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: delauto-config
data:
  NODE_ENV: "production"
  BASE_URL: "https://api.yourdomain.com"
  LOG_LEVEL: "info"
  CACHE_DEFAULT_TTL: "3600"
```

#### Secret
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: delauto-secrets
type: Opaque
data:
  jwt-secret: <base64-encoded-jwt-secret>
  mongodb-uri: <base64-encoded-mongodb-uri>
  twilio-sid: <base64-encoded-twilio-sid>
  twilio-token: <base64-encoded-twilio-token>
```

### Kubernetes Deployment Commands
```bash
# Apply manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get deployments
kubectl get pods
kubectl get services

# View logs
kubectl logs -f deployment/delauto-api

# Scale deployment
kubectl scale deployment delauto-api --replicas=5

# Update deployment
kubectl set image deployment/delauto-api delauto-api=your-registry.com/delauto/delauto-api:v1.1.0

# Check rollout status
kubectl rollout status deployment/delauto-api
```

## CI/CD Pipeline

### GitHub Actions Example
```yaml
name: Build and Deploy DelAuto API

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'npm'
    - run: npm ci
    - run: npm test
    - run: npm run test:coverage

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2

    - name: Log in to Container Registry
      uses: docker/login-action@v2
      with:
        registry: your-registry.com
        username: ${{ secrets.REGISTRY_USERNAME }}
        password: ${{ secrets.REGISTRY_PASSWORD }}

    - name: Build and push Docker image
      uses: docker/build-push-action@v4
      with:
        context: .
        push: true
        tags: your-registry.com/delauto/delauto-api:${{ github.sha }}, your-registry.com/delauto/delauto-api:latest

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
    - name: Deploy to staging
      run: |
        echo "Deploying to staging environment"
        # Add your staging deployment commands here

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
    - name: Deploy to production
      run: |
        echo "Deploying to production environment"
        # Add your production deployment commands here
```

## Monitoring and Logging

### Container Monitoring
```yaml
version: '3.8'

services:
  delauto-api:
    # ... existing configuration
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  prometheus:
    image: prom/prometheus:latest
    container_name: delauto-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=200h'
      - '--web.enable-lifecycle'
    networks:
      - delauto-prod

  grafana:
    image: grafana/grafana:latest
    container_name: delauto-grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
    networks:
      - delauto-prod

volumes:
  prometheus_data:
  grafana_data:
```

### Log Aggregation
```yaml
version: '3.8'

services:
  delauto-api:
    # ... existing configuration
    logging:
      driver: "fluentd"
      options:
        fluentd-address: "localhost:24224"
        tag: "docker.delauto-api"

  fluentd:
    image: fluent/fluentd:latest
    container_name: delauto-fluentd
    ports:
      - "24224:24224"
      - "24224:24224/udp"
    volumes:
      - ./logging/fluent.conf:/fluentd/etc/fluent.conf:ro
    networks:
      - delauto-prod
```

## Security Best Practices

### Docker Security
```dockerfile
# Use specific base images
FROM node:20-alpine

# Don't run as root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S delauto -u 1001
USER delauto

# Minimize attack surface
RUN apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Use .dockerignore
# .dockerignore
node_modules
npm-debug.log
.git
.env*
*.md
```

### Container Scanning
```yaml
# Add to CI/CD pipeline
- name: Scan Docker image
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: 'image'
    scan-ref: 'your-registry.com/delauto/delauto-api:latest'
    format: 'sarif'
    output: 'trivy-results.sarif'
```

### Runtime Security
```yaml
version: '3.8'

services:
  delauto-api:
    # ... existing configuration
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    volumes:
      - ./logs:/app/logs:rw
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
```

## Performance Optimization

### Multi-Stage Builds
```dockerfile
# Dependencies stage
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Builder stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --production

# Runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Resource Limits
```yaml
services:
  delauto-api:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
          pids: 1024
        reservations:
          cpus: '1.0'
          memory: 1G
```

### Health Checks and Restart Policies
```yaml
services:
  delauto-api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
    deploy:
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
        window: 120s
```

This comprehensive Docker deployment guide provides everything needed to containerize, deploy, and manage DelAuto in various environments with production-grade reliability and security.