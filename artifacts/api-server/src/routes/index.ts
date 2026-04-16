import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai";
import marketingRouter from "./marketing";
import calendarRouter from "./calendar";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/openai", openaiRouter);
router.use(marketingRouter);
router.use(calendarRouter);

export default router;
