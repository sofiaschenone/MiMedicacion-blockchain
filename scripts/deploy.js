const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * @title Script de Despliegue para RegistroMedicacion
 * @notice Compila y despliega el contrato en la red seleccionada (Sepolia o Localhost),
 *         verificando la cuenta que firma la transacción y guardando la dirección obtenida.
 */
async function main() {
  console.log("=================================================================");
  console.log(" 🏥 PROYECTO MIMEDICACIÓN - UNIVERSIDAD PROVINCIAL DE EZEIZA (UPE)");
  console.log(" 🚀 Despliegue del Smart Contract: RegistroMedicacion");
  console.log("=================================================================\n");

  const [deployer] = await hre.ethers.getSigners();
  const red = hre.network.name;

  console.log(`📡 Red objetivo: ${red.toUpperCase()}`);
  console.log(`👤 Cuenta desplegadora (Backend Owner): ${deployer.address}`);

  const saldo = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`💰 Saldo de la cuenta: ${hre.ethers.formatEther(saldo)} ETH\n`);

  if (saldo === 0n && red === "sepolia") {
    console.warn("⚠️ ADVERTENCIA: La cuenta no tiene fondos en Sepolia ETH. Consigue Sepolia ETH en faucets antes de continuar.");
  }

  // 1. Obtener la fábrica del contrato
  console.log("📦 Obteniendo fábrica del contrato 'RegistroMedicacion'...");
  const RegistroMedicacion = await hre.ethers.getContractFactory("RegistroMedicacion");

  // 2. Iniciar el despliegue
  console.log("⏳ Enviando transacción de despliegue a la red...");
  const registro = await RegistroMedicacion.deploy();

  // 3. Esperar a que se mine el bloque de confirmación
  await registro.waitForDeployment();
  const contractAddress = await registro.getAddress();

  console.log("\n=================================================================");
  console.log(`✅ ¡Contrato desplegado con éxito!`);
  console.log(`📍 Dirección del Contrato: ${contractAddress}`);
  console.log("=================================================================\n");

  if (red === "sepolia") {
    console.log(`🔍 Ver en Etherscan: https://sepolia.etherscan.io/address/${contractAddress}`);
    console.log("\n💡 Para verificar el código fuente en Etherscan ejecuta:");
    console.log(`   npx hardhat verify --network sepolia ${contractAddress}\n`);
  }

  // 4. Guardar información de despliegue localmente para consumo del backend
  const infoDespliegue = {
    contractAddress,
    network: red,
    deployer: deployer.address,
    deployedAt: new Date().toISOString()
  };

  const outputDir = path.join(__dirname, "../src");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(outputDir, "deployment-info.json"),
    JSON.stringify(infoDespliegue, null, 2)
  );

  console.log("📝 Archivo de configuración generado en: src/deployment-info.json");
  console.log(`🔔 Recuerda actualizar CONTRACT_ADDRESS=${contractAddress} en tu archivo .env\n`);
}

main().catch((error) => {
  console.error("❌ Error durante el despliegue:", error);
  process.exitCode = 1;
});
