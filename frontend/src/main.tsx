import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import "@mysten/dapp-kit/dist/index.css";

const network = (import.meta.env.VITE_SUI_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet"
  | "devnet";

const networks = {
  mainnet: { url: getJsonRpcFullnodeUrl("mainnet"), network: "mainnet" as const },
  testnet: { url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" as const },
  devnet: { url: getJsonRpcFullnodeUrl("devnet"), network: "devnet" as const },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SuiClientProvider networks={networks} defaultNetwork={network}>
      <WalletProvider autoConnect>
        <App />
      </WalletProvider>
    </SuiClientProvider>
  </React.StrictMode>
);
