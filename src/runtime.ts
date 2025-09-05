import * as process from "node:process";

export type Context = {
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

export type Handler<A> = (
  event: A,
  context: Context,
) => unknown | Promise<unknown>;

const RUNTIME_API = process.env["AWS_LAMBDA_RUNTIME_API"];

function toErrorPayload(err: unknown) {
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    errorType: e.name || "Error",
    errorMessage: e.message ?? String(err),
    stackTrace: (e.stack ?? "").split("\n").map((s) => s.trim()),
  };
}

async function post(url: string, payload: unknown) {
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

async function reportInitError(err: unknown) {
  if (!RUNTIME_API) return;
  try {
    await post(
      `http://${RUNTIME_API}/2018-06-01/runtime/init/error`,
      toErrorPayload(err),
    );
  } catch { /* noop */ }
}

async function getNext() {
  const res = await fetch(
    `http://${RUNTIME_API}/2018-06-01/runtime/invocation/next`,
  );
  const requestId = res.headers.get("Lambda-Runtime-Aws-Request-Id")!;
  const trace = res.headers.get("Lambda-Runtime-Trace-Id");
  const invokedArn = res.headers.get("Lambda-Runtime-Invoked-Function-Arn") ??
    undefined;
  const deadlineMsStr = res.headers.get("Lambda-Runtime-Deadline-Ms") ??
    `${Date.now() + 3000}`;
  const clientContext = res.headers.get("Lambda-Runtime-Client-Context");
  const identity = res.headers.get("Lambda-Runtime-Cognito-Identity");
  const event = await res.json();

  if (trace) process.env["_X_AMZN_TRACE_ID"] = trace;

  return {
    requestId,
    invokedArn,
    deadlineMs: Number(deadlineMsStr),
    clientContext: clientContext ? JSON.parse(clientContext) : undefined,
    identity: identity ? JSON.parse(identity) : undefined,
    event,
  };
}

function buildContext(base: {
  requestId: string;
  invokedArn?: string;
  deadlineMs: number;
  clientContext?: unknown;
  identity?: unknown;
}): Context {
  return {
    awsRequestId: base.requestId,
    invokedFunctionArn: base.invokedArn,
    deadlineMs: base.deadlineMs,
    functionName: process.env["AWS_LAMBDA_FUNCTION_NAME"],
    functionVersion: process.env["AWS_LAMBDA_FUNCTION_VERSION"],
    memoryLimitInMB: process.env["AWS_LAMBDA_FUNCTION_MEMORY_SIZE"],
    logGroupName: process.env["AWS_LAMBDA_LOG_GROUP_NAME"],
    logStreamName: process.env["AWS_LAMBDA_LOG_STREAM_NAME"],
    clientContext: base.clientContext,
    identity: base.identity,
    getRemainingTimeInMillis() {
      return Math.max(0, base.deadlineMs - Date.now());
    },
  };
}

async function respond(requestId: string, result: unknown) {
  await post(
    `http://${RUNTIME_API}/2018-06-01/runtime/invocation/${requestId}/response`,
    result,
  );
}

async function respondError(requestId: string, err: unknown) {
  await post(
    `http://${RUNTIME_API}/2018-06-01/runtime/invocation/${requestId}/error`,
    toErrorPayload(err),
  );
}

export async function start<A>(handler: Handler<A>): Promise<never> {
  if (!RUNTIME_API) {
    await reportInitError(
      new Error("AWS_LAMBDA_RUNTIME_API is not set. Not on Lambda?"),
    );
    console.error("Not running in Lambda (AWS_LAMBDA_RUNTIME_API missing).");
    process.exit(1);
  }

  for (;;) {
    const next = await getNext();
    const ctx = buildContext(next);
    try {
      const out = await handler(next.event, ctx);
      await respond(next.requestId, out);
    } catch (e) {
      await respondError(next.requestId, e);
    }
  }
}
