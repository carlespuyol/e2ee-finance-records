// Plaintext shape — only exists in browser memory, never sent to server
export interface FinanceRecord {
  productName: string;
  price: number;
  seller: string;
  salesPerson: string;
  time: string; // ISO 8601
}

// Decrypted record augmented with server-side metadata
export interface DecryptedRecord extends FinanceRecord {
  id: number;
  createdAt: string;
}

// What the server stores and returns (opaque ciphertext)
export interface StoredEncryptedRecord {
  id: number;
  encryptedData: string; // Base64 AES-256-GCM ciphertext
  iv: string;            // Base64 12-byte IV
  createdAt: string;
}
