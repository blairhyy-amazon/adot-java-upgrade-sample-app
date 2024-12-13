import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});

export const handler = async (event) => {
    console.log('Received event:', event);

    // Invoke another Lambda function
    const invokeResponse = await invokeAnotherLambda();

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Lambda invoked successfully!',
            response: invokeResponse,
        }),
    };
};

const invokeAnotherLambda = async () => {
    try {
        const command = new InvokeCommand({
            FunctionName: 'AnotherLambdaFunction',
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({ key: 'value' }),
        });

        const response = await lambda.send(command);

        // Handle response
        if (response.Payload) {
            const result = JSON.parse(Buffer.from(response.Payload).toString());
            console.log(result);
        }
    } catch (error) {
        console.error('Error invoking Lambda:', error);
        throw new Error('Failed to invoke the Lambda function');
    }
};
