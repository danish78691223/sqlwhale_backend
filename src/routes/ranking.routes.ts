import { Router, type Request, type Response } from "express";
import { getCurrentUser } from "../services/mongoAuth";
import { getLeaderboard } from "../services/ranking.service";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    const leaderboard = await getLeaderboard(user?.localUserId);

    res.json({
      success: true,
      ...leaderboard,
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({
      success: false,
      error: "Unable to load SQLWhale rankings.",
    });
  }
});

export default router;
