// controllers/exportController.js
// ============================================================
//  ECOMVISION – Export PDF professionnel (version corrigée)
//  Graphiques dessinés nativement avec PDFKit
//  Aucune dépendance à canvas / chartjs-node-canvas
// ============================================================

import PDFDocument from "pdfkit";
import User        from "../models/User.js";
import Transaction from "../models/Transaction.js";
import OverallStat from "../models/OverallStat.js";
import Product     from "../models/Product.js";

// ─────────────────────────────────────────────────────────────
//  PALETTE DE COULEURS
// ─────────────────────────────────────────────────────────────
const C = {
  navy      : "#1a1a3e",
  gold      : "#f0c674",
  white     : "#ffffff",
  lightGray : "#f5f5f5",
  midGray   : "#e0e0e0",
  darkGray  : "#666666",
  textDark  : "#333333",
  blue      : "#4472C4",
  green     : "#70AD47",
  orange    : "#ED7D31",
  red       : "#C00000",
  purple    : "#7030A0",
  teal      : "#00B0F0",
};

const PIE_COLORS = [C.blue, C.green, C.orange, C.red, C.purple, C.teal, C.gold];

// ─────────────────────────────────────────────────────────────
//  HELPER – Sécuriser un nombre (évite NaN / undefined)
// ─────────────────────────────────────────────────────────────
const safe = (v, fallback = 0) => {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
};

// ─────────────────────────────────────────────────────────────
//  HELPER – Obtenir Y courant de façon sûre
//  pdfkit peut retourner NaN sur certaines pages → on force minY
// ─────────────────────────────────────────────────────────────
const getY = (doc, minY = 60) => {
  const y = doc.y;
  return isFinite(y) && y > 0 ? y : minY;
};

// ─────────────────────────────────────────────────────────────
//  HELPER – En-tête de section (bandeau marine + titre doré)
// ─────────────────────────────────────────────────────────────
const sectionHeader = (doc, title, sub = "") => {
  const y = getY(doc, 50);
  const h = sub ? 40 : 28;
  doc.rect(40, y, 515, h).fill(C.navy);
  doc.fillColor(C.gold).fontSize(12).font("Helvetica-Bold")
     .text(title, 52, y + 7);
  if (sub) {
    doc.fillColor("#aaaaaa").fontSize(8).font("Helvetica")
       .text(sub, 52, y + 24);
  }
  doc.y = y + h + 12;
};

// ─────────────────────────────────────────────────────────────
//  HELPER – Pied de page sur toutes les pages
// ─────────────────────────────────────────────────────────────
const addFooters = (doc) => {
  const total   = doc.bufferedPageRange().count;
  const dateStr = new Date().toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    doc.rect(0, 818, 595, 24).fill(C.navy);
    doc.fillColor(C.white).fontSize(7).font("Helvetica")
       .text(
         `ECOMVISION  –  Rapport confidentiel  |  ${dateStr}  |  Page ${i + 1} / ${total}`,
         40, 826, { align: "center", width: 515 }
       );
  }
};

// ─────────────────────────────────────────────────────────────
//  HELPER – Tableau générique
// ─────────────────────────────────────────────────────────────
const drawTable = (doc, headers, rows, colWidths, startX = 40) => {
  const ROW_H  = 18;
  const PAD    = 5;
  const totalW = colWidths.reduce((s, w) => s + w, 0);

  // En-tête du tableau
  let y = getY(doc);
  doc.rect(startX, y, totalW, ROW_H + 4).fill(C.navy);
  let x = startX;
  headers.forEach((h, i) => {
    doc.fillColor(C.white).fontSize(7.5).font("Helvetica-Bold")
       .text(h, x + PAD, y + 6,
             { width: colWidths[i] - PAD * 2, align: i > 0 ? "right" : "left" });
    x += colWidths[i];
  });
  doc.y = y + ROW_H + 4;

  // Lignes de données
  rows.forEach((row, ri) => {
    if (getY(doc) > 760) {
      doc.addPage();
      doc.y = 50;
    }
    const ry   = getY(doc);
    const fill = ri % 2 === 0 ? "#eef2ff" : C.white;
    doc.rect(startX, ry, totalW, ROW_H).fill(fill);

    let rx = startX;
    row.forEach((cell, ci) => {
      doc.fillColor(C.textDark).fontSize(7).font("Helvetica")
         .text(String(cell ?? "-"), rx + PAD, ry + 5,
               { width: colWidths[ci] - PAD * 2, align: ci > 0 ? "right" : "left" });
      rx += colWidths[ci];
    });

    doc.moveTo(startX, ry + ROW_H)
       .lineTo(startX + totalW, ry + ROW_H)
       .strokeColor(C.midGray).lineWidth(0.3).stroke();

    doc.y = ry + ROW_H;
  });

  doc.y = getY(doc) + 8;
};

// ─────────────────────────────────────────────────────────────
//  GRAPHIQUE – Line Chart
//  x, y : coordonnées absolues (JAMAIS doc.y directement)
// ─────────────────────────────────────────────────────────────
const drawLineChart = (doc, x, y, w, h, labels, values, color, title) => {
  if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return;
  if (!labels.length || !values.length) return;

  const PL = 65, PB = 32, PT = 28, PR = 12;
  const cx = x + PL, cy = y + PT, cw = w - PL - PR, ch = h - PT - PB;
  const dataValues = values.map(v => safe(v));
  const maxVal     = Math.max(...dataValues) * 1.1 || 1;

  doc.rect(x, y, w, h).fill("#fafafa");
  doc.rect(x, y, w, h).stroke(C.midGray).lineWidth(0.5);
  doc.fillColor(C.navy).fontSize(8.5).font("Helvetica-Bold")
     .text(title, x, y + 8, { width: w, align: "center" });

  // Grilles horizontales
  for (let i = 0; i <= 4; i++) {
    const gy = cy + ch - (i / 4) * ch;
    if (!isFinite(gy)) continue;
    doc.moveTo(cx, gy).lineTo(cx + cw, gy)
       .strokeColor(C.midGray).lineWidth(0.4).stroke();
    const val = maxVal * (i / 4);
    const lbl = val >= 1000 ? `$${(val / 1000).toFixed(0)}k` : `$${val.toFixed(0)}`;
    doc.fillColor(C.darkGray).fontSize(6).font("Helvetica")
       .text(lbl, x + 1, gy - 4, { width: PL - 4, align: "right" });
  }

  const step = dataValues.length > 1 ? cw / (dataValues.length - 1) : cw;
  const pts  = dataValues.map((v, i) => ({
    px: cx + i * step,
    py: cy + ch - (v / maxVal) * ch,
  }));

  if (pts.length > 1) {
    doc.save();
    doc.rect(cx, cy, cw, ch).clip();

    // Aire sous la courbe
    doc.moveTo(pts[0].px, cy + ch);
    pts.forEach(p => doc.lineTo(p.px, p.py));
    doc.lineTo(pts[pts.length - 1].px, cy + ch).closePath();
    doc.fillColor(color).fillOpacity(0.15).fill();
    doc.fillOpacity(1);

    // Ligne
    doc.moveTo(pts[0].px, pts[0].py);
    for (let i = 1; i < pts.length; i++) doc.lineTo(pts[i].px, pts[i].py);
    doc.strokeColor(color).lineWidth(1.8).stroke();

    // Points
    pts.forEach(p => {
      doc.circle(p.px, p.py, 2.5).fillColor(C.white).fill();
      doc.circle(p.px, p.py, 2.5).strokeColor(color).lineWidth(1.2).stroke();
    });
    doc.restore();
  }

  // Labels axe X
  const labelStep = Math.max(1, Math.ceil(labels.length / 12));
  labels.forEach((lbl, i) => {
    if (i % labelStep !== 0 && i !== labels.length - 1) return;
    const px = cx + i * step;
    doc.fillColor(C.darkGray).fontSize(5.5).font("Helvetica")
       .text(String(lbl).slice(0, 3), px - 10, cy + ch + 4, { width: 20, align: "center" });
  });

  // Axes
  doc.moveTo(cx, cy).lineTo(cx, cy + ch).lineTo(cx + cw, cy + ch)
     .strokeColor(C.darkGray).lineWidth(0.8).stroke();
};

// ─────────────────────────────────────────────────────────────
//  GRAPHIQUE – Bar Chart
// ─────────────────────────────────────────────────────────────
const drawBarChart = (doc, x, y, w, h, labels, values, color, title) => {
  if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return;
  if (!labels.length || !values.length) return;

  const PL = 65, PB = 32, PT = 28, PR = 12;
  const cx = x + PL, cy = y + PT, cw = w - PL - PR, ch = h - PT - PB;
  const dataValues = values.map(v => safe(v));
  const maxVal     = Math.max(...dataValues) * 1.1 || 1;
  const slotW      = cw / dataValues.length;
  const barW       = slotW * 0.62;
  const barGap     = (slotW - barW) / 2;

  doc.rect(x, y, w, h).fill("#fafafa");
  doc.rect(x, y, w, h).stroke(C.midGray).lineWidth(0.5);
  doc.fillColor(C.navy).fontSize(8.5).font("Helvetica-Bold")
     .text(title, x, y + 8, { width: w, align: "center" });

  for (let i = 0; i <= 4; i++) {
    const gy = cy + ch - (i / 4) * ch;
    if (!isFinite(gy)) continue;
    doc.moveTo(cx, gy).lineTo(cx + cw, gy)
       .strokeColor(C.midGray).lineWidth(0.4).stroke();
    const val = maxVal * (i / 4);
    const lbl = val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val.toFixed(0)}`;
    doc.fillColor(C.darkGray).fontSize(6).font("Helvetica")
       .text(lbl, x + 1, gy - 4, { width: PL - 4, align: "right" });
  }

  doc.save();
  doc.rect(cx, cy, cw, ch).clip();
  dataValues.forEach((v, i) => {
    const bx = cx + i * slotW + barGap;
    const bh = (v / maxVal) * ch;
    const by = cy + ch - bh;
    if (!isFinite(bx) || !isFinite(by) || !isFinite(bh)) return;
    doc.rect(bx, by, barW, bh).fill(color);
  });
  doc.restore();

  const labelStep = Math.max(1, Math.ceil(labels.length / 12));
  labels.forEach((lbl, i) => {
    if (i % labelStep !== 0 && i !== labels.length - 1) return;
    const px = cx + i * slotW + slotW / 2;
    doc.fillColor(C.darkGray).fontSize(5.5).font("Helvetica")
       .text(String(lbl).slice(0, 3), px - 10, cy + ch + 4, { width: 20, align: "center" });
  });

  doc.moveTo(cx, cy).lineTo(cx, cy + ch).lineTo(cx + cw, cy + ch)
     .strokeColor(C.darkGray).lineWidth(0.8).stroke();
};

// ─────────────────────────────────────────────────────────────
//  GRAPHIQUE – Donut Chart
//  CORRECTION CLEF : x, y sont toujours des coordonnées
//  absolues passées en paramètre, jamais lues depuis doc.y
// ─────────────────────────────────────────────────────────────
const drawDonutChart = (doc, x, y, w, h, labels, values, title) => {
  // Validation stricte de toutes les coordonnées
  if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return;
  if (x < 0 || y < 0 || w <= 0 || h <= 0) return;

  const dataValues = values.map(v => safe(v));
  const total      = dataValues.reduce((s, v) => s + v, 0) || 1;

  // Centre et rayon – calcul strictement depuis les paramètres
  const cx     = x + Math.floor(w * 0.36);
  const cy     = y + Math.floor(h * 0.52) + 10;
  const radius = Math.min(Math.floor(w * 0.26), Math.floor((h - 35) * 0.42));
  const innerR = Math.floor(radius * 0.50);

  // Validation finale avant de dessiner
  if (!isFinite(cx) || !isFinite(cy) || !isFinite(radius) || radius <= 5) return;

  // Fond + contour
  doc.rect(x, y, w, h).fill("#fafafa");
  doc.rect(x, y, w, h).stroke(C.midGray).lineWidth(0.5);

  // Titre
  doc.fillColor(C.navy).fontSize(8.5).font("Helvetica-Bold")
     .text(title, x, y + 8, { width: w, align: "center" });

  // ── Secteurs du donut ─────────────────────────────────
  let startAngle = -Math.PI / 2;

  dataValues.forEach((v, i) => {
    if (!isFinite(v) || v <= 0) return;

    const angle    = (v / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const segColor = PIE_COLORS[i % PIE_COLORS.length];
    const steps    = Math.max(6, Math.ceil(angle * 18));

    // Coordonnée du premier point de l'arc
    const x0 = cx + radius * Math.cos(startAngle);
    const y0 = cy + radius * Math.sin(startAngle);

    // Vérification avant de dessiner
    if (!isFinite(x0) || !isFinite(y0)) {
      startAngle = endAngle;
      return;
    }

    doc.save();
    doc.moveTo(cx, cy);
    doc.lineTo(x0, y0);

    for (let s = 1; s <= steps; s++) {
      const a  = startAngle + (angle * s) / steps;
      const px = cx + radius * Math.cos(a);
      const py = cy + radius * Math.sin(a);
      if (isFinite(px) && isFinite(py)) doc.lineTo(px, py);
    }

    doc.closePath().fillColor(segColor).fill();
    doc.restore();

    startAngle = endAngle;
  });

  // ── Trou central (effet donut) ────────────────────────
  if (isFinite(innerR) && innerR > 2) {
    doc.circle(cx, cy, innerR).fillColor("#fafafa").fill();
  }

  // ── Texte au centre ───────────────────────────────────
  const totalLabel = total >= 1000000
    ? `$${(total / 1000000).toFixed(1)}M`
    : total >= 1000
    ? `$${(total / 1000).toFixed(0)}k`
    : `$${total}`;

  doc.fillColor(C.navy).fontSize(6.5).font("Helvetica-Bold")
     .text("Total", cx - 20, cy - 10, { width: 40, align: "center" });
  doc.fillColor(C.navy).fontSize(8).font("Helvetica-Bold")
     .text(totalLabel, cx - 20, cy + 2, { width: 40, align: "center" });

  // ── Légende à droite ─────────────────────────────────
  const legendX = x + Math.floor(w * 0.65);
  let   legendY = y + 32;
  const legendW = w - Math.floor(w * 0.65) - 8;

  labels.slice(0, 7).forEach((lbl, i) => {
    if (!isFinite(legendY) || legendY > y + h - 10) return;
    const segColor = PIE_COLORS[i % PIE_COLORS.length];
    const pct      = ((dataValues[i] / total) * 100).toFixed(1);
    const valLabel = dataValues[i] >= 1000
      ? `$${(dataValues[i] / 1000).toFixed(0)}k`
      : `$${dataValues[i]}`;

    doc.rect(legendX, legendY, 8, 8).fillColor(segColor).fill();
    doc.fillColor(C.textDark).fontSize(7).font("Helvetica-Bold")
       .text(String(lbl).slice(0, 16), legendX + 12, legendY, { width: legendW });
    doc.fillColor(C.darkGray).fontSize(6.5).font("Helvetica")
       .text(`${valLabel}  (${pct}%)`, legendX + 12, legendY + 9, { width: legendW });

    legendY += 24;
  });
};

// ─────────────────────────────────────────────────────────────
//  CONTROLLER PRINCIPAL – Export PDF
// ─────────────────────────────────────────────────────────────
export const exportDashboardPDF = async (req, res) => {
  try {
    // ── 1. Données MongoDB ──────────────────────────────────
    const overallStat    = await OverallStat.findOne();
    const transactions   = await Transaction.find().sort({ createdAt: -1 }).limit(30);
    const totalCustomers = await User.countDocuments({ role: "user" });
    const products       = await Product.find().limit(12);

    const monthlyData = overallStat?.monthlyData || [];
    const lastMonth   = monthlyData[monthlyData.length - 1] || {};
    const yearlyTotal = safe(overallStat?.yearlySalesTotal);

    // ── 2. Init PDF ─────────────────────────────────────────
    const doc = new PDFDocument({
      margin     : 40,
      size       : "A4",
      bufferPages: true,
      info       : {
        Title   : "ECOMVISION – Rapport analytique",
        Author  : "ECOMVISION",
        Subject : "Dashboard e-commerce",
      },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=rapport-ecomvision-${new Date().toISOString().slice(0, 10)}.pdf`
    );
    doc.pipe(res);

    // ══════════════════════════════════════════════════════
    //  PAGE 1 – COUVERTURE + KPIs
    // ══════════════════════════════════════════════════════
    doc.rect(0, 0, 595, 190).fill(C.navy);

    doc.fillColor(C.gold).fontSize(40).font("Helvetica-Bold")
       .text("ECOMVISION", 40, 48, { align: "center", width: 515 });
    doc.fillColor(C.white).fontSize(16).font("Helvetica")
       .text("Rapport Analytique Complet", 40, 108, { align: "center", width: 515 });
    doc.fillColor("#aaaaaa").fontSize(10)
       .text("E-Commerce Analytics Platform", 40, 132, { align: "center", width: 515 });

    const dateStr = new Date().toLocaleDateString("fr-FR", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    doc.fillColor("#bbbbbb").fontSize(9)
       .text(`Généré le : ${dateStr}`, 40, 158, { align: "center", width: 515 });

    // Ligne décorative
    doc.moveTo(120, 204).lineTo(475, 204).strokeColor(C.gold).lineWidth(1.5).stroke();

    // Résumé exécutif
    doc.fillColor(C.navy).fontSize(13).font("Helvetica-Bold")
       .text("Résumé Exécutif", 40, 220);
    doc.moveTo(40, 236).lineTo(555, 236).strokeColor(C.midGray).lineWidth(0.6).stroke();
    doc.fillColor(C.textDark).fontSize(10).font("Helvetica")
       .text(
         "Ce rapport présente une synthèse complète des performances commerciales de la plateforme " +
         "ECOMVISION. Il regroupe les indicateurs clés de performance (KPIs), l'évolution mensuelle " +
         "des ventes, la répartition des revenus par catégorie de produits, et le détail des " +
         "transactions récentes. Ces données permettent aux décideurs de disposer d'une vision " +
         "globale et précise de l'activité e-commerce.",
         40, 244, { width: 515, align: "justify", lineGap: 3 }
       );

    // ── 4 cartes KPI ───────────────────────────────────────
    const kpis = [
      { label: "Clients totaux",         value: totalCustomers.toLocaleString("fr-FR"),                           color: C.blue   },
      { label: "Revenus annuels",         value: `$${yearlyTotal.toLocaleString("fr-FR")}`,                        color: C.green  },
      { label: "Ventes du mois",          value: `$${safe(lastMonth.totalSales).toLocaleString("fr-FR")}`,         color: C.orange },
      { label: "Unités vendues (année)",  value: safe(overallStat?.yearlyTotalSoldUnits).toLocaleString("fr-FR"),  color: C.purple },
    ];

    const kpiTop = 330;
    kpis.forEach((kpi, i) => {
      const kx = 40  + (i % 2) * 258;
      const ky = kpiTop + Math.floor(i / 2) * 76;
      doc.rect(kx, ky, 245, 62).fill(C.lightGray);
      doc.rect(kx, ky, 245, 62).stroke(C.midGray).lineWidth(0.4);
      doc.rect(kx, ky, 5, 62).fill(kpi.color);
      doc.fillColor(C.darkGray).fontSize(8.5).font("Helvetica")
         .text(kpi.label, kx + 13, ky + 10, { width: 225 });
      doc.fillColor(kpi.color).fontSize(19).font("Helvetica-Bold")
         .text(kpi.value, kx + 13, ky + 28, { width: 225 });
    });

    // Tableau des 6 derniers mois (page 1, bas)
    doc.y = kpiTop + 2 * 76 + 20;
    if (monthlyData.length > 0) {
      doc.fillColor(C.navy).fontSize(10).font("Helvetica-Bold")
         .text("Aperçu des 6 derniers mois", 40, getY(doc));
      doc.moveDown(0.5);
      drawTable(
        doc,
        ["Mois", "Ventes ($)", "Unités vendues"],
        monthlyData.slice(-6).map(m => [
          m.month,
          `$${safe(m.totalSales).toLocaleString("fr-FR")}`,
          safe(m.totalUnits).toLocaleString("fr-FR"),
        ]),
        [172, 172, 171]
      );
    }

    // ══════════════════════════════════════════════════════
    //  PAGE 2 – GRAPHIQUES DES VENTES
    // ══════════════════════════════════════════════════════
    doc.addPage();
    sectionHeader(doc, "Analyse des Ventes", "Évolution mensuelle des revenus et des unités vendues");

    if (monthlyData.length > 0) {
      const months    = monthlyData.map(m => String(m.month));
      const salesData = monthlyData.map(m => safe(m.totalSales));
      const unitsData = monthlyData.map(m => safe(m.totalUnits));

      // Graphique courbe – utiliser coordonnée Y fixe
      const y1 = 80;
      drawLineChart(doc, 40, y1, 515, 200, months, salesData, C.blue,
                    "Évolution mensuelle des ventes ($)");
      doc.y = y1 + 200 + 20;

      // Graphique barres
      const y2 = y1 + 200 + 30;
      drawBarChart(doc, 40, y2, 515, 200, months, unitsData, C.green,
                   "Unités vendues par mois");
      doc.y = y2 + 200 + 20;

      // Tableau détaillé
      doc.addPage();
      sectionHeader(doc, "Détail mensuel complet", "Toutes les périodes disponibles");
      drawTable(
        doc,
        ["Mois", "Ventes ($)", "Unités vendues", "Vente moy. / unité ($)"],
        monthlyData.map(m => [
          m.month,
          `$${safe(m.totalSales).toLocaleString("fr-FR")}`,
          safe(m.totalUnits).toLocaleString("fr-FR"),
          safe(m.totalUnits) > 0
            ? `$${(safe(m.totalSales) / safe(m.totalUnits)).toFixed(2)}`
            : "-",
        ]),
        [130, 130, 130, 125]
      );
    }

    // ══════════════════════════════════════════════════════
    //  PAGE 3 – VENTES PAR CATÉGORIE
    // ══════════════════════════════════════════════════════
    doc.addPage();
    sectionHeader(doc, "Ventes par Catégorie", "Répartition des revenus par famille de produits");

    if (overallStat?.salesByCategory &&
        Object.keys(overallStat.salesByCategory).length > 0) {

      const categories = Object.keys(overallStat.salesByCategory);
      const catValues  = Object.values(overallStat.salesByCategory).map(v => safe(v));
      const totalCat   = catValues.reduce((s, v) => s + v, 0) || 1;

      // Coordonnée Y FIXE pour le donut (évite NaN)
      const donutY = 80;
      drawDonutChart(doc, 40, donutY, 515, 220, categories, catValues,
                     "Répartition des ventes par catégorie");
      doc.y = donutY + 220 + 16;

      // Tableau des catégories
      doc.fillColor(C.navy).fontSize(9).font("Helvetica-Bold")
         .text("Détail par catégorie", 40, getY(doc));
      doc.moveDown(0.4);

      drawTable(
        doc,
        ["Catégorie", "Ventes ($)", "Part (%)", "Statut vs moyenne"],
        categories.map((cat, i) => [
          cat,
          `$${catValues[i].toLocaleString("fr-FR")}`,
          `${((catValues[i] / totalCat) * 100).toFixed(1)} %`,
          catValues[i] > totalCat / categories.length
            ? "▲ Au-dessus"
            : "▼ En-dessous",
        ]),
        [185, 120, 110, 100]
      );

      // Ligne de total
      const ty = getY(doc) + 2;
      if (isFinite(ty) && ty < 800) {
        doc.rect(40, ty, 515, 20).fill("#dde8ff");
        doc.fillColor(C.navy).fontSize(8).font("Helvetica-Bold")
           .text("TOTAL", 45, ty + 6)
           .text(`$${totalCat.toLocaleString("fr-FR")}`, 225, ty + 6, { width: 120, align: "right" })
           .text("100.0 %", 345, ty + 6, { width: 110, align: "right" });
        doc.y = ty + 28;
      }
    }

    // ══════════════════════════════════════════════════════
    //  PAGE 4 – TRANSACTIONS RÉCENTES
    // ══════════════════════════════════════════════════════
    doc.addPage();
    sectionHeader(
      doc,
      "Transactions Récentes",
      `Les ${transactions.length} dernières transactions enregistrées`
    );

    drawTable(
      doc,
      ["ID Transaction", "ID Utilisateur", "Produits", "Coût ($)", "Date"],
      transactions.map(t => [
        t._id.toString().slice(-10),
        t.userId?.toString().slice(-10) || "-",
        String(t.products?.length || 0),
        `$${Number(t.cost || 0).toFixed(2)}`,
        new Date(t.createdAt).toLocaleDateString("fr-FR"),
      ]),
      [135, 135, 60, 85, 100]
    );

    // ══════════════════════════════════════════════════════
    //  PAGE 5 – CATALOGUE PRODUITS
    // ══════════════════════════════════════════════════════
    if (products.length > 0) {
      doc.addPage();
      sectionHeader(doc, "Catalogue Produits", "Aperçu des produits disponibles dans le système");

      drawTable(
        doc,
        ["Nom du produit", "Catégorie", "Prix ($)", "Description"],
        products.map(p => [
          String(p.name || "-"),
          String(p.category || "-"),
          p.price ? `$${Number(p.price).toFixed(2)}` : "-",
          String(p.description || "").slice(0, 50) +
            (String(p.description || "").length > 50 ? "…" : ""),
        ]),
        [155, 100, 70, 190]
      );
    }

    // ══════════════════════════════════════════════════════
    //  PIEDS DE PAGE (toutes les pages)
    // ══════════════════════════════════════════════════════
    addFooters(doc);
    doc.end();

  } catch (err) {
    console.error("Erreur génération PDF :", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Erreur génération PDF", error: err.message });
    }
  }
};

// ─────────────────────────────────────────────────────────────
//  CONTROLLER – Export Excel
// ─────────────────────────────────────────────────────────────
export const exportDashboardExcel = async (req, res) => {
  try {
    const ExcelJS = (await import("exceljs")).default;

    const overallStat  = await OverallStat.findOne();
    const transactions = await Transaction.find().sort({ createdAt: -1 });
    const users        = await User.find({ role: "user" }).select("-password");

    const workbook   = new ExcelJS.Workbook();
    workbook.creator = "ECOMVISION";
    workbook.created = new Date();

    const applyHeader = (row, argb) => {
      row.font = { bold: true, color: { argb: "FFFFFFFF" } };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
    };

    // Feuille 1 – KPIs
    const sheetKpi = workbook.addWorksheet("Synthèse");
    sheetKpi.columns = [
      { header: "Indicateur", key: "label", width: 32 },
      { header: "Valeur",     key: "value", width: 22 },
    ];
    applyHeader(sheetKpi.getRow(1), "FF1A1A3E");
    const lastMonth = overallStat?.monthlyData?.[overallStat.monthlyData.length - 1];
    sheetKpi.addRows([
      { label: "Clients totaux",         value: await User.countDocuments({ role: "user" }) },
      { label: "Ventes annuelles ($)",   value: safe(overallStat?.yearlySalesTotal) },
      { label: "Ventes mensuelles ($)",  value: safe(lastMonth?.totalSales) },
      { label: "Ventes aujourd'hui ($)", value: safe(overallStat?.todayStats?.totalSales) },
      { label: "Unités vendues (année)", value: safe(overallStat?.yearlyTotalSoldUnits) },
    ]);

    // Feuille 2 – Ventes mensuelles
    const sheetM = workbook.addWorksheet("Ventes mensuelles");
    sheetM.columns = [
      { header: "Mois",       key: "month", width: 15 },
      { header: "Ventes ($)", key: "sales", width: 18 },
      { header: "Unités",     key: "units", width: 14 },
    ];
    applyHeader(sheetM.getRow(1), "FF4472C4");
    overallStat?.monthlyData?.forEach(m =>
      sheetM.addRow({ month: m.month, sales: safe(m.totalSales), units: safe(m.totalUnits) })
    );

    // Feuille 3 – Catégories
    const sheetCat = workbook.addWorksheet("Catégories");
    sheetCat.columns = [
      { header: "Catégorie",  key: "category", width: 28 },
      { header: "Ventes ($)", key: "amount",   width: 18 },
      { header: "Part (%)",   key: "percent",  width: 14 },
    ];
    applyHeader(sheetCat.getRow(1), "FFED7D31");
    if (overallStat?.salesByCategory) {
      const entries = Object.entries(overallStat.salesByCategory);
      const total   = entries.reduce((s, [, v]) => s + safe(v), 0) || 1;
      entries.forEach(([cat, amount]) =>
        sheetCat.addRow({
          category: cat,
          amount  : safe(amount),
          percent : `${((safe(amount) / total) * 100).toFixed(1)}%`,
        })
      );
    }

    // Feuille 4 – Transactions
    const sheetT = workbook.addWorksheet("Transactions");
    sheetT.columns = [
      { header: "ID",             key: "id",       width: 28 },
      { header: "ID Utilisateur", key: "userId",   width: 28 },
      { header: "# Produits",     key: "products", width: 14 },
      { header: "Coût ($)",       key: "cost",     width: 14 },
      { header: "Date",           key: "date",     width: 18 },
    ];
    applyHeader(sheetT.getRow(1), "FF70AD47");
    transactions.forEach(t =>
      sheetT.addRow({
        id      : t._id.toString(),
        userId  : t.userId?.toString() || "-",
        products: t.products?.length   || 0,
        cost    : Number(t.cost || 0).toFixed(2),
        date    : new Date(t.createdAt).toLocaleDateString("fr-FR"),
      })
    );

    // Feuille 5 – Clients
    const sheetCl = workbook.addWorksheet("Clients");
    sheetCl.columns = [
      { header: "Nom",        key: "name",       width: 26 },
      { header: "Email",      key: "email",      width: 32 },
      { header: "Pays",       key: "country",    width: 16 },
      { header: "Ville",      key: "city",       width: 16 },
      { header: "Occupation", key: "occupation", width: 28 },
    ];
    applyHeader(sheetCl.getRow(1), "FF9E480E");
    users.forEach(u =>
      sheetCl.addRow({
        name      : u.name,
        email     : u.email,
        country   : u.country    || "-",
        city      : u.city       || "-",
        occupation: u.occupation || "-",
      })
    );

    res.setHeader("Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",
      `attachment; filename=rapport-ecomvision-${new Date().toISOString().slice(0, 10)}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Erreur export Excel :", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Erreur export Excel", error: err.message });
    }
  }
};