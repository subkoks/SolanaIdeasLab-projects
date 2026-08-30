import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/environment";
import { logger } from "../utils/logger";
import { parseAuthToken } from "../auth/parseAuthToken";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    walletAddress: string;
    subscriptionTier: string;
  };
}

export interface JWTPayload {
  userId: string;
  walletAddress: string;
  subscriptionTier: string;
  iat: number;
  exp: number;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (config.development.skipAuthInDev) {
    req.user = {
      id: "dev-user",
      walletAddress: "dev-wallet",
      subscriptionTier: "enterprise",
    };
    next();
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      res.status(401).json({ error: "Access token required" });
      return;
    }

    // Pin algorithm to HS256 for security
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ["HS256"]
    }) as JWTPayload;
    
    // Use the dual-read parser with additive issuer/audience validation
    req.user = parseAuthToken(decoded, config.jwt.issuer, config.jwt.audience);

    next();
  } catch (error) {
    logger.error("Auth middleware error:", error);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};