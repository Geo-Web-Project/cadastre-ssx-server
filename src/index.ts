import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { SiweMessage } from "siwe";
import { create } from "@web3-storage/w3up-client";
import { StoreConf } from "@web3-storage/access";
import * as UCANDID from "@ipld/dag-ucan/did";
import * as UCAN from "@ipld/dag-ucan";
import { CarWriter } from "@ipld/car";
import { Readable } from "stream";
import * as Block from "multiformats/block";
import { sha256 as hasher } from "multiformats/hashes/sha2";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001;

app.set("trust proxy", process.env.TRUST_PROXY ?? "loopback");

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

app.use(express.json());

// Get a delegation for W3up storage
app.post("/delegations/storage", async (req: Request, res: Response) => {
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

  const { siwe, signature } = req.body;
  const siweMessage = new SiweMessage(siwe);

  try {
    await siweMessage.verify({ signature: signature });
  } catch (error: any) {
    return res.status(401).json({ message: error.message });
  }

  const w3upClient = await w3upClientP;
  const didAud = UCANDID.parse(siweMessage.uri);

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

// Get a delegation for Claim Referral
app.post("/delegations/claim-referral", async (req: Request, res: Response) => {
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

  const { siwe, signature } = req.body;
  const siweMessage = new SiweMessage(siwe);

  try {
    await siweMessage.verify({ signature: signature });
  } catch (error: any) {
    return res.status(401).json({ message: error.message });
  }

  const w3upClient = await w3upClientP;
  const didAud = UCANDID.parse(siweMessage.uri);
  const didPkh = UCANDID.parse(
    `did:pkh:eip155:${siweMessage.chainId}:${siweMessage.address}`
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
  const claimReferralDelegationBlock = await Block.encode({
    value: claimReferralDelegation,
    codec: UCAN,
    hasher,
  });

  const { writer, out } = CarWriter.create([claimReferralDelegationBlock.cid]);

  writer.put({
    cid: claimReferralDelegationBlock.cid,
    bytes: claimReferralDelegationBlock.bytes,
  });

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
