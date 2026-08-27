import {
  createError,
  createValidationError,
  createNotFoundError,
  createUnauthorizedError,
  createForbiddenError,
  createConflictError,
  createRateLimitError,
  createServiceUnavailableError,
  asyncHandler,
  notFoundHandler,
  CustomError,
} from "../src/middleware/error-handler";

const mockRes = () => {
  const res: any = {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe("error factories", () => {
  it("createError sets message, statusCode, and isOperational", () => {
    const e = createError("boom", 418);
    expect(e).toBeInstanceOf(CustomError);
    expect(e.message).toBe("boom");
    expect(e.statusCode).toBe(418);
    expect(e.isOperational).toBe(true);
  });

  it("createError defaults to 500", () => {
    expect(createError("x").statusCode).toBe(500);
  });

  it("createValidationError uses 400", () => {
    const e = createValidationError("bad", { field: "a" });
    expect(e.statusCode).toBe(400);
    expect(e.details).toEqual({ field: "a" });
  });

  it("createNotFoundError builds a 404 message", () => {
    const e = createNotFoundError("Wallet");
    expect(e.statusCode).toBe(404);
    expect(e.message).toBe("Wallet not found");
  });

  it("createUnauthorizedError / Forbidden / Conflict / RateLimit / ServiceUnavailable", () => {
    expect(createUnauthorizedError().statusCode).toBe(401);
    expect(createForbiddenError().statusCode).toBe(403);
    expect(createConflictError().statusCode).toBe(409);
    expect(createRateLimitError().statusCode).toBe(429);
    expect(createServiceUnavailableError().statusCode).toBe(503);
  });
});

describe("asyncHandler", () => {
  it("passes through a resolved handler without calling next", async () => {
    const next = jest.fn();
    const handler = asyncHandler(async () => "ok");
    await handler({} as any, mockRes() as any, next);
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards a rejected promise to next", async () => {
    const next = jest.fn();
    const handler = asyncHandler(async () => {
      throw new Error("async failure");
    });
    await handler({} as any, mockRes() as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

describe("notFoundHandler", () => {
  it("creates a 404 and forwards it via next", () => {
    const next = jest.fn();
    const req: any = { originalUrl: "/missing" };
    notFoundHandler(req, mockRes() as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as CustomError;
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("/missing");
  });
});
