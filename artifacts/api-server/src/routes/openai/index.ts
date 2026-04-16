import { Router } from "express";
import conversationsRouter from "./conversations";
import documentsRouter from "./documents";

const router = Router();

router.use(conversationsRouter);
router.use(documentsRouter);

export default router;
