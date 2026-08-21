import type { Response } from "express";
import type { AuthenticatedRequest } from "../src/middleware/auth";

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

  it("uses the development enterprise identity without a bearer token", async () => {
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

    await authMiddleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(request.user).toEqual({
      id: "dev-user",
      walletAddress: "dev-wallet",
      subscriptionTier: "enterprise",
    });
    expect(response.status).not.toHaveBeenCalled();
  });

  it("keeps authentication required outside development", async () => {
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

    await authMiddleware(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error: "Access token required",
    });
  });
});
