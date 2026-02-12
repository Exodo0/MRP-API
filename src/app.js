const express = require("express");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const safRoutes = require("./routes/v1/saf");
const apiKeyAuth = require("./middleware/auth");

const app = express();

app.use(bodyParser.json());
app.use(helmet());
app.use(cors());
const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use("/v1", limiter);

app.use("/v1/saf", apiKeyAuth, safRoutes);

app.get("/", (req, res) => {
  res.send("MXRP API is running.");
});

module.exports = app;
