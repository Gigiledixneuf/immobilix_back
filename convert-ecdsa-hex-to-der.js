import { AccountInfoQuery, Client } from "@hashgraph/sdk";
import dotenv from "dotenv";

dotenv.config();

const client = Client.forTestnet()
  .setOperator(process.env.HEDERA_ACCOUNT_ID, process.env.HEDERA_PRIVATE_KEY);

const main = async () => {
  try {
    const info = await new AccountInfoQuery()
      .setAccountId(process.env.HEDERA_ACCOUNT_ID)
      .execute(client);

    console.log("✅ Type de clé :", info.key._type);
  } catch (err) {
    console.error("❌ Erreur :", err.message);
  }
};

main();
