// routes/exportRoutes.js
import express from "express";
import {
  exportDashboardPDF,
  exportDashboardExcel
} from "../controllers/exportController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/dashboard/pdf", protect, exportDashboardPDF);
router.get("/dashboard/excel", protect, exportDashboardExcel);

export default router;