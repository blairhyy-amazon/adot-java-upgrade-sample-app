import { Construct } from 'constructs';
import {
    DatabaseInstance,
    SubnetGroup,
    Credentials,
    DatabaseInstanceEngine,
    MysqlEngineVersion,
    StorageType,
} from 'aws-cdk-lib/aws-rds';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StackProps, Stack, CfnOutput, Duration, RemovalPolicy, Tags, SecretValue } from 'aws-cdk-lib';
import { Vpc, SecurityGroup, SubnetType, InstanceType, InstanceClass, InstanceSize } from 'aws-cdk-lib/aws-ec2';

interface RdsDatabaseStackProps extends StackProps {
    readonly vpc: Vpc;
    readonly rdsSecurityGroup: SecurityGroup;
}

export class RdsDatabaseStack extends Stack {
    private readonly vpc: Vpc;
    private readonly DB_INSTANCE_IDENTIFIER: string = 'adotjavadbv2';
    public readonly rdsInstance: DatabaseInstance;
    public readonly dbSecret: Secret;

    constructor(scope: Construct, id: string, props: RdsDatabaseStackProps) {
        super(scope, id, props);

        this.vpc = props.vpc;

        // Create DB Subnet Group
        const dbSubnetGroup = new SubnetGroup(this, 'MyDBSubnetGroupV2', {
            vpc: this.vpc,
            description: 'Subnet group for RDS',
            subnetGroupName: 'my-db-subnet-group-v2',
            vpcSubnets: {
                subnetType: SubnetType.PUBLIC, // Ensure private subnets with NAT are used
            },
            removalPolicy: RemovalPolicy.DESTROY,
        });

        // Create a Secret for the database credentials
        this.dbSecret = new Secret(this, 'DBSecretv2', {
            secretName: 'PetClinicDBCredentialsv2',
            secretStringValue: SecretValue.unsafePlainText(
                JSON.stringify({
                    username: 'admin',
                    password: '123abc1E2517DB', // Replace with your desired password
                }),
            ),
        });

        // Create database instance
        this.rdsInstance = new DatabaseInstance(this, 'MyDatabasev2', {
            vpc: this.vpc,
            credentials: Credentials.fromSecret(this.dbSecret),
            vpcSubnets: {
                subnetType: SubnetType.PUBLIC, // Ensure private subnets with NAT are used
            },
            publiclyAccessible: true,
            instanceIdentifier: this.DB_INSTANCE_IDENTIFIER,
            instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO), // db.t3.micro
            engine: DatabaseInstanceEngine.mysql({
                version: MysqlEngineVersion.VER_8_0, // Using MySQL 8.0
            }),
            port: 3306,
            allocatedStorage: 20, // 20 GB allocated storage
            maxAllocatedStorage: 25,
            storageType: StorageType.GP2,
            subnetGroup: dbSubnetGroup,
            securityGroups: [props.rdsSecurityGroup],
            multiAz: false, // Disable Multi-AZ
            backupRetention: Duration.days(0), // 0 days backup retention
            removalPolicy: RemovalPolicy.DESTROY, // For dev/testing environments
            deletionProtection: false, // Disable deletion protection
            deleteAutomatedBackups: true,
            databaseName: this.DB_INSTANCE_IDENTIFIER, // Add this line to create the database
        });

        Tags.of(this.rdsInstance).add('Name', this.DB_INSTANCE_IDENTIFIER);

        // Output the subnet group name
        // new CfnOutput(this, 'DBSubnetGroupName', {
        //     value: dbSubnetGroup.subnetGroupName,
        // });
    }
}
