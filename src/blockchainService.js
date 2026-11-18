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

const { validarFechaRegistro } = require("./validacion");

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

// Forma canónica de un bytes32 para el ABI de ethers: '0x' + 64 dígitos hex.
// No se inspecciona el valor cero: bytes32(0) lo rechaza el contrato con
// HashInvalido, y ese mensaje ya nombra la causa correcta.
const HASH_BYTES32 = /^0x[0-9a-fA-F]{64}$/;

// Códigos legibles por máquina de los errores de anclaje. El mensaje es para el
// operador y puede cambiar; el código permite distinguir el caso esperable
// "ya estaba anclado" sin inspeccionar el texto.
const CODIGO_YA_ANCLADO = "YA_ANCLADO";
const CODIGO_IDENTIFICADOR_VACIO = "IDENTIFICADOR_VACIO";
const CODIGO_FECHA_VACIA = "FECHA_VACIA";
const CODIGO_FECHA_INVALIDA = "FECHA_INVALIDA";
const CODIGO_HASH_INVALIDO = "HASH_INVALIDO";
const CODIGO_ERROR_DE_CONFIGURACION = "ERROR_DE_CONFIGURACION";
const CODIGO_ERROR_DE_ANCLAJE = "ERROR_DE_ANCLAJE";

// Una sola tabla traduce el custom error del contrato a su código. Los errores
// que no provienen del contrato caen en el código genérico o, si son de
// configuración, en ERROR_DE_CONFIGURACION.
const CODIGO_POR_CAUSA = Object.freeze({
  IdentificadorVacio: CODIGO_IDENTIFICADOR_VACIO,
  FechaVacia: CODIGO_FECHA_VACIA,
  HashInvalido: CODIGO_HASH_INVALIDO,
  RegistroYaExistente: CODIGO_YA_ANCLADO,
});

/**
 * Construye un error de anclaje con mensaje, `codigo` legible por máquina y la
 * causa original cuando existe.
 *
 * @param {string} mensaje - Mensaje para el operador
 * @param {string} codigo - Código estable para clasificar el error
 * @param {any} [cause] - Error original que provocó la traducción
 * @returns {Error} Error con `codigo` y `cause`
 */
function errorDeAnclaje(mensaje, codigo, cause) {
  const error = new Error(mensaje, { cause });
  error.codigo = codigo;
  return error;
}

/**
 * Valida la forma del hash antes de tocar la red.
 *
 * Sin esta validación, un `null`, un `"0x"` o un string de longitud incorrecta
 * llegan a ethers y fallan con un error genérico de JavaScript que ni siquiera
 * nombra el hash ("Cannot read properties of null", "incorrect data length").
 *
 * @param {any} hash - Hash a anclar
 * @param {string} pacienteId - Identificador del paciente (para el mensaje)
 * @param {string} fecha - Fecha del registro (para el mensaje)
 * @throws {Error} Si el hash no es un bytes32 hexadecimal de 32 bytes
 */
function validarFormaDelHash(hash, pacienteId, fecha) {
  if (typeof hash !== "string" || !HASH_BYTES32.test(hash)) {
    throw errorDeAnclaje(
      `Hash inválido: el hash del registro ${ubicacionDelRegistro(pacienteId, fecha)} ` +
        "no es un bytes32 válido; se esperaba '0x' seguido de 64 dígitos hexadecimales.",
      CODIGO_HASH_INVALIDO
    );
  }
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
 * @param {Object} [opciones={}] - Opciones de inyección para pruebas
 * @param {Function} [opciones.obtenerContrato=obtenerContratoConectado] - Resuelve el contrato conectado
 * @returns {Promise<Object>} Información detallada del recibo de la transacción
 */
async function guardarHashEnBlockchain(pacienteId, fecha, hash, opciones = {}) {
  // La fecha de registro se valida antes de resolver la configuración y de tocar
  // la red: una fecha inválida nunca debe llegar al contrato ni gastar gas. El
  // error que ve el llamador es entonces el de la fecha, no uno de credenciales.
  try {
    validarFechaRegistro(fecha);
  } catch (error) {
    if (fecha === "") {
      throw errorDeAnclaje(
        mensajeParaCausaDeAnclaje("FechaVacia", pacienteId, fecha),
        CODIGO_FECHA_VACIA,
        error
      );
    }
    throw errorDeAnclaje(
      `No se puede anclar el registro: ${error.message}`,
      CODIGO_FECHA_INVALIDA,
      error
    );
  }

  // La forma del hash también se valida antes de resolver la configuración y de
  // tocar la red: un valor ausente o mal formado nunca debe llegar a ethers ni
  // gastar gas. El hash cero no se valida acá: lo rechaza el contrato.
  validarFormaDelHash(hash, pacienteId, fecha);

  try {
    console.log(`[BlockchainService] Iniciando anclaje para Paciente: ${pacienteId} | Fecha: ${fecha}`);
    console.log(`[BlockchainService] Hash a sellar: ${hash}`);

    const obtenerContrato = opciones.obtenerContrato || obtenerContratoConectado;
    const contrato = obtenerContrato();

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

    // Cada revert del contrato se reporta por su causa real. Un fallo que no es
    // un revert (red, credenciales) se envuelve sin afirmar que ya estaba anclado.
    throw traducirErrorDeAnclaje(error, pacienteId, fecha);
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

/**
 * Compone la referencia al registro en los mensajes de anclaje. Es el único
 * lugar donde se arma "para el paciente 'X' en la fecha 'Y'"; las causas que
 * sólo nombran una de las dos coordenadas omiten la otra.
 *
 * @param {string} [pacienteId] - Identificador del paciente
 * @param {string} [fecha] - Fecha del registro
 * @returns {string} Referencia al registro para el mensaje
 */
function ubicacionDelRegistro(pacienteId, fecha) {
  const coordenadas = [];
  if (pacienteId !== undefined) {
    coordenadas.push(`el paciente '${pacienteId}'`);
  }
  if (fecha !== undefined) {
    coordenadas.push(`la fecha '${fecha}'`);
  }
  return `para ${coordenadas.join(" en ")}`;
}

// Custom errors del contrato RegistroMedicacion. Una sola tabla gobierna tanto la
// clasificación (el selector se deriva de la firma, nunca se escribe a mano) como
// el mensaje con el que se reporta cada causa al anclar. Agregar un custom error
// es agregar una entrada, no editar dos registros en paralelo.
//
// RegistroNoEncontrado no lleva mensaje de anclaje: el contrato sólo lo revierte
// en `consultarHash`, nunca en `registrarHash`. Se conserva en la tabla para que
// `esRegistroNoEncontrado` lo reconozca en el camino de lectura (auditoría).
const ERRORES_DEL_CONTRATO = [
  {
    nombre: "IdentificadorVacio",
    firma: "IdentificadorVacio()",
    mensajeDeAnclaje: (pacienteId, fecha) =>
      `Identificador de paciente inválido: el identificador del paciente está vacío; no se puede anclar el registro ${ubicacionDelRegistro(
        undefined,
        fecha
      )}.`,
  },
  {
    nombre: "FechaVacia",
    firma: "FechaVacia()",
    mensajeDeAnclaje: (pacienteId) =>
      `Fecha de registro inválida: la fecha de registro está vacía; no se puede anclar el registro ${ubicacionDelRegistro(
        pacienteId
      )}.`,
  },
  {
    nombre: "HashInvalido",
    firma: "HashInvalido()",
    mensajeDeAnclaje: (pacienteId, fecha) =>
      `Hash inválido: el hash del registro ${ubicacionDelRegistro(
        pacienteId,
        fecha
      )} es nulo; no se puede anclar un hash nulo.`,
  },
  {
    nombre: "RegistroYaExistente",
    firma: "RegistroYaExistente(string,string)",
    mensajeDeAnclaje: (pacienteId, fecha) =>
      `Conflicto de inmutabilidad: El registro ${ubicacionDelRegistro(
        pacienteId,
        fecha
      )} ya ha sido anclado previamente.`,
  },
  {
    nombre: "RegistroNoEncontrado",
    firma: "RegistroNoEncontrado(string,string)",
    mensajeDeAnclaje: null,
  },
];

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
 * Clasifica un revert del contrato por el nombre de su custom error.
 *
 * No asume una única forma de error: algunos nodos incluyen el nombre en el
 * mensaje o en el `reason`, pero contra Sepolia ethers suele entregar
 * "execution reverted (unknown custom error)" con sólo el selector en `data`.
 * Por eso se busca primero el selector y, si no aparece, el nombre.
 *
 * Se usa tanto al anclar como al consultar (auditoría), por eso el nombre no
 * menciona una sola de las dos operaciones.
 *
 * @param {any} error - Error capturado al llamar al contrato
 * @returns {string|null} Nombre del custom error, o `null` si el error no
 *                        proviene del contrato (red, credenciales, etc.)
 */
function clasificarRevertDelContrato(error) {
  const pistas = recolectarPistasDeError(error).map((pista) => pista.toLowerCase());
  if (pistas.length === 0) {
    return null;
  }

  // 1. Por selector: es la pista más precisa y la única disponible cuando
  //    ethers no logra decodificar el custom error.
  const porSelector = ERRORES_DEL_CONTRATO.find(({ firma }) => {
    const selector = ethers.id(firma).slice(0, 10).toLowerCase();
    return pistas.some((pista) => pista.includes(selector));
  });
  if (porSelector) {
    return porSelector.nombre;
  }

  // 2. Por nombre: nodos y proveedores suelen incluir el nombre o la firma.
  const porNombre = ERRORES_DEL_CONTRATO.find(({ nombre }) =>
    pistas.some((pista) => pista.includes(nombre.toLowerCase()))
  );
  return porNombre ? porNombre.nombre : null;
}

/**
 * Detecta si un error de ethers corresponde al revert RegistroNoEncontrado del contrato.
 *
 * @param {any} error - Error capturado al llamar al contrato
 * @returns {boolean} `true` solo si el error es RegistroNoEncontrado
 */
function esRegistroNoEncontrado(error) {
  return clasificarRevertDelContrato(error) === "RegistroNoEncontrado";
}

/**
 * Redacta el mensaje de cada causa reconocida de un anclaje fallido.
 *
 * @param {string|null} causa - Nombre del custom error del contrato
 * @param {string} pacienteId - Identificador del paciente
 * @param {string} fecha - Fecha del registro
 * @returns {string|null} Mensaje específico, o `null` si la causa no tiene
 *                        mensaje de anclaje (es desconocida o es un error que
 *                        el contrato sólo revierte en la lectura)
 */
function mensajeParaCausaDeAnclaje(causa, pacienteId, fecha) {
  const error = ERRORES_DEL_CONTRATO.find(({ nombre }) => nombre === causa);
  return error && error.mensajeDeAnclaje
    ? error.mensajeDeAnclaje(pacienteId, fecha)
    : null;
}

/**
 * Elige el código legible por máquina de un anclaje fallido.
 *
 * Los custom errors del contrato tienen un código propio; un fallo de
 * configuración conserva su código para que el llamador no lo confunda con un
 * revert del contrato; cualquier otro fallo se reporta con el código genérico.
 *
 * @param {string|null} causa - Nombre del custom error del contrato
 * @param {any} error - Error capturado al anclar
 * @returns {string} Código estable del error
 */
function codigoDeErrorDeAnclaje(causa, error) {
  if (causa !== null && Object.prototype.hasOwnProperty.call(CODIGO_POR_CAUSA, causa)) {
    return CODIGO_POR_CAUSA[causa];
  }

  const detalle = error && typeof error.message === "string" ? error.message : "";
  return /configuración inválida/i.test(detalle)
    ? CODIGO_ERROR_DE_CONFIGURACION
    : CODIGO_ERROR_DE_ANCLAJE;
}

/**
 * Traduce un error de anclaje a un mensaje que nombra su causa real.
 *
 * Un revert del contrato se reporta por su custom error. Un fallo que no es un
 * revert del contrato (credenciales ausentes, red caída, gas insuficiente) se
 * envuelve con contexto sin afirmar nada sobre la inmutabilidad del registro.
 *
 * @param {any} error - Error capturado al anclar
 * @param {string} pacienteId - Identificador del paciente
 * @param {string} fecha - Fecha del registro
 * @returns {Error} Error traducido, con el original como `cause`
 */
function traducirErrorDeAnclaje(error, pacienteId, fecha) {
  const causa = clasificarRevertDelContrato(error);
  const codigo = codigoDeErrorDeAnclaje(causa, error);
  const mensaje = mensajeParaCausaDeAnclaje(causa, pacienteId, fecha);
  if (mensaje !== null) {
    return errorDeAnclaje(mensaje, codigo, error);
  }

  const detalle =
    error && typeof error.message === "string" ? error.message : String(error);

  return errorDeAnclaje(
    `No se pudo anclar el registro ${ubicacionDelRegistro(pacienteId, fecha)}: ${detalle}`,
    codigo,
    error
  );
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
  clasificarRevertDelContrato,
  esRegistroNoEncontrado,
  auditarIntegridadRegistro,
  ERRORES_DEL_CONTRATO,
  CODIGO_YA_ANCLADO,
  CODIGO_IDENTIFICADOR_VACIO,
  CODIGO_FECHA_VACIA,
  CODIGO_FECHA_INVALIDA,
  CODIGO_HASH_INVALIDO,
  CODIGO_ERROR_DE_CONFIGURACION,
  CODIGO_ERROR_DE_ANCLAJE,
  ESTADO_INTEGRO,
  ESTADO_ALTERADO,
  ESTADO_NO_ANCLADO,
  ESTADO_NO_AUDITABLE,
  DIAGNOSTICO_INTEGRO,
  DIAGNOSTICO_ALTERADO,
  DIAGNOSTICO_NO_ANCLADO,
  DIAGNOSTICO_NO_AUDITABLE,
};
