import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import dataQualityRouter from "./dataQuality";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(dataQualityRouter);

export default router;
