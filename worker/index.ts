import { Hono } from "hono";
import type { AppEnv } from "./env";
import { apiMiddleware, handleError, requireSession } from "./middleware";
import { authRoutes } from "./routes/auth";
import { overviewRoutes } from "./routes/overview";
import { usersRoutes } from "./routes/users";
import { processesRoutes } from "./routes/processes";
import { batchesRoutes } from "./routes/batches";
import { assetsRoutes } from "./routes/assets";
import { scenariosRoutes } from "./routes/scenarios";
import { assignmentsRoutes } from "./routes/assignments";
import { attemptsRoutes } from "./routes/attempts";
import { conversationRoutes } from "./routes/conversation";
import { assessmentsRoutes } from "./routes/assessments";

const app = new Hono<AppEnv>();
app.use("/api/*", apiMiddleware);
app.onError(handleError);

// Public routes must be registered before the session requirement.
app.route("/api", authRoutes);
app.use("/api/*", requireSession);
app.route("/api", overviewRoutes);
app.route("/api", usersRoutes);
app.route("/api", processesRoutes);
app.route("/api", batchesRoutes);
app.route("/api", assetsRoutes);
app.route("/api", scenariosRoutes);
app.route("/api", assignmentsRoutes);
app.route("/api", attemptsRoutes);
app.route("/api", conversationRoutes);
app.route("/api", assessmentsRoutes);

app.all("/api/*", (c) => c.json({ error: "API endpoint not found." }, 404));
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));
export default app;
