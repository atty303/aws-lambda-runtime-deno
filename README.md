# AWS Lambda Runtime for Deno

A lightweight, zero-dependency Deno library for AWS Lambda that implements the
[AWS Lambda Runtime API](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-api.html).

Designed for use with `deno compile` to create binaries deployable to AWS Lambda
using the
[provided.al2023](https://docs.aws.amazon.com/linux/al2023/ug/lambda.html)
runtime.

While
[aws-lambda-web-adapter](https://github.com/awslabs/aws-lambda-web-adapter) is
officially recommended by Deno for web applications, it requires an HTTP server.
This project enables you to create general-purpose Lambda functions in Deno for
services like EventBridge, SQS, and other non-HTTP event sources without the
overhead of an HTTP server.

## Installation

```typescript
import { start } from "jsr:@atty303/aws-lambda-runtime";
```

## Quick Start

Create a simple Lambda function:

```typescript
import { Context, Handler, start } from "jsr:@atty303/aws-lambda-runtime";

interface Event {
  name: string;
}

const handler: Handler<Event> = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Hello, ${event.name}!`,
      requestId: context.awsRequestId,
    }),
  };
};

start(handler);
```

## API Reference

### Types

#### `Handler<A>`

```typescript
type Handler<A> = (
  event: A,
  context: Context,
) => unknown | Promise<unknown>;
```

The main handler function type that processes Lambda events.

#### `Context`

```typescript
type Context = {
  awsRequestId: string;
  invokedFunctionArn?: string;
  deadlineMs: number;
  functionName?: string;
  functionVersion?: string;
  memoryLimitInMB?: string;
  logGroupName?: string;
  logStreamName?: string;
  clientContext?: unknown;
  identity?: unknown;
  getRemainingTimeInMillis(): number;
};
```

The Lambda context object containing runtime information.

### Functions

#### `start<A>(handler: Handler<A>): Promise<never>`

Starts the Lambda runtime with the provided handler function. This function runs
indefinitely, processing incoming Lambda invocations.

**Parameters:**

- `handler`: The function to handle Lambda events

**Example:**

```typescript
import { start } from "jsr:@atty303/aws-lambda-runtime";

const myHandler = async (event, context) => {
  // Your handler logic here
  return { success: true };
};

start(myHandler);
```

## Deployment

### Using AWS SAM

Create a `template.yaml`:

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31

Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Metadata:
      BuildMethod: makefile
    Properties:
      CodeUri: .
      Handler: bootstrap
      Runtime: provided.al2023
      Architectures:
        - arm64
      Environment:
        Variables:
          DENO_DIR: /tmp
```

Create a `Makefile`:

```Makefile
.PHONY: build-MyFunction

build-MyFunction:
	deno compile -A --target aarch64-unknown-linux-gnu -o $(ARTIFACTS_DIR)/bootstrap src/main.ts
```

Build and deploy with SAM:

```bash
sam deploy
```

### Using Terraform

You can use
[terraform-aws-modules/lambda/aws](https://registry.terraform.io/modules/terraform-aws-modules/lambda/aws/latest)
to build and deploy your function:

```hcl
module "my_lambda" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "~> 8"

  function_name         = "my-function"
  handler               = "bootstrap"
  runtime               = "provided.al2023"
  architectures         = ["arm64"]
  environment_variables = {
    DENO_DIR = "/tmp"
  }

  source_path = [{
    path = "function_dir"
    commands = [
      "set -e",
      "deno compile -A --target aarch64-unknown-linux-gnu --output dist/bootstrap src/main.ts",
      ":zip dist",
    ]
  }]
}
```

## Development

### Prerequisites

- [mise](https://mise.jdx.dev/) installed

```
mise install
hk install --mise
```
