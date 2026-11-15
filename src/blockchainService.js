/**
 * @file blockchainService.js
 * @description Servicio de interacción con Ethereum Sepolia para el backend de MiMedicación.
 *              Implementa el patrón Data Anchoring utilizando Ethers.js (v6) y criptografía SHA-256.
 * @institution Universidad Provincial de Ezeiza (UPE)
 */

const { ethers } = require("ethers");
const crypto = require("crypto");
require("dotenv").config();

const { validarFechaRegistro } = require("./validacion");

// Carga del ABI compilado del Smart Contract
const contractAbi = require("./contractAbi.json");

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

  // 0. La fecha de registro debe ser válida antes de calcular cualquier hash:
  //    un registro con fecha inválida nunca debe llegar a anclarse on-chain.
  try {
    validarFechaRegistro(datosTomas.fecha);
  } catch (error) {
    throw new Error(`No se puede generar el hash diario: ${error.message}`);
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
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const customRpcUrl = process.env.SEPOLIA_RPC_URL;

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
  // La fecha de registro se valida antes de resolver la configuración y de tocar
  // la red: una fecha inválida nunca debe llegar al contrato ni gastar gas. El
  // error que ve el llamador es entonces el de la fecha, no uno de credenciales.
  try {
    validarFechaRegistro(fecha);
  } catch (error) {
    throw new Error(`No se puede anclar el registro: ${error.message}`);
  }

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

// Estados de la auditoría. diagnosticar solo produce los tres primeros;
// NO_AUDITABLE lo produce el llamador cuando ni siquiera se puede calcular el
// hash local (por ejemplo, por una fecha de registro no canónica).
const ESTADO_INTEGRO = "INTEGRO";
const ESTADO_ALTERADO = "ALTERADO";
const ESTADO_NO_ANCLADO = "NO_ANCLADO";
const ESTADO_NO_AUDITABLE = "NO_AUDITABLE";

// Textos de diagnóstico de la auditoría. Se mantienen juntos para que los estados
// sean revisables en un solo lugar. El de NO_ANCLADO evita la acusación de fraude:
// la ausencia de un anclaje no es una manipulación de los datos. El de NO_AUDITABLE
// explica que el problema es la fecha local, no el anclaje.
const DIAGNOSTICO_INTEGRO =
  "INTEGRIDAD CONFIRMADA: El registro no ha sufrido ninguna modificación desde su notariado en Sepolia.";
const DIAGNOSTICO_ALTERADO =
  "ALERTA DE SEGURIDAD: Los datos locales discrepan del hash en la blockchain (posible alteración o fraude).";
const DIAGNOSTICO_NO_ANCLADO =
  "SIN ANCLAJE: El registro no está anclado en la blockchain, no existe un hash de referencia para esa fecha. Su ausencia NO es una alteración ni un fraude.";
const DIAGNOSTICO_NO_AUDITABLE =
  "NO AUDITABLE: La fecha local no es una fecha de registro válida, por lo tanto no se puede comparar el registro contra el anclaje.";

/**
 * Traduce el resultado de la verificación a los tres estados posibles de la auditoría.
 *
 * Verificar y auditar no son lo mismo: `verificarHash` del contrato devuelve `false`
 * tanto cuando el hash no coincide como cuando el registro nunca se ancló. Interpretar
 * ese `false` como fraude acusa injustamente a un paciente sin registro sellado. Esta
 * función es pura (sin red ni credenciales) para que la distinción sea verificable.
 *
 * @param {boolean} existe - Indica si el registro está anclado en la blockchain
 * @param {boolean} coincide - Indica si el hash local coincide con el anclado
 * @returns {{ estado: "INTEGRO"|"ALTERADO"|"NO_ANCLADO", diagnostico: string }}
 */
function diagnosticar(existe, coincide) {
  if (!existe) {
    return { estado: ESTADO_NO_ANCLADO, diagnostico: DIAGNOSTICO_NO_ANCLADO };
  }
  if (coincide) {
    return { estado: ESTADO_INTEGRO, diagnostico: DIAGNOSTICO_INTEGRO };
  }
  return { estado: ESTADO_ALTERADO, diagnostico: DIAGNOSTICO_ALTERADO };
}

// Selector del custom error RegistroNoEncontrado(string,string) del contrato.
// Se deriva de la firma para no depender de un valor hexadecimal escrito a mano.
const SELECTOR_REGISTRO_NO_ENCONTRADO = ethers
  .id("RegistroNoEncontrado(string,string)")
  .slice(0, 10)
  .toLowerCase();

const NOMBRE_REGISTRO_NO_ENCONTRADO = "RegistroNoEncontrado";

/**
 * Recolecta los textos donde ethers o el proveedor RPC pueden exponer un error.
 * Los proveedores no son uniformes: a veces alcanza con `message`, a veces hace
 * falta `reason` o el `data` crudo, y a veces el error original viene anidado.
 *
 * @param {any} error - Error capturado
 * @param {number} profundidad - Nivel de anidamiento (acotado para cortar ciclos)
 * @returns {string[]} Pistas de texto del error
 */
function recolectarPistasDeError(error, profundidad = 0) {
  if (error === null || error === undefined || profundidad > 3) {
    return [];
  }
  if (typeof error === "string") {
    return [error];
  }
  if (typeof error !== "object") {
    return [];
  }

  const pistas = [];
  const clavesConTexto = ["name", "errorName", "reason", "shortMessage", "message", "data"];
  for (const clave of clavesConTexto) {
    const valor = error[clave];
    if (typeof valor === "string") {
      pistas.push(valor);
    } else if (valor !== null && typeof valor === "object") {
      pistas.push(...recolectarPistasDeError(valor, profundidad + 1));
    }
  }

  // Estructuras habituales donde ethers envuelve el error original.
  for (const clave of ["error", "info", "revert"]) {
    pistas.push(...recolectarPistasDeError(error[clave], profundidad + 1));
  }

  return pistas;
}

/**
 * Detecta si un error de ethers corresponde al revert RegistroNoEncontrado del contrato.
 * No asume una única forma: busca el nombre del custom error en los textos y su
 * selector en los datos crudos del revert.
 *
 * @param {any} error - Error capturado al llamar al contrato
 * @returns {boolean} `true` solo si el error es RegistroNoEncontrado
 */
function esRegistroNoEncontrado(error) {
  return recolectarPistasDeError(error).some((pista) => {
    const texto = pista.toLowerCase();
    return (
      texto.includes(NOMBRE_REGISTRO_NO_ENCONTRADO.toLowerCase()) ||
      texto.includes(SELECTOR_REGISTRO_NO_ENCONTRADO)
    );
  });
}

/**
 * Indica si un error proviene de la validación de la fecha de registro.
 * `generarHashDiario` envuelve el error original, así que se inspecciona el
 * mensaje en lugar de asumir una clase de error concreta.
 *
 * @param {any} error - Error capturado al generar el hash
 * @returns {boolean} `true` si el error es de fecha de registro inválida
 */
function esErrorDeFechaDeRegistro(error) {
  const mensaje = error && typeof error.message === "string" ? error.message : "";
  return /fecha de registro inválida/i.test(mensaje);
}

/**
 * Audita si los registros almacenados en la base de datos coinciden con la verdad
 * inmutable en Sepolia. Distingue íntegro, alterado y no anclado, y agrega
 * NO_AUDITABLE cuando la fecha local no permite calcular el hash de comparación.
 *
 * Se consulta una sola vez el hash anclado (operación de lectura gratuita). Si el
 * par paciente/fecha nunca fue anclado, `consultarHash` revierte con
 * RegistroNoEncontrado y la auditoría responde NO_ANCLADO en lugar de propagar la
 * excepción o acusar una alteración inexistente.
 *
 * Un registro ya anclado con una fecha no canónica (por ejemplo "31/02/2026") sigue
 * siendo auditable, pero no hay hash local con el que compararlo: ese caso se
 * reporta como NO_AUDITABLE en lugar de dejar la auditoría inutilizable.
 *
 * @param {Object} datosTomasActuales - Datos extraídos de la base de datos
 * @param {Object} [opciones={}] - Opciones de inyección para pruebas
 * @param {Function} [opciones.consultarHash=consultarHashEnBlockchain] - Consulta del hash anclado
 * @returns {Promise<Object>} Resultado de la auditoría de integridad
 */
async function auditarIntegridadRegistro(datosTomasActuales, opciones = {}) {
  const consultarHash = opciones.consultarHash || consultarHashEnBlockchain;

  let hashCalculado;
  try {
    hashCalculado = generarHashDiario(datosTomasActuales);
  } catch (error) {
    if (!esErrorDeFechaDeRegistro(error)) {
      throw error;
    }
    return {
      pacienteId: datosTomasActuales.paciente,
      fecha: datosTomasActuales.fecha,
      hashCalculado: null,
      esIntegro: false,
      estado: ESTADO_NO_AUDITABLE,
      diagnostico: DIAGNOSTICO_NO_AUDITABLE,
    };
  }

  const pacienteId = datosTomasActuales.paciente;
  const fecha = datosTomasActuales.fecha;

  let hashAnclado = null;
  let existe = false;

  try {
    const consulta = await consultarHash(pacienteId, fecha);
    hashAnclado = consulta.hashRegistro;
    existe = true;
  } catch (error) {
    // La ausencia de anclaje es un estado válido de la auditoría, no una falla.
    if (!esRegistroNoEncontrado(error)) {
      throw error;
    }
  }

  const coincide = existe && hashAnclado.toLowerCase() === hashCalculado.toLowerCase();

  return {
    pacienteId,
    fecha,
    hashCalculado,
    esIntegro: coincide,
    ...diagnosticar(existe, coincide),
  };
}

module.exports = {
  generarHashDiario,
  guardarHashEnBlockchain,
  consultarHashEnBlockchain,
  diagnosticar,
  esRegistroNoEncontrado,
  auditarIntegridadRegistro,
  ESTADO_INTEGRO,
  ESTADO_ALTERADO,
  ESTADO_NO_ANCLADO,
  ESTADO_NO_AUDITABLE,
  DIAGNOSTICO_INTEGRO,
  DIAGNOSTICO_ALTERADO,
  DIAGNOSTICO_NO_ANCLADO,
  DIAGNOSTICO_NO_AUDITABLE,
};
