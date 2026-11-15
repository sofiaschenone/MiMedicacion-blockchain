const { expect } = require("chai");
const { ethers } = require("ethers");

const {
  clasificarRevertDeAnclaje,
  esRegistroNoEncontrado,
  guardarHashEnBlockchain,
} = require("../src/blockchainService");

/**
 * Un revert del contrato no siempre llega con el mismo aspecto: algunos nodos
 * incluyen el nombre del custom error en el mensaje, otros sólo entregan el
 * `data` crudo con el selector. La clasificación tiene que reconocer los cinco
 * errors del contrato en todas esas formas, y devolver `null` cuando el error
 * no proviene del contrato (red, credenciales, etc.).
 */
const FIRMAS_DE_ERROR = {
  IdentificadorVacio: "IdentificadorVacio()",
  FechaVacia: "FechaVacia()",
  HashInvalido: "HashInvalido()",
  RegistroYaExistente: "RegistroYaExistente(string,string)",
  RegistroNoEncontrado: "RegistroNoEncontrado(string,string)",
};

const NOMBRES_DE_ERROR = Object.keys(FIRMAS_DE_ERROR);

// Mismo criterio que el servicio: el selector se deriva de la firma, sin
// escribir valores hexadecimales a mano.
function selectorDe(nombre) {
  return ethers.id(FIRMAS_DE_ERROR[nombre]).slice(0, 10).toLowerCase();
}

function datosDeRevert(nombre) {
  return `${selectorDe(nombre)}${"00".repeat(64)}`;
}

describe("Clasificación de reverts del contrato al anclar", function () {
  it("reconoce los cinco custom errors por el selector de los datos crudos", function () {
    NOMBRES_DE_ERROR.forEach((nombre) => {
      const error = { code: "CALL_EXCEPTION", data: datosDeRevert(nombre) };
      expect(clasificarRevertDeAnclaje(error), nombre).to.equal(nombre);
    });
  });

  it("reconoce los cinco custom errors por el nombre en el mensaje", function () {
    NOMBRES_DE_ERROR.forEach((nombre) => {
      const error = new Error(
        "VM Exception while processing transaction: reverted with custom error " +
          `'${FIRMAS_DE_ERROR[nombre]}'`
      );
      expect(clasificarRevertDeAnclaje(error), nombre).to.equal(nombre);
    });
  });

  it("reconoce los cinco custom errors por el reason decodificado por ethers", function () {
    NOMBRES_DE_ERROR.forEach((nombre) => {
      const error = { reason: FIRMAS_DE_ERROR[nombre], message: "execution reverted" };
      expect(clasificarRevertDeAnclaje(error), nombre).to.equal(nombre);
    });
  });

  it("reconoce un custom error cuando ethers sólo entrega el data y 'unknown custom error'", function () {
    // Es la forma observada contra Sepolia: el mensaje no trae el nombre, sólo
    // el selector en los datos crudos del revert.
    const error = {
      code: "CALL_EXCEPTION",
      message: "execution reverted (unknown custom error)",
      data: datosDeRevert("HashInvalido"),
    };

    expect(clasificarRevertDeAnclaje(error)).to.equal("HashInvalido");
  });

  it("devuelve null para un error de red, sin datos de revert", function () {
    const error = {
      code: "NETWORK_ERROR",
      message: "could not detect network (event=\"noNetwork\", code=NETWORK_ERROR)",
    };

    expect(clasificarRevertDeAnclaje(error)).to.be.null;
  });

  it("devuelve null para null, undefined y valores sin información del contrato", function () {
    expect(clasificarRevertDeAnclaje(null)).to.be.null;
    expect(clasificarRevertDeAnclaje(undefined)).to.be.null;
    expect(clasificarRevertDeAnclaje("timeout")).to.be.null;
    expect(clasificarRevertDeAnclaje({ code: "INSUFFICIENT_FUNDS" })).to.be.null;
  });

  it("devuelve null para un selector desconocido", function () {
    expect(
      clasificarRevertDeAnclaje({ data: `0xdeadbeef${"00".repeat(64)}` })
    ).to.be.null;
  });

  it("conserva esRegistroNoEncontrado reconociendo sólo su propio error", function () {
    expect(
      esRegistroNoEncontrado({ data: datosDeRevert("RegistroNoEncontrado") })
    ).to.be.true;

    NOMBRES_DE_ERROR.filter((nombre) => nombre !== "RegistroNoEncontrado").forEach(
      (nombre) => {
        expect(
          esRegistroNoEncontrado({ data: datosDeRevert(nombre) }),
          nombre
        ).to.be.false;
      }
    );
  });
});

/**
 * `guardarHashEnBlockchain` recibe la dependencia que arma el contrato como
 * seam opcional: así el catch se ejercita con un doble que revierte, sin red
 * ni credenciales. Es el mismo patrón que usa `auditarIntegridadRegistro` con
 * `consultarHash`.
 */
describe("guardarHashEnBlockchain: cada revert se reporta por su causa", function () {
  const FECHA = "2026-11-15";
  const HASH = `0x${"ab".repeat(32)}`;

  function contratoQueRevierte(error) {
    return {
      registrarHash: async () => {
        throw error;
      },
    };
  }

  async function anclarConError(error, argumentos = {}) {
    try {
      await guardarHashEnBlockchain(
        argumentos.pacienteId === undefined ? "PAC_001" : argumentos.pacienteId,
        argumentos.fecha === undefined ? FECHA : argumentos.fecha,
        argumentos.hash === undefined ? HASH : argumentos.hash,
        { obtenerContrato: () => contratoQueRevierte(error) }
      );
    } catch (capturado) {
      return capturado;
    }
    throw new Error("Se esperaba que guardarHashEnBlockchain lanzara un error.");
  }

  it("reporta conflicto de inmutabilidad sólo para RegistroYaExistente", async function () {
    const error = await anclarConError({
      code: "CALL_EXCEPTION",
      data: datosDeRevert("RegistroYaExistente"),
    });

    expect(error.message).to.match(/conflicto de inmutabilidad/i);
    expect(error.message).to.match(/ya ha sido anclado previamente/i);
    expect(error.message).to.include("PAC_001");
    expect(error.message).to.include(FECHA);
  });

  it("nombra el identificador vacío en lugar de la inmutabilidad", async function () {
    const error = await anclarConError(
      { code: "CALL_EXCEPTION", data: datosDeRevert("IdentificadorVacio") },
      { pacienteId: "" }
    );

    expect(error.message).to.match(/identificador de paciente inválido/i);
    expect(error.message).to.match(/vacío/i);
    expect(error.message).to.not.match(/inmutabilidad|ya ha sido anclado/i);
  });

  it("nombra la fecha vacía en lugar de la inmutabilidad", async function () {
    const error = await anclarConError({
      code: "CALL_EXCEPTION",
      data: datosDeRevert("FechaVacia"),
    });

    expect(error.message).to.match(/fecha de registro inválida/i);
    expect(error.message).to.match(/vacía/i);
    expect(error.message).to.not.match(/inmutabilidad|ya ha sido anclado/i);
  });

  it("nombra el hash nulo en lugar de la inmutabilidad", async function () {
    const error = await anclarConError(
      { code: "CALL_EXCEPTION", data: datosDeRevert("HashInvalido") },
      { hash: `0x${"00".repeat(32)}` }
    );

    expect(error.message).to.match(/hash inválido/i);
    expect(error.message).to.match(/nulo/i);
    expect(error.message).to.not.match(/inmutabilidad|ya ha sido anclado/i);
  });

  it("trata RegistroNoEncontrado como error inesperado, no como conflicto", async function () {
    const error = await anclarConError({
      code: "CALL_EXCEPTION",
      data: datosDeRevert("RegistroNoEncontrado"),
    });

    expect(error.message).to.match(/inesperado/i);
    expect(error.message).to.match(/no corresponde/i);
    expect(error.message).to.not.match(/inmutabilidad|ya ha sido anclado/i);
  });

  it("reconoce el revert sólo por el data, como lo entrega Sepolia", async function () {
    const error = await anclarConError({
      code: "CALL_EXCEPTION",
      message: "execution reverted (unknown custom error)",
      data: datosDeRevert("HashInvalido"),
    });

    expect(error.message).to.match(/hash inválido/i);
    expect(error.message).to.not.match(/inmutabilidad|ya ha sido anclado/i);
  });

  it("envuelve con contexto un error de red y no afirma nada sobre inmutabilidad", async function () {
    const original = {
      code: "NETWORK_ERROR",
      message: "could not detect network (event=\"noNetwork\")",
    };

    const error = await anclarConError(original);

    expect(error.message).to.match(/no se pudo anclar el registro/i);
    expect(error.message).to.include(original.message);
    expect(error.message).to.not.match(/inmutabilidad|ya ha sido anclado/i);
    expect(error.cause).to.equal(original);
  });

  it("una fecha vacía se rechaza antes de tocar la red y nombra la fecha vacía", async function () {
    let seResolvioElContrato = false;

    let error;
    try {
      await guardarHashEnBlockchain("PAC_001", "", HASH, {
        obtenerContrato: () => {
          seResolvioElContrato = true;
          return contratoQueRevierte(new Error("No debería llegar al contrato."));
        },
      });
    } catch (capturado) {
      error = capturado;
    }

    expect(seResolvioElContrato).to.be.false;
    expect(error.message).to.match(/fecha de registro inválida/i);
    expect(error.message).to.match(/vacía/i);
    expect(error.message).to.not.match(/inmutabilidad|ya ha sido anclado/i);
  });

  it("sin PRIVATE_KEY falla por configuración y no por inmutabilidad", async function () {
    const claveOriginal = process.env.PRIVATE_KEY;
    const direccionOriginal = process.env.CONTRACT_ADDRESS;
    delete process.env.PRIVATE_KEY;
    process.env.CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000001";

    try {
      let error;
      try {
        await guardarHashEnBlockchain("PAC_001", FECHA, HASH);
      } catch (capturado) {
        error = capturado;
      }

      expect(error.message).to.match(/configuración inválida/i);
      expect(error.message).to.match(/no se pudo anclar el registro/i);
      expect(error.message).to.not.match(/inmutabilidad|ya ha sido anclado/i);
    } finally {
      if (claveOriginal === undefined) {
        delete process.env.PRIVATE_KEY;
      } else {
        process.env.PRIVATE_KEY = claveOriginal;
      }
      if (direccionOriginal === undefined) {
        delete process.env.CONTRACT_ADDRESS;
      } else {
        process.env.CONTRACT_ADDRESS = direccionOriginal;
      }
    }
  });

  it("conserva el camino exitoso cuando el contrato acepta el anclaje", async function () {
    const resultado = await guardarHashEnBlockchain("PAC_001", FECHA, HASH, {
      obtenerContrato: () => ({
        registrarHash: async () => ({
          hash: `0x${"cd".repeat(32)}`,
          wait: async () => ({ blockNumber: 123, gasUsed: 21000n }),
        }),
      }),
    });

    expect(resultado.success).to.be.true;
    expect(resultado.blockNumber).to.equal(123);
    expect(resultado.gasUsed).to.equal("21000");
  });
});
