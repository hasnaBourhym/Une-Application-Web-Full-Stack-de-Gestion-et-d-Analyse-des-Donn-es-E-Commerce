import express from "express";
import { login, getMe } from "../controllers/authController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/login", login);
router.get("/me", protect, getMe);
router.get("/admin", protect, authorize("admin", "superadmin"), (req, res) => {
  res.json({ message: `Bienvenue Admin ${req.user.name} !` });
});

export default router;