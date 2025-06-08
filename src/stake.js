import { db } from "../db.js";
import BigNumber from "bignumber.js";

export const getStake = async (address, epoch) => {
  let response = {};

  let total = {
    bonds: new BigNumber(0),
    unbonds: new BigNumber(0),
    withdrawable: new BigNumber(0),
    rewards: new BigNumber(0),
  };

  const [unbonds, bonds, rewards] = await Promise.all([
    getUnbonds(address, epoch),
    getBonds(address),
    getRewards(address, epoch),
  ]);

  const ids = [
    ...Object.keys(unbonds.unbonding || {}),
    ...Object.keys(unbonds.withdrawable || {}),
    ...Object.keys(bonds || {}),
    ...Object.keys(rewards || {}),
  ];

  const allValidators = [...new Set(ids)];
  const validatorRes = await db.query(`SELECT id, namada_address FROM public.validators WHERE id IN (${allValidators.join(",")})`);

  const validators = validatorRes.rows.reduce((acc, validator) => {
    acc[validator.id] = validator.namada_address;
    return acc;
  }, {});

  allValidators.forEach((validatorId) => {
    response[validatorId] = {
      validatorAddress: validators[validatorId],
      bonds: new BigNumber(bonds[validatorId]?.raw_amount || 0),
      unbonds: new BigNumber(unbonds.unbonding[validatorId]?.raw_amount || 0),
      withdrawable: new BigNumber(
        unbonds.withdrawable[validatorId]?.raw_amount || 0
      ),
      rewards: new BigNumber(rewards[validatorId]?.raw_amount || 0),
    };

    total.bonds = total.bonds.plus(response[validatorId].bonds);
    total.unbonds = total.unbonds.plus(response[validatorId].unbonds);
    total.withdrawable = total.withdrawable.plus(
      response[validatorId].withdrawable
    );
    total.rewards = total.rewards.plus(response[validatorId].rewards);
  });

  total.total = total.bonds
    .plus(total.unbonds)
    .plus(total.withdrawable)
    .plus(total.rewards);

  return { positions: Object.values(response), total };
};

const getUnbonds = async (address, epoch) => {
  const sql = `SELECT * FROM public.unbonds WHERE address = $1`;
  const { rows } = await db.query(sql, [address]);

  const unbonding = mergePositions(
    rows.filter((row) => row.withdraw_epoch < epoch)
  );
  const withdrawable = mergePositions(
    rows.filter((row) => row.withdraw_epoch >= epoch)
  );

  return {
    unbonding,
    withdrawable,
  };
};

const getBonds = async (address) => {
  const sql = `SELECT * FROM public.bonds WHERE address = $1`;
  const { rows } = await db.query(sql, [address]);

  return mergePositions(rows);
};

const getRewards = async (address, epoch) => {
  const sql = `SELECT * FROM public.pos_rewards WHERE owner = $1 AND epoch = $2`;
  const { rows } = await db.query(sql, [address, epoch]);
  return mergePositions(rows.filter((row) => !row.claimed));
};

const mergePositions = (positions) => {
  const merged = {};

  positions.forEach((position) => {
    if (!merged[position.validator_id]) {
      merged[position.validator_id] = {
        ...position,
        raw_amount: new BigNumber(position.raw_amount),
      };
    } else {
      merged[position.validator_id].raw_amount = merged[
        position.validator_id
      ].raw_amount.plus(position.raw_amount);
    }
    delete merged[position.validator_id].epoch;
    delete merged[position.validator_id].owner;
    delete merged[position.validator_id].claimed;
    delete merged[position.validator_id].address;
    delete merged[position.validator_id].start;
  });

  // Object.values(merged).forEach((position) => {
  //   position.raw_amount = position.raw_amount.toString();
  // });

  return merged;
};
