import { db } from "../db.js";

export const getTransactions = async (address = "", limit = 20, page = 1) => {
  let response = {};
  try {
    const offset = (page - 1) * limit;

    const dbQueryArgs = address
      ? [
          "SELECT COUNT(*) FROM public.wrapper_transactions WHERE fee_payer = $1",
          [address],
        ]
      : ["SELECT COUNT(*) FROM public.wrapper_transactions"];

    const countResult = await db.query(...dbQueryArgs);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const dbQuerySelectArgs = address ? [
      `SELECT wt.*, b.timestamp
FROM public.wrapper_transactions wt
LEFT JOIN public.blocks b
  ON wt.block_height = b.height
  WHERE wt.fee_payer = $3
ORDER BY wt.block_height DESC LIMIT $1 OFFSET $2`,
      [limit, offset, address]
    ] : [
      `SELECT wt.*, b.timestamp
FROM public.wrapper_transactions wt
LEFT JOIN public.blocks b
  ON wt.block_height = b.height
ORDER BY wt.block_height DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    ];

    const { rows } = await db.query(...dbQuerySelectArgs);
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
        if (innerRow.kind === "ibc_msg_transfer") {
          innerRow.data = {};
        }
      });
    });
    response = {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      data: rows,
    };
  } catch (err) {
    console.error(err);
  }
  return response;
};
