import { Router, type IRouter } from "express";
import healthRouter from "./health";
import servicesRouter from "./services";
import availabilityRouter from "./availability";
import bookingsRouter from "./bookings";
import adminRouter from "./admin";
import locationsRouter from "./locations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(servicesRouter);
router.use(availabilityRouter);
router.use(bookingsRouter);
router.use(adminRouter);
router.use(locationsRouter);

export default router;
