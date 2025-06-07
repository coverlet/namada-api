import { Pool } from "pg";
import { RPC_URL } from "./constants.js";
import fetch from "node-fetch";
import { db } from "./db.js";

function decodeU64(bytes) {
  // Decode first 8 bytes as little-endian u64
  let asU64 = 0;
  for (let i = 0; i < 8; i++) {
    asU64 += bytes[i] * 2 ** (8 * i);
  }

  return asU64;
}

// Configuration
const INTERVAL_MS = 60_000; // 60 seconds

// /vp/pos/total_stake/730
async function fetchTotalStake() {
  try {
    const epoch = await fetchAbciQuery("/shell/epoch");

    const epochs = Array.from({ length: 6 }, (_, i) => i + (epoch - 3)).map(
      async (epoch) => {
        const stake = await fetchAbciQuery(`/vp/pos/total_stake/${epoch}`);
        return { epoch, stake };
      }
    );

    const results = await Promise.all(epochs);

    const values = results
      .map((d, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
      .join(", ");

    const flat = results.flatMap((d) => [d.epoch, d.stake]);

    const query = `
      INSERT INTO total_stake (epoch, stake)
      VALUES ${values}
      ON CONFLICT (epoch) DO UPDATE SET stake = EXCLUDED.stake
    `;

    await db.query(query, flat);
    console.log("Upsert complete.");
  } catch (err) {
    console.error("Error inserting data:", err);
  } 
}

async function fetchAbciQuery(path) {
  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "abci_query",
      params: {
        path,
        data: "",
        prove: false,
      },
    };

    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (json.result.response.code !== 0) {
      throw new Error(`ABCI query error: ${json.result.response.log}`);
    }

    // console.log(json.result.response.value);

    const base64Value = json.result.response.value;

    const bytes = Uint8Array.from(atob(base64Value), (c) => c.charCodeAt(0));
    const value = decodeU64(bytes);
    return value;
  } catch (err) {
    console.error("Error fetching abci query:", err.message);
  }
}

// Loop
setInterval(fetchTotalStake, INTERVAL_MS);
fetchTotalStake(); // also run immediately on startup
