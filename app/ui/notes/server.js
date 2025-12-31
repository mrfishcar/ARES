const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 4173;
const publicDir = __dirname;

app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Notes UI running at http://localhost:${port}`);
});
