import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai";
import marketingRouter from "./marketing";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/openai", openaiRouter);
router.use(marketingRouter);

export default router;
