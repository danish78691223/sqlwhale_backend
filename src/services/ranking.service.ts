import Task from "../models/Task.js";
import TaskCompletion from "../models/TaskCompletion.js";
import User from "../models/User.js";

const POINTS_BY_DIFFICULTY = {
  Easy: 10,
  Medium: 15,
  Hard: 20,
} as const;

export type LeaderboardEntry = {
  rank: number;
  name: string;
  completedTasks: number;
  points: number;
};

export type LeaderboardResult = {
  top10: LeaderboardEntry[];
  currentUser: LeaderboardEntry | null;
  totalRankedUsers: number;
  pointsScale: typeof POINTS_BY_DIFFICULTY;
};

export async function getLeaderboard(
  currentUserLocalId?: string | null,
): Promise<LeaderboardResult> {
  const completions = await TaskCompletion.find({})
    .select("localUserId taskId pointsAwarded")
    .lean()
    .exec();

  if (completions.length === 0) {
    return {
      top10: [],
      currentUser: null,
      totalRankedUsers: 0,
      pointsScale: POINTS_BY_DIFFICULTY,
    };
  }

  const taskIds = [...new Set(completions.map((completion: any) => String(completion.taskId)))];
  const localUserIds = [...new Set(completions.map((completion: any) => completion.localUserId))];

  const [tasks, users] = await Promise.all([
    Task.find({ _id: { $in: taskIds } })
      .select("_id difficulty")
      .lean()
      .exec(),
    User.find({
      localUserId: { $in: localUserIds },
      role: "user",
    })
      .select("localUserId name")
      .lean()
      .exec(),
  ]);

  const taskById = new Map(tasks.map((task: any) => [String(task._id), task]));
  const userByLocalId = new Map(
    users.map((user: any) => [user.localUserId, user]),
  );

  const aggregate = new Map<
    string,
    { name: string; completedTasks: number; points: number }
  >();

  for (const completion of completions as any[]) {
    const user = userByLocalId.get(completion.localUserId);
    const task = taskById.get(String(completion.taskId));

    if (!user || !task) continue;

    const storedPoints =
      typeof completion.pointsAwarded === "number" && completion.pointsAwarded > 0
        ? completion.pointsAwarded
        : POINTS_BY_DIFFICULTY[task.difficulty as keyof typeof POINTS_BY_DIFFICULTY] ??
          POINTS_BY_DIFFICULTY.Easy;

    const current = aggregate.get(completion.localUserId) ?? {
      name: user.name,
      completedTasks: 0,
      points: 0,
    };

    current.completedTasks += 1;
    current.points += storedPoints;
    aggregate.set(completion.localUserId, current);
  }

  const ranked = [...aggregate.entries()]
    .map(([localUserId, stats]) => ({
      localUserId,
      ...stats,
    }))
    .filter((entry) => entry.completedTasks > 0)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.completedTasks - a.completedTasks ||
        a.name.localeCompare(b.name),
    )
    .map((entry, index) => ({
      localUserId: entry.localUserId,
      rank: index + 1,
      name: entry.name,
      completedTasks: entry.completedTasks,
      points: entry.points,
    }));

  const top10 = ranked.slice(0, 10).map(({ localUserId: _localUserId, ...entry }) => entry);

  const current = currentUserLocalId
    ? ranked.find((entry) => entry.localUserId === currentUserLocalId)
    : null;

  return {
    top10,
    currentUser: current
      ? (({ localUserId: _localUserId, ...entry }) => entry)(current)
      : null,
    totalRankedUsers: ranked.length,
    pointsScale: POINTS_BY_DIFFICULTY,
  };
}
