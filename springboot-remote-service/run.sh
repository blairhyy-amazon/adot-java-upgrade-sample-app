#!/bin/bash
set -ex

ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
REGION='us-east-2'
REPOSITORY_PREFIX=${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${REPOSITORY_PREFIX}
aws ecr create-repository --repository-name adot_java_remote_testing_app_v2 --region ${REGION} --no-cli-pager || true

sed -i 's#"{{ECR_IMAGE_URI}}"#"'"${REPOSITORY_PREFIX}"'/adot_java_remote_testing_app_v2:latest"#g' build.gradle.kts
gradle jib -P javaVersion=23
