import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Code, Function, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { LambdaIntegration, MethodLoggingLevel, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';

export class LambdaApiStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const apiLambda = new Function(this, 'ApiLambdaFunction', {
            functionName: 'ApiLambdaFunction',
            runtime: Runtime.NODEJS_18_X, // Using Node.js for the Lambda runtime
            handler: 'index.handler', // index from lambda/index.mjs
            code: Code.fromAsset(path.join(__dirname, '../lambda')),
            memorySize: 1024,
            timeout: Duration.seconds(30),
            tracing: Tracing.ACTIVE,
        });

        // Create the second Lambda function (The Lambda that will be invoked)
        const anotherLambda = new Function(this, 'AnotherLambdaFunction', {
            functionName: 'AnotherLambdaFunction',
            runtime: Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: Code.fromInline(
                'exports.handler = async () => { return { statusCode: 200, body: JSON.stringify({ message: "Hello from Another Lambda!" }) }; };',
            ),
            memorySize: 1024,
            timeout: Duration.seconds(30),
            tracing: Tracing.ACTIVE,
        });

        // Create the API Gateway REST API
        const api = new RestApi(this, 'ApiGateway', {
            restApiName: 'ApiLambdaService',
            description: 'API Gateway that triggers a Lambda function.',
            deployOptions: {
                stageName: 'dev',
                metricsEnabled: true,
                loggingLevel: MethodLoggingLevel.INFO,
                dataTraceEnabled: true,
                tracingEnabled: true, // Enable X-Ray tracing
            },
            cloudWatchRole: true, // Enable CloudWatch logging
            retainDeployments: false, // Set to true for production
        });

        // Add a resource (endpoint) to the API Gateway
        const invokeLambdaResource = api.root.addResource('invokeLambda');
        // invokeLambdaResource.addMethod('POST', new LambdaIntegration(apiLambda));

        // Grant the API Gateway permission to invoke the Lambda function
        apiLambda.addPermission('InvokeApiGatewayPermission', {
            action: 'lambda:InvokeFunction',
            principal: new ServicePrincipal('apigateway.amazonaws.com'),
        });

        anotherLambda.grantInvoke(apiLambda);
    }
}
