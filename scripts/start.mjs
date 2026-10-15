process.env.NODE_ENV = "production";
const { start } = await import("../server.mjs");
await start();
