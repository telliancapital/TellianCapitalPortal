const { CognitoIdentityProviderClient, DescribeUserPoolCommand } = require("@aws-sdk/client-cognito-identity-provider");

const region = process.env.AWS_COGNITO_REGION || "eu-central-1";
const userPoolId = process.env.AWS_COGNITO_USER_POOL_ID;

if (!userPoolId) {
    console.error("Missing AWS_COGNITO_USER_POOL_ID");
    process.exit(1);
}

const client = new CognitoIdentityProviderClient({ region });

async function main() {
    try {
        const res = await client.send(new DescribeUserPoolCommand({ UserPoolId: userPoolId }));
        const schema = res.UserPool.SchemaAttributes;
        console.log("Writable attributes:");
        schema.filter(a => a.Mutable).forEach(a => console.log(`- ${a.Name} (${a.AttributeDataType})`));
    } catch (err) {
        console.error(err);
    }
}

main();
