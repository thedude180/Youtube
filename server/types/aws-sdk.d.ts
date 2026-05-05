/**
 * Type stubs for the optional @aws-sdk/client-s3 dependency.
 *
 * This package is NOT required — it is only used when S3_ENDPOINT,
 * S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET are all set.
 * If those env vars are absent the local-disk adapter is used instead
 * and this module is never imported at runtime.
 *
 * Install when you need S3:
 *   npm install @aws-sdk/client-s3
 */
declare module "@aws-sdk/client-s3" {
  export class S3Client {
    constructor(config: Record<string, unknown>);
    send(command: unknown): Promise<unknown>;
  }
  export class PutObjectCommand {
    constructor(input: Record<string, unknown>);
  }
  export class GetObjectCommand {
    constructor(input: Record<string, unknown>);
  }
  export class DeleteObjectCommand {
    constructor(input: Record<string, unknown>);
  }
}
