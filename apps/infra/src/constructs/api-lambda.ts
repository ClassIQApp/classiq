import { NodeLambda } from "./node-lambda.ts";
import { CorsHttpMethod, DomainName, HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import type { IHostedZone } from "aws-cdk-lib/aws-route53";
import { ARecord, RecordTarget } from "aws-cdk-lib/aws-route53";
import { ApiGatewayv2DomainProperties } from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import { fileURLToPath } from "node:url";

const apiZip = fileURLToPath(new URL("../../../api/dist/lambda.zip", import.meta.url));

export interface ApiLambdaProps {
    readonly domainName: string;
    readonly hostedZone: IHostedZone;
    readonly allowedOrigin: string;
}

export class ApiLambda extends Construct {
    public readonly api: HttpApi;

    constructor(scope: Construct, id: string, { domainName, hostedZone, allowedOrigin }: ApiLambdaProps) {
        super(scope, id);

        const handler = new NodeLambda(this, "Fn", {
            functionName: `${id}-fn`,
            codePath: apiZip,
        });

        const certificate = new Certificate(this, "Certificate", {
            domainName,
            validation: CertificateValidation.fromDns(hostedZone),
        });

        const apiDomainName = new DomainName(this, "DomainName", {
            domainName,
            certificate,
        });

        this.api = new HttpApi(this, "Api", {
            defaultIntegration: new HttpLambdaIntegration("ApiIntegration", handler),
            defaultDomainMapping: {
                domainName: apiDomainName,
            },
            corsPreflight: {
                allowOrigins: [allowedOrigin],
                allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PUT, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS],
                allowHeaders: ["Content-Type", "Authorization"],
            },
        });

        new ARecord(this, "ApiAliasRecord", {
            zone: hostedZone,
            recordName: domainName,
            target: RecordTarget.fromAlias(
                new ApiGatewayv2DomainProperties(apiDomainName.regionalDomainName, apiDomainName.regionalHostedZoneId),
            ),
        });
    }
}
