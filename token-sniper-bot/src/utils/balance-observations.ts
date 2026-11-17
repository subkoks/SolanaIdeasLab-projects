import { PublicKey } from "@solana/web3.js";
import Joi from "joi";
import { rawAmountSchema } from "./mint-observations";
import { TokenObservationUnavailableError } from "./token-observation-error";

const supplySchema = Joi.object({
  amount: rawAmountSchema,
  decimals: Joi.number().integer().min(0).max(255).required(),
}).unknown(true);
const largestSchema = Joi.array().max(20).items(Joi.object({
  address: Joi.object().instance(PublicKey).required(), amount: rawAmountSchema,
  uiAmount: Joi.number().unsafe().min(0).allow(null).optional(),
}).unknown(true)).required();

export const parseSupplyObservation = (value: unknown): { amount: string; decimals: number } => {
  const parsed = supplySchema.required().validate(value, { convert: false });
  if (parsed.error) throw new TokenObservationUnavailableError();
  return { amount: parsed.value.amount, decimals: parsed.value.decimals };
};

export const parseLargestObservations = (value: unknown): Array<{ address: string; amount: string; uiAmount: number }> => {
  const parsed = largestSchema.validate(value, { convert: false });
  if (parsed.error) throw new TokenObservationUnavailableError();
  const rows = parsed.value as Array<{ address: PublicKey; amount: string; uiAmount?: number | null }>;
  const addresses = rows.map(row => row.address.toBase58());
  if (new Set(addresses).size !== rows.length) throw new TokenObservationUnavailableError();
  rows.sort((left, right) => BigInt(left.amount) > BigInt(right.amount) ? -1 : BigInt(left.amount) < BigInt(right.amount) ? 1 : 0);
  return rows.map(row => ({ address: row.address.toBase58(), amount: row.amount, uiAmount: row.uiAmount ?? 0 }));
};
