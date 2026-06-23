export interface LocalCrypto {
  encrypt(data: unknown): Promise<unknown>;
  decrypt(data: unknown): Promise<unknown>;
}

export class NoOpCrypto implements LocalCrypto {
  async encrypt(data: unknown): Promise<unknown> {
    return data;
  }

  async decrypt(data: unknown): Promise<unknown> {
    return data;
  }
}

export const localCrypto: LocalCrypto = new NoOpCrypto();
