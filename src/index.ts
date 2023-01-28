import express, { Express } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { SSXServer, SSXExpressMiddleware } from "@spruceid/ssx-server";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001;

const ssx = new SSXServer({
  signingKey: process.env.SSX_SIGNING_KEY,
  providers: {
    metrics: {
      service: "ssx",
      apiKey: process.env.SSX_API_TOKEN ?? "",
    },
  },
});

app.use(
  cors({
    credentials: true,
    origin: true,
  })
);

app.use(SSXExpressMiddleware(ssx));

// app.get("/userdata", async (req: Request, res: Response) => {
//   if (!req.ssx.verified) {
//     return res.status(401).json({ success: false, message: "Unauthorized" });
//   }
//
//   const data = await getDataFromNode(req.ssx.siwe?.address);
//
//   res.json({
//     success: true,
//     userId: req.ssx.siwe?.address,
//     message:
//       "Some user data, retrieved from a blockchain node the server can access.",
//     ...data,
//   });
// });

app.use((req, res) => {
  if (!res.headersSent) {
    res.status(404).json({ message: "Invalid API route", success: false });
  }
});

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
