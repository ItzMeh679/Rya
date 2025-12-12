FROM eclipse-temurin:17-jre
WORKDIR /app

# Copy Lavalink files
COPY Lavalink-4.1.1.jar Lavalink.jar
COPY application.yml application.yml
COPY plugins/ plugins/

# Expose Lavalink port
EXPOSE 2333

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:2333/version || exit 1

# Run Lavalink with memory limit for Railway
CMD ["java", "-Xmx512m", "-Djava.awt.headless=true", "-jar", "Lavalink.jar"]
