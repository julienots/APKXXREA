# APPXRAY — full image: PWA + API + analysis tools + Android SDK (Gradle builds).
# docker build -t appxray .
# docker run -p 8787:8787 -e HOST=0.0.0.0 -e APPXRAY_TOKEN=change-me -v appxray-data:/app/data --cap-add SYS_ADMIN appxray
# (--cap-add SYS_ADMIN lets APPXRAY cut network access for JADX/Apktool with `unshare -n`; without it the UI reports the sandbox as unavailable.)
FROM eclipse-temurin:21-jdk-jammy

ARG NODE_MAJOR=22
ARG GRADLE_VERSION=8.11.1
ARG CMDLINE_TOOLS=11076708
ENV ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=$PATH:/opt/gradle/bin:/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates unzip zip util-linux maven gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/g.zip https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip \
 && unzip -q /tmp/g.zip -d /opt && mv /opt/gradle-${GRADLE_VERSION} /opt/gradle && rm /tmp/g.zip

RUN mkdir -p $ANDROID_HOME/cmdline-tools && curl -fsSL -o /tmp/c.zip https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS}_latest.zip \
 && unzip -q /tmp/c.zip -d $ANDROID_HOME/cmdline-tools && mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest && rm /tmp/c.zip \
 && yes | sdkmanager --licenses >/dev/null && sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN bash scripts/install-tools.sh && npm run build && useradd -m appxray && mkdir -p data && chown -R appxray /app/data
USER appxray
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["node", "server/dist/index.js"]
