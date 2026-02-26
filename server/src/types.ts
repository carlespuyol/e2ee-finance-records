export interface User {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface EncryptedRecord {
  id: number;
  user_id: number;
  encrypted_data: string;
  iv: string;
  created_at: string;
}

export interface JwtPayload {
  userId: number;
  email: string;
}

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
