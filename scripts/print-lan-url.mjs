import os from "node:os";

const port = process.env.PORT || "8787";
const interfaces = os.networkInterfaces();
const urls = [];

for (const [name, entries] of Object.entries(interfaces)) {
  for (const entry of entries || []) {
    if (entry.family === "IPv4" && !entry.internal) {
      urls.push({ name, url: `http://${entry.address}:${port}` });
    }
  }
}

if (urls.length === 0) {
  console.log(`No LAN IPv4 address found. Local URL: http://localhost:${port}`);
} else {
  console.log("Open one of these URLs on the host display:");
  for (const item of urls) {
    console.log(`- ${item.name}: ${item.url}`);
  }
}
