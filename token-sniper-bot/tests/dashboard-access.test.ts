const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
  jest.resetModules();
});

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

const loadMiddleware = async () => {
  const mod = await import("../src/middleware/dashboard-access");
  return mod.dashboardAccessMiddleware;
};

describe("dashboardAccessMiddleware", () => {
  it("allows the request when no access token is configured", async () => {
    process.env = { ...originalEnv };
    delete process.env.DASHBOARD_ACCESS_TOKEN;
    jest.resetModules();
    const middleware = await loadMiddleware();
    const next = jest.fn();
    const req: any = { headers: {} };
    middleware(req, mockRes() as any, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("allows the request with a valid Bearer token", async () => {
    process.env = { ...originalEnv, DASHBOARD_ACCESS_TOKEN: "secret-token" };
    jest.resetModules();
    const middleware = await loadMiddleware();
    const next = jest.fn();
    const req: any = { headers: { authorization: "Bearer secret-token" } };
    middleware(req, mockRes() as any, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("denies the request with a wrong/missing token", async () => {
    process.env = { ...originalEnv, DASHBOARD_ACCESS_TOKEN: "secret-token" };
    jest.resetModules();
    const middleware = await loadMiddleware();

    const next = jest.fn();
    const denied = mockRes();
    middleware(
      { headers: { authorization: "Bearer wrong" } } as any,
      denied as any,
      next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(denied.statusCode).toBe(401);

    // Also reject when no header is present at all.
    const next2 = jest.fn();
    const denied2 = mockRes();
    middleware({ headers: {} } as any, denied2 as any, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(denied2.statusCode).toBe(401);
  });
});
