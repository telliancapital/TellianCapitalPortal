import { CognitoIdentityProviderClient, DescribeUserPoolCommand } from "@aws-sdk/client-cognito-identity-provider";

// Manually define the config for the scratch script to avoid "server-only" issues
const region = process.env.AWS_COGNITO_REGION || "eu-central-1";
const userPoolId = process.env.AWS_COGNITO_USER_POOL_ID;

if (!userPoolId) {
  console.error("Missing AWS_COGNITO_USER_POOL_ID environment variable");
  process.exit(1);
}

const client = new CognitoIdentityProviderClient({ region });

async function main() {
  try {
    const res = await client.send(
      new DescribeUserPoolCommand({
        UserPoolId: userPoolId,
      }),
    );
    console.log("--- User Pool Schema Attributes ---");
    console.log(JSON.stringify(res.UserPool?.SchemaAttributes, null, 2));
  } catch (err) {
    console.error("Error describing user pool:", err);
  }
}

main();
