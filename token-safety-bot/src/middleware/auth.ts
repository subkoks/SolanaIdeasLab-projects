import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/environment";
import type { AuthenticatedRequest, AuthenticatedUser } from "../types/auth";
import {
  classifyAuthTokenRejection,
  detectAuthTokenFormat,
  parseAuthToken,
} from "../auth/parseAuthToken";
import { logger } from "../utils/logger";

const getBearerToken = (
  authorizationHeader: string | undefined,
): string | null => {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
};

const getDevelopmentUser = (): AuthenticatedUser => ({
  id: "dev-user",
  walletAddress: "dev-wallet",
  subscriptionTier: "enterprise",
});

export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (config.development.skipAuthInDev) {
    req.user = getDevelopmentUser();
    next();
    return;
  }

  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({ error: "Access token required" });
    return;
  }

  try {
    // Pin algorithm to HS256; use dual-read parser for claim normalization
    const payload = jwt.verify(token, config.auth.jwtSecret, {
      algorithms: ["HS256"]
    });
    const format = detectAuthTokenFormat(payload);
    req.user = parseAuthToken(payload, config.auth.jwtIssuer, config.auth.jwtAudience);
    logger.info("jwt_verified", {
      event: "jwt_verified",
      format,
      bot: "token-safety-bot",
    });
    next();
  } catch (error) {
    logger.warn("jwt_rejected", {
      event: "jwt_rejected",
      reason: classifyAuthTokenRejection(error),
      bot: "token-safety-bot",
    });
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
