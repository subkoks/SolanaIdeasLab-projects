import { PublicKey } from "@solana/web3.js";
import Joi from "joi";
import { TokenObservationUnavailableError } from "./token-observation-error";

export type TokenProgramType = "spl-token" | "token-2022";
export interface MintObservation {
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  tokenProgram: TokenProgramType;
}

const LEGACY = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const authority = Joi.string().min(32).max(44).custom((value, helpers) => {
  try {
    if (new PublicKey(value).toBase58() === value) return value;
  } catch { /* Invalid public keys are incomplete evidence. */ }
  return helpers.error("any.invalid");
}).allow(null).required();
export const rawAmountSchema = Joi.string().max(20).pattern(/^\d+$/).custom((value, helpers) =>
    BigInt(value) <= 18_446_744_073_709_551_615n ? value : helpers.error("any.invalid"),
  ).required();
const mintSchema = Joi.object({
  decimals: Joi.number().integer().min(0).max(255).required(),
  supply: rawAmountSchema,
  mintAuthority: authority,
  freezeAuthority: authority,
  isInitialized: Joi.boolean().valid(true).required(),
}).unknown(true);
const accountSchema = Joi.object({
  executable: Joi.boolean().valid(false).required(),
  owner: Joi.object().instance(PublicKey).required(),
  data: Joi.object({ parsed: Joi.object({
    type: Joi.string().valid("mint", "account", "multisig").required(),
    info: Joi.object().unknown(true).required(),
  }).unknown(true).required() }).unknown(true).required(),
}).unknown(true);

export const parseMintObservation = (value: unknown, address: string): MintObservation | null => {
  const account = accountSchema.validate(value, { convert: false });
  if (account.error) throw new TokenObservationUnavailableError();
  const owner = (account.value.owner as PublicKey).toBase58();
  const tokenProgram = owner === LEGACY ? "spl-token" : owner === TOKEN_2022 ? "token-2022" : null;
  if (!tokenProgram) throw new TokenObservationUnavailableError();
  if (account.value.data.parsed.type !== "mint") return null;
  const parsed = mintSchema.validate(account.value.data.parsed.info, { convert: false });
  if (parsed.error) throw new TokenObservationUnavailableError();
  const info = parsed.value as Omit<MintObservation, "tokenProgram">;
  const nativeProgram = address === "So11111111111111111111111111111111111111112" ? "spl-token"
    : address === "9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP" ? "token-2022" : null;
  if (nativeProgram && (tokenProgram !== nativeProgram || info.decimals !== 9 || BigInt(info.supply) !== 0n ||
      info.mintAuthority !== null || info.freezeAuthority !== null)) throw new TokenObservationUnavailableError();
  return { decimals: info.decimals, supply: info.supply, mintAuthority: info.mintAuthority,
    freezeAuthority: info.freezeAuthority, tokenProgram };
};
