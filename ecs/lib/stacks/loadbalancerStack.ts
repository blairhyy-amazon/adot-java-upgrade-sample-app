import {
    ApplicationTargetGroup,
    TargetType,
    ApplicationProtocol,
    ApplicationLoadBalancer,
    Protocol,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import { Vpc, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2';

interface LoadBalancerStackProps extends StackProps {
    vpc: Vpc;
    securityGroup: SecurityGroup;
}

export class LoadBalancerStack extends Stack {
    public readonly loadBalancer: ApplicationLoadBalancer;
    public readonly targetGroup: ApplicationTargetGroup;
    public readonly remoteTargetGroup: ApplicationTargetGroup;
    private readonly LOAD_BALANCER_NAME = 'ecs-load-balancer-v2';
    private readonly TARGET_GROUP_NAME = 'api-gateway-target-group-v2';

    constructor(scope: Construct, id: string, props: LoadBalancerStackProps) {
        super(scope, id, props);

        // Create Application Load Balancer (ALB)
        this.loadBalancer = new ApplicationLoadBalancer(this, 'LoadBalancerv2', {
            loadBalancerName: this.LOAD_BALANCER_NAME,
            vpc: props.vpc,
            internetFacing: true,
            securityGroup: props.securityGroup,
            vpcSubnets: {
                subnetType: SubnetType.PUBLIC,
            },
        });

        this.targetGroup = new ApplicationTargetGroup(this, 'ApiGatewayTargetGroupV2', {
            targetGroupName: this.TARGET_GROUP_NAME,
            vpc: props.vpc,
            port: 8082,
            protocol: ApplicationProtocol.HTTP,
            targetType: TargetType.IP,
            healthCheck: {
                path: '/',
                protocol: Protocol.HTTP,
                healthyThresholdCount: 5,
                unhealthyThresholdCount: 2,
                interval: Duration.seconds(240),
                timeout: Duration.seconds(60),
            },
        });

        this.loadBalancer.addListener('Listenerv2', {
            protocol: ApplicationProtocol.HTTP,
            port: 8082,
            defaultTargetGroups: [this.targetGroup],
        });

        this.remoteTargetGroup = new ApplicationTargetGroup(this, 'ApiGatewayRemoteTargetGroupV2', {
            targetGroupName: 'api-gateway-remote-v2',
            vpc: props.vpc,
            port: 8083,
            protocol: ApplicationProtocol.HTTP,
            targetType: TargetType.IP,
            healthCheck: {
                path: '/',
                protocol: Protocol.HTTP,
                healthyThresholdCount: 5,
                unhealthyThresholdCount: 2,
                interval: Duration.seconds(240),
                timeout: Duration.seconds(60),
            },
        });

        this.loadBalancer.addListener('RemoteListenerv2', {
            protocol: ApplicationProtocol.HTTP,
            port: 8083,
            defaultTargetGroups: [this.remoteTargetGroup],
        });

        // Output the Load Balancer ARN and DNS
        new CfnOutput(this, 'LoadBalancerARN', {
            value: this.loadBalancer.loadBalancerArn,
        });
        new CfnOutput(this, 'LoadBalancerDNS', {
            value: this.loadBalancer.loadBalancerDnsName,
        });
    }
}
