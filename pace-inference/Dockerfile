# PACE v6 Inference Engine — Multi-stage Docker build
# Produces ~10MB statically linked binary

# Stage 1: Build
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download 2>/dev/null || true
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /inference ./cmd/server

# Stage 2: Runtime (scratch = no OS, just the binary)
FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /inference /inference
EXPOSE 8080
ENTRYPOINT ["/inference"]
