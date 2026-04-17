import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai";
import marketingRouter from "./marketing";
import calendarRouter from "./calendar";
import chatProjectsRouter from "./chat-projects";
import whatsappRouter from "./whatsapp";
import insightsRouter from "./insights";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Gate internal endpoints behind a valid Clerk session. We scope requireAuth
// to explicit path prefixes so that /health and /whatsapp/webhook stay
// reachable without a session. The WhatsApp router additionally enforces auth
// internally for everything except its public webhook.
router.use(
  ["/openai", "/marketing", "/calendar", "/chat-projects", "/conversations", "/insights"],
  requireAuth,
);

router.use(healthRouter);
router.use("/openai", openaiRouter);
router.use(marketingRouter);
router.use(calendarRouter);
router.use(chatProjectsRouter);
router.use(whatsappRouter);
router.use("/insights", insightsRouter);

export default router;
