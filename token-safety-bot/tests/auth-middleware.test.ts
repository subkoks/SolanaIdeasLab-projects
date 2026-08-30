import type { Response } from "express";
import type { AuthenticatedRequest } from "../src/types/auth";

const originalEnv = process.env;

const createResponse = (): Response =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }) as unknown as Response;

describe("authentication middleware development bypass", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("uses the development enterprise identity without a bearer token", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      SKIP_AUTH_IN_DEV: "true",
    };
    jest.resetModules();
    const { authMiddleware } =
      require("../src/middleware/auth") as typeof import("../src/middleware/auth");
    const request = { headers: {} } as AuthenticatedRequest;
    const response = createResponse();
    const next = jest.fn();

    authMiddleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(request.user).toEqual({
      id: "dev-user",
      walletAddress: "dev-wallet",
      subscriptionTier: "enterprise",
    });
    expect(response.status).not.toHaveBeenCalled();
  });

  it("keeps authentication required outside development", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "staging",
      SKIP_AUTH_IN_DEV: "true",
    };
    jest.resetModules();
    const { authMiddleware } =
      require("../src/middleware/auth") as typeof import("../src/middleware/auth");
    const request = { headers: {} } as AuthenticatedRequest;
    const response = createResponse();
    const next = jest.fn();

    authMiddleware(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error: "Access token required",
    });
  });
});

describe("authentication middleware valid JWT", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("accepts a token signed with the configured secret", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      SKIP_AUTH_IN_DEV: "false",
    };
    jest.resetModules();
    // Default dev secret from environment.ts when JWT_SECRET is unset.
    const jwt = require("jsonwebtoken");
    const secret = process.env.JWT_SECRET ?? "token-safety-bot-dev-secret";
    const token = jwt.sign(
      {
        userId: "user-123",
        walletAddress: "wallet-abc",
        subscriptionTier: "pro",
      },
      secret,
      { expiresIn: "1h", algorithm: "HS256" },
    );

    const { authMiddleware } =
      require("../src/middleware/auth") as typeof import("../src/middleware/auth");
    const request = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest;
    const response = createResponse();
    const next = jest.fn();

    authMiddleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(request.user).toMatchObject({
      id: "user-123",
      walletAddress: "wallet-abc",
      subscriptionTier: "pro",
    });
    expect(response.status).not.toHaveBeenCalled();
  });

  it("rejects a token signed with the wrong secret", () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      SKIP_AUTH_IN_DEV: "false",
    };
    jest.resetModules();
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      { userId: "u", walletAddress: "w", subscriptionTier: "free" },
      "not-the-right-secret",
      { expiresIn: "1h" },
    );

    const { authMiddleware } =
      require("../src/middleware/auth") as typeof import("../src/middleware/auth");
    const request = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest;
    const response = createResponse();
    const next = jest.fn();

    authMiddleware(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });
});
