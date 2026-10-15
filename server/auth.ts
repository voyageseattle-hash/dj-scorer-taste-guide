import type { Request, Response } from "express";
export interface Identity { uid: string; email: string; verified: boolean; token: string; admin: boolean }
// This standalone copy never connects to the private app's Firebase project.
// The demo server supplies an anonymous, owner-bound session authenticator.
export async function verifyRequest(_req: Request, res: Response): Promise<Identity | null> {
  res.status(503).json({ error: "The demo session service is unavailable." });
  return null;
}
