ARG SPARK_VERSION=3.5.5
FROM apache/spark:${SPARK_VERSION}

ARG POSTGRES_JDBC_VERSION=42.7.5
ARG POSTGRES_JDBC_SHA256=69020b3bd20984543e817393f2e6c01a890ef2e37a77dd11d6d8508181d079ab
ARG HADOOP_AWS_VERSION=3.3.4
ARG HADOOP_AWS_SHA256=53f9ae03c681a30a50aa17524bd9790ab596b28481858e54efd989a826ed3a4a
ARG AWS_JAVA_SDK_BUNDLE_VERSION=1.12.262
ARG AWS_JAVA_SDK_BUNDLE_SHA256=873fe7cf495126619997bec21c44de5d992544aea7e632fdc77adb1a0915bae5

USER root

RUN set -eux; \
    curl --fail --show-error --silent --location \
      "https://repo1.maven.org/maven2/org/postgresql/postgresql/${POSTGRES_JDBC_VERSION}/postgresql-${POSTGRES_JDBC_VERSION}.jar" \
      --output "/opt/spark/jars/postgresql-${POSTGRES_JDBC_VERSION}.jar"; \
    echo "${POSTGRES_JDBC_SHA256}  /opt/spark/jars/postgresql-${POSTGRES_JDBC_VERSION}.jar" | sha256sum --check --strict; \
    curl --fail --show-error --silent --location \
      "https://repo1.maven.org/maven2/org/apache/hadoop/hadoop-aws/${HADOOP_AWS_VERSION}/hadoop-aws-${HADOOP_AWS_VERSION}.jar" \
      --output "/opt/spark/jars/hadoop-aws-${HADOOP_AWS_VERSION}.jar"; \
    echo "${HADOOP_AWS_SHA256}  /opt/spark/jars/hadoop-aws-${HADOOP_AWS_VERSION}.jar" | sha256sum --check --strict; \
    curl --fail --show-error --silent --location \
      "https://repo1.maven.org/maven2/com/amazonaws/aws-java-sdk-bundle/${AWS_JAVA_SDK_BUNDLE_VERSION}/aws-java-sdk-bundle-${AWS_JAVA_SDK_BUNDLE_VERSION}.jar" \
      --output "/opt/spark/jars/aws-java-sdk-bundle-${AWS_JAVA_SDK_BUNDLE_VERSION}.jar"; \
    echo "${AWS_JAVA_SDK_BUNDLE_SHA256}  /opt/spark/jars/aws-java-sdk-bundle-${AWS_JAVA_SDK_BUNDLE_VERSION}.jar" | sha256sum --check --strict; \
    mkdir -p /opt/spark/conf

COPY --chown=spark:spark config/spark/spark-defaults.conf /opt/spark/conf/spark-defaults.conf

USER spark

