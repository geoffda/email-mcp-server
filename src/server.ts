import express from "express";

export function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;

  app.use(express.json());

  app.get("/", (req, res) => {
    res.json({ status: "ok", message: "MCP server running" });
  });

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}
