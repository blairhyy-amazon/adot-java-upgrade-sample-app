/*
 * Copyright Amazon.com, Inc. or its affiliates.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

package com.amazon.sampleapp;

import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import software.amazon.awssdk.services.s3.S3Client;
import com.amazonaws.services.sqs.AmazonSQS;
import com.amazonaws.services.sqs.AmazonSQSClientBuilder;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;
import java.util.Collections;

@SpringBootApplication
public class FrontendService {

  @Bean
  public CloseableHttpClient httpClient() {
    return HttpClients.createDefault();
  }

  @Bean
  public S3Client s3() {
    return S3Client.builder().build();
  }

  @Bean
  public AmazonSQS amazonSQS() {
    // Automatically uses the IAM role associated with the ECS task
    return AmazonSQSClientBuilder.standard()
      .build();
  }

  @Bean
  public SqsClient sqsClient() {
    // Automatically uses the IAM role associated with the ECS task
    return SqsClient.builder().build();
  }

  public static void main(String[] args) {
    SpringApplication app = new SpringApplication(FrontendService.class);
    app.setDefaultProperties(Collections.singletonMap("server.port", "8082"));
    app.run(args);
  }
}
