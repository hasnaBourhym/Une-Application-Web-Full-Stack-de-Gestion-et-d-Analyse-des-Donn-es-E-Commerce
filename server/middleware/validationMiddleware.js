import { body, validationResult } from "express-validator";

// Règles de validation pour l'inscription d'un nouvel utilisateur
export const validateRegister = [
  body("name").notEmpty().withMessage("Le nom est requis"),
  body("email").isEmail().withMessage("Email invalide"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Le mot de passe doit contenir au moins 6 caractères"),
  body("phoneNumber")
    .optional()
    .isMobilePhone()
    .withMessage("Numéro de téléphone invalide"),
];

// Règles de validation pour la connexion
export const validateLogin = [
  body("email").isEmail().withMessage("Un email valide est requis"),
  body("password").notEmpty().withMessage("Le mot de passe est requis"),
];

// Gestionnaire des erreurs (retourne un format standard)
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};