import { kind } from "pepr";

export class CustomSecret {
  metadata?: kind.Secret["metadata"];

  private stringData?: { [key: string]: string };
  private data: { [key: string]: string };

  constructor(secret: kind.Secret) {
    this.metadata = secret.metadata;

    this.stringData = secret.stringData;
    this.data = {};

    for (const [key, value] of Object.entries(secret.data || [])) {
      try {
        const decodedValue = atob(value);

        if (this.isValidASCII(decodedValue)) {
          this.data[key] = decodedValue;
        } else {
          this.data[key] = value;
        }
      } catch {
        this.data[key] = value;
      }
    }
  }

  // set new secret data by providing key and value
  setData(key: string, value: string): void {
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
      secret.data![key] = Buffer.from(value).toString("base64");
    }

    return secret;
  }

  // Check if the decoded value is valid UTF-8
  // using Buffer.from and ASCHII regex ranges don't work
  isValidASCII(input) {
    for (let i = 0; i < input.length; i++) {
      const charCode = input.charCodeAt(i);
      if (charCode < 0x00 || charCode > 0x7f) {
        return false;
      }
    }
    return true;
  }
}
