import * as assert from 'assert';
import { App } from 'aws-cdk-lib';

import { getLatestAdotJavaTag, getLatestAdotPythonTag } from './utils';
import { EcsClusterStack } from './stacks/ecsStack';
import { IamRolesStack } from './stacks/iamRolesStack';
import { AdotNetworkStack } from './stacks/adotNetworkStack';
import { ServiceDiscoveryStack } from './stacks/servicediscoveryStack';
import { LogStack } from './stacks/logStack';
import { LoadBalancerStack } from './stacks/loadbalancerStack';
import { RdsDatabaseStack } from './stacks/databaseStack';
import { LambdaApiStack } from './stacks/lambdaApiStack';

class ApplicationSignalsECSDemo {
    private readonly app: App;

    constructor() {
        this.app = new App();
        this.runApp();
    }

    public async runApp(): Promise<void> {
        const [adotJavaImageTag] = await Promise.all([getLatestAdotJavaTag()]);

        assert(adotJavaImageTag !== '', 'ADOT Java Image Tag is empty');

        const adotNetworkStack = new AdotNetworkStack(this.app, 'AdotNetworkStack');

        const logStack = new LogStack(this.app, 'LogStack');

        const loadbalancerStack = new LoadBalancerStack(this.app, 'LoadBalancerStack', {
            vpc: adotNetworkStack.vpc,
            securityGroup: adotNetworkStack.albSecurityGroup,
        });

        const rdsDatabaseStack = new RdsDatabaseStack(this.app, 'RdsDatabaseStack', {
            vpc: adotNetworkStack.vpc,
            rdsSecurityGroup: adotNetworkStack.rdsSecurityGroup,
        });

        // const rdsDatabaseStack = this.app.node.findChild('RdsDatabaseStack') as RdsDatabaseStack;

        const iamRolesStack = new IamRolesStack(this.app, 'IamRolesStack');

        // Grant ecsTaskRole access to database
        rdsDatabaseStack.dbSecret.grantRead(iamRolesStack.ecsTaskRole);
        rdsDatabaseStack.dbSecret.grantWrite(iamRolesStack.ecsTaskRole);

        const serviceDiscoveryStack = new ServiceDiscoveryStack(this.app, 'ServiceDiscoveryStack', {
            vpc: adotNetworkStack.vpc,
        });
        //
        new EcsClusterStack(this.app, 'EcsClusterStack', {
            vpc: adotNetworkStack.vpc,
            securityGroups: [adotNetworkStack.ecsSecurityGroup],
            ecsTaskRole: iamRolesStack.ecsTaskRole,
            ecsTaskExecutionRole: iamRolesStack.ecsTaskExecutionRole,
            serviceDiscoveryStack: serviceDiscoveryStack,
            logStack: logStack,
            adotPythonImageTag: '',
            adotJavaImageTag: adotJavaImageTag,
            dbSecret: rdsDatabaseStack.dbSecret,
            dbInstanceEndpointAddress: rdsDatabaseStack.rdsInstance.dbInstanceEndpointAddress,
            loadBalancerTargetGroup: loadbalancerStack.targetGroup,
            loadBalancerDnsName: loadbalancerStack.loadBalancer.loadBalancerDnsName,
            lbRemoteTargetGroup: loadbalancerStack.remoteTargetGroup,
        });
        // new LambdaApiStack(this.app, 'LambdaApiStack', {});

        this.app.synth();
    }
}

new ApplicationSignalsECSDemo();
