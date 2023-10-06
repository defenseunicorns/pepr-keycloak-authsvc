import { kind } from "pepr";

class CustomSecret {
  metadata?: kind.Secret["metadata"];
  private apiVersion?: string;
  private kind?: string;
  private type?: string;
  private stringData?: { [key: string]: string };
  private data: { [key: string]: string | Buffer };

  constructor(secret: kind.Secret) {
    this.metadata = secret.metadata;
    this.apiVersion = secret.apiVersion;
    this.kind = secret.kind;
    this.type = secret.type;
    this.stringData = secret.stringData;
    this.data = {};

    if (secret.data) {
      for (const [key, value] of Object.entries(secret.data)) {
        const decoded = Buffer.from(value, "base64");
        try {
          this.data[key] = decoded.toString("utf-8");
        } catch {
          this.data[key] = decoded;
        }
      }
    }
  }

  // return secret data based on key value
  getData(key: string): string | Buffer | undefined {
    return this.data[key];
  }

  // set new secret data by providing key and value
  setData(key: string, value: string | Buffer): void {
    this.data[key] = value;
  }

  // return a V1Secret
  getSecret(): kind.Secret {
    const secret: kind.Secret = {
      metadata: this.metadata,
      apiVersion: this.apiVersion,
      kind: this.kind,
      type: this.type,
      stringData: this.stringData,
      data: {},
    };

    for (const [key, value] of Object.entries(this.data)) {
      if (typeof value === "string") {
        secret.data![key] = Buffer.from(value).toString("base64");
      } else if (value instanceof Buffer) {
        secret.data![key] = value.toString("base64");
      }
    }

    return secret;
  }
}

// Export a testing instance
export function createCustomSecret(secret: kind.Secret): CustomSecret {
  return new CustomSecret(secret);
}
