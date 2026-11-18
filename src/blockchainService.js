/**
 * @file blockchainService.js
 * @description Servicio de interacción con Ethereum Sepolia para el backend de MiMedicación.
 *              Implementa el patrón Data Anchoring utilizando Ethers.js (v6) y criptografía SHA-256.
 * @institution Universidad Provincial de Ezeiza (UPE)
 */

const { ethers } = require("ethers");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Carga del ABI compilado del Smart Contract
const contractAbi = require("./contractAbi.json");

// Carga automática de metadatos de despliegue si existen
let deploymentInfo = {};
try {
  const deployPath = path.join(__dirname, "deployment-info.json");
  if (fs.existsSync(deployPath)) {
    deploymentInfo = JSON.parse(fs.readFileSync(deployPath, "utf8"));
  }
} catch (e) {}

/**
 * Normaliza y ordena de forma recursiva un objeto JavaScript para garantizar
 * que la serialización a JSON sea siempre determinística (idéntica) sin importar
 * el orden de las propiedades en memoria.
 *
 * @param {any} obj - Objeto o arreglo a ordenar
 * @returns {any} Objeto normalizado determinista
 */
function canonicalizarObjeto(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalizarObjeto);
  }
  const ordenado = {};
  Object.keys(obj)
    .sort()
    .forEach((key) => {
      ordenado[key] = canonicalizarObjeto(obj[key]);
    });
  return ordenado;
}

/**
 * PASO 3.A: Genera un hash criptográfico SHA-256 a partir del objeto JSON de tomas de medicación.
 * 
 * Por qué SHA-256:
 * - Es una función resumen unidireccional y resistente a colisiones.
 * - Su longitud fija es de 256 bits (32 bytes), compatible de forma directa con el tipo `bytes32` de Solidity.
 * - Protege la privacidad del paciente: es matemáticamente inviable recuperar los medicamentos
 *   o la identidad del paciente a partir de este hash (Privacidad por Diseño).
 *
 * @param {Object} datosTomas - Estructura con la información diaria de tomas del paciente
 * @param {string} datosTomas.paciente - ID del paciente
 * @param {string} datosTomas.fecha - Fecha en formato "YYYY-MM-DD"
 * @param {Array} datosTomas.tomas - Lista detallada de medicamentos tomados
 * @returns {string} Hash SHA-256 con prefijo '0x' listo para el tipo bytes32 de la EVM
 */
function generarHashDiario(datosTomas) {
  if (!datosTomas || typeof datosTomas !== "object") {
    throw new Error("El argumento 'datosTomas' debe ser un objeto JSON válido.");
  }

  // 1. Asegurar serialización determinista
  const objetoNormalizado = canonicalizarObjeto(datosTomas);
  const jsonCanonica = JSON.stringify(objetoNormalizado);

  // 2. Cálculo del hash SHA-256 con el módulo nativo de Node.js
  const hashHex = crypto
    .createHash("sha256")
    .update(jsonCanonica, "utf8")
    .digest("hex");

  // 3. Formatear con prefijo 0x para compatibilidad con bytes32 de Ethereum
  return `0x${hashHex}`;
}

/**
 * Inicializa y devuelve la instancia conectada del Smart Contract en Sepolia.
 * 
 * @returns {ethers.Contract} Instancia de ethers.Contract vinculada al signer del backend
 */
function obtenerContratoConectado() {
  const privateKey = process.env.PRIVATE_KEY;
  const alchemyApiKey = process.env.ALCHEMY_API_KEY;
  let contractAddress = process.env.CONTRACT_ADDRESS;
  const customRpcUrl = process.env.SEPOLIA_RPC_URL;

  // Fallback a deployment-info.json si no está en el .env
  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    contractAddress = deploymentInfo.contractAddress;
  }

  if (!privateKey || privateKey.includes("0000000000000000")) {
    throw new Error(
      "Configuración inválida: Define PRIVATE_KEY en el archivo .env con la llave privada de tu wallet."
    );
  }

  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "Configuración inválida: Define CONTRACT_ADDRESS en el archivo .env con la dirección del contrato desplegado."
    );
  }

  // Definición del proveedor RPC para Sepolia
  const rpcUrl = customRpcUrl || (alchemyApiKey
    ? `https://eth-sepolia.g.alchemy.com/v2/${alchemyApiKey}`
    : "https://rpc.sepolia.org");

  // Ethers v6: JsonRpcProvider
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Ethers v6: Wallet conectada al proveedor para firmar transacciones
  const formattedPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const signer = new ethers.Wallet(formattedPrivateKey, provider);

  // Instancia del contrato conectada al firmante
  return new ethers.Contract(contractAddress, contractAbi, signer);
}

/**
 * PASO 3.B: Firma la transacción con la llave privada del servidor y registra el hash en Sepolia.
 *
 * @param {string} pacienteId - Identificador único del paciente (ej: "PAC_001")
 * @param {string} fecha - Fecha del registro ("YYYY-MM-DD")
 * @param {string} hash - Hash SHA-256 de 32 bytes (con prefijo 0x)
 * @returns {Promise<Object>} Información detallada del recibo de la transacción
 */
async function guardarHashEnBlockchain(pacienteId, fecha, hash) {
  try {
    console.log(`[BlockchainService] Iniciando anclaje para Paciente: ${pacienteId} | Fecha: ${fecha}`);
    console.log(`[BlockchainService] Hash a sellar: ${hash}`);

    const contrato = obtenerContratoConectado();

    // 1. Envío de la transacción firmada a la red Sepolia
    console.log("[BlockchainService] Enviando transacción firmada por el backend...");
    const tx = await contrato.registrarHash(pacienteId, fecha, hash);

    console.log(`[BlockchainService] Transacción enviada con hash: ${tx.hash}`);
    console.log("[BlockchainService] Esperando confirmación de minado en Ethereum Sepolia...");

    // 2. Esperar confirmación de la red (1 bloque minado)
    const receipt = await tx.wait(1);

    console.log(`[BlockchainService] Transacción confirmada en el bloque: ${receipt.blockNumber}`);
    console.log(`[BlockchainService] Gas utilizado: ${receipt.gasUsed.toString()} unidades`);

    return {
      success: true,
      pacienteId,
      fecha,
      hash,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      explorerUrl: `https://sepolia.etherscan.io/tx/${tx.hash}`,
    };
  } catch (error) {
    console.error("[BlockchainService] Error al registrar hash en blockchain:", error.message);

    // Detección de errores personalizados de Solidity (revert por registro duplicado)
    if (error.data || error.message.includes("RegistroYaExistente")) {
      throw new Error(`Conflicto de inmutabilidad: El registro para el paciente '${pacienteId}' en la fecha '${fecha}' ya ha sido anclado previamente.`);
    }

    throw error;
  }
}

/**
 * Consulta en la blockchain el hash registrado y la marca de tiempo de un paciente en una fecha dada.
 * (Operación de lectura gratuita, no consume gas).
 *
 * @param {string} pacienteId - ID del paciente
 * @param {string} fecha - Fecha en formato "YYYY-MM-DD"
 * @returns {Promise<Object>} { hashRegistro, timestamp, fechaLegible }
 */
async function consultarHashEnBlockchain(pacienteId, fecha) {
  const contrato = obtenerContratoConectado();
  const [hashRegistro, timestampBigInt] = await contrato.consultarHash(pacienteId, fecha);

  const timestampNum = Number(timestampBigInt);
  return {
    pacienteId,
    fecha,
    hashRegistro,
    timestamp: timestampNum,
    fechaLegible: new Date(timestampNum * 1000).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    }),
  };
}

/**
 * Valida si los registros almacenados en la base de datos coinciden con la verdad inmutable en Sepolia.
 * Si algún cuidador, atacante o administrador alteró un solo carácter en la base de datos,
 * los hashes diferirán y la función retornará 'false'.
 *
 * @param {Object} datosTomasActuales - Datos extraídos de la base de datos
 * @returns {Promise<Object>} Resultado de la auditoría de integridad
 */
async function auditarIntegridadRegistro(datosTomasActuales) {
  const hashCalculado = generarHashDiario(datosTomasActuales);
  const contrato = obtenerContratoConectado();

  const esValido = await contrato.verificarHash(
    datosTomasActuales.paciente,
    datosTomasActuales.fecha,
    hashCalculado
  );

  return {
    pacienteId: datosTomasActuales.paciente,
    fecha: datosTomasActuales.fecha,
    hashCalculado,
    esIntegro: esValido,
    diagnostico: esValido
      ? "INTEGRIDAD CONFIRMADA: El registro no ha sufrido ninguna modificación desde su notariado en Sepolia."
      : "ALERTA DE SEGURIDAD: Los datos locales discrepan del hash en la blockchain (posible alteración o fraude).",
  };
}

module.exports = {
  generarHashDiario,
  guardarHashEnBlockchain,
  consultarHashEnBlockchain,
  auditarIntegridadRegistro,
};
