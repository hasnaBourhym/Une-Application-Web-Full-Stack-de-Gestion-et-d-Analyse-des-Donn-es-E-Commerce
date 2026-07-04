# 📚 GUIDE DE PRÉPARATION - SOUTENANCE

> **Dernière mise à jour:** Juin 2026

---

## 🔐 1. AUTHENTIFICATION JWT - 95% PROBABILITÉ

### Question probable :
> *"Expliquez comment fonctionne votre système d'authentification"*

### Réponse à maîtriser :

**JWT signifie "JSON Web Token"**. C'est un standard pour transmettre des données sécurisées entre client et serveur.

#### Comment ça marche dans votre projet :

1. **L'utilisateur se connecte** (email + mot de passe)
2. **Le serveur vérifie** les identifiants dans la base de données
3. **Si c'est correct**, le serveur crée un token JWT contenant :
   - L'ID de l'utilisateur
   - Son rôle (user/admin/superadmin)
   - Une date d'expiration
4. **Le client reçoit** ce token et le stocke (localStorage)
5. **Pour les requêtes suivantes**, le client envoie le token dans l'entête HTTP :
   ```
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
6. **Le serveur vérifie** le token à chaque requête avant de répondre

#### Avantages par rapport aux sessions :
| Sessions | JWT |
|----------|-----|
| Données stockées sur serveur | Sans état (stateless) |
| Nécessite une base sessions | Décentralisé |
| Difficile à scaler | Facile à scaler sur plusieurs serveurs |

---

## 🔒 2. SÉCURITÉ & CHIFFREMENT - 90% PROBABILITÉ

### Question probable :
> *"Montrez-moi comment vous protégez les mots de passe"*

### Réponse à maîtriser :

**bcryptjs** est une bibliothèque qui chiffre les mots de passe de manière irréversible.

#### Processus dans votre code :

**Avant : Stockage du mot de passe**
```javascript
// Dans User.js (avant de sauvegarder)
UserSchema.pre("save", async function (next) {
  const salt = await bcrypt.genSalt(10);  // ← Ajoute de la complexité
  this.password = await bcrypt.hash(this.password, salt);
  next();
});
```

**Pendant : Connexion d'un utilisateur**
```javascript
// Dans authController.js
const user = await User.findOne({ email }).select("+password");
const isMatch = await user.matchPassword(password);  // ← Comparaison sécurisée
if (!isMatch) return res.status(401).json({ message: "Incorrect" });
```

#### Pourquoi c'est sécurisé :
- ✅ Les mots de passe sont jamais stockés en texte clair
- ✅ Impossible de récupérer le mot de passe à partir du hash
- ✅ Même mot de passe = hash différent (grâce au "salt")
- ✅ Algorithme mathématiquement très coûteux pour les attaques

---

## 🛡️ 3. CONTRÔLE D'ACCÈS PAR RÔLES - 90% PROBABILITÉ

### Question probable :
> *"Comment gérez-vous les permissions d'accès ?"*

### Réponse à maîtriser :

Votre système utilise **RBAC** (Role-Based Access Control).

#### 3 rôles dans votre projet :

```
┌─────────────────────────────────────────────────────┐
│ superadmin: Accès à TOUT                           │
├─────────────────────────────────────────────────────┤
│ admin: Accès au dashboard et données de gestion     │
├─────────────────────────────────────────────────────┤
│ user: Accès limité (produits, profil)              │
└─────────────────────────────────────────────────────┘
```

#### Exemple de protection de route (Backend) :
```javascript
// Dans authRoutes.js
router.get("/admin", 
  protect,                                    // ← Authentification
  authorize("admin", "superadmin"),          // ← Autorisation par rôle
  (req, res) => { res.json({ ... }) }
);
```

#### Exemple de protection (Frontend - React) :
```javascript
// Dans App.js
const RoleRoute = ({ children, allowedRoles }) => {
  const user = useSelector((state) => state.auth.user);
  
  if (!user) return <Navigate to="/login" />;  // ← Pas connecté
  
  if (!allowedRoles.includes(user.role)) {
    // ← Rôle insuffisant
    return <Navigate to="/products" />;
  }
  
  return children;  // ← Accès autorisé
};
```

---

## 🏗️ 4. ARCHITECTURE REST API - 85% PROBABILITÉ

### Question probable :
> *"Expliquez l'organisation de votre backend"*

### Réponse à maîtriser :

Votre API suit le **pattern MVC** (Model-View-Controller) :

```
server/
├── routes/           ← Définit les endpoints HTTP
├── controllers/      ← Logique métier
├── models/           ← Schémas MongoDB
├── middleware/       ← Traitements intermédiaires
└── data/            ← Données initiales
```

#### Flux d'une requête HTTP :

```
1. Cliente envoie une requête
   ↓
2. Route (routes/general.js) reçoit
   ↓
3. Middlewares appliqués (authMiddleware)
   ↓
4. Controller (controllers/general.js) traite
   ↓
5. Model (models/User.js) interagit avec MongoDB
   ↓
6. Réponse JSON renvoyée
```

#### Exemple complet :

**Route :**
```javascript
// routes/general.js
router.get("/user/:id", getUser);
```

**Controller :**
```javascript
// controllers/general.js
export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    res.status(200).json(user);
  } catch (error) {
    res.status(404).json({ message: "Utilisateur non trouvé" });
  }
};
```

**Avantages :**
- ✅ Code organisé et maintenable
- ✅ Facile de tester chaque couche
- ✅ Réutilisabilité des controllers

---

## 📊 5. TECHNOLOGIES UTILISÉES

### Backend
```
Node.js + Express
├── Authentication: JWT + bcryptjs
├── Database: MongoDB + Mongoose
├── Sécurité: Helmet, CORS
└── Logging: Morgan
```

### Frontend
```
React + Redux
├── UI: Material-UI (@mui)
├── Graphiques: Nivo
├── HTTP: Axios
├── Routage: React Router v6
└── Export: html2canvas, jsPDF
```

---

## 🔍 6. QUESTIONS PIÈGES & RÉPONSES

### ❓ "Pourquoi utiliser MongoDB plutôt qu'une base relationnelle ?"
**Réponse :**
- MongoDB est flexible (schéma non rigide)
- Ideal pour les dashboards avec données dynamiques
- Scaling horizontal plus facile
- JSON natif = pas de mappage objet-relationnel

### ❓ "Que se passe-t-il si quelqu'un vole le JWT ?"
**Réponse :**
- Le token a une expiration (ex: 24h)
- En production, stocker le JWT dans httpOnly cookie (plus sécurisé)
- Implémenter une refresh token strategy
- Ajouter une liste noire (blacklist) des tokens révoqués

### ❓ "Comment gérez-vous les erreurs ?"
**Réponse :**
- Try/catch dans chaque controller
- Status codes HTTP appropriés (401, 403, 404, 500)
- Messages d'erreur clairs
- Logging avec Morgan

### ❓ "Pourquoi Redux au lieu du state local ?"
**Réponse :**
- État global pour l'utilisateur (login, rôle)
- Partage d'état entre composants sans prop drilling
- Debugging avec Redux DevTools
- Prédictibilité du flux de données

---

## 💡 7. POINTS FORTS À METTRE EN AVANT

1. ✅ **Authentification sécurisée** → JWT + bcrypt
2. ✅ **RBAC complet** → 3 rôles avec contrôles stricts
3. ✅ **Architecture propre** → MVC bien organisé
4. ✅ **Gestion des erreurs** → Try/catch + status codes
5. ✅ **Scalabilité** → Architecture sans état
6. ✅ **UI moderne** → Material-UI + Nivo charts
7. ✅ **Export de données** → PDF/Excel

---

## ⚠️ 8. POINTS À AMÉLIORER (Mentions probables)

**Si le jury demande :"Que feriez-vous différemment ?"**

- [ ] Ajouter des tests unitaires (Jest/Vitest)
- [ ] Implémenter une refresh token strategy
- [ ] Ajouter rate limiting (express-rate-limit)
- [ ] Validation plus stricte (joi/zod)
- [ ] Documentation API (Swagger/OpenAPI)
- [ ] Monitoring/Logging avancé (Winston)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Environnement de production optimisé

---

## 📝 CHECKLIST AVANT LA SOUTENANCE

- [ ] Relire ce document 3 fois
- [ ] Préparer des exemples concrets du code à montrer
- [ ] Pratiquer l'explication en 2 minutes
- [ ] Prévoir des questions pièges
- [ ] Avoir le projet en local pour démonstration
- [ ] Tester les routes API avec Postman/Insomnia
- [ ] Vérifier que le login fonctionne correctement
- [ ] Avoir le code bien commenté

---

## 🎤 SCRIPT DE PRÉSENTATION (2 minutes)

```
"Mon projet est un système de gestion de dashboard avec authentification sécurisée.

Il utilise JWT pour l'authentification - l'utilisateur se connecte, 
reçoit un token, puis l'envoie avec chaque requête pour prouver son identité.

Les mots de passe sont chiffrés avec bcryptjs avant d'être stockés en base.

L'accès aux données est contrôlé par rôle - un user normal ne peut voir 
que ses propres données, tandis qu'un admin accède au dashboard complet.

Le backend est organisé en couches : routes, controllers, models. 
Chaque couche a une responsabilité clairement définie.

Le frontend utilise React et Redux pour gérer l'état global, 
notamment l'authentification et les données utilisateur.

L'application affiche des graphiques dynamiques avec Nivo et permet 
l'export des données en PDF et Excel."
```

---

**Bonne chance à votre soutenance! 🚀**
