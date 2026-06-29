HEAD
FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY . .

RUN mkdir -p out
RUN javac src/server/*.java -d out

EXPOSE 8080

FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY . .

RUN mkdir -p out
RUN javac src/server/*.java -d out

EXPOSE 8080

3fec2b223e1260707f6a0dd51a48f84a3933e29f
CMD ["java", "-cp", "out", "server.CertificateOrganizerServer"]