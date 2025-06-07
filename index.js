import express from "express";
import cors from "cors";
import { db } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Get all transactions
app.get("/transactions", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    const { rows } = await db.query(
      "SELECT * FROM public.wrapper_transactions ORDER BY block_height DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    const ids = rows.map((row) => row.id);
    const { rows: innerRows } = await db.query(
      "SELECT * FROM public.inner_transactions WHERE wrapper_id = ANY($1)",
      [ids]
    );
    rows.forEach((row) => {
      row.inner_transactions = innerRows.filter(
        (innerRow) => innerRow.wrapper_id === row.id
      );
    });
   
    rows.forEach((row) => {
      row.inner_transactions.forEach((innerRow) => {
        if(innerRow.kind === "ibc_msg_transfer") {
          innerRow.data = {};
        }
      });
    });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// Get a transaction by hash
app.get("/transactions/:hash", async (req, res) => {
  try {

    const { hash } = req.params;
    const { rows } = await db.query(
      "SELECT * FROM transactions WHERE hash = $1",
      [hash]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching transaction" });
  }
});

app.get("/total-stake", async (req, res) => {
  try {
    const epochsParam = req.query.epochs;

    if (!epochsParam || typeof epochsParam !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'epochs' query parameter" });
    }

    // Split and sanitize
    const epochInts = epochsParam
      .split(",")
      .map((e) => parseInt(e.trim()))
      .filter((n) => !isNaN(n));

    if (epochInts.length === 0) {
      return res.status(400).json({ error: "No valid epochs provided" });
    }

    // Create parameterized placeholders
    const placeholders = epochInts.map((_, idx) => `$${idx + 1}`).join(", ");
    const { rows } = await db.query(
      `SELECT * FROM public.total_stake WHERE epoch IN (${placeholders})`,
      epochInts
    );

    res.json(rows.reduce((acc, row) => {
      acc[row.epoch] = row.stake;
      return acc;
    }, {}));
  } catch (error) {
    console.error("Error fetching total stake:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => console.log(`API running on port ${PORT}`));
