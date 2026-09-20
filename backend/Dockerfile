FROM rust:1.97-slim-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends g++ pkg-config && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend backend
COPY data data
RUN cargo build --manifest-path backend/Cargo.toml --release --locked
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 && rm -rf /var/lib/apt/lists/* && useradd -m calibre
COPY --from=builder /app/backend/target/release/calibre-api /usr/local/bin/calibre-api
USER calibre
ENV BIND_ADDRESS=0.0.0.0:3001
EXPOSE 3001
CMD ["calibre-api"]
