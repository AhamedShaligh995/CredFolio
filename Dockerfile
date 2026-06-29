FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY . .

RUN mkdir -p out
RUN javac src/server/*.java -d out

EXPOSE 8080

CMD ["java", "-cp", "out", "server.CertificateOrganizerServer"]