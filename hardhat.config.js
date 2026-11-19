require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * @title Configuración de Hardhat para MiMedicación (Universidad Provincial de Ezeiza)
 * @notice Este archivo configura el entorno de desarrollo de Smart Contracts,
 *         definiendo redes, compilador y credenciales para Ethereum Sepolia Testnet.
 */

// Lectura de variables de entorno desde el archivo .env
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// Construcción del Endpoint RPC de Sepolia (Soporta Alchemy o Infura / URL directa)
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || 
  (ALCHEMY_API_KEY ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}` : "");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Optimiza el bytecode para un balance entre costo de despliegue y llamadas recurrentes
      },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    // Red de pruebas local de Hardhat (para testing y simulación offline sin costo)
    hardhat: {
      chainId: 31337,
    },
    // Red local si se levanta un nodo con `npx hardhat node`
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Red Ethereum Sepolia Testnet (Entorno objetivo del proyecto universitario)
    sepolia: {
      url: SEPOLIA_RPC_URL,
      // Aseguramos que la clave privada tenga el prefijo 0x requerido por ethers/hardhat
      accounts: PRIVATE_KEY.startsWith("0x") ? [PRIVATE_KEY] : [`0x${PRIVATE_KEY}`],
      chainId: 11155111,
    },
  },
  etherscan: {
    // Permite verificar el código fuente en Sepolia Etherscan automáticamente.
    // La API v1 está descontinuada: Etherscan v2 espera una única clave (no un
    // mapa por red), que el plugin resuelve con la red configurada.
    apiKey: ETHERSCAN_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
