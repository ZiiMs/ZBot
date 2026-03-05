FROM rust:1.77 AS builder
WORKDIR /app
COPY . .
RUN cargo build --release -p bot-app

FROM debian:bookworm-slim
RUN useradd -m -u 10001 bot
WORKDIR /app
COPY --from=builder /app/target/release/bot-app /app/bot-app
USER bot
EXPOSE 8080
CMD ["/app/bot-app"]
