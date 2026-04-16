import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai";
import marketingRouter from "./marketing";
import calendarRouter from "./calendar";
import chatProjectsRouter from "./chat-projects";
import whatsappRouter from "./whatsapp";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/openai", openaiRouter);
router.use(marketingRouter);
router.use(calendarRouter);
router.use(chatProjectsRouter);
router.use(whatsappRouter);

export default router;
