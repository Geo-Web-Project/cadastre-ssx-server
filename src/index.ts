import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { SSXServer, SSXExpressMiddleware } from "@spruceid/ssx-server";
import { create } from "@web3-storage/w3up-client";
import { StoreConf } from "@web3-storage/access";
import * as UCANDID from "@ipld/dag-ucan/did";
import * as UCAN from "@ipld/dag-ucan";
import { CarWriter } from "@ipld/car";
import { Readable } from "stream";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001;

app.set("trust proxy", process.env.TRUST_PROXY ?? "loopback");

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
          sameSite: "none",
          secure: true,
        },
      },
    },
  },
});

const store = new StoreConf({
  profile: process.env.W3_STORE_NAME ?? "cadastre-ssx-server",
});
// Disable config writes
store.save = async (): Promise<void> => {};

const w3upClientP = create({ store });

app.use(
  cors({
    credentials: true,
    origin: true,
  })
);

app.use(SSXExpressMiddleware(ssx));

app.post("/delegations", async (req: Request, res: Response) => {
  if (!req.body) {
    res.status(422).json({ message: "Expected body." });
    return;
  }
  if (!req.body.signature) {
    res
      .status(422)
      .json({ message: "Expected the field `signature` in body." });
    return;
  }
  if (!req.body.siwe) {
    res.status(422).json({ message: "Expected the field `siwe` in the body." });
    return;
  }
  let ssxLoginResponse;
  try {
    ssxLoginResponse = await ssx.login(
      req.body.siwe,
      req.body.signature,
      req.body.daoLogin,
      req.body.resolveEns,
      req.session.nonce,
      req.body.resolveLens
    );
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
  const { success, error, session } = ssxLoginResponse;
  if (!success) {
    let message = error.type;
    if (error.expected && error.received) {
      message += ` Expected: ${error.expected}. Received: ${error.received}`;
    }
    return res.status(400).json({ message });
  }

  if (!req.body.aud) {
    return res
      .status(400)
      .json({ success: false, message: "Missing required 'aud' from body" });
  }

  const w3upClient = await w3upClientP;
  const didAud = UCANDID.parse(req.body.aud);
  const didPkh = UCANDID.parse(
    `did:pkh:eip155:${session.siwe.chainId}:${session.siwe.address}`
  );

  // Issue UCAN for claim referral
  const claimReferralDelegation = await UCAN.issue({
    issuer: w3upClient.agent(),
    audience: didAud,
    lifetimeInSeconds: 60 * 60 * 24 * 14,
    capabilities: [
      {
        can: "http/post",
        with: `https://geoweb.network/claim/${didPkh.did()}`,
      },
    ],
  });

  console.log(UCAN.format(claimReferralDelegation));

  // Issue UCAN for w3up
  const w3UpDelegation = await w3upClient.createDelegation(
    didAud,
    ["upload/add", "store/add"],
    { expiration: Math.floor(Date.now() / 1000) + 86400 } // +24 hours
  );

  const { writer, out } = CarWriter.create([w3UpDelegation.root.cid as any]);
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
