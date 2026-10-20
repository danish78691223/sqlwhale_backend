import { Router } from "express";
import crypto from "crypto";
import { getCurrentUser } from "../services/mongoAuth";
import Certificate from "../models/Certificate";

const router = Router();

// Demo credentials are account-bound but are NOT issued completion awards.
// The final issuing endpoint will separately verify course completion.
router.get("/mine", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

    const localUserId = String(user.localUserId);
    const courseKey = "sql-fundamentals";
    let certificate = await Certificate.findOne({ localUserId, courseKey, kind: "demo" }).lean().exec() as any;
    if (!certificate) {
      try {
        certificate = await Certificate.findOneAndUpdate(
          { localUserId, courseKey, kind: "demo" },
          { $setOnInsert: {
            localUserId, courseKey, kind: "demo",
            certificateId: crypto.randomBytes(12).toString("hex").toUpperCase(),
          } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean().exec();
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        certificate = await Certificate.findOne({ localUserId, courseKey, kind: "demo" }).lean().exec();
        if (!certificate) throw error;
      }
    }
    return res.json({ success: true, certificate: {
      certificateId: certificate.certificateId,
      learnerName: user.name,
      kind: certificate.kind,
      createdAt: certificate.createdAt,
    } });
  } catch (error) {
    console.error("Unable to load certificate:", error);
    return res.status(500).json({ success: false, error: "Unable to load certificate." });
  }
});
export default router;
