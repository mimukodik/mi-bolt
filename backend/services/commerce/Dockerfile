# syntax=docker/dockerfile:1
# mi-bolt-commerce: the commerce service. Build context: backend/ (the Gradle
# root). The contract and the demo catalogue come in as the named contexts
# `contracts` and `catalog` (deploy/compose.yaml). The build runs in
# /src/backend so the contract sits three levels above services/commerce,
# as it does in the repository.
FROM eclipse-temurin:21-jdk@sha256:92a2a4d7a928d057e7bd999c418d66c26a34eb9a0442f3ab67721c3f88110b2d AS builder
WORKDIR /src/backend
COPY gradlew settings.gradle ./
COPY gradle ./gradle
COPY config ./config
COPY services/commerce/build.gradle ./services/commerce/
COPY services/commerce/src ./services/commerce/src
COPY --from=contracts commerce/openapi.yaml /src/contracts/commerce/openapi.yaml
RUN --mount=type=cache,target=/root/.gradle ./gradlew :services:commerce:bootJar --no-daemon
RUN cp services/commerce/build/libs/*.jar /application.jar
WORKDIR /
RUN java -Djarmode=tools -jar application.jar extract --layers --destination extracted

# Runtime stage: the four Spring Boot layers, dependencies first so that a
# code change rebuilds only the last one, and the demo catalogue.
FROM eclipse-temurin:21-jre@sha256:49e21e16e3c86eb7816a44a67549910ed090fbeb40c29c525d58bf5e02e91b0f
WORKDIR /app
COPY --from=builder /extracted/dependencies/ ./
COPY --from=builder /extracted/spring-boot-loader/ ./
COPY --from=builder /extracted/snapshot-dependencies/ ./
COPY --from=builder /extracted/application/ ./
COPY --from=catalog . ./data/catalog
ENV MIBOLT_CATALOG_PATH=/app/data/catalog
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "application.jar"]
