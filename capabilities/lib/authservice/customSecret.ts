import { kind } from "pepr";

export class CustomSecret {
  metadata?: kind.Secret["metadata"];

  private stringData?: { [key: string]: string };
  private data: { [key: string]: string | Buffer };

  constructor(secret: kind.Secret) {
    this.metadata = secret.metadata;

    this.stringData = secret.stringData;
    this.data = {};

    for (const [key, value] of Object.entries(secret.data || [])) {
      try {
        const encoded = Buffer.from(value, "base64");
        try {
          this.data[key] = Buffer.from(value, "base64").toString("utf-8");
        } catch {
          this.data[key] = encoded;
        }
      } catch {
        this.data[key] = value;
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

  // return secret string data based on key value
  getStringData(key: string): string {
    return this.data[key].toString();
  }

  // return a V1Secret
  getSecret(): kind.Secret {
    const secret: kind.Secret = {
      apiVersion: "v1",
      kind: "Secret",
      metadata: this.metadata,
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
