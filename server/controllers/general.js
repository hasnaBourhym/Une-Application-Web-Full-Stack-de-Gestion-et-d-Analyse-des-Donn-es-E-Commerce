import User from "../models/User.js";
import OverallStat from "../models/OverallStat.js";
import Transaction from "../models/Transaction.js";

export const getUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    res.status(200).json(user);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const currentMonth = "April"; 
    const currentYear = 2026;
    const currentDay = "2026-04-25";

    const transactions = await Transaction.find().limit(50).sort({ createdAt: -1 });

    // rechercher uniquement les statistiques de l'année 2026
    const overallStat = await OverallStat.findOne({ year: currentYear });

    if (!overallStat) {
      // si aucune donnée n'est trouvée pour l'année, renvoyer seulement les transactions avec un message
      return res.status(200).json({ transactions, message: "Aucune donnée trouvée pour 2026" });
    }

    // extraire directement les données depuis l'objet
    const {
      totalCustomers,
      yearlyTotalSoldUnits,
      yearlySalesTotal,
      monthlyData,
      salesByCategory,
    } = overallStat;

    const thisMonthStats = overallStat.monthlyData.find(({ month }) => month === currentMonth);
    const todayStats = overallStat.dailyData.find(({ date }) => date === currentDay);

    res.status(200).json({
      totalCustomers,
      yearlyTotalSoldUnits,
      yearlySalesTotal,
      monthlyData,
      salesByCategory,
      thisMonthStats,
      todayStats,
      transactions,
    });
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};