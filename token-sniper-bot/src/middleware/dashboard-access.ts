import type { NextFunction, Request, Response } from "express";
import { config } from "../config/environment";

export const dashboardAccessMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const token = config.dashboard.accessToken.trim();

  if (!token) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (header === `Bearer ${token}`) {
    next();
    return;
  }

  res.status(401).json({
    error: "Dashboard access denied. Set Authorization: Bearer <DASHBOARD_ACCESS_TOKEN>.",
  });
};
