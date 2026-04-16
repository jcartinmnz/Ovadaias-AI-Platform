import { Router } from "express";
import conversationsRouter from "./conversations";

const router = Router();

router.use(conversationsRouter);

export default router;
