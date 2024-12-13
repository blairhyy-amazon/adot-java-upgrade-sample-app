import { ApplicationTargetGroup } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Role } from 'aws-cdk-lib/aws-iam';
import { Secret as SmSecret } from 'aws-cdk-lib/aws-secretsmanager';
import {
    Cluster,
    Compatibility,
    ContainerImage,
    FargateService,
    LogDrivers,
    NetworkMode,
    Protocol,
    Secret as EcsSecret,
    TaskDefinition,
    AppProtocol,
} from 'aws-cdk-lib/aws-ecs';
import { SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Buffer } from 'buffer';
import { Queue } from 'aws-cdk-lib/aws-sqs';

import { ServiceDiscoveryStack } from './servicediscoveryStack';
import { LogStack } from './logStack';

interface EcsClusterStackProps extends StackProps {
    readonly vpc: Vpc;
    readonly securityGroups: SecurityGroup[];
    readonly ecsTaskRole: Role;
    readonly ecsTaskExecutionRole: Role;
    readonly serviceDiscoveryStack: ServiceDiscoveryStack;
    readonly logStack: LogStack;
    readonly adotJavaImageTag: string;
    readonly adotPythonImageTag: string;
    readonly dbSecret: SmSecret;
    readonly dbInstanceEndpointAddress: string;
    readonly loadBalancerDnsName: string;
    readonly loadBalancerTargetGroup: ApplicationTargetGroup;
    readonly lbRemoteTargetGroup: ApplicationTargetGroup;
}

export class EcsClusterStack extends Stack {
    public readonly cluster: Cluster;
    private readonly securityGroups: SecurityGroup[];
    private readonly ecsTaskRole: Role;
    private readonly ecsTaskExecutionRole: Role;
    private readonly serviceDiscoveryStack: ServiceDiscoveryStack;
    private readonly logStack: LogStack;
    private readonly adotJavaImageTag: string;
    private readonly dbSecret: SmSecret;
    private readonly dbInstanceEndpointAddress: string;
    private readonly CLUSTER_NAME = 'ecs-adot-demo';

    constructor(scope: Construct, id: string, props: EcsClusterStackProps) {
        super(scope, id, props);

        this.cluster = new Cluster(this, 'EcsClusterV2', {
            vpc: props.vpc,
            clusterName: this.CLUSTER_NAME,
        });

        this.adotJavaImageTag = props.adotJavaImageTag;
        this.dbSecret = props.dbSecret;
        this.dbInstanceEndpointAddress = props.dbInstanceEndpointAddress;
        this.securityGroups = props.securityGroups;
        this.ecsTaskRole = props.ecsTaskRole;
        this.ecsTaskExecutionRole = props.ecsTaskExecutionRole;
        this.serviceDiscoveryStack = props.serviceDiscoveryStack;
        this.logStack = props.logStack;

        this.run(props.loadBalancerTargetGroup, props.lbRemoteTargetGroup);
        new CfnOutput(this, 'EcsClusterArn', { value: this.cluster.clusterArn });
    }

    run(targetGroup: ApplicationTargetGroup, remoteTargetGroup: ApplicationTargetGroup) {
        const serviceName = 'adot-java-test-v2';
        const appLogGroup = this.logStack.createLogGroup(serviceName);
        const remoteLogGroup = this.logStack.createLogGroup(serviceName + `remote-v2`);
        const cwAgentLogGroup = this.logStack.createLogGroup('cwagent-v2');

        // Create a new ECS task definition
        const taskDefinition = new TaskDefinition(this, `${serviceName}-task-v2`, {
            cpu: '512',
            memoryMiB: '2048',
            compatibility: Compatibility.FARGATE,
            family: serviceName,
            networkMode: NetworkMode.AWS_VPC,
            taskRole: this.ecsTaskRole,
            executionRole: this.ecsTaskExecutionRole,
            volumes: [
                {
                    name: 'opentelemetry-auto-instrumentation',
                },
            ],
        });

        const myQueue = new Queue(this, 'MyQueueV2', {
            queueName: 'MyQueueV2', // Optional, specify the name of the queue
            retentionPeriod: Duration.days(4), // Optional, set retention period
        });

        // Add the app container
        const appContainer = taskDefinition.addContainer('appv2', {
            image: ContainerImage.fromRegistry(
                `${this.account}.dkr.ecr.${this.region}.amazonaws.com/adot_java_testing_app_v2:latest`,
            ),
            cpu: 384, // Set CPU units
            memoryLimitMiB: 1536,
            essential: true,
            logging: LogDrivers.awsLogs({
                streamPrefix: 'ecs',
                logGroup: appLogGroup,
            }),
            environment: {
                SQS_QUEUE_URL: myQueue.queueUrl,
                OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
                OTEL_LOGS_EXPORTER: 'none',
                OTEL_TRACES_SAMPLER: 'xray',
                OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4316/v1/traces',
                OTEL_PROPAGATORS: 'tracecontext,baggage,b3,xray',
                OTEL_RESOURCE_ATTRIBUTES: `aws.log.group.names=adot-java-test-log,service.name=${serviceName}`,
                OTEL_AWS_APPLICATION_SIGNALS_ENABLED: 'true',
                OTEL_AWS_APPLICATION_SIGNALS_EXPORTER_ENDPOINT: 'http://localhost:4316/v1/metrics',
                OTEL_METRICS_EXPORTER: 'none',
                JAVA_TOOL_OPTIONS: ' -javaagent:/otel-auto-instrumentation/javaagent.jar',
                SPRING_PROFILES_ACTIVE: 'ecs',
                RDS_MYSQL_CLUSTER_USERNAME: 'admin',
                RDS_MYSQL_CLUSTER_PASSWORD: Buffer.from('123abc1E2517DB').toString('base64'),
                RDS_MYSQL_CLUSTER_CONNECTION_URL: `jdbc:mysql://${this.dbInstanceEndpointAddress}:3306/adotjavadb`,
            },
            portMappings: [
                {
                    containerPort: 8082,
                    hostPort: 8082,
                    protocol: Protocol.TCP,
                    name: 'app-8082-tcp',
                    appProtocol: AppProtocol.http,
                },
            ],
        });

        appContainer.addMountPoints({
            sourceVolume: 'opentelemetry-auto-instrumentation',
            containerPath: '/otel-auto-instrumentation',
            readOnly: false,
        });

        const remoteContainer = taskDefinition.addContainer('remotev2', {
            image: ContainerImage.fromRegistry(
                `${this.account}.dkr.ecr.${this.region}.amazonaws.com/adot_java_remote_testing_app_v2:latest`,
            ),
            cpu: 128, // Set CPU units
            memoryLimitMiB: 514,
            essential: true,
            logging: LogDrivers.awsLogs({
                streamPrefix: 'ecs',
                logGroup: remoteLogGroup,
            }),
            environment: {
                OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
                OTEL_LOGS_EXPORTER: 'none',
                OTEL_TRACES_SAMPLER: 'xray',
                OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4316/v1/traces',
                OTEL_PROPAGATORS: 'tracecontext,baggage,b3,xray',
                OTEL_RESOURCE_ATTRIBUTES: `aws.log.group.names=adot-java-remote-test-log,service.name=${serviceName}-remote`,
                OTEL_AWS_APPLICATION_SIGNALS_ENABLED: 'true',
                OTEL_AWS_APPLICATION_SIGNALS_EXPORTER_ENDPOINT: 'http://localhost:4316/v1/metrics',
                OTEL_METRICS_EXPORTER: 'none',
                JAVA_TOOL_OPTIONS: ' -javaagent:/otel-auto-instrumentation/javaagent.jar',
                SPRING_PROFILES_ACTIVE: 'ecs',
            },
            portMappings: [
                {
                    containerPort: 8083,
                    hostPort: 8083,
                    protocol: Protocol.TCP,
                },
            ],
        });

        remoteContainer.addMountPoints({
            sourceVolume: 'opentelemetry-auto-instrumentation',
            containerPath: '/otel-auto-instrumentation',
            readOnly: false,
        });

        // Add init container
        const initContainer = taskDefinition.addContainer(`${serviceName}-init-container-v2`, {
            image: ContainerImage.fromRegistry(
                '571600868874.dkr.ecr.us-east-2.amazonaws.com/adot-java-test-v2:latest',
                // `public.ecr.aws/aws-observability/adot-autoinstrumentation-java:${this.adotJavaImageTag}`,
            ),
            essential: false, // The container will stop with exit 0 after it completes.
            command: ['cp', '/javaagent.jar', '/otel-auto-instrumentation/javaagent.jar'],
        });

        initContainer.addMountPoints({
            sourceVolume: 'opentelemetry-auto-instrumentation',
            containerPath: '/otel-auto-instrumentation',
            readOnly: false,
        });

        // Add CloudWatch agent container
        taskDefinition.addContainer(`${serviceName}-cwagent-container-v2`, {
            image: ContainerImage.fromRegistry('public.ecr.aws/cloudwatch-agent/cloudwatch-agent:latest'),
            memoryLimitMiB: 128,
            essential: true,
            environment: {
                CW_CONFIG_CONTENT: JSON.stringify({
                    traces: {
                        traces_collected: {
                            application_signals: {},
                        },
                    },
                    logs: {
                        metrics_collected: {
                            application_signals: {},
                        },
                    },
                }),
            },
            logging: LogDrivers.awsLogs({
                streamPrefix: 'ecs',
                logGroup: cwAgentLogGroup,
            }),
        });

        const DNSService = this.serviceDiscoveryStack.createService(serviceName);

        // Add the traffic-gen container
        taskDefinition.addContainer('traffic-gen-v2', {
            image: ContainerImage.fromRegistry('curlimages/curl:8.8.0'),
            cpu: 0,
            essential: true,
            command: [
                'sh',
                '-c',
                `while true; do 
          curl http://${DNSService.serviceName}.${DNSService.namespace.namespaceName}:8082;
          sleep 5;
          curl http://${DNSService.serviceName}.${DNSService.namespace.namespaceName}:8082/send-sqs?message=iamv2;
          sleep 5;
          curl http://${DNSService.serviceName}.${DNSService.namespace.namespaceName}:8082/get-sqs;
          sleep 5;
          curl http://${DNSService.serviceName}.${DNSService.namespace.namespaceName}:8082/aws-sdk-call;
          sleep 5;
          curl http://${DNSService.serviceName}.${DNSService.namespace.namespaceName}:8082/outgoing-http-call;
          sleep 5;
          curl http://${DNSService.serviceName}.${DNSService.namespace.namespaceName}:8082/client-call;
          sleep 5;
          curl http://${DNSService.serviceName}.${DNSService.namespace.namespaceName}:8082/mysql
          sleep 5;
          curl http://${DNSService.serviceName}.${DNSService.namespace.namespaceName}:8082/remote-service?ip=${DNSService.serviceName}.${DNSService.namespace.namespaceName};
          sleep 5;
        done`,
            ],
        });

        // Create the ECS Fargate service to run the task
        const service = new FargateService(this, 'AdotJavaTestServicev2', {
            cluster: this.cluster, // Required: link to the ECS cluster
            taskDefinition: taskDefinition,
            desiredCount: 1, // How many copies of the task to run
            securityGroups: this.securityGroups,
            assignPublicIp: false, // Ensure the task is in private subnet
            vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
            serviceName: serviceName,
        });

        service.associateCloudMapService({
            service: DNSService,
        });
        service.attachToApplicationTargetGroup(targetGroup);
        service.attachToApplicationTargetGroup(remoteTargetGroup);
    }
}
