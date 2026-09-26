import { Stack, type StackProps } from "aws-cdk-lib";
import { Certificate, type ICertificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";

export interface CloudFrontCertificateStackProps extends StackProps {
    readonly domainName: string;
}

export class CloudFrontCertificateStack extends Stack {
    public readonly certificate: ICertificate;

    constructor(scope: Construct, id: string, { domainName, ...props }: CloudFrontCertificateStackProps) {
        super(scope, id, {
            ...props,
            env: {
                ...props.env,
                region: "us-east-1",
            },
            crossRegionReferences: true,
        });

        const hostedZone = HostedZone.fromLookup(this, "HostedZone", { domainName });

        this.certificate = new Certificate(this, "Certificate", {
            domainName,
            validation: CertificateValidation.fromDns(hostedZone),
        });
    }
}
