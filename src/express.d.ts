import "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: Record<string, unknown>;
  }
}
