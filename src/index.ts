import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { SSXServer, SSXExpressMiddleware } from "@spruceid/ssx-server";
import { create } from "@web3-storage/w3up-client";
import { StoreConf } from "@web3-storage/access";
import * as UCANDID from "@ipld/dag-ucan/did";
import { CarWriter } from "@ipld/car";
import { Readable } from "stream";
import { createClient } from "redis";
import ConnectRedis from "connect-redis";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001;

const redisClient = createClient({
  legacyMode: true,
  url: process.env.REDIS_URL,
});
redisClient.connect();

redisClient.on("error", (err) => {
  console.error("Redis error: ", err);
});
redisClient.on("connect", () => {
  console.log("Redis connected!");
});

const ssx = new SSXServer({
  signingKey: process.env.SSX_SIGNING_KEY,
  providers: {
    metrics: {
      service: "ssx",
      apiKey: process.env.SSX_API_TOKEN ?? "",
    },
    sessionConfig: {
      sessionOptions: {
        cookie: {
          domain: process.env.SESSION_DOMAIN,
        },
      },
      store: (session) => {
        const redisStore = ConnectRedis(session);
        return new redisStore({
          client: redisClient,
        });
      },
    },
  },
});

const store = new StoreConf({
  profile: process.env.W3_STORE_NAME ?? "cadastre-ssx-server",
});
const w3upClientP = create({ store });

app.use(
  cors({
    credentials: true,
    origin: true,
  })
);

app.use(SSXExpressMiddleware(ssx));

app.post("/storage/delegation", async (req: Request, res: Response) => {
  if (!req.ssx.verified) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  if (!req.ssx.userId) {
    return res
      .status(400)
      .json({ success: false, message: "Could not parse userId from session" });
  }

  if (!req.body.aud) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required 'aud' from body" });
  }

  const w3upClient = await w3upClientP;
  const did = UCANDID.parse(req.body.aud);
  const delegation = await w3upClient.createDelegation(
    did,
    ["upload/add", "store/add"],
    { expiration: Math.floor(Date.now() / 1000) + 86400 } // +24 hours
  );

  const { writer, out } = CarWriter.create([delegation.root.cid as any]);
  // @ts-ignore
  for (const block of delegation.export()) {
    writer.put(block);
  }

  writer.close();

  res.setHeader("Content-Type", "application/vnd.ipld.car");
  Readable.from(out).pipe(res);
});

app.use((req, res) => {
  if (!res.headersSent) {
    res.status(404).json({ message: "Invalid API route", success: false });
  }
});

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
