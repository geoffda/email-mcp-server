import express from "express";
import statusRouter from "./routes/status.js";
import { errorHandler } from "./middleware/error-handler.js";
import { startMcpServer } from "./mcp/server.js";

export function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;

  startMcpServer(app);
  app.use(express.json());

  // Register routes
  app.use("/api", statusRouter);

  app.get("/", (req, res) => {
    res.json({ status: "ok", message: "MCP server running" });
  });

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  app.use(errorHandler);
}
