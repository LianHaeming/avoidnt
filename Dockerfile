# Build stage
FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

# Copy go mod files and download dependencies
COPY go.mod ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN go build -o avoidnt .

# Runtime stage
FROM alpine:3.21

# Install mupdf-tools for PDF conversion
RUN apk add --no-cache mupdf-tools ca-certificates

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/avoidnt .

# Copy templates and static assets
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/static ./static

# Create data directory
RUN mkdir -p data/songs data/converted

ENTRYPOINT ["./avoidnt"]
