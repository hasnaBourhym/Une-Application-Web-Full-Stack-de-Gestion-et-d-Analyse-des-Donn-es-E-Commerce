/*import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
dotenv.config();

const run = async () => {
  // Connexion à la base de données
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connecté à la base de données...");

  const db = mongoose.connection.db;
  const users = await db.collection("users").find({}).toArray();

  let count = 0;

  for (const user of users) {
    // Si le mot de passe n'est pas chiffré (bcrypt commence toujours par $2b$)
    if (user.password && !user.password.startsWith("$2b$")) {
      const hashed = await bcrypt.hash(user.password, 10);
      await db.collection("users").updateOne(
        { _id: user._id },
        { $set: { password: hashed } }
      );
      count++;
      console.log(`Mot de passe chiffré pour : ${user.email}`);
    }
  }

  console.log(`\nTerminé ! ${count} mot(s) de passe ont été chiffrés.`);
  await mongoose.disconnect();
};

run().catch(console.error);*/