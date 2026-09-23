# Build stage: the Gradle wrapper downloads Gradle itself, so a JDK is enough.
FROM eclipse-temurin:21-jdk AS builder
WORKDIR /builder
COPY gradlew build.gradle settings.gradle ./
COPY gradle ./gradle
COPY api ./api
COPY src ./src
RUN ./gradlew bootJar --no-daemon
RUN cp build/libs/*.jar application.jar
RUN java -Djarmode=tools -jar application.jar extract --layers --destination extracted

# Runtime stage: the four Spring Boot layers, dependencies first so that a
# code change rebuilds only the last one.
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /builder/extracted/dependencies/ ./
COPY --from=builder /builder/extracted/spring-boot-loader/ ./
COPY --from=builder /builder/extracted/snapshot-dependencies/ ./
COPY --from=builder /builder/extracted/application/ ./
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "application.jar"]
